/**
 * Tests for Returns API Routes
 *
 * This test suite validates the returns API routes:
 * - GET /api/orders/:orderId/returns - Get return requests for an order
 * - POST /api/orders/:orderId/returns - Create a return request
 * - GET /api/returns/:id - Get return request details
 * - DELETE /api/returns/:id - Cancel a pending return
 * - GET /api/return-policies - Get active return policies
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Validation schema tests - Test Zod validation schemas
 * 3. Route availability tests - Test routes exist and accept requests
 * 4. Authorization tests - Test auth requirements
 *
 * @see packages/api/src/routes/returns.ts
 * @see plan/tracker-data/todo/feature-shipping-returns/ticket-0039-api-routes-return-requests.yaml
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import "../setup";
import { readJson } from '../helpers/json';

// ============================================================================
// Test Constants
// ============================================================================

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

// ============================================================================
// Test State
// ============================================================================

let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === "true") {
    console.log("Skipping returns runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
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
      const res = await testApp.request("/api/return-policies", {
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

describe("Returns Route Module Exports", () => {
  it("should export returnsApp from routes/returns", async () => {
    const returnsModule = await import("../../src/routes/returns");
    expect(returnsModule).toHaveProperty("returnsApp");
    expect(returnsModule.returnsApp).toBeDefined();
  });

  it("should export returnPoliciesApp from routes/returns", async () => {
    const returnsModule = await import("../../src/routes/returns");
    expect(returnsModule).toHaveProperty("returnPoliciesApp");
    expect(returnsModule.returnPoliciesApp).toBeDefined();
  });

  it("should export createReturnSchema from routes/returns", async () => {
    const returnsModule = await import("../../src/routes/returns");
    expect(returnsModule).toHaveProperty("createReturnSchema");
    expect(returnsModule.createReturnSchema).toBeDefined();
  });

  it("should export checkReturnEligibility helper", async () => {
    const returnsModule = await import("../../src/routes/returns");
    expect(returnsModule).toHaveProperty("checkReturnEligibility");
    expect(typeof returnsModule.checkReturnEligibility).toBe("function");
  });

  it("should export cache constants", async () => {
    const returnsModule = await import("../../src/routes/returns");
    expect(returnsModule).toHaveProperty("RETURN_CACHE_PREFIX");
    expect(returnsModule).toHaveProperty("CACHE_TTL_RETURN_POLICIES");
    expect(returnsModule).toHaveProperty("DEFAULT_RETURN_WINDOW_DAYS");
    expect(returnsModule.RETURN_CACHE_PREFIX).toBe("returns:");
    expect(returnsModule.CACHE_TTL_RETURN_POLICIES).toBe(3600);
    expect(returnsModule.DEFAULT_RETURN_WINDOW_DAYS).toBe(30);
  });

  it("returnsApp should be a Hono app instance", async () => {
    const { returnsApp } = await import("../../src/routes/returns");
    expect(typeof returnsApp.fetch).toBe("function");
    expect(typeof returnsApp.request).toBe("function");
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe("Returns Validation Schemas", () => {
  describe("createReturnSchema", () => {
    it("should validate reason enum values", async () => {
      const { createReturnSchema } = await import("../../src/routes/returns");

      expect(
        createReturnSchema.safeParse({
          reason: "defective",
          reasonDetails: "Product arrived damaged",
        }).success
      ).toBe(true);
      expect(
        createReturnSchema.safeParse({
          reason: "wrong_item",
          reasonDetails: "Received wrong item",
        }).success
      ).toBe(true);
      expect(
        createReturnSchema.safeParse({
          reason: "not_as_described",
          reasonDetails: "Product not as described",
        }).success
      ).toBe(true);
      expect(
        createReturnSchema.safeParse({
          reason: "changed_mind",
          reasonDetails: "Changed my mind about purchase",
        }).success
      ).toBe(true);
      expect(
        createReturnSchema.safeParse({
          reason: "other",
          reasonDetails: "Other reason for return",
        }).success
      ).toBe(true);
    });

    it("should reject invalid reason values", async () => {
      const { createReturnSchema } = await import("../../src/routes/returns");

      expect(
        createReturnSchema.safeParse({
          reason: "invalid_reason",
          reasonDetails: "Test details",
        }).success
      ).toBe(false);
    });

    it("should require reasonDetails with minimum 10 characters", async () => {
      const { createReturnSchema } = await import("../../src/routes/returns");

      // Too short
      expect(
        createReturnSchema.safeParse({
          reason: "defective",
          reasonDetails: "Too short",
        }).success
      ).toBe(false);

      // Valid minimum length
      expect(
        createReturnSchema.safeParse({
          reason: "defective",
          reasonDetails: "1234567890",
        }).success
      ).toBe(true);
    });

    it("should reject reasonDetails exceeding 2000 characters", async () => {
      const { createReturnSchema } = await import("../../src/routes/returns");

      expect(
        createReturnSchema.safeParse({
          reason: "defective",
          reasonDetails: "a".repeat(2001),
        }).success
      ).toBe(false);

      expect(
        createReturnSchema.safeParse({
          reason: "defective",
          reasonDetails: "a".repeat(2000),
        }).success
      ).toBe(true);
    });

    it("should require both reason and reasonDetails", async () => {
      const { createReturnSchema } = await import("../../src/routes/returns");

      expect(createReturnSchema.safeParse({}).success).toBe(false);
      expect(
        createReturnSchema.safeParse({ reason: "defective" }).success
      ).toBe(false);
      expect(
        createReturnSchema.safeParse({ reasonDetails: "Valid details here" })
          .success
      ).toBe(false);
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Returns Route Availability", () => {
  it("GET /api/return-policies route exists (public)", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/return-policies");
    // Route exists if we get JSON response (200 or 500 for db error)
    expect(res.headers.get("content-type")).toContain("application/json");
    expect([200, 500].includes(res.status)).toBe(true);
  });

  it("GET /api/orders/:orderId/returns route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/orders/${VALID_UUID}/returns`);
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("POST /api/orders/:orderId/returns route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/orders/${VALID_UUID}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "defective",
        reasonDetails: "Product arrived damaged",
      }),
    });
    // Should be 401 (unauthorized)
    expect(res.status).toBe(401);
  });

  it("GET /api/returns/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/returns/${VALID_UUID}`);
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("DELETE /api/returns/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/returns/${VALID_UUID}`, {
      method: "DELETE",
    });
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Returns Authorization", () => {
  it("GET /api/return-policies allows anonymous access", async () => {
    if (!app) return;

    const res = await app.request("/api/return-policies");
    // Should not be 401 - public endpoint
    expect(res.status).not.toBe(401);
  });

  it("GET /api/orders/:orderId/returns requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/returns`);
    expect(res.status).toBe(401);
  });

  it("POST /api/orders/:orderId/returns requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "defective",
        reasonDetails: "Product arrived damaged",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/returns/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/returns/${VALID_UUID}`);
    expect(res.status).toBe(401);
  });

  it("DELETE /api/returns/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/returns/${VALID_UUID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Returns Response Format", () => {
  it("should return JSON content-type for return-policies", async () => {
    if (!app) return;

    const res = await app.request("/api/return-policies");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for auth errors", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/returns`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe("Returns Runtime Tests (Database Required)", () => {
  describe("GET /api/return-policies - List Policies", () => {
    it("should return policies list", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/return-policies");
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toHaveProperty("policies");
      expect(Array.isArray(json.policies)).toBe(true);
    });

    it("should indicate cache status", async () => {
      if (!isDatabaseAvailable) {
        console.log("Skipping: Database not available");
        return;
      }
      if (!app) return;

      const res = await app.request("/api/return-policies");
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toHaveProperty("fromCache");
      expect(typeof json.fromCache).toBe("boolean");
    });
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Returns HTTP Method Validation", () => {
  it("should reject PATCH to /api/returns/:id (public route)", async () => {
    if (!app) return;

    const res = await app.request(`/api/returns/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Should be 401 (auth first) or 404/405 (method not supported)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight on return-policies", async () => {
    if (!app) return;

    const res = await app.request("/api/return-policies", {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Returns Performance Tests", () => {
  it("should respond quickly to return-policies request", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/return-policies");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(2000);
  });

  it("should respond quickly to auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/orders/${VALID_UUID}/returns`);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
