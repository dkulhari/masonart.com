/**
 * Admin AI Moderation API Routes
 *
 * Provides admin API endpoints for AI generation moderation:
 * - GET /api/admin/ai-moderation - List generations pending review
 * - GET /api/admin/ai-moderation/stats - Get moderation statistics
 * - GET /api/admin/ai-moderation/:id - Get generation details
 * - PATCH /api/admin/ai-moderation/:id - Approve/reject generation
 * - POST /api/admin/ai-moderation/bulk-approve - Bulk approve
 * - POST /api/admin/ai-moderation/bulk-reject - Bulk reject
 *
 * All endpoints require admin/moderator authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

import { db } from "../../database";
import { recordAudit } from "../../lib/audit";
import { aiGenerations } from "../../database/schema/ai-generations";
import {
  aiGenerationReviews,
  aiRejectionCategoryEnum,
} from "../../database/schema/ai-generation-reviews";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  approveGeneration,
  rejectGeneration,
  flagGeneration,
  bulkApprove,
  bulkReject,
  getModerationStats,
} from "../../services/ai-moderation";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for listing moderation queue
 */
const listModerationQueueSchema = z.object({
  status: z
    .enum(["pending_review", "approved", "rejected", "flagged"])
    .optional()
    .default("pending_review"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["newest", "oldest"]).default("oldest"), // Oldest first for FIFO queue
  stylePreset: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * Schema for moderating a generation
 */
const moderateGenerationSchema = z.object({
  action: z.enum(["approved", "rejected", "flagged"]),
  reason: z.string().max(1000).optional(),
  category: z.enum(aiRejectionCategoryEnum.enumValues).optional(),
});

/**
 * Schema for bulk operations
 */
const bulkModerationSchema = z.object({
  generationIds: z.array(z.string().uuid()).min(1).max(50),
  reason: z.string().max(1000).optional(),
  category: z.enum(aiRejectionCategoryEnum.enumValues).optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminModerationApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminModerationApp.use("*", requireAuth);
adminModerationApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/ai-moderation - List Moderation Queue
// ============================================================================

adminModerationApp.get(
  "/",
  zValidator("query", listModerationQueueSchema),
  async (c) => {
    const { status, page, pageSize, sortBy, stylePreset, userId } =
      c.req.valid("query");

    try {
      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(
          eq(
            aiGenerations.moderationStatus,
            status as "pending_review" | "approved" | "rejected" | "flagged"
          )
        );
      }

      if (stylePreset) {
        conditions.push(eq(aiGenerations.stylePreset, stylePreset as any));
      }

      if (userId) {
        conditions.push(eq(aiGenerations.userId, userId));
      }

      // Build sort order
      const orderBy =
        sortBy === "oldest"
          ? asc(aiGenerations.createdAt)
          : desc(aiGenerations.createdAt);

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Query generations with user info
      const generations = await db
        .select({
          id: aiGenerations.id,
          promptText: aiGenerations.promptText,
          stylePreset: aiGenerations.stylePreset,
          aspectRatio: aiGenerations.aspectRatio,
          status: aiGenerations.status,
          moderationStatus: aiGenerations.moderationStatus,
          moderationResult: aiGenerations.moderationResult,
          isFlagged: aiGenerations.isFlagged,
          images: aiGenerations.images,
          selectedImageUrl: aiGenerations.selectedImageUrl,
          createdAt: aiGenerations.createdAt,
          userId: aiGenerations.userId,
          userName: users.name,
          userEmail: users.email,
        })
        .from(aiGenerations)
        .leftJoin(users, eq(aiGenerations.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset);

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiGenerations)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count || 0;
      const totalPages = Math.ceil(total / pageSize);

      return c.json({
        generations,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        { error: `Failed to fetch moderation queue: ${errorMessage}` },
        500
      );
    }
  }
);

// ============================================================================
// GET /api/admin/ai-moderation/stats - Get Moderation Statistics
// ============================================================================

adminModerationApp.get("/stats", async (c) => {
  try {
    const stats = await getModerationStats();

    // Get average review time (last 30 days)
    const avgTimeResult = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM AVG(moderated_at - created_at)) / 60 as avg_time_minutes
      FROM ai_generations
      WHERE moderated_at IS NOT NULL
        AND moderated_at > NOW() - INTERVAL '30 days'
    `);

    const avgReviewTimeMinutes =
      (avgTimeResult as any)[0]?.avg_time_minutes || 0;

    return c.json({
      stats,
      avgReviewTimeMinutes: Math.round(avgReviewTimeMinutes),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to fetch stats: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/admin/ai-moderation/:id - Get Generation Details
// ============================================================================

adminModerationApp.get("/:id", async (c) => {
  const { id } = c.req.param();

  // Validate UUID format
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return c.json({ error: "Invalid generation ID format" }, 400);
  }

  try {
    // Get generation with user info
    const generation = await db
      .select({
        id: aiGenerations.id,
        promptText: aiGenerations.promptText,
        promptDetails: aiGenerations.promptDetails,
        stylePreset: aiGenerations.stylePreset,
        aspectRatio: aiGenerations.aspectRatio,
        status: aiGenerations.status,
        moderationStatus: aiGenerations.moderationStatus,
        moderationResult: aiGenerations.moderationResult,
        moderatedAt: aiGenerations.moderatedAt,
        moderatedBy: aiGenerations.moderatedBy,
        rejectionReason: aiGenerations.rejectionReason,
        rejectionCategory: aiGenerations.rejectionCategory,
        isFlagged: aiGenerations.isFlagged,
        images: aiGenerations.images,
        selectedImageUrl: aiGenerations.selectedImageUrl,
        createdAt: aiGenerations.createdAt,
        userId: aiGenerations.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(aiGenerations)
      .leftJoin(users, eq(aiGenerations.userId, users.id))
      .where(eq(aiGenerations.id, id))
      .limit(1);

    if (!generation[0]) {
      return c.json({ error: "Generation not found" }, 404);
    }

    // Get review history
    const reviewHistory = await db
      .select({
        id: aiGenerationReviews.id,
        action: aiGenerationReviews.action,
        reason: aiGenerationReviews.reason,
        category: aiGenerationReviews.category,
        previousStatus: aiGenerationReviews.previousStatus,
        newStatus: aiGenerationReviews.newStatus,
        createdAt: aiGenerationReviews.createdAt,
        reviewerName: users.name,
      })
      .from(aiGenerationReviews)
      .leftJoin(users, eq(aiGenerationReviews.reviewerId, users.id))
      .where(eq(aiGenerationReviews.generationId, id))
      .orderBy(desc(aiGenerationReviews.createdAt));

    return c.json({
      generation: generation[0],
      reviewHistory,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: `Failed to fetch generation: ${errorMessage}` },
      500
    );
  }
});

// ============================================================================
// Audit
// ============================================================================

/**
 * Read the moderation status of the generations about to be acted on.
 *
 * The service layer returns only a count and a new status, so the state a
 * generation moved FROM has to be captured here, before the call. It is the
 * half of the row that makes a decision reviewable: "approved" says nothing;
 * "approved, from flagged" says a second reviewer overrode the first.
 *
 * `ai_generation_reviews` already carries its own reviewer column, and this
 * duplicates it deliberately — the `admin_audit_log` header states the reason:
 * one table answers "who did what", always, without a reader having to know
 * which feature keeps its own log.
 */
async function moderationStatuses(
  ids: string[]
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      id: aiGenerations.id,
      moderationStatus: aiGenerations.moderationStatus,
    })
    .from(aiGenerations)
    .where(inArray(aiGenerations.id, ids));

  return new Map(rows.map((row) => [row.id, row.moderationStatus ?? null]));
}

/**
 * One row per generation that ACTUALLY moved.
 *
 * The bulk helpers swallow per-id failures and return only totals, so the
 * statuses are re-read afterwards and compared. Emitting a row per requested id
 * would claim a moderation that never happened for every id in the failed
 * count — the one thing an audit trail must never do.
 */
async function recordModerations(
  c: Parameters<typeof recordAudit>[0],
  before: Map<string, string | null>,
  after: Map<string, string | null>,
  metadata: Record<string, unknown>
): Promise<void> {
  for (const [id, was] of before) {
    const now = after.get(id) ?? null;
    if (now === was) continue;

    await recordAudit(c, {
      action: "ai_generation.moderated",
      entityType: "ai_generation",
      entityId: id,
      summary: `Moderated AI generation ${id}: ${was ?? "unset"} → ${now ?? "unset"}`,
      before: { moderationStatus: was },
      after: { moderationStatus: now },
      metadata,
    });
  }
}

// ============================================================================
// PATCH /api/admin/ai-moderation/:id - Moderate Generation
// ============================================================================

adminModerationApp.patch(
  "/:id",
  zValidator("json", moderateGenerationSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { id } = c.req.param();
    const { action, reason, category } = c.req.valid("json");

    // Validate UUID format
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return c.json({ error: "Invalid generation ID format" }, 400);
    }

    // Require reason for rejection
    if (action === "rejected" && !reason) {
      return c.json({ error: "Reason is required for rejection" }, 400);
    }

    // Require category for rejection
    if (action === "rejected" && !category) {
      return c.json({ error: "Category is required for rejection" }, 400);
    }

    try {
      // Before the service call: it reports the new status but not the old one.
      const before = await moderationStatuses([id]);
      if (!before.has(id)) {
        return c.json({ error: "Generation not found" }, 404);
      }

      let result;

      switch (action) {
        case "approved":
          result = await approveGeneration(id, user.id, reason);
          break;
        case "rejected":
          result = await rejectGeneration(id, user.id, category!, reason!);
          break;
        case "flagged":
          result = await flagGeneration(id, user.id, reason || "Flagged for senior review");
          break;
      }

      await recordAudit(c, {
        action: "ai_generation.moderated",
        entityType: "ai_generation",
        entityId: id,
        summary:
          `Moderated AI generation ${id}: ` +
          `${before.get(id) ?? "unset"} → ${result?.newStatus ?? action}`,
        before: { moderationStatus: before.get(id) ?? null },
        after: { moderationStatus: result?.newStatus ?? action },
        // The reason and category are the decision itself, not a side note —
        // a rejection with no recorded reason is unappealable.
        metadata: {
          decision: action,
          reason: reason ?? null,
          category: category ?? null,
          reviewId: result?.reviewId ?? null,
        },
      });

      return c.json({
        message: `Generation ${action} successfully`,
        result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json(
        { error: `Failed to moderate generation: ${errorMessage}` },
        500
      );
    }
  }
);

// ============================================================================
// POST /api/admin/ai-moderation/bulk-approve - Bulk Approve
// ============================================================================

adminModerationApp.post(
  "/bulk-approve",
  zValidator("json", bulkModerationSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { generationIds } = c.req.valid("json");

    try {
      const before = await moderationStatuses(generationIds);
      const result = await bulkApprove(generationIds, user.id);
      const after = await moderationStatuses(generationIds);

      await recordModerations(c, before, after, {
        decision: "approved",
        bulk: true,
        requested: generationIds.length,
      });

      return c.json({
        message: `Bulk approve completed`,
        result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Bulk approve failed: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/ai-moderation/bulk-reject - Bulk Reject
// ============================================================================

adminModerationApp.post(
  "/bulk-reject",
  zValidator("json", bulkModerationSchema),
  async (c) => {
    const user = c.get("user") as AuthVariables["user"];
    const { generationIds, reason, category } = c.req.valid("json");

    if (!reason) {
      return c.json({ error: "Reason is required for bulk rejection" }, 400);
    }

    if (!category) {
      return c.json({ error: "Category is required for bulk rejection" }, 400);
    }

    try {
      const before = await moderationStatuses(generationIds);
      const result = await bulkReject(generationIds, user.id, category, reason);
      const after = await moderationStatuses(generationIds);

      await recordModerations(c, before, after, {
        decision: "rejected",
        bulk: true,
        requested: generationIds.length,
        reason,
        category,
      });

      return c.json({
        message: `Bulk reject completed`,
        result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Bulk reject failed: ${errorMessage}` }, 500);
    }
  }
);

export { adminModerationApp };
