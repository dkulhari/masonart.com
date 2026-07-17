/**
 * Admin Reviews API Routes
 *
 * Provides admin API endpoints for review moderation:
 * - GET /api/admin/reviews - List all reviews with filters
 * - GET /api/admin/reviews/stats - Get moderation statistics
 * - GET /api/admin/reviews/:reviewId - Get full review details
 * - PATCH /api/admin/reviews/:reviewId - Moderate review (approve/reject)
 * - DELETE /api/admin/reviews/:reviewId - Delete any review
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, asc, sql, gte } from "drizzle-orm";

import { db } from "../../database";
import { reviews, type ReviewStatus } from "../../database/schema/reviews";
import { products } from "../../database/schema/products";
import { users } from "../../database/schema/users";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { deleteCached } from "../../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const REVIEW_CACHE_PREFIX = "reviews:";

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
          .where(sql`${products.id} = ANY(${productIds})`);

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

      return c.json({
        items: reviewsWithProduct,
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

    return c.json({
      ...review,
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

      // Invalidate cache for this product's reviews
      await deleteCached(`${REVIEW_CACHE_PREFIX}product:${review.productId}:*`);

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
    // Get existing review for cache invalidation
    const existingReview = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
      })
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    const review = existingReview[0];

    if (!review) {
      return c.json({ error: "Review not found" }, 404);
    }

    // Delete the review
    await db.delete(reviews).where(eq(reviews.id, reviewId));

    // Invalidate cache for this product's reviews
    await deleteCached(`${REVIEW_CACHE_PREFIX}product:${review.productId}:*`);

    return c.json({
      message: "Review deleted successfully",
      reviewId,
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return c.json({ error: "Failed to delete review" }, 500);
  }
});

// Export the router and schemas
export {
  adminReviewsApp,
  listAdminReviewsSchema,
  moderateReviewSchema,
};
export default adminReviewsApp;
