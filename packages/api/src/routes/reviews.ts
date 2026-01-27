/**
 * Reviews API Routes
 *
 * Provides public API endpoints for product reviews:
 * - GET /api/products/:productId/reviews - List reviews for a product
 * - POST /api/products/:productId/reviews - Create a new review
 * - GET /api/reviews/:reviewId - Get a single review
 * - PATCH /api/reviews/:reviewId - Update own review
 * - DELETE /api/reviews/:reviewId - Delete own review
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
import { getCached, setCached, deleteCached, CacheKeys } from "../lib/redis";

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

// ============================================================================
// Route Handlers
// ============================================================================

// Product reviews routes (nested under products)
const productReviewsApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth to list reviews (shows user's own pending reviews if logged in)
productReviewsApp.use("*", optionalAuth);

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

/**
 * POST /api/products/:productId/reviews - Create a new review
 */
const createReviewApp = new Hono<{ Variables: AuthVariables }>();
createReviewApp.use("*", requireAuth);

createReviewApp.post(
  "/",
  zValidator("json", createReviewSchema),
  async (c) => {
    const productId = c.req.param("productId");
    const { rating, title, content } = c.req.valid("json");
    const user = c.get("user");

    // Validate productId
    if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
      return c.json({ error: "Invalid product ID" }, 400);
    }

    try {
      // Check if product exists and is active
      const product = await db
        .select({ id: products.id, status: products.status })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product.length || product[0].status !== "active") {
        return c.json({ error: "Product not found" }, 404);
      }

      // Check if user already has a review for this product
      const existingReview = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(
          and(eq(reviews.productId, productId), eq(reviews.userId, user.id))
        )
        .limit(1);

      if (existingReview.length) {
        return c.json(
          { error: "You have already reviewed this product" },
          409
        );
      }

      // Create the review with pending status
      const [newReview] = await db
        .insert(reviews)
        .values({
          productId,
          userId: user.id,
          rating,
          title,
          content,
          status: "pending",
        })
        .returning();

      // Invalidate cache for this product's reviews
      await deleteCached(`${REVIEW_CACHE_PREFIX}product:${productId}:*`);

      return c.json(
        {
          message: "Review submitted successfully",
          review: {
            id: newReview.id,
            rating: newReview.rating,
            title: newReview.title,
            content: newReview.content,
            status: newReview.status,
            createdAt: newReview.createdAt,
          },
        },
        201
      );
    } catch (error) {
      console.error("Error creating review:", error);
      return c.json({ error: "Failed to create review" }, 500);
    }
  }
);

// Individual review routes
const reviewsApp = new Hono<{ Variables: OptionalAuthVariables }>();
reviewsApp.use("*", optionalAuth);

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

    const review = reviewResult[0];

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
      if (!canAccess(user, existingReview[0].userId)) {
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

      // Invalidate cache
      await deleteCached(`${REVIEW_CACHE_PREFIX}product:${existingReview[0].productId}:*`);

      return c.json({
        message: "Review updated successfully",
        review: {
          id: updatedReview.id,
          rating: updatedReview.rating,
          title: updatedReview.title,
          content: updatedReview.content,
          status: updatedReview.status,
          updatedAt: updatedReview.updatedAt,
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
    if (!canAccess(user, existingReview[0].userId)) {
      throw new HTTPException(403, { message: "You can only delete your own reviews" });
    }

    // Delete the review
    await db.delete(reviews).where(eq(reviews.id, reviewId));

    // Invalidate cache
    await deleteCached(`${REVIEW_CACHE_PREFIX}product:${existingReview[0].productId}:*`);

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
  createReviewApp,
  reviewsApp,
  protectedReviewsApp,
  createReviewSchema,
  updateReviewSchema,
  listReviewsQuerySchema,
};
