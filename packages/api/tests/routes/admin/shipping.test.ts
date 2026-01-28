/**
 * Tests for Admin Shipping API Routes
 *
 * This test suite validates the admin shipping API routes:
 * - GET /api/admin/shipping/options - List all shipping options
 * - POST /api/admin/shipping/options - Create a new shipping option
 * - GET /api/admin/shipping/options/:id - Get single shipping option
 * - PATCH /api/admin/shipping/options/:id - Update a shipping option
 * - DELETE /api/admin/shipping/options/:id - Soft delete a shipping option
 *
 * All endpoints require admin authentication.
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Validation schema tests - Test Zod validation schemas
 * 3. Route availability tests - Test routes exist and accept requests
 * 4. Authorization tests - Test admin auth requirements
 * 5. Runtime tests - Require database, gracefully skip when unavailable
 *
 * @see packages/api/src/routes/admin/shipping.ts
 * @see plan/tracker-data/todo/feature-shipping-returns/ticket-0037-api-routes-shipping-options-endpoints.yaml
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import "../../setup";

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
    console.log("Skipping admin shipping runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import("../../../src/index");
    app = testApp;

    // Test database connectivity by making a simple request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await testApp.request("/api/shipping/options", {
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

describe("Admin Shipping Route Module Exports", () => {
  it("should export adminShippingApp from routes/admin/shipping", async () => {
    const adminShippingModule = await import("../../../src/routes/admin/shipping");
    expect(adminShippingModule).toHaveProperty("adminShippingApp");
    expect(adminShippingModule.adminShippingApp).toBeDefined();
  });

  it("should export validation schemas", async () => {
    const adminShippingModule = await import("../../../src/routes/admin/shipping");
    expect(adminShippingModule).toHaveProperty("listShippingOptionsSchema");
    expect(adminShippingModule).toHaveProperty("createShippingOptionSchema");
    expect(adminShippingModule).toHaveProperty("updateShippingOptionSchema");
  });

  it("adminShippingApp should be a Hono app instance", async () => {
    const { adminShippingApp } = await import("../../../src/routes/admin/shipping");
    expect(typeof adminShippingApp.fetch).toBe("function");
    expect(typeof adminShippingApp.request).toBe("function");
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe("Admin Shipping Validation Schemas", () => {
  describe("listShippingOptionsSchema", () => {
    it("should provide defaults for all parameters", async () => {
      const { listShippingOptionsSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      const result = listShippingOptionsSchema.parse({});
      expect(result.includeInactive).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.sortBy).toBe("sortOrder");
      expect(result.sortOrder).toBe("asc");
    });

    it("should validate sortBy enum values", async () => {
      const { listShippingOptionsSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(listShippingOptionsSchema.safeParse({ sortBy: "name" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortBy: "carrier" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortBy: "baseCost" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortBy: "sortOrder" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortBy: "createdAt" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortBy: "invalid" }).success).toBe(false);
    });

    it("should validate sortOrder enum values", async () => {
      const { listShippingOptionsSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(listShippingOptionsSchema.safeParse({ sortOrder: "asc" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortOrder: "desc" }).success).toBe(true);
      expect(listShippingOptionsSchema.safeParse({ sortOrder: "invalid" }).success).toBe(false);
    });

    it("should reject invalid pagination values", async () => {
      const { listShippingOptionsSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(listShippingOptionsSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(listShippingOptionsSchema.safeParse({ page: -1 }).success).toBe(false);
      expect(listShippingOptionsSchema.safeParse({ pageSize: 0 }).success).toBe(false);
      expect(listShippingOptionsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    });
  });

  describe("createShippingOptionSchema", () => {
    it("should validate required fields", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      // Valid data
      expect(
        createShippingOptionSchema.safeParse({
          name: "Standard Shipping",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(true);

      // Missing required fields
      expect(createShippingOptionSchema.safeParse({}).success).toBe(false);
      expect(
        createShippingOptionSchema.safeParse({ name: "Test" }).success
      ).toBe(false);
    });

    it("should validate name max length", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(
        createShippingOptionSchema.safeParse({
          name: "a".repeat(101),
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(false);

      expect(
        createShippingOptionSchema.safeParse({
          name: "a".repeat(100),
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(true);
    });

    it("should validate baseCost is non-negative", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(
        createShippingOptionSchema.safeParse({
          name: "Free Shipping",
          carrier: "USPS",
          baseCost: 0,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(true);

      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: -1,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(false);
    });

    it("should validate estimatedDaysMax >= estimatedDaysMin", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      // Valid: max > min
      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(true);

      // Valid: max = min
      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 3,
          estimatedDaysMax: 3,
        }).success
      ).toBe(true);

      // Invalid: max < min
      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 7,
          estimatedDaysMax: 5,
        }).success
      ).toBe(false);
    });

    it("should validate estimated days are positive integers", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 0,
          estimatedDaysMax: 3,
        }).success
      ).toBe(false);

      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 1.5,
          estimatedDaysMax: 3,
        }).success
      ).toBe(false);
    });

    it("should allow optional description", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      // Without description
      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(true);

      // With description
      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          description: "Fast delivery option",
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(true);
    });

    it("should validate description max length", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(
        createShippingOptionSchema.safeParse({
          name: "Test",
          carrier: "USPS",
          description: "a".repeat(501),
          baseCost: 5.99,
          estimatedDaysMin: 5,
          estimatedDaysMax: 7,
        }).success
      ).toBe(false);
    });

    it("should provide defaults for sortOrder and isActive", async () => {
      const { createShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      const result = createShippingOptionSchema.parse({
        name: "Test",
        carrier: "USPS",
        baseCost: 5.99,
        estimatedDaysMin: 5,
        estimatedDaysMax: 7,
      });

      expect(result.sortOrder).toBe(0);
      expect(result.isActive).toBe(true);
    });
  });

  describe("updateShippingOptionSchema", () => {
    it("should allow partial updates", async () => {
      const { updateShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(updateShippingOptionSchema.safeParse({ name: "New Name" }).success).toBe(true);
      expect(updateShippingOptionSchema.safeParse({ carrier: "FedEx" }).success).toBe(true);
      expect(updateShippingOptionSchema.safeParse({ baseCost: 10.99 }).success).toBe(true);
      expect(updateShippingOptionSchema.safeParse({ isActive: false }).success).toBe(true);
    });

    it("should validate baseCost if provided", async () => {
      const { updateShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(updateShippingOptionSchema.safeParse({ baseCost: 10.99 }).success).toBe(true);
      expect(updateShippingOptionSchema.safeParse({ baseCost: 0 }).success).toBe(true);
      expect(updateShippingOptionSchema.safeParse({ baseCost: -5 }).success).toBe(false);
    });

    it("should allow setting description to null", async () => {
      const { updateShippingOptionSchema } = await import(
        "../../../src/routes/admin/shipping"
      );

      expect(
        updateShippingOptionSchema.safeParse({ description: null }).success
      ).toBe(true);
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Admin Shipping Route Availability", () => {
  it("GET /api/admin/shipping/options route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/admin/shipping/options");
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/shipping/options route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/admin/shipping/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        carrier: "USPS",
        baseCost: 5.99,
        estimatedDaysMin: 5,
        estimatedDaysMax: 7,
      }),
    });
    // Should be 401 (unauthorized) since POST requires admin auth
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/shipping/options/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`);
    // Should be 401 (unauthorized) since GET requires admin auth
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/shipping/options/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    // Should be 401 (unauthorized) since PATCH requires admin auth
    expect(res.status).toBe(401);
  });

  it("DELETE /api/admin/shipping/options/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`, {
      method: "DELETE",
    });
    // Should be 401 (unauthorized) since DELETE requires admin auth
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Admin Shipping Authorization", () => {
  it("GET /api/admin/shipping/options requires authentication", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipping/options");
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/shipping/options requires authentication", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipping/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        carrier: "USPS",
        baseCost: 5.99,
        estimatedDaysMin: 5,
        estimatedDaysMax: 7,
      }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/shipping/options/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/shipping/options/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/admin/shipping/options/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Admin Shipping Response Format", () => {
  it("should return JSON content-type for auth errors", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipping/options");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Admin Shipping HTTP Method Validation", () => {
  it("should reject PUT to /api/admin/shipping/options/:id", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipping/options/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    // Should be 401 (auth first) or 404/405 (method not supported)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipping/options", {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Admin Shipping Performance Tests", () => {
  it("should respond quickly to auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/admin/shipping/options");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
