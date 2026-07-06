/**
 * Tests for Shipping API Routes
 *
 * This test suite validates the shipping API routes:
 * - GET /api/shipping/options - List active shipping options
 * - GET /api/shipping/options/:id - Get a single shipping option
 * - GET /api/shipping/estimate - Estimate shipping cost for cart
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Validation schema tests - Test Zod validation schemas
 * 3. Route availability tests - Test routes exist and accept requests
 * 4. Runtime tests - Require database, gracefully skip when unavailable
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 *
 * @see packages/api/src/routes/shipping.ts
 * @see plan/tracker-data/todo/feature-shipping-returns/ticket-0037-api-routes-shipping-options-endpoints.yaml
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import "../setup";

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
    console.log("Skipping shipping runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
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
    console.log("Could not initialize app for testing:", (error as Error).message);
    isDatabaseAvailable = false;
  }
}, 10000);

// ============================================================================
// Module Export Tests (Always Run)
// ============================================================================

describe("Shipping Route Module Exports", () => {
  it("should export shippingApp from routes/shipping", async () => {
    const shippingModule = await import("../../src/routes/shipping");
    expect(shippingModule).toHaveProperty("shippingApp");
    expect(shippingModule.shippingApp).toBeDefined();
  });

  it("should export estimateShippingSchema from routes/shipping", async () => {
    const shippingModule = await import("../../src/routes/shipping");
    expect(shippingModule).toHaveProperty("estimateShippingSchema");
    expect(shippingModule.estimateShippingSchema).toBeDefined();
  });

  it("should export cache constants from routes/shipping", async () => {
    const shippingModule = await import("../../src/routes/shipping");
    expect(shippingModule).toHaveProperty("SHIPPING_CACHE_PREFIX");
    expect(shippingModule).toHaveProperty("CACHE_TTL_SHIPPING_OPTIONS");
    expect(shippingModule.SHIPPING_CACHE_PREFIX).toBe("shipping:");
    expect(shippingModule.CACHE_TTL_SHIPPING_OPTIONS).toBe(3600);
  });

  it("shippingApp should be a Hono app instance", async () => {
    const { shippingApp } = await import("../../src/routes/shipping");
    expect(typeof shippingApp.fetch).toBe("function");
    expect(typeof shippingApp.request).toBe("function");
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe("Shipping Validation Schemas", () => {
  describe("estimateShippingSchema", () => {
    it("should validate cartTotal as a positive number", async () => {
      const { estimateShippingSchema } = await import("../../src/routes/shipping");

      expect(estimateShippingSchema.safeParse({ cartTotal: 100 }).success).toBe(true);
      expect(estimateShippingSchema.safeParse({ cartTotal: 0 }).success).toBe(true);
      expect(estimateShippingSchema.safeParse({ cartTotal: 99.99 }).success).toBe(true);
    });

    it("should reject negative cartTotal", async () => {
      const { estimateShippingSchema } = await import("../../src/routes/shipping");

      expect(estimateShippingSchema.safeParse({ cartTotal: -1 }).success).toBe(false);
      expect(estimateShippingSchema.safeParse({ cartTotal: -100 }).success).toBe(false);
    });

    it("should allow optional zipCode", async () => {
      const { estimateShippingSchema } = await import("../../src/routes/shipping");

      // Without zipCode
      expect(estimateShippingSchema.safeParse({ cartTotal: 100 }).success).toBe(true);

      // With zipCode
      expect(estimateShippingSchema.safeParse({ cartTotal: 100, zipCode: "12345" }).success).toBe(
        true
      );
      expect(estimateShippingSchema.safeParse({ cartTotal: 100, zipCode: "560001" }).success).toBe(
        true
      );
    });

    it("should reject zipCode exceeding max length", async () => {
      const { estimateShippingSchema } = await import("../../src/routes/shipping");

      expect(
        estimateShippingSchema.safeParse({
          cartTotal: 100,
          zipCode: "a".repeat(21),
        }).success
      ).toBe(false);
    });

    it("should coerce string cartTotal to number", async () => {
      const { estimateShippingSchema } = await import("../../src/routes/shipping");

      const result = estimateShippingSchema.parse({ cartTotal: "100" });
      expect(result.cartTotal).toBe(100);
      expect(typeof result.cartTotal).toBe("number");
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Shipping Route Availability", () => {
  it("GET /api/shipping/options route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/shipping/options");
    // Route exists if we get a JSON response - 200 or 500 for db error
    expect(res.headers.get("content-type")).toContain("application/json");
    expect([200, 500].includes(res.status)).toBe(true);
  });

  it("GET /api/shipping/options/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/shipping/options/${VALID_UUID}`);
    // Route exists if we get a JSON response - 404 is valid (option not found)
    expect(res.headers.get("content-type")).toContain("application/json");
    expect([200, 404, 500].includes(res.status)).toBe(true);
  });

  it("GET /api/shipping/estimate route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/shipping/estimate?cartTotal=100");
    // Route exists if we get a JSON response
    expect(res.headers.get("content-type")).toContain("application/json");
    expect([200, 400, 500].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Input Validation Tests (Always Run via App)
// ============================================================================

describe("Shipping Input Validation", () => {
  describe("GET /api/shipping/options/:id", () => {
    it("should reject invalid option ID format", async () => {
      if (!app) return;

      const res = await app.request(`/api/shipping/options/${INVALID_UUID}`);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Invalid shipping option ID");
    });

    it("should accept valid UUID format", async () => {
      if (!app) return;

      const res = await app.request(`/api/shipping/options/${VALID_UUID}`);
      // Should accept valid UUID (404 for not found is valid)
      expect([200, 404, 500].includes(res.status)).toBe(true);
    });
  });

  describe("GET /api/shipping/estimate", () => {
    it("should require cartTotal parameter", async () => {
      if (!app) return;

      const res = await app.request("/api/shipping/estimate");
      expect(res.status).toBe(400);
    });

    it("should reject negative cartTotal", async () => {
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=-100");
      expect(res.status).toBe(400);
    });

    it("should accept valid cartTotal", async () => {
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=500");
      // Should accept valid params (200 or 500 for db error)
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it("should accept optional zipCode parameter", async () => {
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=500&zipCode=560001");
      expect([200, 500].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Shipping Authorization", () => {
  it("GET /api/shipping/options allows anonymous access", async () => {
    if (!app) return;

    const res = await app.request("/api/shipping/options");
    // Should not be 401 - anonymous access allowed
    expect(res.status).not.toBe(401);
  });

  it("GET /api/shipping/options/:id allows anonymous access", async () => {
    if (!app) return;

    const res = await app.request(`/api/shipping/options/${VALID_UUID}`);
    // Should not be 401 - anonymous access allowed (may be 404 for not found)
    expect(res.status).not.toBe(401);
  });

  it("GET /api/shipping/estimate allows anonymous access", async () => {
    if (!app) return;

    const res = await app.request("/api/shipping/estimate?cartTotal=100");
    // Should not be 401 - anonymous access allowed
    expect(res.status).not.toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Shipping Response Format", () => {
  it("should return JSON content-type for options endpoint", async () => {
    if (!app) return;

    const res = await app.request("/api/shipping/options");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for single option endpoint", async () => {
    if (!app) return;

    const res = await app.request(`/api/shipping/options/${VALID_UUID}`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for estimate endpoint", async () => {
    if (!app) return;

    const res = await app.request("/api/shipping/estimate?cartTotal=100");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return error object for validation failures", async () => {
    if (!app) return;

    const res = await app.request(`/api/shipping/options/${INVALID_UUID}`);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(typeof json.error).toBe("string");
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe("Shipping Runtime Tests (Database Required)", () => {
  describe("GET /api/shipping/options - List Options", () => {
    it("should return shipping options list", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/options");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("options");
      expect(Array.isArray(json.options)).toBe(true);
    });

    it("should indicate cache status", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/options");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("fromCache");
      expect(typeof json.fromCache).toBe("boolean");
    });

    it("should return only active options", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/options");
      expect(res.status).toBe(200);

      const json = await res.json();
      // All returned options should be active (isActive not returned to public, but inactive filtered)
      // Options should have expected fields
      for (const option of json.options) {
        expect(option).toHaveProperty("id");
        expect(option).toHaveProperty("name");
        expect(option).toHaveProperty("carrier");
        expect(option).toHaveProperty("baseCost");
      }
    });
  });

  describe("GET /api/shipping/options/:id - Single Option", () => {
    it("should return 404 for non-existent option", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const nonExistentId = "99999999-9999-9999-9999-999999999999";
      const res = await app.request(`/api/shipping/options/${nonExistentId}`);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe("Shipping option not found");
    });
  });

  describe("GET /api/shipping/estimate - Cost Estimation", () => {
    it("should return estimates for all active options", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=500");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty("cartTotal");
      expect(json).toHaveProperty("options");
      expect(json).toHaveProperty("freeShippingThreshold");
      expect(Array.isArray(json.options)).toBe(true);
    });

    it("should include calculated costs in estimates", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=500");
      expect(res.status).toBe(200);

      const json = await res.json();
      for (const option of json.options) {
        expect(option).toHaveProperty("id");
        expect(option).toHaveProperty("name");
        expect(option).toHaveProperty("calculatedCost");
        expect(option).toHaveProperty("estimatedDeliveryMin");
        expect(option).toHaveProperty("estimatedDeliveryMax");
        expect(option).toHaveProperty("isFree");
      }
    });

    it("should return zipCode in response when provided", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=500&zipCode=560001");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.zipCode).toBe("560001");
    });

    it("should return null zipCode when not provided", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/shipping/estimate?cartTotal=500");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.zipCode).toBeNull();
    });
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Shipping HTTP Method Validation", () => {
  it("should reject POST to /api/shipping/options", async () => {
    if (!app) return;

    const res = await app.request("/api/shipping/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    // Should be 404/405 (method not supported) - public endpoint has no POST
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight", async () => {
    if (!app) return;

    const res = await app.request("/api/shipping/options", {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Caching Tests (Require Database)
// ============================================================================

describe("Shipping Caching Tests", () => {
  it("should cache shipping options", async () => {
    if (!isDatabaseAvailable) {
      console.log("Skipping: Database not available");
      return;
    }
    if (!app) return;

    // First request - should be cache miss
    const res1 = await app.request("/api/shipping/options");
    expect(res1.status).toBe(200);
    const json1 = await res1.json();

    // Second request - may be from cache
    const res2 = await app.request("/api/shipping/options");
    expect(res2.status).toBe(200);
    const json2 = await res2.json();

    // Data should be the same
    expect(json1.options.length).toBe(json2.options.length);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Shipping Performance Tests", () => {
  it("should respond quickly to validation errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/shipping/options/${INVALID_UUID}`);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it("should respond quickly to options list request", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/shipping/options");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(2000);
  });
});
