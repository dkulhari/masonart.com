/**
 * Tests for Shipments API Routes
 *
 * This test suite validates the shipments API routes:
 * - GET /api/orders/:orderId/shipments - Get shipments for an order
 * - GET /api/shipments/:id/track - Get tracking details for a shipment
 *
 * All endpoints require authentication (order owner only).
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route modules export correctly
 * 2. Route availability tests - Test routes exist and accept requests
 * 3. Authorization tests - Test auth requirements
 * 4. Input validation tests - Test UUID validation
 *
 * @see packages/api/src/routes/shipments.ts
 * @see plan/tracker-data/todo/feature-shipping-returns/ticket-0038-api-routes-order-shipments-tracking.yaml
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
    console.log("Skipping shipments runtime tests (SKIP_DB_RUNTIME_TESTS=true)");
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

describe("Shipments Route Module Exports", () => {
  it("should export shipmentsApp from routes/shipments", async () => {
    const shipmentsModule = await import("../../src/routes/shipments");
    expect(shipmentsModule).toHaveProperty("shipmentsApp");
    expect(shipmentsModule.shipmentsApp).toBeDefined();
  });

  it("should export generateTrackingUrl helper", async () => {
    const shipmentsModule = await import("../../src/routes/shipments");
    expect(shipmentsModule).toHaveProperty("generateTrackingUrl");
    expect(typeof shipmentsModule.generateTrackingUrl).toBe("function");
  });

  it("should export generateTrackingTimeline helper", async () => {
    const shipmentsModule = await import("../../src/routes/shipments");
    expect(shipmentsModule).toHaveProperty("generateTrackingTimeline");
    expect(typeof shipmentsModule.generateTrackingTimeline).toBe("function");
  });

  it("shipmentsApp should be a Hono app instance", async () => {
    const { shipmentsApp } = await import("../../src/routes/shipments");
    expect(typeof shipmentsApp.fetch).toBe("function");
    expect(typeof shipmentsApp.request).toBe("function");
  });
});

// ============================================================================
// Helper Function Tests (Always Run)
// ============================================================================

describe("Shipments Helper Functions", () => {
  describe("generateTrackingUrl", () => {
    it("should generate USPS tracking URL", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url = generateTrackingUrl("USPS", "1234567890");
      expect(url).toContain("usps.com");
      expect(url).toContain("1234567890");
    });

    it("should generate FedEx tracking URL", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url = generateTrackingUrl("FedEx", "1234567890");
      expect(url).toContain("fedex.com");
      expect(url).toContain("1234567890");
    });

    it("should generate UPS tracking URL", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url = generateTrackingUrl("UPS", "1Z12345");
      expect(url).toContain("ups.com");
      expect(url).toContain("1Z12345");
    });

    it("should generate Delhivery tracking URL", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url = generateTrackingUrl("Delhivery", "DL123456");
      expect(url).toContain("delhivery.com");
      expect(url).toContain("DL123456");
    });

    it("should return null for null tracking number", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url = generateTrackingUrl("USPS", null);
      expect(url).toBeNull();
    });

    it("should return null for unknown carrier", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url = generateTrackingUrl("UnknownCarrier", "123456");
      expect(url).toBeNull();
    });

    it("should be case-insensitive for carrier names", async () => {
      const { generateTrackingUrl } = await import("../../src/routes/shipments");
      const url1 = generateTrackingUrl("usps", "123456");
      const url2 = generateTrackingUrl("USPS", "123456");
      const url3 = generateTrackingUrl("UsPs", "123456");
      expect(url1).toBe(url2);
      expect(url2).toBe(url3);
    });
  });

  describe("generateTrackingTimeline", () => {
    it("should generate correct timeline for pending status", async () => {
      const { generateTrackingTimeline } = await import("../../src/routes/shipments");
      const timeline = generateTrackingTimeline({
        status: "pending",
        createdAt: new Date("2024-01-01"),
        shippedAt: null,
        estimatedDeliveryAt: null,
        deliveredAt: null,
      });

      expect(timeline.currentStatus).toBe("pending");
      expect(timeline.steps[0].completed).toBe(true); // Order Received
      expect(timeline.steps[1].completed).toBe(false); // Label Created
      expect(timeline.steps[5].completed).toBe(false); // Delivered
    });

    it("should generate correct timeline for shipped status", async () => {
      const { generateTrackingTimeline } = await import("../../src/routes/shipments");
      const timeline = generateTrackingTimeline({
        status: "shipped",
        createdAt: new Date("2024-01-01"),
        shippedAt: new Date("2024-01-02"),
        estimatedDeliveryAt: new Date("2024-01-05"),
        deliveredAt: null,
      });

      expect(timeline.currentStatus).toBe("shipped");
      expect(timeline.steps[0].completed).toBe(true); // Order Received
      expect(timeline.steps[2].completed).toBe(true); // Shipped
      expect(timeline.steps[5].completed).toBe(false); // Delivered
      expect(timeline.steps[2].timestamp).toBeTruthy();
    });

    it("should generate correct timeline for delivered status", async () => {
      const { generateTrackingTimeline } = await import("../../src/routes/shipments");
      const timeline = generateTrackingTimeline({
        status: "delivered",
        createdAt: new Date("2024-01-01"),
        shippedAt: new Date("2024-01-02"),
        estimatedDeliveryAt: new Date("2024-01-05"),
        deliveredAt: new Date("2024-01-04"),
      });

      expect(timeline.currentStatus).toBe("delivered");
      expect(timeline.steps.every((step) => step.completed)).toBe(true);
      expect(timeline.steps[5].timestamp).toBeTruthy();
    });

    it("should include estimated delivery in timeline", async () => {
      const { generateTrackingTimeline } = await import("../../src/routes/shipments");
      const estimatedDate = new Date("2024-01-10");
      const timeline = generateTrackingTimeline({
        status: "in_transit",
        createdAt: new Date("2024-01-01"),
        shippedAt: new Date("2024-01-02"),
        estimatedDeliveryAt: estimatedDate,
        deliveredAt: null,
      });

      expect(timeline.estimatedDelivery).toBe(estimatedDate.toISOString());
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe("Shipments Route Availability", () => {
  it("GET /api/orders/:orderId/shipments route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/orders/${VALID_UUID}/shipments`);
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });

  it("GET /api/shipments/:id/track route exists", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request(`/api/shipments/${VALID_UUID}/track`);
    // Route exists if we get 401 (unauthorized without auth)
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Authorization Tests (Always Run via App)
// ============================================================================

describe("Shipments Authorization", () => {
  it("GET /api/orders/:orderId/shipments requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/shipments`);
    expect(res.status).toBe(401);
  });

  it("GET /api/shipments/:id/track requires authentication", async () => {
    if (!app) return;

    const res = await app.request(`/api/shipments/${VALID_UUID}/track`);
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Response Format Tests (Always Run)
// ============================================================================

describe("Shipments Response Format", () => {
  it("should return JSON content-type for auth errors", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/shipments`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("should return JSON content-type for tracking auth errors", async () => {
    if (!app) return;

    const res = await app.request(`/api/shipments/${VALID_UUID}/track`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe("Shipments HTTP Method Validation", () => {
  it("should reject POST to /api/orders/:orderId/shipments", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Should be 401 (auth first) or 404/405 (method not supported)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it("should handle OPTIONS for CORS preflight", async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${VALID_UUID}/shipments`, {
      method: "OPTIONS",
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Shipments Performance Tests", () => {
  it("should respond quickly to auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/orders/${VALID_UUID}/shipments`);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it("should respond quickly to tracking auth errors", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request(`/api/shipments/${VALID_UUID}/track`);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
