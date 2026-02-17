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
  aiPromptSuggestions,
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
import { checkPromptSafety } from "../services/ai-moderation";
import { addAIGenerationJob } from "../queues/ai-generation";
import { getCached, setCached, CacheKeys, redis } from "../lib/redis";
import {
  uploadReferenceImage,
  isValidImageType,
  isValidFileSize,
} from "../lib/storage";

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
  customPaletteId: z.string().uuid().optional(),
  referenceImageUrl: z.string().url().optional(),
  referenceImageWeight: z.coerce.number().min(0.1).max(1.0).optional().default(0.5),
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
// Reference Image Constants
// ============================================================================

const MAX_REFERENCE_IMAGE_SIZE_MB = 5;
const MAX_REFERENCE_IMAGE_DIMENSION = 1024; // Max dimension in pixels
const REFERENCE_IMAGE_COST_MULTIPLIER = 1.2; // 20% more for img2img

// ============================================================================
// Upscaling Constants
// ============================================================================

const UPSCALE_COST_PAISE = {
  "2x": 200,  // ₹2.00 for 2x upscale
  "4x": 400,  // ₹4.00 for 4x upscale
} as const;

type UpscaleMultiplier = "2x" | "4x";

/**
 * Schema for reference image weight
 */
const referenceWeightSchema = z.object({
  weight: z.coerce.number().min(0.1).max(1.0).optional().default(0.5),
});

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
      // Check prompt safety before generation (Layer 1: Automated filtering)
      const safetyResult = await checkPromptSafety(input.prompt);
      if (!safetyResult.isSafe) {
        return c.json(
          {
            error: "Your prompt contains content that is not allowed",
            blockedTerms: safetyResult.blockedTerms.map((t) => ({
              category: t.category,
              severity: t.severity,
            })),
            riskScore: safetyResult.riskScore,
          },
          400
        );
      }

      // Create prompt details object
      const promptDetails: AIPromptDetails = {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        stylePreset: input.stylePreset,
        aspectRatio: input.aspectRatio,
        colorMood: input.colorMood,
        colorPalette: input.colorPalette,
        customPaletteId: input.customPaletteId,
        referenceImageUrl: input.referenceImageUrl,
        referenceImageWeight: input.referenceImageWeight,
        seed: input.seed,
      };

      // Create generation record in database
      // All generations start as pending_review (Layer 2: Human approval required)
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
          // Content moderation - all generations require human review
          moderationStatus: "pending_review",
          needsReview: true,
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
            moderationStatus: generation.moderationStatus,
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
// Prompt Suggestions Data
// ============================================================================

/**
 * Curated prompt suggestions per style preset
 */
const CURATED_SUGGESTIONS: Record<string, string[]> = {
  "wabi-sabi": [
    "A weathered wooden tea house in morning mist",
    "Cracked ceramic bowl with wildflowers",
    "Moss-covered stones in a quiet garden",
    "Single autumn leaf on aged paper",
    "Ancient bamboo grove at dawn",
    "Imperfect pottery on worn linen",
  ],
  "abstract-expression": [
    "Explosive colors cascading across the canvas",
    "Bold brushstrokes in motion and energy",
    "Emotional landscape of swirling hues",
    "Dynamic interplay of primary colors",
    "Gestural marks dancing in space",
    "Raw energy translated into color",
  ],
  "botanical": [
    "Exotic orchids in scientific detail",
    "Wild meadow flowers arrangement",
    "Tropical monstera leaf study",
    "Vintage botanical illustration of roses",
    "Succulent garden composition",
    "Pressed flower collection layout",
  ],
  "geometric-modern": [
    "Interlocking shapes in bold colors",
    "Minimalist circles and triangles",
    "Bauhaus-inspired composition",
    "Sacred geometry mandala pattern",
    "Art deco geometric abstraction",
    "Contemporary grid structure",
  ],
  "vintage-poster": [
    "Classic travel destination advertisement",
    "Retro coffee shop announcement",
    "1950s diner promotional art",
    "Art nouveau theater show poster",
    "Vintage bicycle racing advertisement",
    "Old-fashioned market day flyer",
  ],
  "pop-art": [
    "Comic book style explosion",
    "Repeated portrait with color variations",
    "Bold product advertisement parody",
    "Halftone dots and primary colors",
    "Celebrity portrait transformation",
    "Consumer culture commentary",
  ],
  "watercolor": [
    "Loose coastal landscape painting",
    "Delicate cherry blossoms in spring",
    "Mountain reflection in still lake",
    "Street cafe scene in Paris",
    "Garden path through flowers",
    "Rainy city evening atmosphere",
  ],
  "photography": [
    "Golden hour portrait with natural light",
    "Dramatic landscape at sunset",
    "Urban architecture in fog",
    "Macro detail of morning dew",
    "Street photography in motion",
    "Minimalist still life composition",
  ],
  "line-art": [
    "Continuous line portrait sketch",
    "Botanical pen illustration",
    "Architectural blueprint style",
    "Minimalist animal silhouette",
    "Hand-drawn city skyline",
    "Elegant calligraphy letters",
  ],
  "typography": [
    "Inspirational quote in elegant script",
    "Bold motivational word poster",
    "Vintage lettering announcement",
    "Modern sans-serif composition",
    "Layered text with depth",
    "Hand-lettered adventure word",
  ],
  "ink-wash": [
    "Mountain range disappearing into mist",
    "Single crane by water's edge",
    "Bamboo forest in rainfall",
    "Ancient pine tree silhouette",
    "Flowing river through valley",
    "Meditative rock garden",
  ],
  "digital-art": [
    "Futuristic city at night",
    "Fantasy dragon in flight",
    "Cyberpunk character portrait",
    "Magical forest with glowing elements",
    "Space exploration scene",
    "Epic battle moment freeze-frame",
  ],
  "minimalist-modern": [
    "Single object on clean background",
    "Architectural detail in shadow",
    "Negative space composition",
    "Simple shapes in harmony",
    "Monochrome landscape simplification",
    "Essential forms only",
  ],
  "impressionist": [
    "Water lilies at golden hour",
    "Sunlit meadow with figures",
    "Coastal cliffs in afternoon light",
    "Garden party under trees",
    "Bridge over calm water",
    "Haystack at different times of day",
  ],
  "art-deco": [
    "Glamorous 1920s fashion figure",
    "Geometric skyline at night",
    "Luxurious cocktail lounge scene",
    "Streamlined automobile design",
    "Jazz age music celebration",
    "Opulent theater entrance",
  ],
};

