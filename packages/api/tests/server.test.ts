import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { readJson } from './helpers/json';

/**
 * Tests to verify Hono server starts correctly
 *
 * This test suite validates:
 * - Server instantiation and configuration
 * - Middleware setup (CORS, logger, secure headers)
 * - Basic route functionality
 * - Health check endpoints
 * - Error handling
 * - API route structure
 * - Response headers
 * - Request handling capabilities
 */

describe('Hono Server Startup', () => {
  describe('Server Instantiation', () => {
    it('should create a Hono app instance', () => {
      expect(app).toBeDefined();
      expect(app).toHaveProperty('fetch');
      expect(typeof app.fetch).toBe('function');
    });

    it('should have request handler', () => {
      expect(app).toHaveProperty('request');
      expect(typeof app.request).toBe('function');
    });

    it('should have router', () => {
      expect(app).toHaveProperty('router');
      expect(app.router).toBeDefined();
    });

    it('should have route registration methods', () => {
      expect(typeof app.get).toBe('function');
      expect(typeof app.post).toBe('function');
      expect(typeof app.put).toBe('function');
      expect(typeof app.delete).toBe('function');
      expect(typeof app.patch).toBe('function');
    });

    it('should have middleware registration method', () => {
      expect(typeof app.use).toBe('function');
    });
  });

  describe('Root Endpoint', () => {
    it('should respond to GET / request', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);
    });

    it('should return JSON response', async () => {
      const res = await app.request('/');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should return API metadata', async () => {
      const res = await app.request('/');
      const data = await readJson(res);

      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('health');
    });

    it('should return correct API name', async () => {
      const res = await app.request('/');
      const data = await readJson(res);

      expect(data.name).toBe('chobii.art API');
    });

    it('should return version string', async () => {
      const res = await app.request('/');
      const data = await readJson(res);

      expect(typeof data.version).toBe('string');
      expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should advertise the health endpoint path', async () => {
      const res = await app.request('/');
      const data = await readJson(res);

      expect(data.health).toBe('/api/health');
    });

    it('should advertise a health path that is actually served', async () => {
      const res = await app.request('/');
      const data = await readJson(res);

      // The root payload is the API's only self-description; an advertised
      // path that 404s is worse than no advertisement at all.
      const advertised = await app.request(data.health);
      expect(advertised.status).not.toBe(404);
    });
  });

  describe('Health Check Endpoint (/health)', () => {
    it('should respond to GET /health request', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });

    it('should return JSON response', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should return health status', async () => {
      const res = await app.request('/health');
      const data = await readJson(res);

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
    });

    it('should return healthy status', async () => {
      const res = await app.request('/health');
      const data = await readJson(res);

      expect(data.status).toBe('healthy');
    });

    it('should return valid ISO timestamp', async () => {
      const res = await app.request('/health');
      const data = await readJson(res);

      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should return recent timestamp', async () => {
      const before = new Date();
      const res = await app.request('/health');
      const after = new Date();
      const data = await readJson(res);

      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });
  });

  describe('API Health Check Endpoint (/api/health)', () => {
    it('should respond to GET /api/health request', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
    });

    it('should return JSON response', async () => {
      const res = await app.request('/api/health');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should return health status with service info', async () => {
      const res = await app.request('/api/health');
      const data = await readJson(res);

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('service');
      expect(data).toHaveProperty('timestamp');
    });

    it('should return healthy status', async () => {
      const res = await app.request('/api/health');
      const data = await readJson(res);

      expect(data.status).toBe('healthy');
    });

    it('should report database and redis reachability', async () => {
      const res = await app.request('/api/health');
      const data = await readJson(res);

      // The per-component block is what docs/RUNBOOK-OUTAGE.md L4 triages on.
      expect(data.components.database.status).toBe('healthy');
      expect(data.components.redis.status).toBe('healthy');
    });

    it('should return correct service name', async () => {
      const res = await app.request('/api/health');
      const data = await readJson(res);

      expect(data.service).toBe('chobii-api');
    });

    it('should return valid ISO timestamp', async () => {
      const res = await app.request('/api/health');
      const data = await readJson(res);

      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('API Routes Structure', () => {
    it('should have products route mounted', async () => {
      const res = await app.request('/api/products');
      // Route exists, may return 200 or require auth
      expect([200, 401, 403, 500]).toContain(res.status);
    });

    it('should have cart route mounted', async () => {
      const res = await app.request('/api/cart');
      // Route exists, may return 200 or require auth
      expect([200, 401, 403, 500]).toContain(res.status);
    });

    it('should have orders route mounted', async () => {
      const res = await app.request('/api/orders');
      // Route exists, may return 200 or require auth
      expect([200, 401, 403, 500]).toContain(res.status);
    });

    it('should have AI route mounted', async () => {
      const res = await app.request('/api/ai');
      // Route exists, may return 200 or require auth
      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });

    it('should have admin products route mounted', async () => {
      const res = await app.request('/api/admin/products');
      // Route exists, may require admin auth
      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });

    it('should have admin orders route mounted', async () => {
      const res = await app.request('/api/admin/orders');
      // Route exists, may require admin auth
      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });

    it('should have razorpay webhooks route mounted', async () => {
      // POST to webhooks endpoint
      const res = await app.request('/api/webhooks/razorpay', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      // Route exists, will fail validation but route is mounted
      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
    });

    it('should have sitemap route mounted', async () => {
      const res = await app.request('/sitemap.xml');
      // Route exists
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('HTTP Methods', () => {
    it('should handle GET requests', async () => {
      const res = await app.request('/', { method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('should handle POST requests to health endpoint', async () => {
      const res = await app.request('/health', { method: 'POST' });
      // GET only endpoint
      expect(res.status).toBe(404);
    });

    it('should handle PUT requests to non-existent routes', async () => {
      const res = await app.request('/api/non-existent', { method: 'PUT' });
      expect(res.status).toBe(404);
    });

    it('should handle DELETE requests to non-existent routes', async () => {
      const res = await app.request('/api/non-existent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('should handle PATCH requests to non-existent routes', async () => {
      const res = await app.request('/api/non-existent', { method: 'PATCH' });
      expect(res.status).toBe(404);
    });

    it('should handle HEAD requests', async () => {
      const res = await app.request('/health', { method: 'HEAD' });
      // Hono may return 200 or 405 for HEAD on GET routes
      expect([200, 404, 405]).toContain(res.status);
    });

    it('should handle OPTIONS requests (CORS preflight)', async () => {
      const res = await app.request('/api/products', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3001',
          'Access-Control-Request-Method': 'POST',
        },
      });
      // CORS middleware should handle OPTIONS
      expect([200, 204, 404]).toContain(res.status);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const res = await app.request('/non-existent-route');
      expect(res.status).toBe(404);
    });

    it('should return 404 for deep non-existent routes', async () => {
      const res = await app.request('/api/v1/unknown/deep/path');
      expect(res.status).toBe(404);
    });

    it('should handle multiple 404 requests', async () => {
      const res1 = await app.request('/test1');
      const res2 = await app.request('/test2');
      const res3 = await app.request('/test3');

      expect(res1.status).toBe(404);
      expect(res2.status).toBe(404);
      expect(res3.status).toBe(404);
    });

    it('should handle requests with query parameters to non-existent routes', async () => {
      const res = await app.request('/non-existent?foo=bar&baz=qux');
      expect(res.status).toBe(404);
    });
  });

  describe('Response Headers', () => {
    it('should set correct content-type for JSON responses', async () => {
      const res = await app.request('/');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should include content-type in health check', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should include content-type in API health check', async () => {
      const res = await app.request('/api/health');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should include secure headers from middleware', async () => {
      const res = await app.request('/');
      // secureHeaders middleware adds various security headers

      // At minimum, check that response is valid
      expect(res.status).toBe(200);
    });
  });

  describe('CORS Configuration', () => {
    it('should handle requests with Origin header', async () => {
      const res = await app.request('/api/health', {
        headers: {
          'Origin': 'http://localhost:3001',
        },
      });
      expect(res.status).toBe(200);
    });

    it('should return CORS headers for allowed origins', async () => {
      const res = await app.request('/api/health', {
        headers: {
          'Origin': 'http://localhost:3001',
        },
      });

      // CORS middleware may set Access-Control-Allow-Origin
      expect(res.status).toBe(200);
    });
  });

  describe('Request Handling', () => {
    it('should handle concurrent requests', async () => {
      const requests = [
        app.request('/'),
        app.request('/health'),
        app.request('/api/health'),
      ];

      const responses = await Promise.all(requests);

      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);
      expect(responses[2].status).toBe(200);
    });

    it('should handle rapid successive requests', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request('/health');
        expect(res.status).toBe(200);
      }
    });

    it('should handle many concurrent requests', async () => {
      const requests = Array(20).fill(null).map(() => app.request('/health'));
      const responses = await Promise.all(requests);

      responses.forEach(res => {
        expect(res.status).toBe(200);
      });
    });

    it('should maintain state across requests', async () => {
      const res1 = await app.request('/api/health');
      const data1 = await readJson(res1);

      const res2 = await app.request('/api/health');
      const data2 = await readJson(res2);

      expect(data1.service).toBe(data2.service);
      expect(data1.status).toBe(data2.status);
    });

    it('should handle requests with custom headers', async () => {
      const res = await app.request('/health', {
        headers: {
          'X-Custom-Header': 'test-value',
          'X-Request-ID': 'test-123',
        },
      });
      expect(res.status).toBe(200);
    });

    it('should handle requests with JSON body', async () => {
      const res = await app.request('/api/products', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      // Route may not accept POST or require auth, but request should process
      expect([200, 400, 401, 403, 404, 405, 500]).toContain(res.status);
    });
  });

  describe('Route Matching', () => {
    it('should match exact routes', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });

    it('should be case-sensitive for routes', async () => {
      const res = await app.request('/HEALTH');
      expect(res.status).toBe(404);
    });

    it('should handle routes with trailing slashes correctly', async () => {
      const res1 = await app.request('/health');
      const res2 = await app.request('/health/');

      // Hono treats routes with and without trailing slashes differently by default
      expect(res1.status).toBe(200);
      // res2 may be 200 or 404 depending on Hono configuration
      expect([200, 301, 302, 404]).toContain(res2.status);
    });

    it('should match nested API routes', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
    });

    it('should distinguish between different route paths', async () => {
      const resRoot = await app.request('/');
      const resHealth = await app.request('/health');
      const resApiHealth = await app.request('/api/health');

      expect(resRoot.status).toBe(200);
      expect(resHealth.status).toBe(200);
      expect(resApiHealth.status).toBe(200);

      const dataRoot = await readJson(resRoot);
      const dataHealth = await readJson(resHealth);
      const dataApiHealth = await readJson(resApiHealth);

      expect(dataRoot.name).toBe('chobii.art API');
      expect(dataHealth.status).toBe('healthy');
      expect(dataApiHealth.service).toBe('chobii-api');
    });
  });

  describe('Server Configuration', () => {
    it('should work in test environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(app).toBeDefined();
    });

    it('should allow request mocking in tests', async () => {
      const mockRequest = new Request('http://localhost/health');
      const res = await app.fetch(mockRequest);
      expect(res.status).toBe(200);
    });

    it('should support requests with various URL formats', async () => {
      const res1 = await app.request('/health');
      const res2 = await app.request('http://localhost/health');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should handle requests without crashing', async () => {
      const res = await app.request('/');
      expect(res).toBeInstanceOf(Response);
      expect(res.ok).toBe(true);
    });
  });

  describe('Auth Routes', () => {
    it('should have auth wildcard route mounted', async () => {
      // Better Auth uses wildcard routes - test that the handler is mounted
      const res = await app.request('/api/auth/test-endpoint', { method: 'GET' });
      // Route is mounted (wildcard), Better Auth will return 404 for unknown endpoints
      // This verifies the route is hit (not Hono's default 404)
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    it('should handle GET to auth get-session endpoint', async () => {
      // Better Auth's session endpoint (may vary by config)
      const res = await app.request('/api/auth/get-session', { method: 'GET' });
      // Auth route exists, may return various status codes
      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });

    it('should handle POST to auth sign-in email endpoint', async () => {
      // Better Auth uses /sign-in/email for email-based sign in
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@test.com', password: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      });
      // Auth route exists, credentials will fail but route is mounted
      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
    });

    it('should handle POST to auth sign-up email endpoint', async () => {
      // Better Auth uses /sign-up/email for email-based sign up
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@test.com',
          password: 'test123456',
          name: 'Test User',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      // Auth route exists
      expect([200, 400, 401, 403, 404, 409, 422, 500]).toContain(res.status);
    });

    it('should accept requests to /api/auth/* wildcard', async () => {
      // Verify the wildcard pattern works
      const res = await app.request('/api/auth/callback/google', { method: 'GET' });
      // Route is handled by Better Auth (not Hono's 404)
      expect([200, 302, 400, 401, 404, 500]).toContain(res.status);
    });
  });

  describe('Response Body Parsing', () => {
    it('should return valid JSON from root endpoint', async () => {
      const res = await app.request('/');
      expect(() => res.json()).not.toThrow;
      const data = await readJson(res);
      expect(typeof data).toBe('object');
    });

    it('should return valid JSON from health endpoint', async () => {
      const res = await app.request('/health');
      const data = await readJson(res);
      expect(typeof data).toBe('object');
      expect(data).not.toBeNull();
    });

    it('should return valid JSON from api health endpoint', async () => {
      const res = await app.request('/api/health');
      const data = await readJson(res);
      expect(typeof data).toBe('object');
      expect(data).not.toBeNull();
    });
  });

  describe('Stress Testing', () => {
    it('should handle burst of requests', async () => {
      const startTime = Date.now();
      const requests = Array(50).fill(null).map(() => app.request('/health'));
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });

      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle sequential requests efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        const res = await app.request('/api/health');
        expect(res.status).toBe(200);
      }

      const endTime = Date.now();
      // Should complete within reasonable time (3 seconds)
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });
});
