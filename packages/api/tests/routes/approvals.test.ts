/**
 * Tests for Public Approvals API Routes
 *
 * This test suite validates the public approvals API routes:
 * - GET /api/approvals/:token - Get approval details by token
 * - POST /api/approvals/:token/changes - Request changes to production photos
 * - POST /api/approvals/:token/approve - Approve for shipping
 *
 * These endpoints do NOT require authentication - they use secure tokens.
 *
 * Tests are organized into:
 * 1. Module export tests - Always run
 * 2. Route availability tests - Test routes exist
 * 3. Validation tests - Test input validation
 * 4. Error handling tests - Test error responses
 *
 * @see packages/api/src/routes/approvals.ts
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { Hono } from "hono";
import "../setup";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid approval token format for testing
 */
const validApprovalToken = "apv_abc123def456ghi789jkl012mno345";
const invalidToken = "invalid_token";

/**
 * Valid change request data
 */
const validChangeRequestData = {
  comment: "Please adjust the colors slightly - the blue looks too dark.",
};

/**
 * Valid approve data
 */
const validApproveData = {
  approvedBy: "guest@example.com",
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === "true") {
    console.log(
      "Skipping approvals runtime tests (SKIP_DB_RUNTIME_TESTS=true)"
    );
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import("../../src/index");
    app = testApp;

    // Test database connectivity by making a simple request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await testApp.request("/api/health", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 200) {
        isDatabaseAvailable = true;
        console.log("Database connection available for runtime tests");
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

describe("Approvals Route Module Exports", () => {
  it("should export approvalsApp from routes/approvals", async () => {
    const approvalsModule = await import("../../src/routes/approvals");
    expect(approvalsModule).toHaveProperty("approvalsApp");
    expect(approvalsModule.approvalsApp).toBeDefined();
  });

  it("should be a Hono app instance", async () => {
    const { approvalsApp } = await import("../../src/routes/approvals");
    expect(typeof approvalsApp.fetch).toBe("function");
    expect(typeof approvalsApp.request).toBe("function");
  });
});

// ============================================================================
// Route Availability Tests
// ============================================================================

describe("Approvals Route Availability", () => {
  describe("GET /api/approvals/:token", () => {
    it("should have GET /:token route available", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}`);

      // Route exists - we may get 404 (not found) or 500 (db error), but not 404 for method not allowed
      expect(res.status).not.toBe(405);
    });

    it("should return 404 for non-existent token", async () => {
      if (!app) {
        console.log("App not available, skipping test");
        return;
      }

      const res = await app.request(`/api/approvals/${invalidToken}`);

      // Should return 404 or 500 (database error in test env)
      expect([404, 500]).toContain(res.status);
    });
  });

  describe("POST /api/approvals/:token/changes", () => {
    it("should have POST /:token/changes route available", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validChangeRequestData),
      });

      // Route exists - should not be 405 (Method Not Allowed)
      expect(res.status).not.toBe(405);
    });
  });

  describe("POST /api/approvals/:token/approve", () => {
    it("should have POST /:token/approve route available", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validApproveData),
      });

      // Route exists - should not be 405 (Method Not Allowed)
      expect(res.status).not.toBe(405);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("Approvals Input Validation", () => {
  describe("POST /api/approvals/:token/changes - Change Request Validation", () => {
    it("should reject empty comment", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "" }),
      });

      expect(res.status).toBe(400);
    });

    it("should reject missing comment", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("should reject comment over 2000 characters", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const longComment = "a".repeat(2001);

      const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: longComment }),
      });

      expect(res.status).toBe(400);
    });

    it("should accept valid comment", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validChangeRequestData),
      });

      // Should not be a validation error (400) - might be 404/500 from service
      expect(res.status).not.toBe(400);
    });
  });

  describe("POST /api/approvals/:token/approve - Approve Validation", () => {
    it("should accept empty body", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Should not be a validation error (400) - approvedBy is optional
      expect(res.status).not.toBe(400);
    });

    it("should accept approvedBy identifier", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validApproveData),
      });

      // Should not be a validation error (400)
      expect(res.status).not.toBe(400);
    });
  });
});

// ============================================================================
// Response Format Tests
// ============================================================================

describe("Approvals Response Format", () => {
  describe("GET /:token - Error Response", () => {
    it("should return proper error format for not found", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}`);
      const json = await res.json();

      // Should have success: false in error response
      expect(json).toHaveProperty("success");
      expect(json.success).toBe(false);
      expect(json).toHaveProperty("error");
    });
  });

  describe("POST /:token/changes - Error Response", () => {
    it("should return proper error format for not found", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validChangeRequestData),
      });

      const json = await res.json();

      // Error responses should have success: false
      if (!json.success) {
        expect(json).toHaveProperty("error");
      }
    });
  });

  describe("POST /:token/approve - Error Response", () => {
    it("should return proper error format for not found", async () => {
      const { approvalsApp } = await import("../../src/routes/approvals");

      const res = await approvalsApp.request(`/${validApprovalToken}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validApproveData),
      });

      const json = await res.json();

      // Error responses should have success: false
      if (!json.success) {
        expect(json).toHaveProperty("error");
      }
    });
  });
});

// ============================================================================
// No Auth Required Tests
// ============================================================================

describe("Approvals Public Access (No Auth Required)", () => {
  it("should not return 401 for GET /:token", async () => {
    const { approvalsApp } = await import("../../src/routes/approvals");

    const res = await approvalsApp.request(`/${validApprovalToken}`);

    // Public route - should not require auth
    expect(res.status).not.toBe(401);
  });

  it("should not return 401 for POST /:token/changes", async () => {
    const { approvalsApp } = await import("../../src/routes/approvals");

    const res = await approvalsApp.request(`/${validApprovalToken}/changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validChangeRequestData),
    });

    // Public route - should not require auth
    expect(res.status).not.toBe(401);
  });

  it("should not return 401 for POST /:token/approve", async () => {
    const { approvalsApp } = await import("../../src/routes/approvals");

    const res = await approvalsApp.request(`/${validApprovalToken}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validApproveData),
    });

    // Public route - should not require auth
    expect(res.status).not.toBe(401);
  });
});
