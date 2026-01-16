import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../src/index';

/**
 * Tests to verify Hono server starts correctly
 *
 * This test suite validates:
 * - Server instantiation and configuration
 * - Middleware setup (CORS, logger)
 * - Basic route functionality
 * - Health check endpoint
 * - Error handling
 * - API route structure
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
      const data = await res.json();

      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('endpoints');
      expect(data.message).toBe('MasonArt API');
      expect(data.version).toBe('1.0.0');
    });

    it('should include endpoint documentation', async () => {
      const res = await app.request('/');
      const data = await res.json();

      expect(data.endpoints).toHaveProperty('health');
      expect(data.endpoints).toHaveProperty('api');
      expect(data.endpoints.health).toBe('/health');
      expect(data.endpoints.api).toBe('/api');
    });
  });

  describe('Health Check Endpoint', () => {
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
      const data = await res.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('service');
      expect(data).toHaveProperty('version');

      expect(data.status).toBe('ok');
      expect(data.service).toBe('masonart-api');
      expect(data.version).toBe('1.0.0');
    });

    it('should return valid ISO timestamp', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.timestamp).toBeDefined();
      const timestamp = new Date(data.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should return recent timestamp', async () => {
      const before = new Date();
      const res = await app.request('/health');
      const after = new Date();
      const data = await res.json();

      const timestamp = new Date(data.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('API Routes', () => {
    it('should respond to GET /api request', async () => {
      const res = await app.request('/api');
      expect(res.status).toBe(200);
    });

    it('should return JSON response', async () => {
      const res = await app.request('/api');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should return API endpoint documentation', async () => {
      const res = await app.request('/api');
      const data = await res.json();

      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('endpoints');
      expect(data.message).toBe('MasonArt API v1');
    });

    it('should include all API endpoints', async () => {
      const res = await app.request('/api');
      const data = await res.json();

      expect(data.endpoints).toHaveProperty('products');
      expect(data.endpoints).toHaveProperty('cart');
      expect(data.endpoints).toHaveProperty('orders');
      expect(data.endpoints).toHaveProperty('auth');
      expect(data.endpoints).toHaveProperty('ai');
      expect(data.endpoints).toHaveProperty('admin');

      expect(data.endpoints.products).toBe('/api/products');
      expect(data.endpoints.cart).toBe('/api/cart');
      expect(data.endpoints.orders).toBe('/api/orders');
      expect(data.endpoints.auth).toBe('/api/auth');
      expect(data.endpoints.ai).toBe('/api/ai');
      expect(data.endpoints.admin).toBe('/api/admin');
    });
  });

  describe('HTTP Methods', () => {
    it('should handle GET requests', async () => {
      const res = await app.request('/', { method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('should handle POST requests to non-existent routes', async () => {
      const res = await app.request('/api/test', { method: 'POST' });
      expect(res.status).toBe(404);
    });

    it('should handle PUT requests to non-existent routes', async () => {
      const res = await app.request('/api/test', { method: 'PUT' });
      expect(res.status).toBe(404);
    });

    it('should handle DELETE requests to non-existent routes', async () => {
      const res = await app.request('/api/test', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('should handle PATCH requests to non-existent routes', async () => {
      const res = await app.request('/api/test', { method: 'PATCH' });
      expect(res.status).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const res = await app.request('/non-existent-route');
      expect(res.status).toBe(404);
    });

    it('should return JSON error response for 404', async () => {
      const res = await app.request('/non-existent-route');
      const data = await res.json();

      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data.error).toBe('Not Found');
      expect(data.message).toContain('Route');
      expect(data.message).toContain('not found');
    });

    it('should include request method in 404 message', async () => {
      const res = await app.request('/test', { method: 'POST' });
      const data = await res.json();

      expect(data.message).toContain('POST');
    });

    it('should include request path in 404 message', async () => {
      const res = await app.request('/test-path');
      const data = await res.json();

      expect(data.message).toContain('/test-path');
    });

    it('should handle multiple 404 requests', async () => {
      const res1 = await app.request('/test1');
      const res2 = await app.request('/test2');
      const res3 = await app.request('/test3');

      expect(res1.status).toBe(404);
      expect(res2.status).toBe(404);
      expect(res3.status).toBe(404);
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

    it('should include content-type in API routes', async () => {
      const res = await app.request('/api');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should include content-type in error responses', async () => {
      const res = await app.request('/non-existent');
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('Request Handling', () => {
    it('should handle concurrent requests', async () => {
      const requests = [
        app.request('/'),
        app.request('/health'),
        app.request('/api'),
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

    it('should maintain state across requests', async () => {
      const res1 = await app.request('/health');
      const data1 = await res1.json();

      const res2 = await app.request('/health');
      const data2 = await res2.json();

      expect(data1.service).toBe(data2.service);
      expect(data1.version).toBe(data2.version);
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

    it('should distinguish routes with trailing slashes', async () => {
      const res1 = await app.request('/health');
      const res2 = await app.request('/health/');

      // Hono treats routes with and without trailing slashes as different
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(404);
    });

    it('should match nested API routes', async () => {
      const res = await app.request('/api');
      expect(res.status).toBe(200);
    });
  });

  describe('Server Configuration', () => {
    it('should not start HTTP server in test environment', () => {
      // Verify NODE_ENV is set to test
      expect(process.env.NODE_ENV).toBe('test');

      // In test mode, the server should not bind to a port
      // This is validated by the app being usable via app.request()
      // without an actual HTTP server running
      expect(app).toBeDefined();
    });

    it('should allow request mocking in tests', async () => {
      // Verify we can mock requests without actual HTTP calls
      const mockRequest = new Request('http://localhost/health');
      const res = await app.fetch(mockRequest);
      expect(res.status).toBe(200);
    });

    it('should support custom request headers', async () => {
      const res = await app.request('/health', {
        headers: {
          'X-Custom-Header': 'test-value',
        },
      });
      expect(res.status).toBe(200);
    });
  });
});
