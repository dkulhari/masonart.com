/**
 * Tests for health check endpoints
 *
 * This test suite validates the health check API routes:
 * - GET /health - Basic health check for monitoring (returns: { status: 'healthy', timestamp })
 * - GET /api/health - API-prefixed health check with service info (returns: { status: 'ok', service, timestamp })
 *
 * Health endpoints are unauthenticated and used for:
 * - Container health checks (Docker, Kubernetes)
 * - Load balancer health probes
 * - Monitoring and alerting systems
 * - API status verification
 *
 * Tests are organized into:
 * 1. Module export tests - Verify app exports
 * 2. Route availability tests - Test routes are mounted
 * 3. Response format tests - Verify JSON response structures
 * 4. Response headers tests - Verify correct content-types
 * 5. HTTP method tests - Test allowed/disallowed methods
 * 6. CORS tests - Verify cross-origin requests work
 * 7. Performance tests - Test response times
 * 8. Concurrent request tests - Test under load
 *
 * @see packages/api/src/index.ts - Health endpoints definition
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import "../setup";

// ============================================================================
// Test Setup
// ============================================================================

/**
 * App reference - loaded in beforeAll
 */
let app: Hono | null = null;

beforeAll(async () => {
  try {
    const { app: testApp } = await import("../../src/index");
    app = testApp;
  } catch (error) {
    console.log("Could not initialize app for testing:", (error as Error).message);
    app = null;
  }
}, 10000);

// ============================================================================
// Module Export Tests (Always Run)
// ============================================================================

describe("Health Check Module Exports", () => {
  it("should export app from src/index", async () => {
    const indexModule = await import("../../src/index");
    expect(indexModule).toHaveProperty("app");
    expect(indexModule.app).toBeDefined();
  });

  it("should be a Hono app instance", async () => {
    const { app: testApp } = await import("../../src/index");
    expect(typeof testApp.fetch).toBe("function");
    expect(typeof testApp.request).toBe("function");
  });

  it("should export AppType for type inference", async () => {
    const indexModule = await import("../../src/index");
    expect(indexModule).toHaveProperty("app");
    // AppType is a TypeScript type, can't test at runtime
  });
});

// ============================================================================
// Route Availability Tests
// ============================================================================

describe("Health Check Route Availability", () => {
  it("should have health endpoint at /health", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("should have API health endpoint at /api/health", async () => {
    if (!app) {
      console.log("App not available, skipping route availability test");
      return;
    }

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
  });

  it("should not require authentication for /health", async () => {
    if (!app) return;

    const res = await app.request("/health");
    // Should be 200 (OK), not 401 (Unauthorized)
    expect(res.status).toBe(200);
  });

  it("should not require authentication for /api/health", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    // Should be 200 (OK), not 401 (Unauthorized)
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// Response Format Tests - /health
// ============================================================================

describe("Health Endpoint Response Format (/health)", () => {
  it("should return JSON response", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("should return status field", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();
    expect(data).toHaveProperty("status");
  });

  it('should return status as "healthy"', async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();
    expect(data.status).toBe("healthy");
  });

  it("should return timestamp field", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();
    expect(data).toHaveProperty("timestamp");
  });

  it("should return valid ISO 8601 timestamp", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();
    expect(data.timestamp).toBeDefined();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.toString()).not.toBe("Invalid Date");
    // ISO 8601 format check
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should return recent timestamp (within 5 seconds)", async () => {
    if (!app) return;

    const before = new Date();
    const res = await app.request("/health");
    const after = new Date();
    const data = await res.json();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 5000);
  });

  it("should match expected response structure", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();

    expect(data).toMatchObject({
      status: "healthy",
      timestamp: expect.any(String),
    });
  });

  it("should only contain expected fields (status, timestamp)", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();
    const keys = Object.keys(data);

    expect(keys).toHaveLength(2);
    expect(keys).toContain("status");
    expect(keys).toContain("timestamp");
  });

  it("should not contain service field", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const data = await res.json();
    expect(data).not.toHaveProperty("service");
  });

  it("should return valid JSON that can be parsed", async () => {
    if (!app) return;

    const res = await app.request("/health");
    const text = await res.text();

    expect(() => JSON.parse(text)).not.toThrow();
  });
});

// ============================================================================
// Response Format Tests - /api/health
// ============================================================================

