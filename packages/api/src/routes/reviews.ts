/**
 * Reviews API Routes
 *
 * Provides public API endpoints for product reviews:
 * - GET /api/products/:productId/reviews - List reviews for a product
 * - GET /api/reviews/:reviewId - Get a single review
 * - PATCH /api/reviews/:reviewId - Update own review
 * - DELETE /api/reviews/:reviewId - Delete own review
 *
 * Note: Review creation is only available via order items endpoint
 * (POST /api/orders/:orderId/items/:orderItemId/review)
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db } from "../database";
import { reviews, type ReviewStatus } from "../database/schema/reviews";
import { products } from "../database/schema/products";
import { users } from "../database/schema/users";
import {
  requireAuth,
  optionalAuth,
  canAccess,
  type AuthVariables,
  type OptionalAuthVariables,
} from "../middleware/auth";
import { getCached, setCached, deleteCachedPattern } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const CACHE_TTL_REVIEWS = 300; // 5 minutes

// Add reviews cache key to CacheKeys if not already defined
const REVIEW_CACHE_PREFIX = "reviews:";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for creating a new review
 */
const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(255).optional(),
  content: z.string().min(10).max(5000),
});

/**
 * Schema for updating a review
 */
const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(255).optional(),
  content: z.string().min(10).max(5000).optional(),
});

/**
 * Query parameters for listing reviews
 */
const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["newest", "highest", "lowest"]).default("newest"),
});

/**
 * Rating summary for a product. Mirrors ReviewStatsResponse in
 * packages/web/app/hooks/useReviews.ts — keep the two in step.
 */
interface ReviewStatsPayload {
  averageRating: number;
  totalReviews: number;
  distribution: Array<{
    rating: number;
    count: number;
    percentage: number;
  }>;
}

/**
 * Turn per-rating counts into the summary the product page renders.
 *
 * Exported so the arithmetic — average rounding, percentages, and the
 * always-five-buckets guarantee — can be tested without a database. Seeding
 * real reviews requires a full order chain, since reviews.order_item_id is
 * NOT NULL with an FK.
 */
export function buildReviewStats(
  rows: Array<{ rating: number | string; count: number | string }>
): ReviewStatsPayload {
  const countByRating = new Map(
    rows.map((row) => [Number(row.rating), Number(row.count)])
  );

  const totalReviews = [...countByRating.values()].reduce(
    (sum, count) => sum + count,
    0
  );
  const ratingSum = [...countByRating.entries()].reduce(
    (sum, [rating, count]) => sum + rating * count,
    0
  );

  return {
    // One decimal place — matches how the summary renders it.
    averageRating: totalReviews
      ? Math.round((ratingSum / totalReviews) * 10) / 10
      : 0,
    totalReviews,
    distribution: [5, 4, 3, 2, 1].map((rating) => {
      const count = countByRating.get(rating) ?? 0;
      return {
        rating,
        count,
        percentage: totalReviews ? Math.round((count / totalReviews) * 100) : 0,
      };
    }),
  };
}

/**
 * Drop every cached read for a product's reviews — the paginated lists and
 * the rating summary.
 *
 * The list keys embed page/pageSize/sortBy, so clearing them needs a pattern
 * delete. The previous code passed a "...:*" string to deleteCached, which
 * deletes one exact key; the wildcard was never expanded, so stale review
 * lists survived edits and deletions for the full 5-minute TTL.
 */
