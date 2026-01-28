/**
 * AI Generation API Routes
 *
 * Provides API endpoints for AI poster generation:
 * - POST /api/ai/generate - Submit a new generation request
 * - GET /api/ai/generations - List user's generations with pagination
 * - GET /api/ai/generations/:id - Get generation by ID
 * - POST /api/ai/generations/:id/select - Select an image from generation
 * - PATCH /api/ai/generations/:id/visibility - Update gallery visibility
 * - DELETE /api/ai/generations/:id - Delete/cancel a generation
 * - GET /api/ai/gallery - Get public gallery of shared generations
 * - GET /api/ai/status/:id - Get generation job status
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";

import { db } from "../database";
import {
  aiGenerations,
  userColorPalettes,
  type AIPromptDetails,
  type AIStylePreset,
  type AIAspectRatio,
  type AIModelProvider,
  type AIGalleryVisibility,
  aiStylePresetEnum,
  aiAspectRatioEnum,
  aiModelProviderEnum,
  aiGalleryVisibilityEnum,
} from "../database/schema/ai-generations";
import {
  requireAuth,
  optionalAuth,
  type AuthVariables,
  type OptionalAuthVariables,
} from "../middleware/auth";
import {
  requireSufficientFunds,
  type WalletVariables,
} from "../middleware/wallet";
import { deductFromWallet } from "../services/wallet";
import { addAIGenerationJob } from "../queues/ai-generation";
import { getCached, setCached, CacheKeys, redis } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const DEFAULT_VARIATION_COUNT = 4;
const MAX_VARIATION_COUNT = 8;
const CACHE_TTL_GENERATION = 300; // 5 minutes
const CACHE_TTL_GALLERY = 60; // 1 minute (public gallery changes frequently)

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for creating a new AI generation request
 */
const createGenerationSchema = z.object({
  prompt: z.string().min(3).max(500).trim(),
  negativePrompt: z.string().max(300).optional(),
  stylePreset: z.enum(aiStylePresetEnum.enumValues),
  aspectRatio: z.enum(aiAspectRatioEnum.enumValues),
  colorMood: z.string().max(50).optional(),
  colorPalette: z.array(z.string().max(20)).max(5).optional(),
  referenceImageUrl: z.string().url().optional(),
  variationCount: z.coerce.number().int().min(1).max(MAX_VARIATION_COUNT).optional().default(DEFAULT_VARIATION_COUNT),
  modelProvider: z.enum(aiModelProviderEnum.enumValues).optional().default("stable-diffusion"),
  seed: z.coerce.number().int().min(0).max(2147483647).optional(),
});

/**
 * Query parameters for listing generations
 */
const listGenerationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
  status: z.enum(["queued", "processing", "completed", "failed", "cancelled"]).optional(),
  stylePreset: z.enum(aiStylePresetEnum.enumValues).optional(),
});

/**
 * Query parameters for public gallery
 */
const galleryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
  stylePreset: z.enum(aiStylePresetEnum.enumValues).optional(),
  sortBy: z.enum(["recent", "popular"]).optional().default("recent"),
});

/**
 * Schema for selecting an image from generation
 */
const selectImageSchema = z.object({
  imageId: z.string().min(1),
});

/**
 * Schema for updating visibility
 */
const updateVisibilitySchema = z.object({
  visibility: z.enum(aiGalleryVisibilityEnum.enumValues),
});

// ============================================================================
// Color Palette Validation Schemas
// ============================================================================

/**
 * Hex color validation regex
 */
const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

/**
 * Schema for creating a color palette
 */
const createPaletteSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  colors: z.array(z.string().regex(hexColorRegex, "Invalid hex color format")).min(3).max(8),
  isDefault: z.boolean().optional().default(false),
});

/**
 * Schema for updating a color palette
 */
const updatePaletteSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  colors: z.array(z.string().regex(hexColorRegex, "Invalid hex color format")).min(3).max(8).optional(),
  isDefault: z.boolean().optional(),
});

const MAX_PALETTES_PER_USER = 20;

// ============================================================================
// Route Handler
// ============================================================================

const aiApp = new Hono<{ Variables: (AuthVariables & Partial<WalletVariables>) | OptionalAuthVariables }>();

// ============================================================================
// POST /api/ai/generate - Create Generation Request
// ============================================================================