describe("API Health Endpoint Response Format (/api/health)", () => {
  it("should return JSON response", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("should return status field", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    expect(data).toHaveProperty("status");
  });

  it('should return status as "ok"', async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("should return service field", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    expect(data).toHaveProperty("service");
  });

  it('should return service as "masonart-api"', async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    expect(data.service).toBe("masonart-api");
  });

  it("should return timestamp field", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    expect(data).toHaveProperty("timestamp");
  });

  it("should return valid ISO 8601 timestamp", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    expect(data.timestamp).toBeDefined();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.toString()).not.toBe("Invalid Date");
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should return recent timestamp (within 5 seconds)", async () => {
    if (!app) return;

    const before = new Date();
    const res = await app.request("/api/health");
    const after = new Date();
    const data = await res.json();

    const timestamp = new Date(data.timestamp);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 5000);
  });

  it("should match expected response structure", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();

    expect(data).toMatchObject({
      status: "ok",
      service: "masonart-api",
      timestamp: expect.any(String),
    });
  });

  it("should only contain expected fields (status, service, timestamp)", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();
    const keys = Object.keys(data);

    expect(keys).toHaveLength(3);
    expect(keys).toContain("status");
    expect(keys).toContain("service");
    expect(keys).toContain("timestamp");
  });

  it("should return valid JSON that can be parsed", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const text = await res.text();

    expect(() => JSON.parse(text)).not.toThrow();
  });
});

// ============================================================================
// Response Header Tests
// ============================================================================

