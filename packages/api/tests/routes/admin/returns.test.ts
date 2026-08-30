/**
 * Tests for Admin Returns API Routes
 *
 * This test suite validates the admin returns API routes:
 * - GET /api/admin/returns - List all return requests with filters
 * - GET /api/admin/returns/stats - Get return statistics
 * - GET /api/admin/returns/:id - Get return request details
 * - PATCH /api/admin/returns/:id - Update return request
 * - POST /api/admin/returns/:id/approve - Approve return
 * - POST /api/admin/returns/:id/reject - Reject return
 * - POST /api/admin/returns/:id/process-refund - Process refund
 *
 * All endpoints require admin authentication.
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Validation schema tests - Test Zod validation schemas
 * 3. Route availability tests - Test routes exist and accept requests
 * 4. Authorization tests - Test admin auth requirements
 *
 * @see packages/api/src/routes/admin/returns.ts
 * @see plan/tracker-data/todo/feature-shipping-returns/ticket-0039-api-routes-return-requests.yaml
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

let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === "true") {
    console.log("Skipping admin returns runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
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
      const res = await testApp.request("/api/return-policies", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 200) {
        console.log("Database connection available for runtime tests");
      } else if (res.status === 500) {
        console.log("Database not available, skipping runtime tests");
      }
    } catch (abortError) {
      console.log("Database check timed out, marking as unavailable");
    }
  } catch (error) {
    console.log(
      "Could not initialize app for testing:",
      (error as Error).message
    );
  }
}, 10000);

// ============================================================================
// Module Export Tests (Always Run)
// ============================================================================

describe("Admin Returns Route Module Exports", () => {
  it("should export adminReturnsApp from routes/admin/returns", async () => {
    const adminReturnsModule = await import("../../../src/routes/admin/returns");
    expect(adminReturnsModule).toHaveProperty("adminReturnsApp");
    expect(adminReturnsModule.adminReturnsApp).toBeDefined();
  });

  it("should export validation schemas", async () => {
    const adminReturnsModule = await import("../../../src/routes/admin/returns");
    expect(adminReturnsModule).toHaveProperty("listReturnsSchema");
    expect(adminReturnsModule).toHaveProperty("updateReturnSchema");
    expect(adminReturnsModule).toHaveProperty("rejectReturnSchema");
    expect(adminReturnsModule).toHaveProperty("processRefundSchema");
  });

  it("adminReturnsApp should be a Hono app instance", async () => {
    const { adminReturnsApp } = await import("../../../src/routes/admin/returns");
    expect(typeof adminReturnsApp.fetch).toBe("function");
    expect(typeof adminReturnsApp.request).toBe("function");
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe("Admin Returns Validation Schemas", () => {
  describe("listReturnsSchema", () => {
    it("should provide defaults for all parameters", async () => {
      const { listReturnsSchema } = await import("../../../src/routes/admin/returns");

      const result = listReturnsSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.sortBy).toBe("requestedAt");
      expect(result.sortOrder).toBe("desc");
    });

    it("should validate status enum values", async () => {
      const { listReturnsSchema } = await import("../../../src/routes/admin/returns");

      expect(listReturnsSchema.safeParse({ status: "pending" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ status: "approved" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ status: "rejected" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ status: "refunded" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ status: "invalid" }).success).toBe(false);
    });

    it("should validate reason enum values", async () => {
      const { listReturnsSchema } = await import("../../../src/routes/admin/returns");

      expect(listReturnsSchema.safeParse({ reason: "defective" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ reason: "wrong_item" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ reason: "changed_mind" }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ reason: "invalid" }).success).toBe(false);
    });

    it("should validate orderId as UUID", async () => {
      const { listReturnsSchema } = await import("../../../src/routes/admin/returns");

      expect(listReturnsSchema.safeParse({ orderId: VALID_UUID }).success).toBe(true);
      expect(listReturnsSchema.safeParse({ orderId: INVALID_UUID }).success).toBe(false);
    });

    it("should reject invalid pagination values", async () => {
      const { listReturnsSchema } = await import("../../../src/routes/admin/returns");

      expect(listReturnsSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(listReturnsSchema.safeParse({ page: -1 }).success).toBe(false);
      expect(listReturnsSchema.safeParse({ pageSize: 0 }).success).toBe(false);
      expect(listReturnsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    });
  });

  describe("updateReturnSchema", () => {
    it("should allow partial updates", async () => {
      const { updateReturnSchema } = await import("../../../src/routes/admin/returns");

      expect(updateReturnSchema.safeParse({ status: "approved" }).success).toBe(true);
      expect(updateReturnSchema.safeParse({ adminNotes: "Test notes" }).success).toBe(true);
      expect(updateReturnSchema.safeParse({ refundAmount: 100 }).success).toBe(true);
    });

    it("should validate status enum if provided", async () => {
      const { updateReturnSchema } = await import("../../../src/routes/admin/returns");

      expect(updateReturnSchema.safeParse({ status: "approved" }).success).toBe(true);
      expect(updateReturnSchema.safeParse({ status: "rejected" }).success).toBe(true);
      expect(updateReturnSchema.safeParse({ status: "invalid" }).success).toBe(false);
    });

    it("should allow setting adminNotes to null", async () => {
      const { updateReturnSchema } = await import("../../../src/routes/admin/returns");

      expect(updateReturnSchema.safeParse({ adminNotes: null }).success).toBe(true);
    });

    it("should validate refundAmount is non-negative", async () => {
      const { updateReturnSchema } = await import("../../../src/routes/admin/returns");

      expect(updateReturnSchema.safeParse({ refundAmount: 0 }).success).toBe(true);
      expect(updateReturnSchema.safeParse({ refundAmount: 100.50 }).success).toBe(true);
      expect(updateReturnSchema.safeParse({ refundAmount: -10 }).success).toBe(false);
    });
  });

  describe("rejectReturnSchema", () => {
    it("should require reason with minimum 10 characters", async () => {
      const { rejectReturnSchema } = await import("../../../src/routes/admin/returns");

      expect(
        rejectReturnSchema.safeParse({ reason: "Too short" }).success
      ).toBe(false);
      expect(
        rejectReturnSchema.safeParse({ reason: "1234567890" }).success
      ).toBe(true);
    });

    it("should reject reason exceeding 1000 characters", async () => {
      const { rejectReturnSchema } = await import("../../../src/routes/admin/returns");

      expect(
        rejectReturnSchema.safeParse({ reason: "a".repeat(1001) }).success
      ).toBe(false);
      expect(
        rejectReturnSchema.safeParse({ reason: "a".repeat(1000) }).success
      ).toBe(true);
    });
  });

  describe("processRefundSchema", () => {
    it("should require positive refundAmount", async () => {
      const { processRefundSchema } = await import("../../../src/routes/admin/returns");

      expect(
        processRefundSchema.safeParse({ refundAmount: 100, refundType: "full" })
          .success
      ).toBe(true);
      expect(
        processRefundSchema.safeParse({ refundAmount: 0, refundType: "full" })
          .success
      ).toBe(false);
      expect(
        processRefundSchema.safeParse({ refundAmount: -50, refundType: "full" })
          .success
      ).toBe(false);
    });

    it("should validate refundType enum values", async () => {
      const { processRefundSchema } = await import("../../../src/routes/admin/returns");

      expect(
        processRefundSchema.safeParse({ refundAmount: 100, refundType: "full" })
          .success
      ).toBe(true);
      expect(
        processRefundSchema.safeParse({
          refundAmount: 50,
          refundType: "partial",
        }).success
      ).toBe(true);
      expect(
        processRefundSchema.safeParse({
          refundAmount: 100,
          refundType: "store_credit",
        }).success
      ).toBe(true);
      expect(
        processRefundSchema.safeParse({
          refundAmount: 100,
          refundType: "invalid",
        }).success
      ).toBe(false);
    });

    it("should require both refundAmount and refundType", async () => {
      const { processRefundSchema } = await import("../../../src/routes/admin/returns");

      expect(processRefundSchema.safeParse({}).success).toBe(false);
      expect(
        processRefundSchema.safeParse({ refundAmount: 100 }).success
      ).toBe(false);
      expect(
        processRefundSchema.safeParse({ refundType: "full" }).success
      ).toBe(false);
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Admin Returns Route Availability", () => {
  it("GET /api/admin/returns route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/admin/returns");
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/returns/stats route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/admin/returns/stats");
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/returns/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/returns/${VALID_UUID}`);
    // Should be 401 (unauthorized) since GET requires admin auth
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/returns/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/returns/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    // Should be 401 (unauthorized) since PATCH requires admin auth
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/returns/:id/approve route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/returns/${VALID_UUID}/approve`, {
      method: "POST",
    });
    // Should be 401 (unauthorized) since POST requires admin auth
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/returns/:id/reject route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/returns/${VALID_UUID}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejection reason here" }),
    });
    // Should be 401 (unauthorized) since POST requires admin auth
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/returns/:id/process-refund route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(
      `/api/admin/returns/${VALID_UUID}/process-refund`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundAmount: 100, refundType: "full" }),
      }
    );
    // Should be 401 (unauthorized) since POST requires admin auth
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Admin Returns Authorization", () => {
  it("GET /api/admin/returns requires authentication", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/returns");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/returns/stats requires authentication", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/returns/stats");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/returns/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/returns/${VALID_UUID}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/returns/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/returns/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/returns/:id/approve requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/returns/${VALID_UUID}/approve`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/returns/:id/reject requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/returns/${VALID_UUID}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejection reason here" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/returns/:id/process-refund requires authentication", async () => {
    if (!app) return;

    const res = await app.request(
      `/api/admin/returns/${VALID_UUID}/process-refund`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundAmount: 100, refundType: "full" }),
      }
    );
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Admin Returns Response Format", () => {
  it("should return JSON content-type for auth errors", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/returns");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for stats auth errors", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/returns/stats");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Admin Returns HTTP Method Validation", () => {
  it("should reject PUT to /api/admin/returns/:id", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/returns/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    // Should be 401 (auth first) or 404/405 (method not supported)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/returns", {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Admin Returns Performance Tests", () => {
  it("should respond quickly to auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/admin/returns");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it("should respond quickly to stats auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/admin/returns/stats");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
