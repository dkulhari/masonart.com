/**
 * Admin Reviews API Routes
 *
 * Provides admin API endpoints for review moderation:
 * - GET /api/admin/reviews - List all reviews with filters
 * - GET /api/admin/reviews/stats - Get moderation statistics
 * - GET /api/admin/reviews/:reviewId - Get full review details
 * - PATCH /api/admin/reviews/:reviewId - Moderate review (approve/reject)
 * - DELETE /api/admin/reviews/:reviewId - Delete any review
 * - DELETE /api/admin/reviews/:reviewId/media/:mediaId - Delete one attachment
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, gte, inArray } from "drizzle-orm";

import { db } from "../../database";
import { recordAudit } from "../../lib/audit";
import { reviews, type ReviewStatus } from "../../database/schema/reviews";
import { reviewMedia } from "../../database/schema/review-media";
import { products } from "../../database/schema/products";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { deleteCachedPattern } from "../../lib/redis";
import { deleteFile } from "../../lib/storage";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const REVIEW_CACHE_PREFIX = "reviews:";

/**
 * Every review-media object key starts here — see StoragePaths.reviewMedia().
 */
const REVIEW_MEDIA_KEY_PREFIX = "reviews/";

/** Loose UUID shape, matching the ids Postgres hands back. */
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for admin review listing
 */
const listAdminReviewsSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  productId: z.string().uuid().optional(),
  userId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["newest", "oldest", "rating"]).default("newest"),
});

/**
 * Schema for moderating a review
 */
const moderateReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  moderatorNotes: z.string().max(1000).optional(),
});

// ============================================================================
// Review media
// ============================================================================

/**
 * One attachment, as the moderation screens see it.
 *
 * Unlike the public payload in routes/reviews.ts this carries
 * `processingStatus` and `processingError`: a transcode that is still running
 * or that failed outright has to be visible to the person deciding whether the
 * review is publishable, not silently missing from their screen.
 */
interface AdminReviewMediaPayload {
  id: string;
  reviewId: string;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  sortOrder: number;
  processingStatus: string;
  processingError: string | null;
  createdAt: Date;
}

/** Columns every admin read of review media selects. */
const adminReviewMediaColumns = {
  id: reviewMedia.id,
  reviewId: reviewMedia.reviewId,
  mediaType: reviewMedia.mediaType,
  url: reviewMedia.url,
  thumbnailUrl: reviewMedia.thumbnailUrl,
  posterUrl: reviewMedia.posterUrl,
  durationSeconds: reviewMedia.durationSeconds,
  width: reviewMedia.width,
  height: reviewMedia.height,
  sizeBytes: reviewMedia.sizeBytes,
  sortOrder: reviewMedia.sortOrder,
  processingStatus: reviewMedia.processingStatus,
  processingError: reviewMedia.processingError,
  createdAt: reviewMedia.createdAt,
};

/**
 * Attach `media` to a page of review rows, preserving their order.
 *
 * Deliberately NO `processingStatus` filter. The public reads restrict
 * themselves to `ready` because a half-transcoded tile looks like a broken
 * store; the moderation queue is the one screen where a stuck or failed
 * pipeline needs to be visible, so it takes every row.
 *
 * One `inArray` query for the whole page — never one per review.
 */