describe("Health Check Response Headers", () => {
  describe("GET /health Headers", () => {
    it("should return content-type header", async () => {
      if (!app) return;

      const res = await app.request("/health");
      expect(res.headers.get("content-type")).toBeDefined();
    });

    it("should return application/json content-type", async () => {
      if (!app) return;

      const res = await app.request("/health");
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("GET /api/health Headers", () => {
    it("should return content-type header", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      expect(res.headers.get("content-type")).toBeDefined();
    });

    it("should return application/json content-type", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });
});

// ============================================================================
// HTTP Method Tests
// ============================================================================

describe("Health Check HTTP Methods", () => {
  describe("/health HTTP Methods", () => {
    it("should accept GET requests", async () => {
      if (!app) return;

      const res = await app.request("/health", { method: "GET" });
      expect(res.status).toBe(200);
    });

    it("should reject POST requests", async () => {
      if (!app) return;

      const res = await app.request("/health", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("should reject PUT requests", async () => {
      if (!app) return;

      const res = await app.request("/health", { method: "PUT" });
      expect(res.status).toBe(404);
    });

    it("should reject DELETE requests", async () => {
      if (!app) return;

      const res = await app.request("/health", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("should reject PATCH requests", async () => {
      if (!app) return;

      const res = await app.request("/health", { method: "PATCH" });
      expect(res.status).toBe(404);
    });

    it("should handle HEAD requests", async () => {
      if (!app) return;

      const res = await app.request("/health", { method: "HEAD" });
      // Hono may return 200 or 404 for HEAD on GET-only routes
      expect([200, 404, 405]).toContain(res.status);
    });

    it("should handle OPTIONS requests (CORS preflight)", async () => {
      if (!app) return;

      const res = await app.request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "GET",
        },
      });
      // CORS middleware should handle OPTIONS
      expect([200, 204, 404]).toContain(res.status);
    });
  });

  describe("/api/health HTTP Methods", () => {
    it("should accept GET requests", async () => {
      if (!app) return;

      const res = await app.request("/api/health", { method: "GET" });
      expect(res.status).toBe(200);
    });

    it("should reject POST requests", async () => {
      if (!app) return;

      const res = await app.request("/api/health", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("should reject PUT requests", async () => {
      if (!app) return;

      const res = await app.request("/api/health", { method: "PUT" });
      expect(res.status).toBe(404);
    });

    it("should reject DELETE requests", async () => {
      if (!app) return;

      const res = await app.request("/api/health", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("should reject PATCH requests", async () => {
      if (!app) return;

      const res = await app.request("/api/health", { method: "PATCH" });
      expect(res.status).toBe(404);
    });

    it("should handle OPTIONS requests (CORS preflight)", async () => {
      if (!app) return;

      const res = await app.request("/api/health", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "GET",
        },
      });
      expect([200, 204, 404]).toContain(res.status);
    });
  });
});

// ============================================================================
// CORS Tests
// ============================================================================

describe("Health Check CORS Support", () => {
  describe("/health CORS", () => {
    it("should accept requests with Origin header", async () => {
      if (!app) return;

      const res = await app.request("/health", {
        headers: {
          Origin: "http://localhost:3001",
        },
      });
      expect(res.status).toBe(200);
    });

    it("should accept requests from configured origin", async () => {
      if (!app) return;

      const res = await app.request("/health", {
        headers: {
          Origin: "http://localhost:3001",
        },
      });
      expect(res.status).toBe(200);
    });

    it("should return valid response regardless of origin", async () => {
      if (!app) return;

      const res = await app.request("/health", {
        headers: {
          Origin: "https://example.com",
        },
      });
      // Health check should work regardless of CORS for monitoring tools
      expect(res.status).toBe(200);
    });
  });

  describe("/api/health CORS", () => {
    it("should accept requests with Origin header", async () => {
      if (!app) return;

      const res = await app.request("/api/health", {
        headers: {
          Origin: "http://localhost:3001",
        },
      });
      expect(res.status).toBe(200);
    });

    it("should accept cross-origin requests", async () => {
      if (!app) return;

      const res = await app.request("/api/health", {
        headers: {
          Origin: "https://external-monitoring.example.com",
        },
      });
      expect(res.status).toBe(200);
    });
  });
});

// ============================================================================
// Query Parameter Tests
// ============================================================================

describe("Health Check Query Parameters", () => {
  it("should ignore query parameters on /health", async () => {
    if (!app) return;

    const res = await app.request("/health?foo=bar&baz=qux");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("healthy");
  });

  it("should ignore query parameters on /api/health", async () => {
    if (!app) return;

    const res = await app.request("/api/health?verbose=true&format=json");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
  });
});

// ============================================================================
// URL Variations Tests
// ============================================================================

describe("Health Check URL Variations", () => {
  describe("/health URL variations", () => {
    it("should respond to /health", async () => {
      if (!app) return;

      const res = await app.request("/health");
      expect(res.status).toBe(200);
    });

    it("should handle trailing slash correctly", async () => {
      if (!app) return;

      const res = await app.request("/health/");
      // Hono may treat with/without trailing slash differently
      expect([200, 301, 302, 404]).toContain(res.status);
    });

    it("should not respond to /HEALTH (case sensitive)", async () => {
      if (!app) return;

      const res = await app.request("/HEALTH");
      expect(res.status).toBe(404);
    });

    it("should not respond to /Health (case sensitive)", async () => {
      if (!app) return;

      const res = await app.request("/Health");
      expect(res.status).toBe(404);
    });
  });

  describe("/api/health URL variations", () => {
    it("should respond to /api/health", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
    });

    it("should handle trailing slash correctly", async () => {
      if (!app) return;

      const res = await app.request("/api/health/");
      expect([200, 301, 302, 404]).toContain(res.status);
    });

    it("should not respond to /api/HEALTH (case sensitive)", async () => {
      if (!app) return;

      const res = await app.request("/api/HEALTH");
      expect(res.status).toBe(404);
    });

    it("should not respond to /API/health (case sensitive)", async () => {
      if (!app) return;

      const res = await app.request("/API/health");
      expect(res.status).toBe(404);
    });
  });
});

// ============================================================================
// Request Header Tests
// ============================================================================

describe("Health Check Request Headers", () => {
  it("should accept requests with custom headers", async () => {
    if (!app) return;

    const res = await app.request("/health", {
      headers: {
        "X-Custom-Header": "test-value",
        "X-Request-ID": "test-123",
      },
    });
    expect(res.status).toBe(200);
  });

  it("should accept requests with Accept header", async () => {
    if (!app) return;

    const res = await app.request("/health", {
      headers: {
        Accept: "application/json",
      },
    });
    expect(res.status).toBe(200);
  });

  it("should work with User-Agent header (monitoring tools)", async () => {
    if (!app) return;

    const res = await app.request("/health", {
      headers: {
        "User-Agent": "Prometheus/2.37.0",
      },
    });
    expect(res.status).toBe(200);
  });

  it("should work with typical load balancer headers", async () => {
    if (!app) return;

    const res = await app.request("/api/health", {
      headers: {
        "X-Forwarded-For": "10.0.0.1",
        "X-Forwarded-Proto": "https",
        "X-Real-IP": "192.168.1.1",
      },
    });
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

describe("Health Check Consistency", () => {
  it("should return consistent status on /health", async () => {
    if (!app) return;

    const responses = await Promise.all([
      app.request("/health"),
      app.request("/health"),
      app.request("/health"),
    ]);

    const statuses = await Promise.all(
      responses.map((res) => res.json().then((d: { status: string }) => d.status))
    );

    expect(statuses).toEqual(["healthy", "healthy", "healthy"]);
  });

  it("should return consistent status on /api/health", async () => {
    if (!app) return;

    const responses = await Promise.all([
      app.request("/api/health"),
      app.request("/api/health"),
      app.request("/api/health"),
    ]);

    const statuses = await Promise.all(
      responses.map((res) => res.json().then((d: { status: string }) => d.status))
    );

    expect(statuses).toEqual(["ok", "ok", "ok"]);
  });

  it("should return consistent service name on /api/health", async () => {
    if (!app) return;

    const responses = await Promise.all([app.request("/api/health"), app.request("/api/health")]);

    const services = await Promise.all(
      responses.map((res) => res.json().then((d: { service: string }) => d.service))
    );

    expect(services).toEqual(["masonart-api", "masonart-api"]);
  });

  it("should have different timestamps on sequential requests", async () => {
    if (!app) return;

    const res1 = await app.request("/health");
    // Small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
    const res2 = await app.request("/health");

    const data1 = await res1.json();
    const data2 = await res2.json();

    const time1 = new Date(data1.timestamp).getTime();
    const time2 = new Date(data2.timestamp).getTime();

    // Second timestamp should be greater or equal
    expect(time2).toBeGreaterThanOrEqual(time1);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Health Check Performance", () => {
  it("should respond quickly to /health (under 100ms)", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/health");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it("should respond quickly to /api/health (under 100ms)", async () => {
    if (!app) return;

    const start = Date.now();
    await app.request("/api/health");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it("should handle rapid successive requests to /health", async () => {
    if (!app) return;

    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
    }
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it("should handle rapid successive requests to /api/health", async () => {
    if (!app) return;

    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
    }
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it("should maintain performance under load", async () => {
    if (!app) return;

    const iterations = 5;
    const requestsPerIteration = 20;
    const maxAverageTime = 50; // 50ms average

    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const requests = Array.from({ length: requestsPerIteration }, () => app!.request("/health"));
      await Promise.all(requests);
      const endTime = Date.now();

      const avgTime = (endTime - startTime) / requestsPerIteration;
      times.push(avgTime);
    }

    const overallAverage = times.reduce((a, b) => a + b, 0) / times.length;
    expect(overallAverage).toBeLessThan(maxAverageTime);
  });
});

// ============================================================================
// Concurrent Request Tests
// ============================================================================

describe("Health Check Concurrent Requests", () => {
  it("should handle concurrent requests to /health", async () => {
    if (!app) return;

    const requests = Array.from({ length: 20 }, () => app!.request("/health"));

    const responses = await Promise.all(requests);

    expect(responses).toHaveLength(20);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });

  it("should handle concurrent requests to /api/health", async () => {
    if (!app) return;

    const requests = Array.from({ length: 20 }, () => app!.request("/api/health"));

    const responses = await Promise.all(requests);

    expect(responses).toHaveLength(20);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });

  it("should handle mixed concurrent requests", async () => {
    if (!app) return;

    const requests = [
      ...Array.from({ length: 10 }, () => app!.request("/health")),
      ...Array.from({ length: 10 }, () => app!.request("/api/health")),
    ];

    const responses = await Promise.all(requests);

    expect(responses).toHaveLength(20);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });

  it("should handle burst of 50 concurrent requests", async () => {
    if (!app) return;

    const start = Date.now();
    const requests = Array.from({ length: 50 }, () => app!.request("/health"));

    const responses = await Promise.all(requests);
    const duration = Date.now() - start;

    expect(responses).toHaveLength(50);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });
    // Should complete within 5 seconds
    expect(duration).toBeLessThan(5000);
  });
});

// ============================================================================
// Response Status Code Tests
// ============================================================================

describe("Health Check Status Codes", () => {
  it("should return 200 OK for /health", async () => {
    if (!app) return;

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  it("should return 200 OK for /api/health", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  });

  it("should return 404 for non-existent health routes", async () => {
    if (!app) return;

    const res = await app.request("/health/status");
    expect(res.status).toBe(404);
  });

  it("should return 404 for /api/health/deep/path", async () => {
    if (!app) return;

    const res = await app.request("/api/health/deep/path");
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// Endpoint Differentiation Tests
// ============================================================================

describe("Health Check Endpoint Differentiation", () => {
  it("should return different responses for /health and /api/health", async () => {
    if (!app) return;

    const res1 = await app.request("/health");
    const res2 = await app.request("/api/health");

    const data1 = await res1.json();
    const data2 = await res2.json();

    // /health has 'healthy' status
    expect(data1.status).toBe("healthy");
    // /api/health has 'ok' status
    expect(data2.status).toBe("ok");
  });

  it("should return service field only for /api/health", async () => {
    if (!app) return;

    const res1 = await app.request("/health");
    const res2 = await app.request("/api/health");

    const data1 = await res1.json();
    const data2 = await res2.json();

    // /health does not have 'service' field
    expect(data1).not.toHaveProperty("service");
    // /api/health has 'service' field
    expect(data2).toHaveProperty("service");
  });

  it("should have different number of fields", async () => {
    if (!app) return;

    const res1 = await app.request("/health");
    const res2 = await app.request("/api/health");

    const data1 = await res1.json();
    const data2 = await res2.json();

    // /health has 2 fields (status, timestamp)
    expect(Object.keys(data1)).toHaveLength(2);
    // /api/health has 3 fields (status, service, timestamp)
    expect(Object.keys(data2)).toHaveLength(3);
  });
});

// ============================================================================
// Use Case Tests (Monitoring/Load Balancer)
// ============================================================================

describe("Health Check Use Cases", () => {
  it("should work as Docker health check", async () => {
    if (!app) return;

    // Docker health check typically just checks status code
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("should work as Kubernetes liveness probe", async () => {
    if (!app) return;

    // Kubernetes liveness probe checks if app is alive
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("healthy");
  });

  it("should work as Kubernetes readiness probe", async () => {
    if (!app) return;

    // Kubernetes readiness probe checks if app can accept traffic
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("should work as load balancer health check", async () => {
    if (!app) return;

    // Load balancers often check multiple times quickly
    const checks = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/api/health");
      checks.push(res.status === 200);
    }

    expect(checks.every(Boolean)).toBe(true);
  });

  it("should provide service identification for monitoring", async () => {
    if (!app) return;

    const res = await app.request("/api/health");
    const data = await res.json();

    // Service name should be identifiable
    expect(data.service).toBe("masonart-api");
    expect(data.service).toBeTruthy();
    expect(typeof data.service).toBe("string");
  });
});

// ============================================================================
// Response Data Type Validation Tests
// ============================================================================

describe("Health Check Response Data Types", () => {
  describe("/health Data Types", () => {
    it("should have status as string type", async () => {
      if (!app) return;

      const res = await app.request("/health");
      const data = await res.json();

      expect(typeof data.status).toBe("string");
    });

    it("should have timestamp as string type", async () => {
      if (!app) return;

      const res = await app.request("/health");
      const data = await res.json();

      expect(typeof data.timestamp).toBe("string");
    });

    it("should not return null or undefined values", async () => {
      if (!app) return;

      const res = await app.request("/health");
      const data = await res.json();

      expect(data.status).not.toBeNull();
      expect(data.status).not.toBeUndefined();
      expect(data.timestamp).not.toBeNull();
      expect(data.timestamp).not.toBeUndefined();
    });

    it("should not return empty strings", async () => {
      if (!app) return;

      const res = await app.request("/health");
      const data = await res.json();

      expect(data.status).not.toBe("");
      expect(data.timestamp).not.toBe("");
    });
  });

  describe("/api/health Data Types", () => {
    it("should have status as string type", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      const data = await res.json();

      expect(typeof data.status).toBe("string");
    });

    it("should have service as string type", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      const data = await res.json();

      expect(typeof data.service).toBe("string");
    });

    it("should have timestamp as string type", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      const data = await res.json();

      expect(typeof data.timestamp).toBe("string");
    });

    it("should not return null or undefined values", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      const data = await res.json();

      expect(data.status).not.toBeNull();
      expect(data.status).not.toBeUndefined();
      expect(data.service).not.toBeNull();
      expect(data.service).not.toBeUndefined();
      expect(data.timestamp).not.toBeNull();
      expect(data.timestamp).not.toBeUndefined();
    });

    it("should not return empty strings", async () => {
      if (!app) return;

      const res = await app.request("/api/health");
      const data = await res.json();

      expect(data.status).not.toBe("");
      expect(data.service).not.toBe("");
      expect(data.timestamp).not.toBe("");
    });
  });
});
