/**
 * Tests for Reviews API Routes
 *
 * This test suite validates the reviews API routes:
 * - GET /api/products/:productId/reviews - List reviews for a product
 * - GET /api/reviews/:reviewId - Get a single review
 * - PATCH /api/reviews/:reviewId - Update own review
 * - DELETE /api/reviews/:reviewId - Delete own review
 *
 * Note: Review creation is now only available via order items endpoint
 * (POST /api/orders/:orderId/items/:orderItemId/review)
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Validation schema tests - Test Zod validation schemas
 * 3. Route availability tests - Test routes exist and accept requests
 * 4. Authorization tests - Test auth requirements
 * 5. Runtime tests - Require database, gracefully skip when unavailable
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 *
 * @see packages/api/src/routes/reviews.ts
 * @see plan/tracker-data/todo/feature-user-reviews/ticket-0029-api-routes-public-review-endpoints.yaml
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import "../setup";
import { readJson } from '../helpers/json';

// ============================================================================
// Test Constants
// ============================================================================

const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const INVALID_UUID = "not-a-uuid";

// ============================================================================
// Test State
// ============================================================================

let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === "true") {
    console.log("Skipping reviews runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import("../../src/index");
    app = testApp;

    // Test database connectivity by making a simple request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await testApp.request("/api/products?page=1&pageSize=1", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 200) {
        isDatabaseAvailable = true;
        console.log("Database connection available for runtime tests");
      } else if (res.status === 500) {
        console.log("Database not available, skipping runtime tests");
        isDatabaseAvailable = false;
      }
    } catch (abortError) {
      console.log("Database check timed out, marking as unavailable");
      isDatabaseAvailable = false;
    }
  } catch (error) {
    console.log(
      "Could not initialize app for testing:",
      (error as Error).message
    );
    isDatabaseAvailable = false;
  }
}, 10000);

// ============================================================================
// Module Export Tests (Always Run)
// ============================================================================

describe("Reviews Route Module Exports", () => {
  it("should export productReviewsApp from routes/reviews", async () => {
    const reviewsModule = await import("../../src/routes/reviews");
    expect(reviewsModule).toHaveProperty("productReviewsApp");
    expect(reviewsModule.productReviewsApp).toBeDefined();
  });

  it("should NOT export createReviewApp from routes/reviews (removed for verified purchase reviews)", async () => {
    const reviewsModule = await import("../../src/routes/reviews");
    // createReviewApp was removed - reviews are now created via order items endpoint
    expect(reviewsModule).not.toHaveProperty("createReviewApp");
  });

  it("should export reviewsApp from routes/reviews", async () => {
    const reviewsModule = await import("../../src/routes/reviews");
    expect(reviewsModule).toHaveProperty("reviewsApp");
    expect(reviewsModule.reviewsApp).toBeDefined();
  });

  it("should export protectedReviewsApp from routes/reviews", async () => {
    const reviewsModule = await import("../../src/routes/reviews");
    expect(reviewsModule).toHaveProperty("protectedReviewsApp");
    expect(reviewsModule.protectedReviewsApp).toBeDefined();
  });

  it("should export validation schemas", async () => {
    const reviewsModule = await import("../../src/routes/reviews");
    expect(reviewsModule).toHaveProperty("createReviewSchema");
    expect(reviewsModule).toHaveProperty("updateReviewSchema");
    expect(reviewsModule).toHaveProperty("listReviewsQuerySchema");
  });

  it("productReviewsApp should be a Hono app instance", async () => {
    const { productReviewsApp } = await import("../../src/routes/reviews");
    expect(typeof productReviewsApp.fetch).toBe("function");
    expect(typeof productReviewsApp.request).toBe("function");
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe("Reviews Validation Schemas", () => {
  describe("createReviewSchema", () => {
    it("should validate rating between 1-5", async () => {
      const { createReviewSchema } = await import("../../src/routes/reviews");

      // Valid ratings
      expect(
        createReviewSchema.safeParse({
          rating: 1,
          content: "This is a valid review content",
        }).success
      ).toBe(true);
      expect(
        createReviewSchema.safeParse({
          rating: 5,
          content: "This is a valid review content",
        }).success
      ).toBe(true);
      expect(
        createReviewSchema.safeParse({
          rating: 3,
          content: "This is a valid review content",
        }).success
      ).toBe(true);
    });

    it("should reject rating outside 1-5", async () => {
      const { createReviewSchema } = await import("../../src/routes/reviews");

      // Invalid ratings
      expect(
        createReviewSchema.safeParse({
          rating: 0,
          content: "This is a valid review content",
        }).success
      ).toBe(false);
      expect(
        createReviewSchema.safeParse({
          rating: 6,
          content: "This is a valid review content",
        }).success
      ).toBe(false);
      expect(
        createReviewSchema.safeParse({
          rating: -1,
          content: "This is a valid review content",
        }).success
      ).toBe(false);
      expect(
        createReviewSchema.safeParse({
          rating: 3.5,
          content: "This is a valid review content",
        }).success
      ).toBe(false); // Must be integer
    });

    it("should require content with minimum 10 characters", async () => {
      const { createReviewSchema } = await import("../../src/routes/reviews");

      // Valid content
      expect(
        createReviewSchema.safeParse({ rating: 5, content: "1234567890" })
          .success
      ).toBe(true);

      // Invalid content (too short)
      expect(
        createReviewSchema.safeParse({ rating: 5, content: "123456789" }).success
      ).toBe(false);
      expect(
        createReviewSchema.safeParse({ rating: 5, content: "" }).success
      ).toBe(false);
    });

    it("should reject content exceeding 5000 characters", async () => {
      const { createReviewSchema } = await import("../../src/routes/reviews");

      const longContent = "a".repeat(5001);
      expect(
        createReviewSchema.safeParse({ rating: 5, content: longContent }).success
      ).toBe(false);

      const validContent = "a".repeat(5000);
      expect(
        createReviewSchema.safeParse({ rating: 5, content: validContent })
          .success
      ).toBe(true);
    });

    it("should allow optional title with max 255 characters", async () => {
      const { createReviewSchema } = await import("../../src/routes/reviews");

      // Without title
      expect(
        createReviewSchema.safeParse({
          rating: 5,
          content: "This is a valid review content",
        }).success
      ).toBe(true);

      // With valid title
      expect(
        createReviewSchema.safeParse({
          rating: 5,
          title: "Great product!",
          content: "This is a valid review content",
        }).success
      ).toBe(true);

      // With too long title
      expect(
        createReviewSchema.safeParse({
          rating: 5,
          title: "a".repeat(256),
          content: "This is a valid review content",
        }).success
      ).toBe(false);
    });
  });

  describe("updateReviewSchema", () => {
    it("should allow partial updates", async () => {
      const { updateReviewSchema } = await import("../../src/routes/reviews");

      expect(updateReviewSchema.safeParse({ rating: 4 }).success).toBe(true);
      expect(
        updateReviewSchema.safeParse({ content: "Updated content here" })
          .success
      ).toBe(true);
      expect(updateReviewSchema.safeParse({ title: "New title" }).success).toBe(
        true
      );
    });

    it("should validate rating if provided", async () => {
      const { updateReviewSchema } = await import("../../src/routes/reviews");

      expect(updateReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
      expect(updateReviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    });
  });

  describe("listReviewsQuerySchema", () => {
    it("should validate sortBy enum values", async () => {
      const { listReviewsQuerySchema } = await import(
        "../../src/routes/reviews"
      );

      expect(
        listReviewsQuerySchema.safeParse({ sortBy: "newest" }).success
      ).toBe(true);
      expect(
        listReviewsQuerySchema.safeParse({ sortBy: "highest" }).success
      ).toBe(true);
      expect(
        listReviewsQuerySchema.safeParse({ sortBy: "lowest" }).success
      ).toBe(true);
      expect(
        listReviewsQuerySchema.safeParse({ sortBy: "invalid" }).success
      ).toBe(false);
    });

    it("should provide defaults for pagination", async () => {
      const { listReviewsQuerySchema } = await import(
        "../../src/routes/reviews"
      );

      const result = listReviewsQuerySchema.parse({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.sortBy).toBe("newest");
    });

    it("should reject invalid pagination values", async () => {
      const { listReviewsQuerySchema } = await import(
        "../../src/routes/reviews"
      );

      expect(listReviewsQuerySchema.safeParse({ page: 0 }).success).toBe(false);
      expect(listReviewsQuerySchema.safeParse({ page: -1 }).success).toBe(false);
      expect(listReviewsQuerySchema.safeParse({ pageSize: 0 }).success).toBe(
        false
      );
      expect(listReviewsQuerySchema.safeParse({ pageSize: 51 }).success).toBe(
        false
      );
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Reviews Route Availability", () => {
  it("GET /api/products/:productId/reviews route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/products/${VALID_UUID}/reviews`);
    // Route exists if we get a JSON response - 404 is valid (product not found)
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // The product detail page calls this on every load. It was never defined,
  // so it 404'd three times per PDP view and the review summary sat in a
  // permanent skeleton (#353).
  it("GET /api/products/:productId/reviews/stats route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/products/${VALID_UUID}/reviews/stats`);

    // A missing route falls through to the API's HTML/JSON 404 handler. The
    // route existing means we get a handled JSON response, and specifically
    // not a "route not found" 404.
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body.error).not.toBe("Not Found");
  });

  it("POST /api/products/:productId/reviews route should NOT create reviews (removed for verified purchase reviews)", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/products/${VALID_UUID}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: 5,
        content: "This is a test review content",
      }),
    });
    // The POST route was removed - should return 404 or 401 (middleware runs but no handler)
    // Reviews can now only be created via order items endpoint
    // Key point: it should NOT return 201 (created) anymore
    expect([401, 404].includes(res.status)).toBe(true);
    expect(res.status).not.toBe(201);
  });

  it("GET /api/reviews/:reviewId route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/reviews/${VALID_UUID}`);
    // Should return JSON response (404 for not found is valid)
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("PATCH /api/reviews/:reviewId route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/reviews/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4 }),
    });
    // Should be 401 (unauthorized) since PATCH requires auth, not 404
    expect([401, 500].includes(res.status)).toBe(true);
  });

  it("DELETE /api/reviews/:reviewId route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/reviews/${VALID_UUID}`, {
      method: "DELETE",
    });
    // Should be 401 (unauthorized) since DELETE requires auth, not 404
    expect([401, 500].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Input Validation Tests (Always Run via App)
// ============================================================================

describe("buildReviewStats", () => {
  it("computes average, totals and percentages from grouped counts", async () => {
    const { buildReviewStats } = await import("../../src/routes/reviews");

    // 5x2, 4x1, 1x1 => 4 reviews, sum 15, average 3.75 -> 3.8
    const stats = buildReviewStats([
      { rating: 5, count: 2 },
      { rating: 4, count: 1 },
      { rating: 1, count: 1 },
    ]);

    expect(stats.totalReviews).toBe(4);
    expect(stats.averageRating).toBe(3.8);
    expect(stats.distribution).toEqual([
      { rating: 5, count: 2, percentage: 50 },
      { rating: 4, count: 1, percentage: 25 },
      { rating: 3, count: 0, percentage: 0 },
      { rating: 2, count: 0, percentage: 0 },
      { rating: 1, count: 1, percentage: 25 },
    ]);
  });

  it("always returns five buckets, highest rating first", async () => {
    const { buildReviewStats } = await import("../../src/routes/reviews");

    const stats = buildReviewStats([{ rating: 3, count: 1 }]);

    expect(stats.distribution.map((d) => d.rating)).toEqual([5, 4, 3, 2, 1]);
  });

  it("returns zeros rather than NaN when a product has no reviews", async () => {
    const { buildReviewStats } = await import("../../src/routes/reviews");

    const stats = buildReviewStats([]);

    expect(stats.averageRating).toBe(0);
    expect(stats.totalReviews).toBe(0);
    expect(stats.distribution.every((d) => d.count === 0)).toBe(true);
    expect(stats.distribution.every((d) => d.percentage === 0)).toBe(true);
  });

  it("coerces string counts, which pg returns for aggregates", async () => {
    const { buildReviewStats } = await import("../../src/routes/reviews");

    const stats = buildReviewStats([
      { rating: "5", count: "3" },
      { rating: "1", count: "1" },
    ]);

    // String concatenation instead of addition would give 4 -> "31".
    expect(stats.totalReviews).toBe(4);
    expect(stats.averageRating).toBe(4);
  });
});

describe("Reviews Input Validation", () => {
  describe("GET /api/products/:productId/reviews/stats", () => {
    it("should reject invalid productId format", async () => {
      if (!app) return;

      const res = await app.request(
        `/api/products/${INVALID_UUID}/reviews/stats`
      );
      expect(res.status).toBe(400);

      const json = await readJson(res);
      expect(json.error).toBe("Invalid product ID");
    });

    it("should return the shape the product page consumes", async () => {
      if (!app || !isDatabaseAvailable) return;

      const res = await app.request(
        `/api/products/${VALID_UUID}/reviews/stats`
      );

      // Unknown product is a legitimate 404; what matters is that a 200
      // carries the contract useReviews.ts expects.
      if (res.status !== 200) {
        expect([404, 500].includes(res.status)).toBe(true);
        return;
      }

      const json = await readJson(res);
      expect(typeof json.averageRating).toBe("number");
      expect(typeof json.totalReviews).toBe("number");
      expect(Array.isArray(json.distribution)).toBe(true);

      // Always five buckets, one per star rating, highest first.
      expect(json.distribution).toHaveLength(5);
      expect(json.distribution.map((d: { rating: number }) => d.rating)).toEqual(
        [5, 4, 3, 2, 1]
      );
      for (const bucket of json.distribution) {
        expect(typeof bucket.count).toBe("number");
        expect(typeof bucket.percentage).toBe("number");
      }
    });
  });

  describe("GET /api/products/:productId/reviews", () => {
    it("should reject invalid productId format", async () => {
      if (!app) return;

      const res = await app.request(`/api/products/${INVALID_UUID}/reviews`);
      expect(res.status).toBe(400);

      const json = await readJson(res);
      expect(json.error).toBe("Invalid product ID");
    });

    it("should accept valid pagination parameters", async () => {
      if (!app) return;

      const res = await app.request(
        `/api/products/${VALID_UUID}/reviews?page=1&pageSize=10&sortBy=newest`
      );
      // Should accept valid params (200, 404 product not found, or 500 for db error)
      expect([200, 404, 500].includes(res.status)).toBe(true);
    });

    it("should reject invalid sortBy value", async () => {
      if (!app) return;

      const res = await app.request(
        `/api/products/${VALID_UUID}/reviews?sortBy=invalid`
      );
      expect(res.status).toBe(400);
    });

    it("should reject page less than 1", async () => {
      if (!app) return;

      const res = await app.request(
        `/api/products/${VALID_UUID}/reviews?page=0`
      );
      expect(res.status).toBe(400);
    });

    it("should reject pageSize exceeding max (50)", async () => {
      if (!app) return;

      const res = await app.request(
        `/api/products/${VALID_UUID}/reviews?pageSize=51`
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/reviews/:reviewId", () => {
    it("should reject invalid reviewId format", async () => {
      if (!app) return;

      const res = await app.request(`/api/reviews/${INVALID_UUID}`);
      expect(res.status).toBe(400);

      const json = await readJson(res);
      expect(json.error).toBe("Invalid review ID");
    });
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Reviews Authorization", () => {
  it("POST /api/products/:productId/reviews endpoint no longer creates reviews", async () => {
    if (!app) {
      console.log("App not available, skipping auth test");
      return;
    }

    const res = await app.request(`/api/products/${VALID_UUID}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: 5,
        content: "This is a test review content that is long enough",
      }),
    });
    // The POST endpoint was removed - returns 404 or 401 (middleware runs but no handler)
    // Reviews are now created via order items endpoint only
    // Key point: it should NOT return 201 (created) anymore
    expect([401, 404].includes(res.status)).toBe(true);
    expect(res.status).not.toBe(201);
  });

  it("PATCH /api/reviews/:reviewId requires authentication", async () => {
    if (!app) {
      console.log("App not available, skipping auth test");
      return;
    }

    const res = await app.request(`/api/reviews/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4 }),
    });
    // Should be 401 unauthorized without valid session
    expect(res.status).toBe(401);
  });

  it("DELETE /api/reviews/:reviewId requires authentication", async () => {
    if (!app) {
      console.log("App not available, skipping auth test");
      return;
    }

    const res = await app.request(`/api/reviews/${VALID_UUID}`, {
      method: "DELETE",
    });
    // Should be 401 unauthorized without valid session
    expect(res.status).toBe(401);
  });

  it("GET /api/products/:productId/reviews allows anonymous access", async () => {
    if (!app) return;

    const res = await app.request(`/api/products/${VALID_UUID}/reviews`);
    // Should not be 401 - anonymous access allowed
    expect(res.status).not.toBe(401);
  });

  it("GET /api/reviews/:reviewId allows anonymous access", async () => {
    if (!app) return;

    const res = await app.request(`/api/reviews/${VALID_UUID}`);
    // Should not be 401 - anonymous access allowed (may be 404 for not found)
    expect(res.status).not.toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Reviews Response Format", () => {
  it("should return JSON content-type for list endpoint", async () => {
    if (!app) return;

    const res = await app.request(`/api/products/${VALID_UUID}/reviews`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for single review endpoint", async () => {
    if (!app) return;

    const res = await app.request(`/api/reviews/${VALID_UUID}`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return error object for validation failures", async () => {
    if (!app) return;

    const res = await app.request(`/api/products/${INVALID_UUID}/reviews`);
    expect(res.status).toBe(400);

    const json = await readJson(res);
    expect(json).toHaveProperty("error");
    expect(typeof json.error).toBe("string");
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe("Reviews Runtime Tests (Database Required)", () => {
  describe("GET /api/products/:productId/reviews - List Reviews", () => {
    it("should return paginated reviews list", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/products/${VALID_UUID}/reviews`);
      // Will be 404 if product doesn't exist, or 200 with empty list
      expect([200, 404].includes(res.status)).toBe(true);

      if (res.status === 200) {
        const json = await readJson(res);
        expect(json).toHaveProperty("items");
        expect(json).toHaveProperty("total");
        expect(json).toHaveProperty("page");
        expect(json).toHaveProperty("pageSize");
        expect(json).toHaveProperty("totalPages");
        expect(json).toHaveProperty("hasNextPage");
        expect(json).toHaveProperty("hasPreviousPage");
        expect(Array.isArray(json.items)).toBe(true);
      }
    });

    it("should only list approved reviews for anonymous users", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/products/${VALID_UUID}/reviews`);

      if (res.status === 200) {
        const json = await readJson(res);
        // All returned reviews should have status 'approved'
        for (const review of json.items) {
          expect(review.status).toBe("approved");
        }
      }
    });

    it("should return correct pagination", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request(
        `/api/products/${VALID_UUID}/reviews?page=1&pageSize=5`
      );

      if (res.status === 200) {
        const json = await readJson(res);
        expect(json.page).toBe(1);
        expect(json.pageSize).toBe(5);
        expect(json.items.length).toBeLessThanOrEqual(5);
      }
    });

    it("should return 404 for non-existent product", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const nonExistentId = "99999999-9999-9999-9999-999999999999";
      const res = await app.request(`/api/products/${nonExistentId}/reviews`);
      expect(res.status).toBe(404);

      const json = await readJson(res);
      expect(json.error).toBe("Product not found");
    });
  });

  describe("GET /api/reviews/:reviewId - Single Review", () => {
    it("should return 404 for non-existent review", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const nonExistentId = "99999999-9999-9999-9999-999999999999";
      const res = await app.request(`/api/reviews/${nonExistentId}`);
      expect(res.status).toBe(404);

      const json = await readJson(res);
      expect(json.error).toBe("Review not found");
    });
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Reviews HTTP Method Validation", () => {
  it("should reject PUT to /api/reviews/:reviewId", async () => {
    if (!app) return;

    const res = await app.request(`/api/reviews/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4 }),
    });
    // Should be 401 (auth middleware first) or 404/405 (method not supported)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight on reviews list", async () => {
    if (!app) return;

    const res = await app.request(`/api/products/${VALID_UUID}/reviews`, {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Reviews Performance Tests", () => {
  it("should respond quickly to validation errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/products/${INVALID_UUID}/reviews`);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it("should respond quickly to 404 for removed POST endpoint", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/products/${VALID_UUID}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5, content: "Test content here" }),
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
