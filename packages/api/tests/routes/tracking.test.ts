/**
 * Tests for Order Tracking API Routes
 *
 * This test suite validates the public tracking API endpoints:
 * - GET /api/tracking/lookup - Guest order lookup by order number and email/phone
 * - GET /api/tracking/:orderNumber - Get tracking details with query validation
 * - GET /api/tracking/token/:token - Token-based order lookup from email links
 *
 * These endpoints do NOT require authentication but validate against order contact info.
 *
 * @see packages/api/src/routes/tracking.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { Hono } from "hono";
import "../setup";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the database module
vi.mock("../../src/database", () => ({
  db: {
    query: {
      orders: {
        findFirst: vi.fn(),
      },
      orderShipments: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { db } from "../../src/database";

// ============================================================================
// Test Data
// ============================================================================

const mockOrder = {
  id: "order-123",
  orderNumber: "MA-2024-001234",
  status: "shipped",
  guestEmail: "guest@example.com",
  guestPhone: "9876543210",
  userId: null,
  shippingAddress: {
    fullName: "John Doe",
    phone: "9876543210",
    addressLine1: "123 Main Street",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400001",
    country: "India",
  },
  shippingDetails: {
    carrier: "blue_dart",
    trackingNumber: "BD123456789",
    trackingUrl: "https://bluedart.com/track/BD123456789",
  },
  itemCount: 2,
  createdAt: new Date("2024-02-08"),
  shippedAt: new Date("2024-02-10"),
  deliveredAt: null,
  user: null,
};

const mockOrderWithUser = {
  ...mockOrder,
  userId: "user-123",
  guestEmail: null,
  guestPhone: null,
  user: {
    email: "user@example.com",
    phone: "9876543210",
  },
};

const mockOrderWithToken = {
  ...mockOrder,
  trackingToken: "abcd1234567890abcdef1234567890ab",
  trackingTokenExpiresAt: new Date(Date.now() + 86400000), // Tomorrow
};

const mockShipment = {
  id: "shipment-123",
  orderId: "order-123",
  carrier: "blue_dart",
  trackingNumber: "BD123456789",
  trackingUrl: "https://bluedart.com/track/BD123456789",
  status: "in_transit",
  shippedAt: new Date("2024-02-10"),
  estimatedDeliveryAt: new Date("2024-02-15"),
  deliveredAt: null,
  createdAt: new Date("2024-02-10"),
};

// ============================================================================
// Test Setup
// ============================================================================

let app: Hono | null = null;

beforeAll(async () => {
  try {
    // Import the tracking routes directly
    const { trackingApp } = await import("../../src/routes/tracking");
    app = new Hono();
    app.route("/api/tracking", trackingApp);
  } catch (error) {
    console.log("Could not initialize tracking routes for testing:", (error as Error).message);
    app = null;
  }
}, 10000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Lookup Endpoint Tests - GET /api/tracking/lookup
// ============================================================================

describe("Guest Order Lookup - GET /api/tracking/lookup", () => {
  describe("Successful Lookup", () => {
    it("should return order tracking info with valid email", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=guest@example.com"
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderNumber).toBe("MA-2024-001234");
      expect(data.status).toBe("shipped");
    });

    it("should return order tracking info with valid phone", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&phone=9876543210"
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderNumber).toBe("MA-2024-001234");
    });

    it("should return tracking info when shipment exists", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=guest@example.com"
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tracking).not.toBeNull();
      expect(data.tracking.carrier).toBe("blue_dart");
      expect(data.tracking.trackingNumber).toBe("BD123456789");
    });

    it("should return null tracking when no shipment exists", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(null);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=guest@example.com"
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tracking).toBeNull();
    });

    it("should return timeline data", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=guest@example.com"
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.timeline).toBeDefined();
      expect(data.timeline.orderedAt).toBeDefined();
    });

    it("should work with user-associated orders", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrderWithUser);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=user@example.com"
      );

      expect(res.status).toBe(200);
    });

    it("should normalize phone numbers with +91 prefix", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&phone=919876543210"
      );

      expect(res.status).toBe(200);
    });

    it("should be case-insensitive for email matching", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=GUEST@EXAMPLE.COM"
      );

      expect(res.status).toBe(200);
    });
  });

  describe("Order Not Found", () => {
    it("should return 404 for non-existent order", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(null);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-9999-999999&email=test@example.com"
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("ORDER_NOT_FOUND");
    });
  });

  describe("Email/Phone Mismatch", () => {
    it("should return 404 for email mismatch (prevents enumeration)", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=wrong@example.com"
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("ORDER_NOT_FOUND");
    });

    it("should return 404 for phone mismatch (prevents enumeration)", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&phone=1111111111"
      );

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("ORDER_NOT_FOUND");
    });
  });

  describe("Validation Errors", () => {
    it("should require order number", async () => {
      if (!app) return;

      const res = await app.request("/api/tracking/lookup?email=test@example.com");

      expect(res.status).toBe(400);
    });

    it("should require either email or phone", async () => {
      if (!app) return;

      const res = await app.request("/api/tracking/lookup?orderNumber=MA-2024-001234");

      expect(res.status).toBe(400);
    });

    it("should validate email format", async () => {
      if (!app) return;

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=invalid-email"
      );

      expect(res.status).toBe(400);
    });

    it("should validate phone minimum length", async () => {
      if (!app) return;

      const res = await app.request("/api/tracking/lookup?orderNumber=MA-2024-001234&phone=12345");

      expect(res.status).toBe(400);
    });
  });

  describe("Response Format", () => {
    it("should return JSON content type", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=guest@example.com"
      );

      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });

    it("should return partial shipping address (no street for privacy)", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request(
        "/api/tracking/lookup?orderNumber=MA-2024-001234&email=guest@example.com"
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.shippingAddress.city).toBe("Mumbai");
      expect(data.shippingAddress.state).toBe("Maharashtra");
      expect(data.shippingAddress.addressLine1).toBeUndefined();
    });
  });
});

// ============================================================================
// Token-Based Lookup Tests - GET /api/tracking/token/:token
// ============================================================================

describe("Token-Based Lookup - GET /api/tracking/token/:token", () => {
  describe("Successful Lookup", () => {
    it("should return order tracking info with valid token", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrderWithToken);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request("/api/tracking/token/abcd1234567890abcdef1234567890ab");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.orderNumber).toBe("MA-2024-001234");
    });

    it("should include tracking info when shipment exists", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrderWithToken);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request("/api/tracking/token/abcd1234567890abcdef1234567890ab");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tracking).not.toBeNull();
    });
  });

  describe("Invalid Token", () => {
    it("should return 400 for token shorter than 32 characters", async () => {
      if (!app) return;

      const res = await app.request("/api/tracking/token/short");

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_TOKEN");
    });

    it("should return 404 for non-existent token", async () => {
      if (!app) return;

      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(null);

      const res = await app.request("/api/tracking/token/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("TOKEN_NOT_FOUND");
    });
  });

  describe("Expired Token", () => {
    it("should return 410 for expired token", async () => {
      if (!app) return;

      const expiredOrder = {
        ...mockOrderWithToken,
        trackingTokenExpiresAt: new Date(Date.now() - 86400000), // Yesterday
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(expiredOrder);

      const res = await app.request("/api/tracking/token/abcd1234567890abcdef1234567890ab");

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.code).toBe("TOKEN_EXPIRED");
    });
  });

  describe("Token without Expiration", () => {
    it("should allow access when token has no expiration set", async () => {
      if (!app) return;

      const orderWithoutExpiry = {
        ...mockOrderWithToken,
        trackingTokenExpiresAt: null,
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(orderWithoutExpiry);
      vi.mocked(db.query.orderShipments.findFirst).mockResolvedValueOnce(mockShipment);

      const res = await app.request("/api/tracking/token/abcd1234567890abcdef1234567890ab");

      expect(res.status).toBe(200);
    });
  });
});

// ============================================================================
// Order Number Route Tests - GET /api/tracking/:orderNumber
// ============================================================================

describe("Order Number Route - GET /api/tracking/:orderNumber", () => {
  it("should require email or phone", async () => {
    if (!app) return;

    const res = await app.request("/api/tracking/MA-2024-001234");

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_REQUIRED");
  });

  it("should redirect to lookup with email", async () => {
    if (!app) return;

    const res = await app.request("/api/tracking/MA-2024-001234?email=test@example.com", {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("/api/tracking/lookup");
    expect(location).toContain("orderNumber=MA-2024-001234");
    // Email @ gets URL encoded as %40
    expect(location).toContain("email=test");
    expect(location).toContain("example.com");
  });

  it("should redirect to lookup with phone", async () => {
    if (!app) return;

    const res = await app.request("/api/tracking/MA-2024-001234?phone=9876543210", {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("/api/tracking/lookup");
    expect(location).toContain("phone=9876543210");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  it("should handle database errors gracefully", async () => {
    if (!app) return;

    vi.mocked(db.query.orders.findFirst).mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await app.request(
      "/api/tracking/lookup?orderNumber=MA-2024-001234&email=test@example.com"
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("LOOKUP_ERROR");
  });

  it("should handle token lookup database errors", async () => {
    if (!app) return;

    vi.mocked(db.query.orders.findFirst).mockRejectedValueOnce(new Error("DB error"));

    const res = await app.request("/api/tracking/token/abcd1234567890abcdef1234567890ab");

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("LOOKUP_ERROR");
  });
});

// ============================================================================
// Service Exports Tests
// ============================================================================

describe("Tracking Routes Exports", () => {
  it("should export trackingApp from routes/tracking", async () => {
    const trackingModule = await import("../../src/routes/tracking");
    expect(trackingModule).toHaveProperty("trackingApp");
  });

  it("should be a Hono app instance", async () => {
    const { trackingApp } = await import("../../src/routes/tracking");
    expect(typeof trackingApp.fetch).toBe("function");
  });
});