async function withAdminMedia<T extends { id: string }>(
  rows: T[]
): Promise<Array<T & { media: AdminReviewMediaPayload[] }>> {
  if (rows.length === 0) return [];

  const mediaRows = await db
    .select(adminReviewMediaColumns)
    .from(reviewMedia)
    .where(
      inArray(
        reviewMedia.reviewId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(asc(reviewMedia.sortOrder), asc(reviewMedia.createdAt));

  const byReview = new Map<string, AdminReviewMediaPayload[]>();
  for (const row of mediaRows) {
    const existing = byReview.get(row.reviewId);
    if (existing) {
      existing.push(row);
    } else {
      byReview.set(row.reviewId, [row]);
    }
  }

  return rows.map((row) => ({ ...row, media: byReview.get(row.id) ?? [] }));
}

/**
 * The R2 object key behind a stored media URL, or null.
 *
 * The URL is stored rather than derived, so this refuses to return anything
 * outside the `reviews/` prefix: a malformed or hand-edited row must never be
 * able to turn a media deletion into a deletion of product imagery.
 */
function reviewMediaKeyFromUrl(url: string | null): string | null {
  if (!url) return null;

  const marker = url.indexOf(`/${REVIEW_MEDIA_KEY_PREFIX}`);
  if (marker === -1) return null;

  const key = url.slice(marker + 1).split("?")[0] ?? "";
  return key.length > REVIEW_MEDIA_KEY_PREFIX.length ? key : null;
}

/**
 * Drop every cached read a review's media appears in.
 *
 * Mirrors invalidateProductReviewCaches() in routes/reviews.ts — keep the two
 * in step, including the product-list version bumps that came with media (v2)
 * and with the card fields (v3). A pattern left on an older version matches
 * nothing, and moderation silently stops busting the lists.
 */
async function invalidateReviewMediaCaches(productId: string): Promise<void> {
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}product:v3:${productId}:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}all:v2:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}media:v1:*`);
}

// ============================================================================
// Route Handler
// ============================================================================

const adminReviewsApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminReviewsApp.use("*", requireAuth);
adminReviewsApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/reviews - List Reviews (Admin)
// ============================================================================

adminReviewsApp.get(
  "/",
  zValidator("query", listAdminReviewsSchema),
  async (c) => {
    const { status, productId, userId, page, pageSize, sortBy } = c.req.valid("query");

    try {
      // Build where conditions
      const conditions: ReturnType<typeof eq>[] = [];

      if (status) {
        conditions.push(eq(reviews.status, status as ReviewStatus));
      }

      if (productId) {
        conditions.push(eq(reviews.productId, productId));
      }

      if (userId) {
        conditions.push(eq(reviews.userId, userId));
      }

      // Build sort order
      const orderBy = {
        newest: desc(reviews.createdAt),
        oldest: asc(reviews.createdAt),
        rating: desc(reviews.rating),
      }[sortBy];

      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResult[0]?.count ?? 0;

      // Get reviews with author and product info
      const reviewList = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          userId: reviews.userId,
          rating: reviews.rating,
          title: reviews.title,
          content: reviews.content,
          status: reviews.status,
          moderatorId: reviews.moderatorId,
          moderatorNotes: reviews.moderatorNotes,
          createdAt: reviews.createdAt,
          updatedAt: reviews.updatedAt,
          author: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(reviews)
        .leftJoin(users, eq(reviews.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset);

      // Fetch product info for reviews
      const productIds = [...new Set(reviewList.map((r) => r.productId))];
      let productMap: Record<string, { id: string; title: string; slug: string }> = {};

      if (productIds.length > 0) {
        const productList = await db
          .select({
            id: products.id,
            title: products.title,
            slug: products.slug,
          })
          .from(products)
          // `= ANY(${productIds})` renders `= ANY(($1))`, which Postgres
          // rejects — see the same correction in returns and orders (#624).
          .where(inArray(products.id, productIds));

        productMap = productList.reduce(
          (acc, product) => {
            acc[product.id] = product;
            return acc;
          },
          {} as Record<string, { id: string; title: string; slug: string }>
        );
      }

      // Add product info to reviews
      const reviewsWithProduct = reviewList.map((review) => ({
        ...review,
        product: productMap[review.productId] || null,
      }));

      // Attach every attachment, at any processing status — the queue is
      // where a stuck transcode has to surface.
      const items = await withAdminMedia(reviewsWithProduct);

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
      console.error("Error fetching admin reviews:", error);
      return c.json({ error: "Failed to fetch reviews" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/reviews/stats - Get Moderation Statistics
// ============================================================================

adminReviewsApp.get("/stats", async (c) => {
  try {
    // Get counts by status
    const statusCounts = await db
      .select({
        status: reviews.status,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .groupBy(reviews.status);

    // Get today's review count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(gte(reviews.createdAt, today));

    // Get average rating of approved reviews
    const avgRatingResult = await db
      .select({
        avgRating: sql<string>`COALESCE(AVG(${reviews.rating})::numeric(3,2), 0)::text`,
      })
      .from(reviews)
      .where(eq(reviews.status, "approved" as ReviewStatus));

    // Format status counts as object
    const statusCountsMap = statusCounts.reduce(
      (acc, row) => {
        acc[row.status] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return c.json({
      pending: statusCountsMap.pending || 0,
      approved: statusCountsMap.approved || 0,
      rejected: statusCountsMap.rejected || 0,
      today: todayCountResult[0]?.count ?? 0,
      averageRating: parseFloat(avgRatingResult[0]?.avgRating || "0"),
      total: Object.values(statusCountsMap).reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    console.error("Error fetching review statistics:", error);
    return c.json({ error: "Failed to fetch review statistics" }, 500);
  }
});

// ============================================================================
// GET /api/admin/reviews/:reviewId - Get Review Details (Admin)
// ============================================================================

adminReviewsApp.get("/:reviewId", async (c) => {
  const reviewId = c.req.param("reviewId");

  // Validate reviewId
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  try {
    // Get review with full details
    const reviewResult = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        userId: reviews.userId,
        rating: reviews.rating,
        title: reviews.title,
        content: reviews.content,
        status: reviews.status,
        moderatorId: reviews.moderatorId,
        moderatorNotes: reviews.moderatorNotes,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.id, reviewId))
      .limit(1);

    const review = reviewResult[0];

    if (!review) {
      return c.json({ error: "Review not found" }, 404);
    }

    // Get product info
    const productResult = await db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
      })
      .from(products)
      .where(eq(products.id, review.productId))
      .limit(1);

    // Get moderator info if exists
    let moderator = null;
    if (review.moderatorId) {
      const moderatorResult = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, review.moderatorId))
        .limit(1);

      moderator = moderatorResult[0] || null;
    }

    // Same rule as the list: every attachment, whatever the pipeline did to it
    const [reviewWithMedia] = await withAdminMedia([review]);

    return c.json({
      ...reviewWithMedia,
      product: productResult[0] || null,
      moderator,
    });
  } catch (error) {
    console.error("Error fetching review:", error);
    return c.json({ error: "Failed to fetch review" }, 500);
  }
});

// ============================================================================
// PATCH /api/admin/reviews/:reviewId - Moderate Review
// ============================================================================

adminReviewsApp.patch(
  "/:reviewId",
  zValidator("json", moderateReviewSchema),
  async (c) => {
    const reviewId = c.req.param("reviewId");
    const { status, moderatorNotes } = c.req.valid("json");
    const admin = c.get("user");

    // Validate reviewId
    if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
      return c.json({ error: "Invalid review ID" }, 400);
    }

    try {
      // Get existing review
      const existingReview = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          status: reviews.status,
        })
        .from(reviews)
        .where(eq(reviews.id, reviewId))
        .limit(1);

      const review = existingReview[0];

      if (!review) {
        return c.json({ error: "Review not found" }, 404);
      }

      // Update review
      const [updatedReview] = await db
        .update(reviews)
        .set({
          status: status as ReviewStatus,
          moderatorId: admin.id,
          moderatorNotes: moderatorNotes || null,
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, reviewId))
        .returning();

      if (!updatedReview) {
        return c.json({ error: "Failed to moderate review" }, 500);
      }

      // Approving a review publishes its media too, so drop every cached read
      // the review appears in — not just the product list.
      await invalidateReviewMediaCaches(review.productId);

      return c.json({
        message: `Review ${status} successfully`,
        review: {
          id: updatedReview.id,
          status: updatedReview.status,
          moderatorId: updatedReview.moderatorId,
          moderatorNotes: updatedReview.moderatorNotes,
          previousStatus: review.status,
          updatedAt: updatedReview.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error moderating review:", error);
      return c.json({ error: "Failed to moderate review" }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/admin/reviews/:reviewId - Delete Review (Admin)
// ============================================================================

adminReviewsApp.delete("/:reviewId", async (c) => {
  const reviewId = c.req.param("reviewId");

  // Validate reviewId
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  try {
    /**
     * The whole row, not just the ids the cache purge needs. This is a HARD
     * delete: a moment after the statement below there is nothing left that
     * describes what was removed, so this read is the only chance to capture it
     * for the audit trail.
     */
    const existingReview = await db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    const review = existingReview[0];

    if (!review) {
      return c.json({ error: "Review not found" }, 404);
    }

    // Delete the review
    await db.delete(reviews).where(eq(reviews.id, reviewId));

    // Deleting takes the review's media with it (cascade), so invalidate the
    // media and site-wide feeds as well as the product list.
    await invalidateReviewMediaCaches(review.productId);

    /**
     * The delta is INVERTED from the usual shape: the removed row goes in
     * `before` and `after` is null. A row that says only "deleted" cannot
     * answer whether the right review was taken down — and the review itself
     * can no longer be consulted to check.
     */
    await recordAudit(c, {
      action: "review.deleted",
      entityType: "review",
      entityId: reviewId,
      summary:
        `Deleted a ${review.rating}★ review on product ${review.productId}` +
        (review.title ? ` ('${review.title}')` : ""),
      before: {
        productId: review.productId,
        userId: review.userId,
        rating: review.rating,
        title: review.title,
        content: review.content,
        status: review.status,
        // The order item is what makes a review a verified purchase; without it
        // the row cannot answer whether a real customer was silenced.
        orderItemId: review.orderItemId,
        moderatorId: review.moderatorId,
        createdAt: review.createdAt,
      },
      after: null,
    });

    return c.json({
      message: "Review deleted successfully",
      reviewId,
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return c.json({ error: "Failed to delete review" }, 500);
  }
});

// ============================================================================
// DELETE /api/admin/reviews/:reviewId/media/:mediaId - Delete One Attachment
// ============================================================================

/**
 * Strip a single photo or video from a review.
 *
 * There is no separate media moderation queue: media inherits its parent
 * review's status. This is the escape hatch for the case that rule cannot
 * express — one bad file on an otherwise good review, where rejecting the
 * whole review would punish a legitimate customer for one photo.
 *
 * The parent review is deliberately left untouched: status, moderator and
 * notes all stay as they were.
 */
adminReviewsApp.delete("/:reviewId/media/:mediaId", async (c) => {
  const reviewId = c.req.param("reviewId");
  const mediaId = c.req.param("mediaId");

  if (!reviewId || !UUID_PATTERN.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  if (!mediaId || !UUID_PATTERN.test(mediaId)) {
    return c.json({ error: "Invalid media ID" }, 400);
  }

  try {
    // Scoped to the review in the path, so a mediaId belonging to a different
    // review is a 404 rather than a cross-review deletion. The join carries
    // productId, which the cache invalidation below needs.
    const mediaResult = await db
      .select({
        id: reviewMedia.id,
        reviewId: reviewMedia.reviewId,
        url: reviewMedia.url,
        thumbnailUrl: reviewMedia.thumbnailUrl,
        posterUrl: reviewMedia.posterUrl,
        productId: reviews.productId,
      })
      .from(reviewMedia)
      .innerJoin(reviews, eq(reviewMedia.reviewId, reviews.id))
      .where(and(eq(reviewMedia.id, mediaId), eq(reviewMedia.reviewId, reviewId)))
      .limit(1);

    const media = mediaResult[0];

    if (!media) {
      return c.json({ error: "Media not found" }, 404);
    }

    // The rendition, its thumbnail and (for video) the poster frame.
    const keys = [media.url, media.thumbnailUrl, media.posterUrl]
      .map(reviewMediaKeyFromUrl)
      .filter((key): key is string => key !== null);

    // allSettled, not all: an object that is already gone must not leave the
    // row behind, which would put a dead URL back on the storefront.
    const results = await Promise.allSettled(keys.map((key) => deleteFile(key)));
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(
          `Failed to delete review media object ${keys[index]}:`,
          result.reason
        );
      }
    }

    await db.delete(reviewMedia).where(eq(reviewMedia.id, mediaId));

    await invalidateReviewMediaCaches(media.productId);

    /**
     * Inverted delta again, and here the row is doubly the only record: the
     * database row is gone AND the stored objects were deleted above, so the
     * URLs cannot be re-fetched to see what was taken down.
     */
    await recordAudit(c, {
      action: "review_media.deleted",
      entityType: "review_media",
      entityId: mediaId,
      summary: `Stripped one attachment from review ${reviewId}`,
      before: {
        reviewId: media.reviewId,
        productId: media.productId,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        posterUrl: media.posterUrl,
        storageKeysDeleted: keys,
      },
      after: null,
    });

    return c.json({
      message: "Review media deleted successfully",
      reviewId,
      mediaId,
    });
  } catch (error) {
    console.error("Error deleting review media:", error);
    return c.json({ error: "Failed to delete review media" }, 500);
  }
});

// Export the router and schemas
export {
  adminReviewsApp,
  listAdminReviewsSchema,
  moderateReviewSchema,
};
export default adminReviewsApp;
