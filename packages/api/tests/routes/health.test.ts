import { describe, it, expect } from 'vitest';
import app from '../../src/index';

/**
 * Tests for health check endpoint
 *
 * This test suite validates the health check endpoint which is used for
 * service monitoring, load balancer health checks, and deployment verification.
 *
 * Endpoints tested:
 * - GET /health - Health check with service status
 *
 * @see packages/api/src/index.ts
 */

describe('Health Check Endpoint', () => {
  describe('GET /health', () => {
    it('should return 200 status code', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });

    it('should return JSON content type', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should return correct response structure', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('service');
      expect(data).toHaveProperty('version');
    });

    it('should return status as "ok"', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.status).toBe('ok');
    });

    it('should return service name', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.service).toBe('masonart-api');
    });

    it('should return version number', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.version).toBe('1.0.0');
      expect(typeof data.version).toBe('string');
    });

    it('should return valid ISO 8601 timestamp', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.timestamp).toBeDefined();
      expect(typeof data.timestamp).toBe('string');

      // Validate ISO 8601 format
      const timestamp = new Date(data.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(data.timestamp);
    });

    it('should return current timestamp (within 1 second)', async () => {
      const beforeTime = Date.now();
      const res = await app.request('/health');
      const afterTime = Date.now();
      const data = await res.json();

      const responseTime = new Date(data.timestamp).getTime();
      expect(responseTime).toBeGreaterThanOrEqual(beforeTime - 1000);
      expect(responseTime).toBeLessThanOrEqual(afterTime + 1000);
    });

    it('should not require authentication', async () => {
      // Health check should be accessible without auth headers
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        app.request('/health')
      );

      const responses = await Promise.all(requests);

      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });

    it('should complete request quickly (under 100ms)', async () => {
      const startTime = Date.now();
      await app.request('/health');
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100);
    });

    it('should not accept POST method', async () => {
      const res = await app.request('/health', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });

    it('should not accept PUT method', async () => {
      const res = await app.request('/health', {
        method: 'PUT',
      });

      expect(res.status).toBe(404);
    });

    it('should not accept DELETE method', async () => {
      const res = await app.request('/health', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });

    it('should not accept PATCH method', async () => {
      const res = await app.request('/health', {
        method: 'PATCH',
      });

      expect(res.status).toBe(404);
    });

    it('should return consistent response format across multiple calls', async () => {
      const res1 = await app.request('/health');
      const data1 = await res1.json();

      const res2 = await app.request('/health');
      const data2 = await res2.json();

      // Should have same structure
      expect(Object.keys(data1).sort()).toEqual(Object.keys(data2).sort());

      // Should have same static values
      expect(data1.status).toBe(data2.status);
      expect(data1.service).toBe(data2.service);
      expect(data1.version).toBe(data2.version);
    });

    it('should have all required fields and no extra fields', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      const expectedFields = ['status', 'timestamp', 'service', 'version'];
      const actualFields = Object.keys(data).sort();

      expect(actualFields).toEqual(expectedFields.sort());
    });

    it('should return valid JSON that can be parsed', async () => {
      const res = await app.request('/health');
      const text = await res.text();

      expect(() => JSON.parse(text)).not.toThrow();
    });
  });

  describe('Health Check Integration', () => {
    it('should be suitable for load balancer health checks', async () => {
      const res = await app.request('/health');

      // Fast response
      expect(res.status).toBe(200);

      // No authentication required
      expect(res.status).toBe(200);

      // Returns consistent format
      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('should be suitable for monitoring systems', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      // Returns timestamp for tracking
      expect(data.timestamp).toBeDefined();

      // Returns service identifier
      expect(data.service).toBeDefined();

      // Returns version for tracking deployments
      expect(data.version).toBeDefined();
    });

    it('should be suitable for deployment verification', async () => {
      const res = await app.request('/health');

      // Service is responding
      expect(res.status).toBe(200);

      const data = await res.json();

      // Service identifies itself correctly
      expect(data.service).toBe('masonart-api');

      // Version is available
      expect(data.version).toBeDefined();

      // Status is healthy
      expect(data.status).toBe('ok');
    });

    it('should be accessible via direct path', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });

    it('should not be nested under /api prefix', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(404);
    });
  });

  describe('Response Validation', () => {
    it('should have status as string type', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(typeof data.status).toBe('string');
    });

    it('should have timestamp as string type', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(typeof data.timestamp).toBe('string');
    });

    it('should have service as string type', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(typeof data.service).toBe('string');
    });

    it('should have version as string type', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(typeof data.version).toBe('string');
    });

    it('should not return null or undefined values', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.status).not.toBeNull();
      expect(data.status).not.toBeUndefined();
      expect(data.timestamp).not.toBeNull();
      expect(data.timestamp).not.toBeUndefined();
      expect(data.service).not.toBeNull();
      expect(data.service).not.toBeUndefined();
      expect(data.version).not.toBeNull();
      expect(data.version).not.toBeUndefined();
    });

    it('should not return empty strings', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      expect(data.status).not.toBe('');
      expect(data.timestamp).not.toBe('');
      expect(data.service).not.toBe('');
      expect(data.version).not.toBe('');
    });

    it('should return valid semantic version format', async () => {
      const res = await app.request('/health');
      const data = await res.json();

      // Version should match semantic versioning pattern (X.Y.Z)
      const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
      expect(data.version).toMatch(semverPattern);
    });
  });

  describe('Performance', () => {
    it('should handle rapid successive requests', async () => {
      const count = 50;
      const requests = [];

      for (let i = 0; i < count; i++) {
        requests.push(app.request('/health'));
      }

      const responses = await Promise.all(requests);

      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });

    it('should maintain performance under load', async () => {
      const iterations = 5;
      const requestsPerIteration = 20;
      const maxAverageTime = 50; // 50ms average

      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const requests = Array.from({ length: requestsPerIteration }, () =>
          app.request('/health')
        );
        await Promise.all(requests);
        const endTime = Date.now();

        const avgTime = (endTime - startTime) / requestsPerIteration;
        times.push(avgTime);
      }

      const overallAverage = times.reduce((a, b) => a + b, 0) / times.length;
      expect(overallAverage).toBeLessThan(maxAverageTime);
    });
  });

  describe('Error Handling', () => {
    it('should handle requests with query parameters', async () => {
      const res = await app.request('/health?foo=bar');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('should handle requests with trailing slash', async () => {
      const res = await app.request('/health/');
      // Either 200 (if redirected/handled) or 404 (strict routing)
      expect([200, 404]).toContain(res.status);
    });

    it('should handle requests with uppercase path', async () => {
      const res = await app.request('/HEALTH');
      // URLs are case-sensitive, so this should return 404
      expect(res.status).toBe(404);
    });

    it('should handle requests with custom headers', async () => {
      const res = await app.request('/health', {
        headers: {
          'X-Custom-Header': 'test-value',
          'User-Agent': 'TestBot/1.0',
        },
      });

      expect(res.status).toBe(200);
    });

    it('should handle requests with accept header', async () => {
      const res = await app.request('/health', {
        headers: {
          Accept: 'application/json',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('Documentation', () => {
    it('should be discoverable from root endpoint', async () => {
      const res = await app.request('/');
      const data = await res.json();

      expect(data.endpoints).toBeDefined();
      expect(data.endpoints.health).toBe('/health');
    });
  });
});