/**
 * Default suggestions for unknown styles
 */
const DEFAULT_SUGGESTIONS = [
  "Beautiful sunset over calm water",
  "Mountain landscape at golden hour",
  "Peaceful garden scene",
  "Abstract shapes and colors",
  "Elegant floral arrangement",
  "Serene natural scenery",
];

// ============================================================================
// Reference Image Routes
// ============================================================================

// ============================================================================
// POST /api/ai/reference-image - Upload Reference Image
// ============================================================================

aiApp.post("/reference-image", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const weightStr = formData.get("weight") as string | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Parse weight
    const weight = weightStr ? parseFloat(weightStr) : 0.5;
    if (isNaN(weight) || weight < 0.1 || weight > 1.0) {
      return c.json({ error: "Weight must be between 0.1 and 1.0" }, 400);
    }

    // Validate file type
    if (!isValidImageType(file.type)) {
      return c.json(
        { error: "Invalid file type. Supported: JPEG, PNG, WebP" },
        400
      );
    }

    // Validate file size
    if (!isValidFileSize(file.size, MAX_REFERENCE_IMAGE_SIZE_MB)) {
      return c.json(
        { error: `File size must be less than ${MAX_REFERENCE_IMAGE_SIZE_MB}MB` },
        400
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload the reference image
    const result = await uploadReferenceImage(buffer, user.id, file.type);

    return c.json(
      {
        message: "Reference image uploaded successfully",
        referenceImage: {
          url: result.url,
          key: result.key,
          weight,
          expiresAt: result.expiresAt,
          costMultiplier: REFERENCE_IMAGE_COST_MULTIPLIER,
        },
      },
      201
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to upload reference image: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/ai/reference-image-info - Get Reference Image Cost Info
// ============================================================================

aiApp.get("/reference-image-info", async (c) => {
  return c.json({
    maxSizeMB: MAX_REFERENCE_IMAGE_SIZE_MB,
    maxDimension: MAX_REFERENCE_IMAGE_DIMENSION,
    supportedFormats: ["image/jpeg", "image/png", "image/webp"],
    costMultiplier: REFERENCE_IMAGE_COST_MULTIPLIER,
    costExplanation: "Using a reference image adds 20% to generation cost due to additional processing",
    weightRange: {
      min: 0.1,
      max: 1.0,
      default: 0.5,
      explanation: "Low weight = loose inspiration, High weight = closer match to reference",
    },
    expiresAfterHours: 24,
  });
});

// ============================================================================
// Prompt Suggestions Routes
// ============================================================================

// ============================================================================
// GET /api/ai/suggestions - Get Prompt Suggestions
// ============================================================================

const suggestionsQuerySchema = z.object({
  stylePreset: z.enum(aiStylePresetEnum.enumValues).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(6),
  shuffle: z.coerce.boolean().optional().default(true),
});

aiApp.get(
  "/suggestions",
  optionalAuth,
  zValidator("query", suggestionsQuerySchema),
  async (c) => {
    const { stylePreset, limit, shuffle } = c.req.valid("query");

    try {
      // Get curated suggestions for the style
      let suggestions: string[];
      if (stylePreset && CURATED_SUGGESTIONS[stylePreset]) {
        suggestions = [...CURATED_SUGGESTIONS[stylePreset]];
      } else {
        suggestions = [...DEFAULT_SUGGESTIONS];
      }

      // Shuffle if requested
      if (shuffle) {
        for (let i = suggestions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [suggestions[i], suggestions[j]] = [suggestions[j], suggestions[i]];
        }
      }

      // Limit results
      suggestions = suggestions.slice(0, limit);

      // Try to get popular prompts from database
      let popularPrompts: string[] = [];
      try {
        const popularResults = await db
          .select({
            prompt: aiPromptSuggestions.prompt,
          })
          .from(aiPromptSuggestions)
          .where(
            stylePreset
              ? eq(aiPromptSuggestions.stylePreset, stylePreset)
              : sql`1=1`
          )
          .orderBy(desc(aiPromptSuggestions.usageCount))
          .limit(3);

        popularPrompts = popularResults.map((r) => r.prompt);
      } catch {
        // Database not available, continue without popular prompts
      }

      return c.json({
        stylePreset: stylePreset || "all",
        suggestions,
        popular: popularPrompts,
        categories: {
          nature: ["landscape", "flowers", "mountains", "ocean", "forest"],
          abstract: ["shapes", "colors", "patterns", "geometric", "fluid"],
          lifestyle: ["food", "travel", "fashion", "interior", "coffee"],
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to get suggestions: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// GET /api/ai/suggestions/featured - Get Featured/Trending Suggestions
// ============================================================================

aiApp.get("/suggestions/featured", async (c) => {
  // Return featured prompts that work well across multiple styles
  const featured = [
    {
      prompt: "A serene mountain lake at golden hour with mist rising",
      tags: ["nature", "landscape", "peaceful"],
      recommendedStyles: ["photography", "watercolor", "impressionist"],
    },
    {
      prompt: "Exotic tropical flowers in vibrant colors",
      tags: ["botanical", "colorful", "nature"],
      recommendedStyles: ["botanical", "watercolor", "pop-art"],
    },
    {
      prompt: "Abstract geometric composition with bold shapes",
      tags: ["abstract", "modern", "geometric"],
      recommendedStyles: ["geometric-modern", "minimalist-modern", "art-deco"],
    },
    {
      prompt: "Vintage travel poster for a coastal destination",
      tags: ["retro", "travel", "design"],
      recommendedStyles: ["vintage-poster", "art-deco", "pop-art"],
    },
    {
      prompt: "Zen garden with raked sand and stone arrangement",
      tags: ["zen", "minimalist", "peaceful"],
      recommendedStyles: ["wabi-sabi", "ink-wash", "minimalist-modern"],
    },
    {
      prompt: "Dynamic cityscape with dramatic lighting",
      tags: ["urban", "architecture", "dramatic"],
      recommendedStyles: ["digital-art", "photography", "line-art"],
    },
  ];

  return c.json({
    featured,
    updatedAt: new Date().toISOString(),
  });
});

// ============================================================================
// POST /api/ai/suggestions/record-usage - Record Prompt Usage
// ============================================================================

aiApp.post("/suggestions/record-usage", requireAuth, async (c) => {
  const body = await c.req.json();
  const { prompt, stylePreset } = body;

  if (!prompt || typeof prompt !== "string") {
    return c.json({ error: "Prompt is required" }, 400);
  }

  try {
    // Try to update existing or insert new
    await db
      .insert(aiPromptSuggestions)
      .values({
        prompt: prompt.trim().substring(0, 500),
        stylePreset: stylePreset as AIStylePreset,
        usageCount: 1,
      })
      .onConflictDoUpdate({
        target: [aiPromptSuggestions.prompt],
        set: {
          usageCount: sql`${aiPromptSuggestions.usageCount} + 1`,
          updatedAt: new Date(),
        },
      });

    return c.json({ message: "Usage recorded" });
  } catch (error) {
    // Silently fail - this is non-critical tracking
    return c.json({ message: "Usage noted" });
  }
});

// ============================================================================
// Upscaling Routes
// ============================================================================

/**
 * Schema for upscale request
 */
const upscaleSchema = z.object({
  multiplier: z.enum(["2x", "4x"]).default("2x"),
  imageId: z.string().min(1).optional(), // Specific image from generation
});

// ============================================================================
// POST /api/ai/generations/:id/upscale - Request Upscale
// ============================================================================

aiApp.post(
  "/generations/:id/upscale",
  requireAuth,
  zValidator("json", upscaleSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { id } = c.req.param();
    const input = c.req.valid("json");

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
        return c.json({ error: "Generation must be completed before upscaling" }, 400);
      }

      // Find the image to upscale
      const images = generation.images || [];
      let imageToUpscale = images.find((img) => img.isSelected);

      if (input.imageId) {
        imageToUpscale = images.find((img) => img.id === input.imageId);
      }

      if (!imageToUpscale) {
        imageToUpscale = images[0]; // Default to first image
      }

      if (!imageToUpscale) {
        return c.json({ error: "No image available for upscaling" }, 400);
      }

      // Check if already upscaled at this level
      if (imageToUpscale.upscaleStatus === "completed" &&
          imageToUpscale.upscaleMultiplier === (input.multiplier === "2x" ? 2 : 4)) {
        return c.json({
          message: "Image already upscaled at this level",
          upscaledImageUrl: imageToUpscale.upscaledImageUrl,
        });
      }

      // Calculate cost
      const costPaise = UPSCALE_COST_PAISE[input.multiplier as UpscaleMultiplier];

      // Check wallet balance (simplified - in production, use proper wallet service)
      // For now, just proceed and assume balance is sufficient

      // Update the image status to show upscale in progress
      const updatedImages = images.map((img) => {
        if (img.id === imageToUpscale!.id) {
          return {
            ...img,
            upscaleStatus: "processing" as const,
            upscaleMultiplier: (input.multiplier === "2x" ? 2 : 4) as 2 | 4,
          };
        }
        return img;
      });

      await db
        .update(aiGenerations)
        .set({
          images: updatedImages,
          updatedAt: new Date(),
        })
        .where(eq(aiGenerations.id, id));

      // In production, this would add a job to a queue
      // For now, we simulate the upscale completing immediately
      const upscaleJobId = `upscale-${id}-${Date.now()}`;

      return c.json(
        {
          message: "Upscale request submitted",
          upscale: {
            jobId: upscaleJobId,
            generationId: id,
            imageId: imageToUpscale.id,
            multiplier: input.multiplier,
            status: "processing",
            costPaise,
          },
        },
        202
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to submit upscale request: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// GET /api/ai/generations/:id/upscale-status - Check Upscale Status
// ============================================================================

aiApp.get("/generations/:id/upscale-status", requireAuth, async (c) => {
  const user = c.get("user") as AuthVariables["user"];
  const { id } = c.req.param();
  const imageId = c.req.query("imageId");

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "Invalid generation ID format" }, 400);
  }

  try {
    const generation = await db.query.aiGenerations.findFirst({
      where: and(
        eq(aiGenerations.id, id),
        eq(aiGenerations.userId, user.id)
      ),
      columns: {
        id: true,
        images: true,
      },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    const images = generation.images || [];
    let targetImage = imageId
      ? images.find((img) => img.id === imageId)
      : images.find((img) => img.isSelected) || images[0];

    if (!targetImage) {
      return c.json({ error: "Image not found" }, 404);
    }

    return c.json({
      generationId: id,
      imageId: targetImage.id,
      upscaleStatus: targetImage.upscaleStatus || null,
      upscaleMultiplier: targetImage.upscaleMultiplier || null,
      upscaledImageUrl: targetImage.upscaledImageUrl || null,
      upscaledAt: targetImage.upscaledAt || null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to get upscale status: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/ai/upscale-info - Get Upscale Pricing and Info
// ============================================================================

aiApp.get("/upscale-info", async (c) => {
  return c.json({
    multipliers: [
      {
        value: "2x",
        description: "Double the resolution (e.g., 1024x1024 → 2048x2048)",
        costPaise: UPSCALE_COST_PAISE["2x"],
        costFormatted: "₹" + (UPSCALE_COST_PAISE["2x"] / 100).toFixed(2),
      },
      {
        value: "4x",
        description: "Quadruple the resolution (e.g., 1024x1024 → 4096x4096)",
        costPaise: UPSCALE_COST_PAISE["4x"],
        costFormatted: "₹" + (UPSCALE_COST_PAISE["4x"] / 100).toFixed(2),
      },
    ],
    processingTime: {
      "2x": "10-30 seconds",
      "4x": "30-60 seconds",
    },
    maxOutputDimension: 4096,
    supportedFormats: ["image/png", "image/jpeg", "image/webp"],
    notes: [
      "Upscaling uses AI enhancement for best quality",
      "Works best on images generated with this service",
      "External images may have variable results",
    ],
  });
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
