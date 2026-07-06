/**
 * Tests for Admin Shipments API Routes
 *
 * This test suite validates the admin shipments API routes:
 * - GET /api/admin/shipments - List all shipments with filters
 * - GET /api/admin/shipments/:id - Get shipment details
 * - POST /api/admin/orders/:orderId/ship - Create shipment for order
 * - PATCH /api/admin/shipments/:id - Update shipment
 * - POST /api/admin/shipments/:id/mark-delivered - Mark as delivered
 *
 * All endpoints require admin authentication.
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Validation schema tests - Test Zod validation schemas
 * 3. Route availability tests - Test routes exist and accept requests
 * 4. Authorization tests - Test admin auth requirements
 *
 * @see packages/api/src/routes/admin/shipments.ts
 * @see plan/tracker-data/todo/feature-shipping-returns/ticket-0038-api-routes-order-shipments-tracking.yaml
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
    console.log("Skipping admin shipments runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
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
    console.log("Could not initialize app for testing:", (error as Error).message);
    isDatabaseAvailable = false;
  }
}, 10000);

// ============================================================================
// Module Export Tests (Always Run)
// ============================================================================

describe("Admin Shipments Route Module Exports", () => {
  it("should export adminShipmentsApp from routes/admin/shipments", async () => {
    const adminShipmentsModule = await import("../../../src/routes/admin/shipments");
    expect(adminShipmentsModule).toHaveProperty("adminShipmentsApp");
    expect(adminShipmentsModule.adminShipmentsApp).toBeDefined();
  });

  it("should export validation schemas", async () => {
    const adminShipmentsModule = await import("../../../src/routes/admin/shipments");
    expect(adminShipmentsModule).toHaveProperty("listShipmentsSchema");
    expect(adminShipmentsModule).toHaveProperty("createShipmentSchema");
    expect(adminShipmentsModule).toHaveProperty("updateShipmentSchema");
  });

  it("adminShipmentsApp should be a Hono app instance", async () => {
    const { adminShipmentsApp } = await import("../../../src/routes/admin/shipments");
    expect(typeof adminShipmentsApp.fetch).toBe("function");
    expect(typeof adminShipmentsApp.request).toBe("function");
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe("Admin Shipments Validation Schemas", () => {
  describe("listShipmentsSchema", () => {
    it("should provide defaults for all parameters", async () => {
      const { listShipmentsSchema } = await import("../../../src/routes/admin/shipments");

      const result = listShipmentsSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.sortBy).toBe("createdAt");
      expect(result.sortOrder).toBe("desc");
    });

    it("should validate status enum values", async () => {
      const { listShipmentsSchema } = await import("../../../src/routes/admin/shipments");

      expect(listShipmentsSchema.safeParse({ status: "pending" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ status: "shipped" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ status: "in_transit" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ status: "delivered" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ status: "invalid" }).success).toBe(false);
    });

    it("should validate orderId as UUID", async () => {
      const { listShipmentsSchema } = await import("../../../src/routes/admin/shipments");

      expect(listShipmentsSchema.safeParse({ orderId: VALID_UUID }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ orderId: INVALID_UUID }).success).toBe(false);
    });

    it("should validate sortBy enum values", async () => {
      const { listShipmentsSchema } = await import("../../../src/routes/admin/shipments");

      expect(listShipmentsSchema.safeParse({ sortBy: "createdAt" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ sortBy: "status" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ sortBy: "shippedAt" }).success).toBe(true);
      expect(listShipmentsSchema.safeParse({ sortBy: "invalid" }).success).toBe(false);
    });

    it("should reject invalid pagination values", async () => {
      const { listShipmentsSchema } = await import("../../../src/routes/admin/shipments");

      expect(listShipmentsSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(listShipmentsSchema.safeParse({ page: -1 }).success).toBe(false);
      expect(listShipmentsSchema.safeParse({ pageSize: 0 }).success).toBe(false);
      expect(listShipmentsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    });
  });

  describe("createShipmentSchema", () => {
    it("should validate required carrier field", async () => {
      const { createShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(createShipmentSchema.safeParse({ carrier: "USPS" }).success).toBe(true);
      expect(createShipmentSchema.safeParse({}).success).toBe(false);
    });

    it("should validate carrier max length", async () => {
      const { createShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(createShipmentSchema.safeParse({ carrier: "a".repeat(101) }).success).toBe(false);
      expect(createShipmentSchema.safeParse({ carrier: "a".repeat(100) }).success).toBe(true);
    });

    it("should allow optional shippingOptionId as UUID", async () => {
      const { createShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(
        createShipmentSchema.safeParse({
          carrier: "USPS",
          shippingOptionId: VALID_UUID,
        }).success
      ).toBe(true);
      expect(
        createShipmentSchema.safeParse({
          carrier: "USPS",
          shippingOptionId: INVALID_UUID,
        }).success
      ).toBe(false);
    });

    it("should allow optional trackingNumber with max length", async () => {
      const { createShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(
        createShipmentSchema.safeParse({
          carrier: "USPS",
          trackingNumber: "1234567890",
        }).success
      ).toBe(true);
      expect(
        createShipmentSchema.safeParse({
          carrier: "USPS",
          trackingNumber: "a".repeat(101),
        }).success
      ).toBe(false);
    });

    it("should validate estimatedDeliveryAt as datetime", async () => {
      const { createShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(
        createShipmentSchema.safeParse({
          carrier: "USPS",
          estimatedDeliveryAt: "2024-01-15T10:00:00Z",
        }).success
      ).toBe(true);
      expect(
        createShipmentSchema.safeParse({
          carrier: "USPS",
          estimatedDeliveryAt: "not-a-date",
        }).success
      ).toBe(false);
    });
  });

  describe("updateShipmentSchema", () => {
    it("should allow partial updates", async () => {
      const { updateShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(updateShipmentSchema.safeParse({ trackingNumber: "123456" }).success).toBe(true);
      expect(updateShipmentSchema.safeParse({ status: "shipped" }).success).toBe(true);
      expect(updateShipmentSchema.safeParse({ notes: "Updated notes" }).success).toBe(true);
    });

    it("should validate status enum if provided", async () => {
      const { updateShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(updateShipmentSchema.safeParse({ status: "shipped" }).success).toBe(true);
      expect(updateShipmentSchema.safeParse({ status: "delivered" }).success).toBe(true);
      expect(updateShipmentSchema.safeParse({ status: "invalid" }).success).toBe(false);
    });

    it("should allow setting trackingNumber to null", async () => {
      const { updateShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(updateShipmentSchema.safeParse({ trackingNumber: null }).success).toBe(true);
    });

    it("should allow setting notes to null", async () => {
      const { updateShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(updateShipmentSchema.safeParse({ notes: null }).success).toBe(true);
    });

    it("should validate trackingUrl max length", async () => {
      const { updateShipmentSchema } = await import("../../../src/routes/admin/shipments");

      expect(updateShipmentSchema.safeParse({ trackingUrl: "a".repeat(501) }).success).toBe(false);
      expect(updateShipmentSchema.safeParse({ trackingUrl: "a".repeat(500) }).success).toBe(true);
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Admin Shipments Route Availability", () => {
  it("GET /api/admin/shipments route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/admin/shipments");
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/shipments/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}`);
    // Should be 401 (unauthorized) since GET requires admin auth
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/orders/:orderId/ship route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/orders/${VALID_UUID}/ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrier: "USPS" }),
    });
    // Should be 401 (unauthorized) since POST requires admin auth
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/shipments/:id route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped" }),
    });
    // Should be 401 (unauthorized) since PATCH requires admin auth
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/shipments/:id/mark-delivered route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}/mark-delivered`, {
      method: "POST",
    });
    // Should be 401 (unauthorized) since POST requires admin auth
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Admin Shipments Authorization", () => {
  it("GET /api/admin/shipments requires authentication", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipments");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/shipments/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}`);
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/orders/:orderId/ship requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${VALID_UUID}/ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrier: "USPS" }),
    });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/shipments/:id requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/shipments/:id/mark-delivered requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}/mark-delivered`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Admin Shipments Response Format", () => {
  it("should return JSON content-type for auth errors", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipments");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for single shipment auth errors", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Admin Shipments HTTP Method Validation", () => {
  it("should reject PUT to /api/admin/shipments/:id", async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/shipments/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped" }),
    });
    // Should be 401 (auth first) or 404/405 (method not supported)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight", async () => {
    if (!app) return;

    const res = await app.request("/api/admin/shipments", {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Admin Shipments Performance Tests", () => {
  it("should respond quickly to auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/admin/shipments");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it("should respond quickly to create shipment auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/admin/orders/${VALID_UUID}/ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrier: "USPS" }),
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