async function invalidateProductReviewCaches(productId: string): Promise<void> {
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}product:${productId}:*`);
  await deleteCachedPattern(`${REVIEW_CACHE_PREFIX}stats:${productId}`);
}

// ============================================================================
// Route Handlers
// ============================================================================

// Product reviews routes (nested under products)
const productReviewsApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth to list reviews (shows user's own pending reviews if logged in)
productReviewsApp.use("*", optionalAuth);

/**
 * GET /api/products/:productId/reviews/stats - Rating summary for a product
 *
 * Consumed by the product detail page's review summary block. Registered
 * before "/" so the literal segment is matched first.
 *
 * Returns every star bucket, including empty ones, so the UI can render a
 * stable five-row distribution without filling gaps itself.
 */
productReviewsApp.get("/stats", async (c) => {
  const productId = c.req.param("productId");

  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return c.json({ error: "Invalid product ID" }, 400);
  }

  const cacheKey = `${REVIEW_CACHE_PREFIX}stats:${productId}`;
  const cached = await getCached<ReviewStatsPayload>(cacheKey);
  if (cached) {
    return c.json(cached);
  }

  try {
    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (product.length === 0) {
      return c.json({ error: "Product not found" }, 404);
    }

    // One grouped query rather than five counts.
    const rows = await db
      .select({
        rating: reviews.rating,
        count: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.productId, productId),
          eq(reviews.status, "approved" as ReviewStatus)
        )
      )
      .groupBy(reviews.rating);

    const payload = buildReviewStats(rows);

    await setCached(cacheKey, payload, CACHE_TTL_REVIEWS);

    return c.json(payload);
  } catch (error) {
    console.error("Error fetching review stats:", error);
    return c.json({ error: "Failed to fetch review stats" }, 500);
  }
});

/**
 * GET /api/products/:productId/reviews - List reviews for a product
 */
productReviewsApp.get(
  "/",
  zValidator("query", listReviewsQuerySchema),
  async (c) => {
    const productId = c.req.param("productId");
    const { page, pageSize, sortBy } = c.req.valid("query");
    const user = c.get("user");

    // Validate productId is a valid UUID
    if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
      return c.json({ error: "Invalid product ID" }, 400);
    }

    // Build cache key
    const cacheKey = `${REVIEW_CACHE_PREFIX}product:${productId}:${page}:${pageSize}:${sortBy}`;

    // Try cache first (only for non-authenticated requests)
    if (!user) {
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
    }

    try {
      // Check if product exists
      const product = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product.length) {
        return c.json({ error: "Product not found" }, 404);
      }

      // Build sort order
      const orderBy = {
        newest: desc(reviews.createdAt),
        highest: desc(reviews.rating),
        lowest: asc(reviews.rating),
      }[sortBy];

      // Base condition: approved reviews for this product
      const baseCondition = and(
        eq(reviews.productId, productId),
        eq(reviews.status, "approved" as ReviewStatus)
      );

      // Get total count of approved reviews
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(baseCondition);

      const total = countResult[0]?.count ?? 0;

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Get approved reviews with author info
      const reviewList = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          rating: reviews.rating,
          title: reviews.title,
          content: reviews.content,
          status: reviews.status,
          createdAt: reviews.createdAt,
          updatedAt: reviews.updatedAt,
          author: {
            id: users.id,
            name: users.name,
          },
        })
        .from(reviews)
        .leftJoin(users, eq(reviews.userId, users.id))
        .where(baseCondition)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset);

      // If user is logged in, also fetch their own pending reviews for this product
      let userPendingReviews: typeof reviewList = [];
      if (user) {
        userPendingReviews = await db
          .select({
            id: reviews.id,
            productId: reviews.productId,
            rating: reviews.rating,
            title: reviews.title,
            content: reviews.content,
            status: reviews.status,
            createdAt: reviews.createdAt,
            updatedAt: reviews.updatedAt,
            author: {
              id: users.id,
              name: users.name,
            },
          })
          .from(reviews)
          .leftJoin(users, eq(reviews.userId, users.id))
          .where(
            and(
              eq(reviews.productId, productId),
              eq(reviews.userId, user.id),
              eq(reviews.status, "pending" as ReviewStatus)
            )
          );
      }

      const result = {
        items: reviewList,
        userPendingReviews: user ? userPendingReviews : undefined,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      };

      // Cache the result (only for non-authenticated requests)
      if (!user) {
        await setCached(cacheKey, { items: reviewList, total }, CACHE_TTL_REVIEWS);
      }

      return c.json(result);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      return c.json({ error: "Failed to fetch reviews" }, 500);
    }
  }
);

// Individual review routes
const reviewsApp = new Hono<{ Variables: OptionalAuthVariables }>();
reviewsApp.use("*", optionalAuth);

/**
 * GET /api/reviews/stats - catalogue-wide review aggregate
 *
 * Feeds the collection-grid promo tile (analysis §1.3.6). The stats route
 * above it is per-product; this is the figure for the whole catalogue.
 *
 * `averageRating` is null, not 0, when nothing is approved — the same rule
 * the product list applies to its per-product aggregate. A synthetic 0.0
 * renders as "rated badly" rather than "not yet rated". The tile renders
 * nothing on null rather than rounding a thin sample up into a marketing
 * number.
 *
 * Registered BEFORE `/:reviewId`, or "stats" is read as a review id.
 */
reviewsApp.get("/stats", async (c) => {
  const cacheKey = `${REVIEW_CACHE_PREFIX}stats:catalogue:v1`;

  const cached = await getCached<{
    averageRating: number | null;
    reviewCount: number;
  }>(cacheKey);
  if (cached) return c.json(cached);

  try {
    const [row] = await db
      .select({
        averageRating: sql<
          string | null
        >`round(avg(${reviews.rating})::numeric, 1)`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(eq(reviews.status, "approved" as ReviewStatus));

    const reviewCount = row?.reviewCount ?? 0;

    const payload = {
      // postgres hands numeric back as a string; a string here renders fine
      // and then silently concatenates the first time anything does
      // arithmetic on it.
      averageRating:
        reviewCount > 0 && row?.averageRating != null
          ? Number(row.averageRating)
          : null,
      reviewCount,
    };

    await setCached(cacheKey, payload, CACHE_TTL_REVIEWS);

    return c.json(payload);
  } catch (error) {
    console.error("Error fetching catalogue review stats:", error);
    return c.json({ error: "Failed to fetch review stats" }, 500);
  }
});

/**
 * GET /api/reviews/:reviewId - Get a single review
 */
reviewsApp.get("/:reviewId", async (c) => {
  const reviewId = c.req.param("reviewId");
  const user = c.get("user");

  // Validate reviewId
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  try {
    const reviewResult = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        userId: reviews.userId,
        rating: reviews.rating,
        title: reviews.title,
        content: reviews.content,
        status: reviews.status,
        createdAt: reviews.createdAt,
        updatedAt: reviews.updatedAt,
        author: {
          id: users.id,
          name: users.name,
        },
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!reviewResult.length) {
      return c.json({ error: "Review not found" }, 404);
    }

    const review = reviewResult[0]!;

    // Only show approved reviews, unless it's the owner viewing their own
    if (review.status !== "approved") {
      if (!user || user.id !== review.userId) {
        return c.json({ error: "Review not found" }, 404);
      }
    }

    return c.json({ review });
  } catch (error) {
    console.error("Error fetching review:", error);
    return c.json({ error: "Failed to fetch review" }, 500);
  }
});

// Protected review routes
const protectedReviewsApp = new Hono<{ Variables: AuthVariables }>();
protectedReviewsApp.use("*", requireAuth);

/**
 * PATCH /api/reviews/:reviewId - Update own review
 */
protectedReviewsApp.patch(
  "/:reviewId",
  zValidator("json", updateReviewSchema),
  async (c) => {
    const reviewId = c.req.param("reviewId");
    const updates = c.req.valid("json");
    const user = c.get("user");

    // Validate reviewId
    if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
      return c.json({ error: "Invalid review ID" }, 400);
    }

    // Must provide at least one field to update
    if (!updates.rating && !updates.title && !updates.content) {
      return c.json({ error: "No updates provided" }, 400);
    }

    try {
      // Get the existing review
      const existingReview = await db
        .select({
          id: reviews.id,
          userId: reviews.userId,
          productId: reviews.productId,
        })
        .from(reviews)
        .where(eq(reviews.id, reviewId))
        .limit(1);

      if (!existingReview.length) {
        return c.json({ error: "Review not found" }, 404);
      }

      // Check ownership - only owner can update
      if (!canAccess(user, existingReview[0]!.userId)) {
        throw new HTTPException(403, { message: "You can only update your own reviews" });
      }

      // Update the review and reset status to pending
      const [updatedReview] = await db
        .update(reviews)
        .set({
          ...updates,
          status: "pending", // Reset to pending for re-moderation
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, reviewId))
        .returning();

      // Invalidate cache. These are wildcard keys, so they need
      // deleteCachedPattern — deleteCached takes an exact key and was
      // silently deleting a literal "...:*" that never existed.
      await invalidateProductReviewCaches(existingReview[0]!.productId);

      return c.json({
        message: "Review updated successfully",
        review: {
          id: updatedReview!.id,
          rating: updatedReview!.rating,
          title: updatedReview!.title,
          content: updatedReview!.content,
          status: updatedReview!.status,
          updatedAt: updatedReview!.updatedAt,
        },
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      console.error("Error updating review:", error);
      return c.json({ error: "Failed to update review" }, 500);
    }
  }
);

/**
 * DELETE /api/reviews/:reviewId - Delete own review
 */
protectedReviewsApp.delete("/:reviewId", async (c) => {
  const reviewId = c.req.param("reviewId");
  const user = c.get("user");

  // Validate reviewId
  if (!reviewId || !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return c.json({ error: "Invalid review ID" }, 400);
  }

  try {
    // Get the existing review
    const existingReview = await db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        productId: reviews.productId,
      })
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!existingReview.length) {
      return c.json({ error: "Review not found" }, 404);
    }

    // Check ownership - only owner can delete
    if (!canAccess(user, existingReview[0]!.userId)) {
      throw new HTTPException(403, { message: "You can only delete your own reviews" });
    }

    // Delete the review
    await db.delete(reviews).where(eq(reviews.id, reviewId));

    // Invalidate cache
    await invalidateProductReviewCaches(existingReview[0]!.productId);

    return c.json({ message: "Review deleted successfully" });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error deleting review:", error);
    return c.json({ error: "Failed to delete review" }, 500);
  }
});

// Export the routers
export {
  productReviewsApp,
  reviewsApp,
  protectedReviewsApp,
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
};