aiApp.post(
  "/generate",
  requireAuth,
  zValidator("json", createGenerationSchema),
  requireSufficientFunds((c) => {
    const input = c.req.valid("json") as {
      modelProvider?: AIModelProvider;
      variationCount?: number;
    };
    return {
      provider: input.modelProvider,
      variationCount: input.variationCount,
    };
  }),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const input = c.req.valid("json");
    const generationCost = c.get("generationCost");

    try {
      // Create prompt details object
      const promptDetails: AIPromptDetails = {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        stylePreset: input.stylePreset,
        aspectRatio: input.aspectRatio,
        colorMood: input.colorMood,
        colorPalette: input.colorPalette,
        referenceImageUrl: input.referenceImageUrl,
        seed: input.seed,
      };

      // Create generation record in database
      const [generation] = await db
        .insert(aiGenerations)
        .values({
          userId: user.id,
          promptDetails,
          promptText: input.prompt,
          stylePreset: input.stylePreset as AIStylePreset,
          aspectRatio: input.aspectRatio as AIAspectRatio,
          status: "queued",
          modelProvider: input.modelProvider as AIModelProvider,
          variationCount: input.variationCount,
          queuedAt: new Date(),
          // Store cost info
          estimatedCost: generationCost?.userPricePaise,
        })
        .returning();

      if (!generation) {
        return c.json({ error: "Failed to create generation request" }, 500);
      }

      // Deduct from wallet (or use free generation)
      let walletTransactionId: string | null = null;
      let usedFreeGeneration = false;

      if (generationCost) {
        const deductResult = await deductFromWallet(
          user.id,
          generationCost.userPricePaise,
          generation.id,
          {
            provider: input.modelProvider,
            stylePreset: input.stylePreset,
            variationCount: input.variationCount,
            apiCostUsdCents: Math.round(generationCost.apiCostPaise / generationCost.exchangeRate),
            exchangeRate: generationCost.exchangeRate,
            markupPercentage: generationCost.markupPercentage,
          }
        );
        walletTransactionId = deductResult.transaction?.id ?? null;
        usedFreeGeneration = deductResult.usedFreeGeneration;
      }

      // Add job to queue with wallet transaction info for potential refund
      const job = await addAIGenerationJob({
        generationId: generation.id,
        userId: user.id,
        prompt: input.prompt,
        stylePreset: input.stylePreset as AIStylePreset,
        aspectRatio: input.aspectRatio as AIAspectRatio,
        negativePrompt: input.negativePrompt,
        colorMood: input.colorMood,
        colorPalette: input.colorPalette,
        referenceImageUrl: input.referenceImageUrl,
        variationCount: input.variationCount,
        modelProvider: input.modelProvider as AIModelProvider,
        seed: input.seed,
      });

      return c.json(
        {
          message: "Generation request submitted",
          generation: {
            id: generation.id,
            status: generation.status,
            stylePreset: generation.stylePreset,
            aspectRatio: generation.aspectRatio,
            variationCount: generation.variationCount,
            queuedAt: generation.queuedAt,
          },
          jobId: job.id,
          payment: {
            usedFreeGeneration,
            amountCharged: usedFreeGeneration ? 0 : generationCost?.userPricePaise ?? 0,
            transactionId: walletTransactionId,
          },
        },
        201
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to submit generation: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// GET /api/ai/generations - List User's Generations
// ============================================================================

aiApp.get(
  "/generations",
  requireAuth,
  zValidator("query", listGenerationsQuerySchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { page, pageSize, status, stylePreset } = c.req.valid("query");

    try {
      // Build where conditions
      const conditions = [eq(aiGenerations.userId, user.id)];

      if (status) {
        conditions.push(eq(aiGenerations.status, status));
      }

      if (stylePreset) {
        conditions.push(eq(aiGenerations.stylePreset, stylePreset));
      }

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiGenerations)
        .where(and(...conditions));

      const total = countResult[0]?.count ?? 0;

      // Get generations
      const generations = await db
        .select({
          id: aiGenerations.id,
          promptText: aiGenerations.promptText,
          stylePreset: aiGenerations.stylePreset,
          aspectRatio: aiGenerations.aspectRatio,
          status: aiGenerations.status,
          images: aiGenerations.images,
          variationCount: aiGenerations.variationCount,
          selectedImageId: aiGenerations.selectedImageId,
          selectedImageUrl: aiGenerations.selectedImageUrl,
          visibility: aiGenerations.visibility,
          isPurchased: aiGenerations.isPurchased,
          likesCount: aiGenerations.likesCount,
          viewsCount: aiGenerations.viewsCount,
          processingTimeMs: aiGenerations.processingTimeMs,
          errorMessage: aiGenerations.errorMessage,
          createdAt: aiGenerations.createdAt,
          completedAt: aiGenerations.completedAt,
        })
        .from(aiGenerations)
        .where(and(...conditions))
        .orderBy(desc(aiGenerations.createdAt))
        .limit(pageSize)
        .offset(offset);

      return c.json({
        items: generations,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to fetch generations: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// GET /api/ai/generations/:id - Get Generation by ID
// ============================================================================

aiApp.get("/generations/:id", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];
  const { id } = c.req.param();

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid generation ID format" }, 400);
  }

  // Check cache
  const cacheKey = `${CacheKeys.AI_GENERATION}${user.id}:${id}`;
  const cached = await getCached<object>(cacheKey);
  if (cached) {
    return c.json({ ...cached, fromCache: true });
  }

  try {
    const generation = await db.query.aiGenerations.findFirst({
      where: and(
        eq(aiGenerations.id, id),
        eq(aiGenerations.userId, user.id)
      ),
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    const result = {
      id: generation.id,
      promptDetails: generation.promptDetails,
      promptText: generation.promptText,
      stylePreset: generation.stylePreset,
      aspectRatio: generation.aspectRatio,
      status: generation.status,
      modelProvider: generation.modelProvider,
      modelVersion: generation.modelVersion,
      images: generation.images,
      variationCount: generation.variationCount,
      selectedImageId: generation.selectedImageId,
      selectedImageUrl: generation.selectedImageUrl,
      visibility: generation.visibility,
      likesCount: generation.likesCount,
      viewsCount: generation.viewsCount,
      isPurchased: generation.isPurchased,
      productId: generation.productId,
      orderId: generation.orderId,
      moderationResult: generation.moderationResult,
      isFlagged: generation.isFlagged,
      processingTimeMs: generation.processingTimeMs,
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt,
      queuedAt: generation.queuedAt,
      processingStartedAt: generation.processingStartedAt,
      completedAt: generation.completedAt,
    };

    // Cache completed generations longer
    if (generation.status === "completed") {
      await setCached(cacheKey, result, CACHE_TTL_GENERATION);
    }

    return c.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to fetch generation: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// POST /api/ai/generations/:id/select - Select Image from Generation
// ============================================================================

aiApp.post(
  "/generations/:id/select",
  requireAuth,
  zValidator("json", selectImageSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { id } = c.req.param();
    const { imageId } = c.req.valid("json");

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return c.json({ error: "Invalid generation ID format" }, 400);
    }

    try {
      // Get the generation
      const generation = await db.query.aiGenerations.findFirst({
        where: and(
          eq(aiGenerations.id, id),
          eq(aiGenerations.userId, user.id)
        ),
      });

      if (!generation) {
        return c.json({ error: "Generation not found" }, 404);
      }

      if (generation.status !== "completed") {
        return c.json({ error: "Generation is not completed" }, 400);
      }

      // Find the selected image in the images array
      const images = generation.images || [];
      const selectedImage = images.find((img) => img.id === imageId);

      if (!selectedImage) {
        return c.json({ error: "Image not found in this generation" }, 404);
      }

      // Update the generation with selected image
      const [updated] = await db
        .update(aiGenerations)
        .set({
          selectedImageId: imageId,
          selectedImageUrl: selectedImage.imageUrl,
          images: images.map((img) => ({
            ...img,
            isSelected: img.id === imageId,
          })),
          updatedAt: new Date(),
        })
        .where(eq(aiGenerations.id, id))
        .returning({
          id: aiGenerations.id,
          selectedImageId: aiGenerations.selectedImageId,
          selectedImageUrl: aiGenerations.selectedImageUrl,
        });

      // Invalidate cache
      const cacheKey = `${CacheKeys.AI_GENERATION}${user.id}:${id}`;
      await redis.del(cacheKey);

      return c.json({
        message: "Image selected successfully",
        generation: updated,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to select image: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// PATCH /api/ai/generations/:id/visibility - Update Visibility
// ============================================================================

aiApp.patch(
  "/generations/:id/visibility",
  requireAuth,
  zValidator("json", updateVisibilitySchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { id } = c.req.param();
    const { visibility } = c.req.valid("json");

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return c.json({ error: "Invalid generation ID format" }, 400);
    }

    try {
      // Verify ownership
      const generation = await db.query.aiGenerations.findFirst({
        where: and(
          eq(aiGenerations.id, id),
          eq(aiGenerations.userId, user.id)
        ),
        columns: { id: true, status: true, isFlagged: true },
      });

      if (!generation) {
        return c.json({ error: "Generation not found" }, 404);
      }

      if (generation.status !== "completed") {
        return c.json({ error: "Can only update visibility for completed generations" }, 400);
      }

      // Don't allow flagged content to be made public
      if (generation.isFlagged && visibility === "public") {
        return c.json({ error: "Flagged content cannot be made public" }, 403);
      }

      // Update visibility
      const [updated] = await db
        .update(aiGenerations)
        .set({
          visibility: visibility as AIGalleryVisibility,
          updatedAt: new Date(),
        })
        .where(eq(aiGenerations.id, id))
        .returning({
          id: aiGenerations.id,
          visibility: aiGenerations.visibility,
        });

      // Invalidate caches
      const cacheKey = `${CacheKeys.AI_GENERATION}${user.id}:${id}`;
      await redis.del(cacheKey);

      return c.json({
        message: "Visibility updated successfully",
        generation: updated,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to update visibility: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/ai/generations/:id - Delete/Cancel Generation
// ============================================================================

aiApp.delete("/generations/:id", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];
  const { id } = c.req.param();

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid generation ID format" }, 400);
  }

  try {
    // Verify ownership
    const generation = await db.query.aiGenerations.findFirst({
      where: and(
        eq(aiGenerations.id, id),
        eq(aiGenerations.userId, user.id)
      ),
      columns: { id: true, status: true, isPurchased: true },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    // Cannot delete purchased generations
    if (generation.isPurchased) {
      return c.json({ error: "Cannot delete purchased generations" }, 403);
    }

    // If still queued, try to cancel the job
    if (generation.status === "queued") {
      // Try to find and cancel the job (job ID might be stored separately)
      // For now, just mark as cancelled
      await db
        .update(aiGenerations)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(aiGenerations.id, id));

      return c.json({ message: "Generation cancelled" });
    }

    // For completed/failed generations, delete the record
    // Note: In production, you might want to soft delete instead
    await db.delete(aiGenerations).where(eq(aiGenerations.id, id));

    // Invalidate cache
    const cacheKey = `${CacheKeys.AI_GENERATION}${user.id}:${id}`;
    await redis.del(cacheKey);

    return c.json({ message: "Generation deleted successfully" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to delete generation: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/ai/gallery - Public Gallery
// ============================================================================

aiApp.get(
  "/gallery",
  optionalAuth,
  zValidator("query", galleryQuerySchema),
  async (c) => {
    const { page, pageSize, stylePreset, sortBy } = c.req.valid("query");

    // Build cache key
    const cacheKey = `${CacheKeys.AI_GENERATION}gallery:${JSON.stringify({ page, pageSize, stylePreset, sortBy })}`;

    // Try cache
    const cached = await getCached<{ items: unknown[]; total: number }>(cacheKey);
    if (cached) {
      return c.json({
        ...cached,
        page,
        pageSize,
        totalPages: Math.ceil(cached.total / pageSize),
        hasNextPage: page * pageSize < cached.total,
        hasPreviousPage: page > 1,
        fromCache: true,
      });
    }

    try {
      // Build where conditions for public gallery
      const conditions = [
        eq(aiGenerations.visibility, "public"),
        eq(aiGenerations.status, "completed"),
        eq(aiGenerations.isFlagged, false),
      ];

      if (stylePreset) {
        conditions.push(eq(aiGenerations.stylePreset, stylePreset));
      }

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiGenerations)
        .where(and(...conditions));

      const total = countResult[0]?.count ?? 0;

      // Determine sort order
      const orderBy = sortBy === "popular"
        ? desc(aiGenerations.likesCount)
        : desc(aiGenerations.createdAt);

      // Get public generations
      const generations = await db
        .select({
          id: aiGenerations.id,
          promptText: aiGenerations.promptText,
          stylePreset: aiGenerations.stylePreset,
          aspectRatio: aiGenerations.aspectRatio,
          selectedImageUrl: aiGenerations.selectedImageUrl,
          images: aiGenerations.images,
          likesCount: aiGenerations.likesCount,
          viewsCount: aiGenerations.viewsCount,
          createdAt: aiGenerations.createdAt,
        })
        .from(aiGenerations)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset);

      // Process results (return thumbnail from first/selected image)
      const items = generations.map((gen) => {
        const images = gen.images || [];
        const displayImage = gen.selectedImageUrl || images[0]?.thumbnailUrl || images[0]?.imageUrl;
        return {
          id: gen.id,
          promptText: gen.promptText,
          stylePreset: gen.stylePreset,
          aspectRatio: gen.aspectRatio,
          imageUrl: displayImage,
          likesCount: gen.likesCount,
          viewsCount: gen.viewsCount,
          createdAt: gen.createdAt,
        };
      });

      // Cache the result
      await setCached(cacheKey, { items, total }, CACHE_TTL_GALLERY);

      return c.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to fetch gallery: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// GET /api/ai/status/:id - Get Job Status (for polling)
// ============================================================================

aiApp.get("/status/:id", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];
  const { id } = c.req.param();

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid generation ID format" }, 400);
  }

  try {
    // Get generation to verify ownership and get current status
    const generation = await db.query.aiGenerations.findFirst({
      where: and(
        eq(aiGenerations.id, id),
        eq(aiGenerations.userId, user.id)
      ),
      columns: {
        id: true,
        status: true,
        images: true,
        selectedImageId: true,
        selectedImageUrl: true,
        processingTimeMs: true,
        errorMessage: true,
        createdAt: true,
        queuedAt: true,
        processingStartedAt: true,
        completedAt: true,
      },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    return c.json({
      id: generation.id,
      status: generation.status,
      images: generation.status === "completed" ? generation.images : null,
      selectedImageId: generation.selectedImageId,
      selectedImageUrl: generation.selectedImageUrl,
      processingTimeMs: generation.processingTimeMs,
      errorMessage: generation.errorMessage,
      timestamps: {
        createdAt: generation.createdAt,
        queuedAt: generation.queuedAt,
        processingStartedAt: generation.processingStartedAt,
        completedAt: generation.completedAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to get status: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/ai/style-presets - Get Available Style Presets
// ============================================================================

aiApp.get("/style-presets", async (c) => {
  // This could be expanded to include full style preset details
  // including prompt modifiers, thumbnails, etc.
  const stylePresets = aiStylePresetEnum.enumValues.map((preset) => ({
    id: preset,
    name: preset
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  }));

  return c.json({ items: stylePresets });
});

// ============================================================================
// GET /api/ai/aspect-ratios - Get Available Aspect Ratios
// ============================================================================

aiApp.get("/aspect-ratios", async (c) => {
  const aspectRatios = [
    { id: "square", name: "Square", ratio: "1:1", description: "Perfect for Instagram" },
    { id: "portrait", name: "Portrait", ratio: "2:3", description: "Standard poster format" },
    { id: "landscape", name: "Landscape", ratio: "3:2", description: "Wide format" },
    { id: "panoramic", name: "Panoramic", ratio: "16:9", description: "Ultra-wide format" },
  ];

  return c.json({ items: aspectRatios });
});

// ============================================================================
// Color Palette Routes
// ============================================================================

// ============================================================================
// POST /api/ai/palettes - Create Color Palette
// ============================================================================

aiApp.post(
  "/palettes",
  requireAuth,
  zValidator("json", createPaletteSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const input = c.req.valid("json");

    try {
      // Check palette limit
      const existingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userColorPalettes)
        .where(eq(userColorPalettes.userId, user.id));

      if ((existingCount[0]?.count ?? 0) >= MAX_PALETTES_PER_USER) {
        return c.json(
          { error: `Maximum ${MAX_PALETTES_PER_USER} palettes allowed per user` },
          400
        );
      }

      // If setting as default, unset other defaults first
      if (input.isDefault) {
        await db
          .update(userColorPalettes)
          .set({ isDefault: false })
          .where(
            and(
              eq(userColorPalettes.userId, user.id),
              eq(userColorPalettes.isDefault, true)
            )
          );
      }

      // Create the palette
      const [palette] = await db
        .insert(userColorPalettes)
        .values({
          userId: user.id,
          name: input.name,
          colors: input.colors,
          isDefault: input.isDefault,
        })
        .returning();

      return c.json({ palette }, 201);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to create palette: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// GET /api/ai/palettes - List User's Palettes
// ============================================================================

aiApp.get("/palettes", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];

  try {
    const palettes = await db
      .select()
      .from(userColorPalettes)
      .where(eq(userColorPalettes.userId, user.id))
      .orderBy(desc(userColorPalettes.createdAt));

    // Also return preset color moods as system palettes
    const systemPalettes = [
      { id: "preset-warm", name: "Warm", colors: ["#FF5733", "#FFC300", "#FF8D1A", "#FF6B6B", "#FFE66D"], isSystem: true },
      { id: "preset-cool", name: "Cool", colors: ["#4A90D9", "#5BC0DE", "#7B68EE", "#20B2AA", "#87CEEB"], isSystem: true },
      { id: "preset-neutral", name: "Neutral", colors: ["#A0A0A0", "#D3D3D3", "#F5F5DC", "#C4B7A6", "#E8E8E8"], isSystem: true },
      { id: "preset-vibrant", name: "Vibrant", colors: ["#FF0080", "#00FF00", "#0080FF", "#FFFF00", "#FF00FF"], isSystem: true },
      { id: "preset-muted", name: "Muted", colors: ["#D4A5A5", "#A8C8A8", "#B8B8D4", "#D4C8A5", "#C8C8C8"], isSystem: true },
      { id: "preset-earth", name: "Earth Tones", colors: ["#8B4513", "#556B2F", "#D2B48C", "#BC8F8F", "#6B4423"], isSystem: true },
      { id: "preset-pastel", name: "Pastel", colors: ["#FFB3BA", "#BAFFC9", "#BAE1FF", "#FFFFBA", "#E0BBE4"], isSystem: true },
      { id: "preset-monochrome", name: "Monochrome", colors: ["#000000", "#333333", "#666666", "#999999", "#CCCCCC"], isSystem: true },
    ];

    return c.json({
      userPalettes: palettes,
      systemPalettes,
      maxPalettes: MAX_PALETTES_PER_USER,
      currentCount: palettes.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to fetch palettes: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/ai/palettes/:id - Get Single Palette
// ============================================================================

aiApp.get("/palettes/:id", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];
  const { id } = c.req.param();

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid palette ID format" }, 400);
  }

  try {
    const palette = await db.query.userColorPalettes.findFirst({
      where: and(
        eq(userColorPalettes.id, id),
        eq(userColorPalettes.userId, user.id)
      ),
    });

    if (!palette) {
      return c.json({ error: "Palette not found" }, 404);
    }

    return c.json({ palette });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to fetch palette: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// PATCH /api/ai/palettes/:id - Update Palette
// ============================================================================

aiApp.patch(
  "/palettes/:id",
  requireAuth,
  zValidator("json", updatePaletteSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { id } = c.req.param();
    const input = c.req.valid("json");

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return c.json({ error: "Invalid palette ID format" }, 400);
    }

    try {
      // Verify ownership
      const existing = await db.query.userColorPalettes.findFirst({
        where: and(
          eq(userColorPalettes.id, id),
          eq(userColorPalettes.userId, user.id)
        ),
      });

      if (!existing) {
        return c.json({ error: "Palette not found" }, 404);
      }

      // If setting as default, unset other defaults first
      if (input.isDefault) {
        await db
          .update(userColorPalettes)
          .set({ isDefault: false })
          .where(
            and(
              eq(userColorPalettes.userId, user.id),
              eq(userColorPalettes.isDefault, true),
              sql`${userColorPalettes.id} != ${id}`
            )
          );
      }

      // Build update object
      const updateData: Partial<typeof input> & { updatedAt?: Date } = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.colors !== undefined) updateData.colors = input.colors;
      if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;
      updateData.updatedAt = new Date();

      // Update the palette
      const [updated] = await db
        .update(userColorPalettes)
        .set(updateData)
        .where(eq(userColorPalettes.id, id))
        .returning();

      return c.json({ palette: updated });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to update palette: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/ai/palettes/:id - Delete Palette
// ============================================================================

aiApp.delete("/palettes/:id", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];
  const { id } = c.req.param();

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid palette ID format" }, 400);
  }

  try {
    // Verify ownership
    const existing = await db.query.userColorPalettes.findFirst({
      where: and(
        eq(userColorPalettes.id, id),
        eq(userColorPalettes.userId, user.id)
      ),
      columns: { id: true },
    });

    if (!existing) {
      return c.json({ error: "Palette not found" }, 404);
    }

    // Delete the palette
    await db.delete(userColorPalettes).where(eq(userColorPalettes.id, id));

    return c.json({ message: "Palette deleted successfully" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to delete palette: ${errorMessage}` }, 500);
  }
});

// Export the router
export { aiApp };
export default aiApp;
