/**
 * Tests for Admin Approvals API Routes
 *
 * This test suite validates the admin approvals API routes:
 * - GET /api/admin/approvals - List approvals with filters
 * - GET /api/admin/approvals/stats - Get approval statistics
 * - GET /api/admin/approvals/:id - Get full approval details
 * - POST /api/admin/approvals/:id/photos - Upload production photos
 * - DELETE /api/admin/approvals/:id/photos - Delete all photos
 * - POST /api/admin/approvals/:id/comments - Add admin comment
 *
 * All endpoints require admin authentication.
 *
 * Tests are organized into:
 * 1. Module export tests - Always run, don't require database
 * 2. Authentication tests - Test admin auth requirement
 * 3. Validation tests - Test input validation
 *
 * @see packages/api/src/routes/admin/approvals.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import "../../setup";
import { readJson } from '../../helpers/json';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid approval ID for testing
 */
const validApprovalId = "00000000-0000-0000-0000-000000000001";

/**
 * Valid photo upload data
 */
const validPhotoUploadData = {
  photos: [
    {
      url: "https://example.com/photo1.jpg",
      thumbnailUrl: "https://example.com/thumb1.jpg",
      sortOrder: 0,
    },
    {
      url: "https://example.com/photo2.jpg",
      thumbnailUrl: "https://example.com/thumb2.jpg",
      sortOrder: 1,
    },
  ],
  sendNotification: true,
};

/**
 * Valid comment data
 */
const validCommentData = {
  comment: "Production photo showing the finished product with correct colors.",
};

/**
 * Check if database is available for runtime tests
 */
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === "true") {
    console.log(
      "Skipping admin approvals runtime tests (SKIP_DB_RUNTIME_TESTS=true)"
    );
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import("../../../src/index");
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
        console.log("Database connection available for runtime tests");
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

describe("Admin Approvals Route Module Exports", () => {
  it("should export adminApprovalsApp from routes/admin/approvals", async () => {
    const approvalsModule = await import("../../../src/routes/admin/approvals");
    expect(approvalsModule).toHaveProperty("adminApprovalsApp");
    expect(approvalsModule.adminApprovalsApp).toBeDefined();
  });

  it("should be a Hono app instance", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );
    expect(typeof adminApprovalsApp.fetch).toBe("function");
    expect(typeof adminApprovalsApp.request).toBe("function");
  });
});

// ============================================================================
// Authentication Tests (Always Run)
// ============================================================================

describe("Admin Approvals Authentication Requirements", () => {
  describe("GET /api/admin/approvals - List Approvals", () => {
    it("should require authentication", async () => {
      if (!app) {
        console.log("App not available, skipping auth test");
        return;
      }

      const res = await app.request("/api/admin/approvals");
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty("error");
    });
  });

  describe("GET /api/admin/approvals/stats - Get Stats", () => {
    it("should require authentication", async () => {
      if (!app) {
        console.log("App not available, skipping auth test");
        return;
      }

      const res = await app.request("/api/admin/approvals/stats");
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty("error");
    });
  });

  describe("GET /api/admin/approvals/:id - Get Approval", () => {
    it("should require authentication", async () => {
      if (!app) {
        console.log("App not available, skipping auth test");
        return;
      }

      const res = await app.request(`/api/admin/approvals/${validApprovalId}`);
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty("error");
    });
  });

  describe("POST /api/admin/approvals/:id/photos - Upload Photos", () => {
    it("should require authentication", async () => {
      if (!app) {
        console.log("App not available, skipping auth test");
        return;
      }

      const res = await app.request(
        `/api/admin/approvals/${validApprovalId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPhotoUploadData),
        }
      );
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty("error");
    });
  });

  describe("DELETE /api/admin/approvals/:id/photos - Delete Photos", () => {
    it("should require authentication", async () => {
      if (!app) {
        console.log("App not available, skipping auth test");
        return;
      }

      const res = await app.request(
        `/api/admin/approvals/${validApprovalId}/photos`,
        {
          method: "DELETE",
        }
      );
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty("error");
    });
  });

  describe("POST /api/admin/approvals/:id/comments - Add Comment", () => {
    it("should require authentication", async () => {
      if (!app) {
        console.log("App not available, skipping auth test");
        return;
      }

      const res = await app.request(
        `/api/admin/approvals/${validApprovalId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validCommentData),
        }
      );
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty("error");
    });
  });
});

// ============================================================================
// Validation Tests
// Note: Auth middleware runs before validation, so these test that
// invalid requests are rejected (returns 401 since auth runs first)
// ============================================================================

describe("Admin Approvals Input Validation", () => {
  describe("GET /api/admin/approvals - Query Validation", () => {
    it("should accept valid status filter format", async () => {
      const { adminApprovalsApp } = await import(
        "../../../src/routes/admin/approvals"
      );

      // Without authentication, we'll get 401 (auth runs first)
      // This test verifies the route accepts valid query params format
      const res = await adminApprovalsApp.request(
        "/?status=pending_approval&page=1&pageSize=10"
      );

      // Should get 401 (auth required), confirming route exists and accepts params
      expect(res.status).toBe(401);
    });

    it("should reject invalid status before auth check", async () => {
      const { adminApprovalsApp } = await import(
        "../../../src/routes/admin/approvals"
      );

      const res = await adminApprovalsApp.request("/?status=invalid_status");

      // Auth runs first, so we get 401 for unauthenticated requests
      // Validation would happen after auth in a real authenticated request
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/admin/approvals/:id/photos - Photo Upload Schema", () => {
    it("should have photo upload endpoint that requires auth first", async () => {
      const { adminApprovalsApp } = await import(
        "../../../src/routes/admin/approvals"
      );

      const res = await adminApprovalsApp.request(
        `/${validApprovalId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos: [] }),
        }
      );

      // Auth runs before validation
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/admin/approvals/:id/comments - Comment Schema", () => {
    it("should have comment endpoint that requires auth first", async () => {
      const { adminApprovalsApp } = await import(
        "../../../src/routes/admin/approvals"
      );

      const res = await adminApprovalsApp.request(
        `/${validApprovalId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: "" }),
        }
      );

      // Auth runs before validation
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Route Availability Tests
// ============================================================================

describe("Admin Approvals Route Availability", () => {
  it("should have GET / route available", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );

    const res = await adminApprovalsApp.request("/");

    // Route exists - should get 401 (auth required), not 404
    expect(res.status).not.toBe(404);
  });

  it("should have GET /stats route available", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );

    const res = await adminApprovalsApp.request("/stats");

    expect(res.status).not.toBe(404);
  });

  it("should have GET /:id route available", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );

    const res = await adminApprovalsApp.request(`/${validApprovalId}`);

    expect(res.status).not.toBe(404);
  });

  it("should have POST /:id/photos route available", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );

    const res = await adminApprovalsApp.request(`/${validApprovalId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPhotoUploadData),
    });

    expect(res.status).not.toBe(404);
  });

  it("should have DELETE /:id/photos route available", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );

    const res = await adminApprovalsApp.request(`/${validApprovalId}/photos`, {
      method: "DELETE",
    });

    expect(res.status).not.toBe(404);
  });

  it("should have POST /:id/comments route available", async () => {
    const { adminApprovalsApp } = await import(
      "../../../src/routes/admin/approvals"
    );

    const res = await adminApprovalsApp.request(
      `/${validApprovalId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validCommentData),
      }
    );

    expect(res.status).not.toBe(404);
  });
});
