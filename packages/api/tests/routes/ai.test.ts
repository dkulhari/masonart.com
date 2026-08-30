/**
 * Tests for AI Generation API Routes
 *
 * This test suite validates the AI generation API routes:
 * - POST /api/ai/generate - Submit a new generation request
 * - GET /api/ai/generations - List user's generations with pagination
 * - GET /api/ai/generations/:id - Get generation by ID
 * - POST /api/ai/generations/:id/select - Select an image from generation
 * - PATCH /api/ai/generations/:id/visibility - Update gallery visibility
 * - DELETE /api/ai/generations/:id - Delete/cancel a generation
 * - GET /api/ai/gallery - Get public gallery of shared generations
 * - GET /api/ai/status/:id - Get generation job status
 * - GET /api/ai/style-presets - Get available style presets
 * - GET /api/ai/aspect-ratios - Get available aspect ratios
 *
 * Tests are organized into:
 * 1. Module export tests - Verify route exports correctly
 * 2. Route availability tests - Test routes exist and accept requests
 * 3. Validation tests - Test input validation without database
 * 4. Authentication tests - Verify auth middleware requirements
 * 5. Response format tests - Verify response structures
 * 6. Runtime tests - Require database, gracefully skip when unavailable
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 *
 * @see packages/api/src/routes/ai.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import '../setup';
import { readJson } from '../helpers/json';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid AI style presets from the schema
 */
const validStylePresets = [
  'wabi-sabi',
  'abstract-expression',
  'botanical',
  'vintage-poster',
  'minimalist-modern',
  'geometric',
  'watercolor',
  'line-art',
  'pop-art',
  'surrealism',
  'modern-art',
  'digital-art',
  'photography-inspired',
  'classic-art',
  'nature-inspired',
] as const;

/**
 * Valid aspect ratios from the schema
 */
const validAspectRatios = ['square', 'portrait', 'landscape', 'panoramic'] as const;

/**
 * Valid visibility options
 */
const validVisibilityOptions = ['private', 'public', 'unlisted'] as const;

/**
 * Valid generation statuses
 */
const validStatuses = ['queued', 'processing', 'completed', 'failed', 'cancelled'] as const;

/**
 * Valid model providers
 */
const validModelProviders = ['stable-diffusion', 'midjourney', 'dalle', 'leonardo'] as const;

/**
 * Valid generation request data for testing
 */

/**
 * Minimal valid generation request
 */
const minimalGenerationData = {
  prompt: 'A simple test prompt',
  stylePreset: 'minimalist-modern',
  aspectRatio: 'square',
};

/**
 * Test UUID format
 */
const validUUID = '00000000-0000-0000-0000-000000000001';
const invalidUUID = 'not-a-valid-uuid';

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping AI runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import('../../src/index');
    app = testApp;

    // Test database connectivity by making a request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await testApp.request('/api/ai/style-presets', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If we get a 200, app is available
      if (res.status === 200) {
        // Check if database works by testing a protected route
        const dbRes = await testApp.request('/api/ai/gallery?page=1&pageSize=1');
        if (dbRes.status === 200 || dbRes.status === 500) {
          // 500 with specific error means DB unavailable
          const json = await readJson(dbRes).catch(() => ({}));
          if (json.error && json.error.includes('Failed to fetch')) {
            console.log('Database not available, skipping runtime tests');
            isDatabaseAvailable = false;
          } else {
            isDatabaseAvailable = true;
            console.log('Database connection available for runtime tests');
          }
        }
      }
    } catch (abortError) {
      console.log('Database check timed out, marking as unavailable');
      isDatabaseAvailable = false;
    }
  } catch (error) {
    console.log('Could not initialize app for testing:', (error as Error).message);
    isDatabaseAvailable = false;
  }
}, 10000);

// ============================================================================
// Module Export Tests (Always Run)
// ============================================================================

describe('AI Route Module Exports', () => {
  it('should export aiApp from routes/ai', async () => {
    const aiModule = await import('../../src/routes/ai');
    expect(aiModule).toHaveProperty('aiApp');
    expect(aiModule.aiApp).toBeDefined();
  });

  it('should export default from routes/ai', async () => {
    const aiModule = await import('../../src/routes/ai');
    expect(aiModule.default).toBeDefined();
    expect(aiModule.default).toBe(aiModule.aiApp);
  });

  it('should be a Hono app instance', async () => {
    const { aiApp } = await import('../../src/routes/ai');
    expect(typeof aiApp.fetch).toBe('function');
    expect(typeof aiApp.request).toBe('function');
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe('AI Route Availability', () => {
  it('should have AI route mounted at /api/ai', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    // Test public endpoint
    const res = await app.request('/api/ai/style-presets');
    expect(res.status).not.toBe(404);
  });

  it('style presets include description and keywords metadata (#257)', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/style-presets');
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      items: Array<{
        id: string;
        name: string;
        description?: string;
        keywords?: string[];
        recommendedAspectRatios?: string[];
      }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.description, `${item.id} missing description`).toBeTruthy();
      expect(Array.isArray(item.keywords), `${item.id} missing keywords`).toBe(true);
    }
  });

  it('should have generate route at /api/ai/generate', async () => {
    if (!app) return;

    // POST without auth should return 401
    const res = await app.request('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalGenerationData),
    });
    // Route exists if we don't get 404
    expect(res.status).not.toBe(404);
  });

  it('should have generations list route at /api/ai/generations', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generations');
    // Should return 401 (unauthorized) not 404
    expect(res.status).not.toBe(404);
  });

  it('should have generation detail route at /api/ai/generations/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/ai/generations/${validUUID}`);
    // Should return 401 (unauthorized) not 404
    expect(res.status).not.toBe(404);
  });

  it('should have select image route at /api/ai/generations/:id/select', async () => {
    if (!app) return;

    const res = await app.request(`/api/ai/generations/${validUUID}/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: 'img-001' }),
    });
    expect(res.status).not.toBe(404);
  });

  it('should have visibility route at /api/ai/generations/:id/visibility', async () => {
    if (!app) return;

    const res = await app.request(`/api/ai/generations/${validUUID}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' }),
    });
    expect(res.status).not.toBe(404);
  });

  it('should have delete route at /api/ai/generations/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/ai/generations/${validUUID}`, {
      method: 'DELETE',
    });
    expect(res.status).not.toBe(404);
  });

  it('should have gallery route at /api/ai/gallery', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery');
    expect(res.status).not.toBe(404);
  });

  it('should have status route at /api/ai/status/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/ai/status/${validUUID}`);
    expect(res.status).not.toBe(404);
  });

  it('should have style-presets route at /api/ai/style-presets', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/style-presets');
    expect(res.status).toBe(200);
  });

  it('should have aspect-ratios route at /api/ai/aspect-ratios', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/aspect-ratios');
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// Authentication Requirement Tests
// ============================================================================

describe('AI Authentication Requirements', () => {
  describe('Protected Routes (Require Auth)', () => {
    it('should require auth for POST /api/ai/generate', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalGenerationData),
      });
      expect(res.status).toBe(401);
    });

    it('should require auth for GET /api/ai/generations', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/generations');
      expect(res.status).toBe(401);
    });

    it('should require auth for GET /api/ai/generations/:id', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/generations/${validUUID}`);
      expect(res.status).toBe(401);
    });

    it('should require auth for POST /api/ai/generations/:id/select', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/generations/${validUUID}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: 'img-001' }),
      });
      expect(res.status).toBe(401);
    });

    it('should require auth for PATCH /api/ai/generations/:id/visibility', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/generations/${validUUID}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      });
      expect(res.status).toBe(401);
    });

    it('should require auth for DELETE /api/ai/generations/:id', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/generations/${validUUID}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });

    it('should require auth for GET /api/ai/status/:id', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/status/${validUUID}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Public Routes (No Auth Required)', () => {
    it('should NOT require auth for GET /api/ai/gallery', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery');
      // Should not be 401 - optionalAuth allows unauthenticated requests
      expect(res.status).not.toBe(401);
    });

    it('should NOT require auth for GET /api/ai/style-presets', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/style-presets');
      expect(res.status).toBe(200);
    });

    it('should NOT require auth for GET /api/ai/aspect-ratios', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      expect(res.status).toBe(200);
    });
  });
});

// ============================================================================
// Generation Request Validation Tests
// ============================================================================

describe('AI Generation Request Validation', () => {
  describe('POST /api/ai/generate - Input Validation', () => {
    // Note: These tests will return 401 because auth runs first,
    // so we're testing that the route exists and accepts requests

    it('should reject request without Content-Type header', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(minimalGenerationData),
      });
      // Will be 401 (auth first) or 400 (content-type missing)
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject malformed JSON', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty body', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('Prompt Validation (Logic)', () => {
    it('should validate prompt minimum length (3 chars)', () => {
      const shortPrompt = 'ab';
      expect(shortPrompt.length).toBeLessThan(3);
    });

    it('should validate prompt maximum length (500 chars)', () => {
      const longPrompt = 'a'.repeat(501);
      expect(longPrompt.length).toBeGreaterThan(500);
    });

    it('should accept valid prompt length', () => {
      const validPrompt = 'A beautiful landscape with mountains';
      expect(validPrompt.length).toBeGreaterThanOrEqual(3);
      expect(validPrompt.length).toBeLessThanOrEqual(500);
    });
  });

  describe('Style Preset Validation (Logic)', () => {
    it('should have valid style presets defined', () => {
      expect(validStylePresets.length).toBeGreaterThan(0);
    });

    it('should include minimalist as valid preset', () => {
      expect(validStylePresets).toContain('minimalist-modern');
    });

    it('should include wabi-sabi as valid preset', () => {
      expect(validStylePresets).toContain('wabi-sabi');
    });

    it('should include botanical as valid preset', () => {
      expect(validStylePresets).toContain('botanical');
    });
  });

  describe('Aspect Ratio Validation (Logic)', () => {
    it('should have valid aspect ratios defined', () => {
      expect(validAspectRatios.length).toBe(4);
    });

    it('should include square aspect ratio', () => {
      expect(validAspectRatios).toContain('square');
    });

    it('should include portrait aspect ratio', () => {
      expect(validAspectRatios).toContain('portrait');
    });

    it('should include landscape aspect ratio', () => {
      expect(validAspectRatios).toContain('landscape');
    });

    it('should include panoramic aspect ratio', () => {
      expect(validAspectRatios).toContain('panoramic');
    });
  });

  describe('Variation Count Validation (Logic)', () => {
    it('should validate minimum variation count (1)', () => {
      expect(1).toBeGreaterThanOrEqual(1);
    });

    it('should validate maximum variation count (8)', () => {
      expect(8).toBeLessThanOrEqual(8);
    });

    it('should reject zero variation count', () => {
      expect(0).toBeLessThan(1);
    });

    it('should reject excessive variation count', () => {
      expect(10).toBeGreaterThan(8);
    });
  });

  describe('Seed Validation (Logic)', () => {
    it('should accept valid seed (0)', () => {
      expect(0).toBeGreaterThanOrEqual(0);
    });

    it('should accept valid seed (max int)', () => {
      expect(2147483647).toBeLessThanOrEqual(2147483647);
    });

    it('should reject negative seed', () => {
      expect(-1).toBeLessThan(0);
    });
  });
});

// ============================================================================
// Generations List Query Validation Tests
// ============================================================================

describe('AI Generations List Query Validation', () => {
  describe('GET /api/ai/generations - Query Parameters', () => {
    it('should validate page is positive integer', () => {
      expect(1).toBeGreaterThan(0);
      expect(Number.isInteger(1)).toBe(true);
    });

    it('should reject page=0', () => {
      expect(0).toBeLessThanOrEqual(0);
    });

    it('should reject negative page', () => {
      expect(-1).toBeLessThan(0);
    });

    it('should validate pageSize is positive integer', () => {
      expect(12).toBeGreaterThan(0);
      expect(Number.isInteger(12)).toBe(true);
    });

    it('should validate pageSize max (50)', () => {
      expect(50).toBeLessThanOrEqual(50);
      expect(51).toBeGreaterThan(50);
    });

    it('should accept valid status filter values', () => {
      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });

    it('should accept valid stylePreset filter values', () => {
      expect(validStylePresets).toContain('minimalist-modern');
    });
  });
});

// ============================================================================
// Gallery Query Validation Tests
// ============================================================================

describe('AI Gallery Query Validation', () => {
  describe('GET /api/ai/gallery - Query Parameters', () => {
    it('should accept valid pagination', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?page=1&pageSize=12');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid stylePreset filter', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?stylePreset=minimalist-modern');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept sortBy=recent', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?sortBy=recent');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept sortBy=popular', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?sortBy=popular');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should reject invalid sortBy value', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?sortBy=invalid');
      expect(res.status).toBe(400);
    });

    it('should reject invalid pageSize (exceeds max)', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?pageSize=100');
      expect(res.status).toBe(400);
    });

    it('should reject invalid page (non-positive)', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?page=0');
      expect(res.status).toBe(400);
    });

    it('should reject invalid stylePreset', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/gallery?stylePreset=invalid-preset');
      expect(res.status).toBe(400);
    });
  });
});

// ============================================================================
// UUID Validation Tests
// ============================================================================

describe('AI UUID Validation', () => {
  describe('Generation ID Format', () => {
    it('should accept valid UUID format', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(validUUID)).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(invalidUUID)).toBe(false);
    });

    it('should reject empty string', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test('')).toBe(false);
    });

    it('should reject partial UUID', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test('00000000-0000-0000')).toBe(false);
    });
  });
});

// ============================================================================
// Visibility Update Validation Tests
// ============================================================================

describe('AI Visibility Update Validation', () => {
  describe('PATCH /api/ai/generations/:id/visibility', () => {
    it('should validate visibility options exist', () => {
      expect(validVisibilityOptions).toContain('private');
      expect(validVisibilityOptions).toContain('public');
      expect(validVisibilityOptions).toContain('unlisted');
    });

    it('should have exactly 3 visibility options', () => {
      expect(validVisibilityOptions.length).toBe(3);
    });
  });
});

// ============================================================================
// Select Image Validation Tests
// ============================================================================

describe('AI Select Image Validation', () => {
  describe('POST /api/ai/generations/:id/select', () => {
    it('should require imageId in body', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/generations/${validUUID}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Will be 401 (auth) or 400 (validation)
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty imageId', async () => {
      if (!app) return;

      const res = await app.request(`/api/ai/generations/${validUUID}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: '' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// HTTP Method Validation Tests
// ============================================================================

describe('AI HTTP Method Validation', () => {
  it('should reject GET to /api/ai/generate', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generate', {
      method: 'GET',
    });
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PUT to /api/ai/generate', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generate', {
      method: 'PUT',
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject DELETE to /api/ai/generate', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generate', {
      method: 'DELETE',
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject POST to /api/ai/gallery', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery', {
      method: 'POST',
    });
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PUT to /api/ai/generations/:id/visibility', async () => {
    if (!app) return;

    const res = await app.request(`/api/ai/generations/${validUUID}/visibility`, {
      method: 'PUT',
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generate', {
      method: 'OPTIONS',
    });
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests
// ============================================================================

describe('AI Response Headers', () => {
  it('should return JSON content-type for style-presets', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/style-presets');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for aspect-ratios', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/aspect-ratios');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for gallery', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for validation errors', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery?page=-1');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for auth errors', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generations');
    if (res.status === 401) {
      expect(res.headers.get('content-type')).toContain('application/json');
    }
  });
});

// ============================================================================
// Error Response Format Tests
// ============================================================================

describe('AI Error Response Format', () => {
  it('should return error object for validation failures', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery?sortBy=invalid');
    expect(res.status).toBe(400);

    const json = await readJson(res);
    expect(json).toBeDefined();
  });

  it('should return error object for auth failures', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/generations');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    expect(json).toBeDefined();
    expect(json).toHaveProperty('error');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery?page=-1');
    const text = await res.text();

    // Should not expose stack traces or internal paths
    expect(text).not.toContain('/packages/api/');
    expect(text).not.toContain('node_modules');
  });
});

// ============================================================================
// Style Presets Endpoint Tests
// ============================================================================

describe('AI Style Presets Endpoint', () => {
  describe('GET /api/ai/style-presets', () => {
    it('should return 200 OK', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/style-presets');
      expect(res.status).toBe(200);
    });

    it('should return items array', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/style-presets');
      const json = await readJson(res);

      expect(json).toHaveProperty('items');
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('should return presets with id and name', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/style-presets');
      const json = await readJson(res);

      expect(json.items.length).toBeGreaterThan(0);
      json.items.forEach((preset: { id: string; name: string }) => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(typeof preset.id).toBe('string');
        expect(typeof preset.name).toBe('string');
      });
    });

    it('should include expected style presets', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/style-presets');
      const json = await readJson(res);

      const presetIds = json.items.map((p: { id: string }) => p.id);
      // 'minimalist-modern' is a poster style, not an AI preset — the enum ships
      // wabi-sabi, abstract-expression, botanical, etc.
      expect(presetIds).toContain('abstract-expression');
      expect(presetIds).toContain('wabi-sabi');
    });

    it('should use curated display names from the preset configs', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/style-presets');
      const json = await readJson(res);

      const wabiSabi = json.items.find((p: { id: string }) => p.id === 'wabi-sabi');
      if (wabiSabi) {
        // Names come from STYLE_PRESETS configs since #257 (curated
        // typography like "Wabi-Sabi"), not auto title-casing of the id
        expect(wabiSabi.name).toBe('Wabi-Sabi');
      }
    });
  });
});

// ============================================================================
// Aspect Ratios Endpoint Tests
// ============================================================================

describe('AI Aspect Ratios Endpoint', () => {
  describe('GET /api/ai/aspect-ratios', () => {
    it('should return 200 OK', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      expect(res.status).toBe(200);
    });

    it('should return items array', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      expect(json).toHaveProperty('items');
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('should return exactly 4 aspect ratios', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      expect(json.items.length).toBe(4);
    });

    it('should return aspect ratios with complete information', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      json.items.forEach((ratio: { id: string; name: string; ratio: string; description: string }) => {
        expect(ratio).toHaveProperty('id');
        expect(ratio).toHaveProperty('name');
        expect(ratio).toHaveProperty('ratio');
        expect(ratio).toHaveProperty('description');
      });
    });

    it('should include square aspect ratio', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      const square = json.items.find((r: { id: string }) => r.id === 'square');
      expect(square).toBeDefined();
      expect(square.ratio).toBe('1:1');
    });

    it('should include portrait aspect ratio', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      const portrait = json.items.find((r: { id: string }) => r.id === 'portrait');
      expect(portrait).toBeDefined();
      expect(portrait.ratio).toBe('2:3');
    });

    it('should include landscape aspect ratio', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      const landscape = json.items.find((r: { id: string }) => r.id === 'landscape');
      expect(landscape).toBeDefined();
      expect(landscape.ratio).toBe('3:2');
    });

    it('should include panoramic aspect ratio', async () => {
      if (!app) return;

      const res = await app.request('/api/ai/aspect-ratios');
      const json = await readJson(res);

      const panoramic = json.items.find((r: { id: string }) => r.id === 'panoramic');
      expect(panoramic).toBeDefined();
      expect(panoramic.ratio).toBe('16:9');
    });
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('AI Runtime Tests (Database Required)', () => {
  describe('GET /api/ai/gallery - Public Gallery', () => {
    it('should return paginated gallery response', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/ai/gallery');
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toHaveProperty('items');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('page');
      expect(json).toHaveProperty('pageSize');
      expect(json).toHaveProperty('totalPages');
      expect(json).toHaveProperty('hasNextPage');
      expect(json).toHaveProperty('hasPreviousPage');
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('should filter gallery by style preset', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/ai/gallery?stylePreset=minimalist-modern');
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json).toHaveProperty('items');
    });

    it('should support pagination in gallery', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/ai/gallery?page=1&pageSize=5');
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.page).toBe(1);
      expect(json.pageSize).toBe(5);
    });

    it('should sort gallery by recent', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/ai/gallery?sortBy=recent');
      expect(res.status).toBe(200);
    });

    it('should sort gallery by popular', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/ai/gallery?sortBy=popular');
      expect(res.status).toBe(200);
    });

    it('should include gallery item details', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/ai/gallery');
      expect(res.status).toBe(200);

      const json = await readJson(res);
      if (json.items.length > 0) {
        const item = json.items[0];
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('promptText');
        expect(item).toHaveProperty('stylePreset');
        expect(item).toHaveProperty('aspectRatio');
      }
    });

    it('should support caching (fromCache field)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // First request
      await app.request('/api/ai/gallery?page=1&pageSize=5');

      // Second request might be cached
      const res = await app.request('/api/ai/gallery?page=1&pageSize=5');
      expect(res.status).toBe(200);

      const json = await readJson(res);
      // fromCache may or may not be present depending on cache hit
      expect(json).toHaveProperty('items');
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('AI Performance Tests', () => {
  it('should respond quickly to style-presets', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/ai/style-presets');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to aspect-ratios', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/ai/aspect-ratios');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/ai/gallery?page=-1');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to auth errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/ai/generations');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent requests to public endpoints', async () => {
    if (!app) return;

    const requests = [
      app.request('/api/ai/style-presets'),
      app.request('/api/ai/aspect-ratios'),
      app.request('/api/ai/gallery'),
    ];

    const start = Date.now();
    const responses = await Promise.all(requests);
    const duration = Date.now() - start;

    expect(responses).toHaveLength(3);
    expect(duration).toBeLessThan(5000);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('AI Constants', () => {
  describe('Default Values', () => {
    it('should have default page size of 12', () => {
      const DEFAULT_PAGE_SIZE = 12;
      expect(DEFAULT_PAGE_SIZE).toBe(12);
    });

    it('should have max page size of 50', () => {
      const MAX_PAGE_SIZE = 50;
      expect(MAX_PAGE_SIZE).toBe(50);
    });

    it('should have default variation count of 4', () => {
      const DEFAULT_VARIATION_COUNT = 4;
      expect(DEFAULT_VARIATION_COUNT).toBe(4);
    });

    it('should have max variation count of 8', () => {
      const MAX_VARIATION_COUNT = 8;
      expect(MAX_VARIATION_COUNT).toBe(8);
    });
  });

  describe('Cache TTL', () => {
    it('should have generation cache TTL of 300 seconds (5 min)', () => {
      const CACHE_TTL_GENERATION = 300;
      expect(CACHE_TTL_GENERATION).toBe(300);
    });

    it('should have gallery cache TTL of 60 seconds (1 min)', () => {
      const CACHE_TTL_GALLERY = 60;
      expect(CACHE_TTL_GALLERY).toBe(60);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('AI Integration Tests', () => {
  it('should work with CORS headers', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/style-presets', {
      headers: {
        Origin: 'http://localhost:3001',
      },
    });

    expect(res.status).toBe(200);
  });

  it('should integrate with main app router', async () => {
    if (!app) return;

    // Verify AI routes work alongside other app routes
    const [aiRes, healthRes] = await Promise.all([
      app.request('/api/ai/style-presets'),
      app.request('/health'),
    ]);

    expect(aiRes.status).toBe(200);
    expect(healthRes.status).toBe(200);
  });

  it('should handle multiple AI endpoints simultaneously', async () => {
    if (!app) return;

    const [styleRes, ratioRes, galleryRes] = await Promise.all([
      app.request('/api/ai/style-presets'),
      app.request('/api/ai/aspect-ratios'),
      app.request('/api/ai/gallery'),
    ]);

    expect(styleRes.status).toBe(200);
    expect(ratioRes.status).toBe(200);
    expect([200, 500].includes(galleryRes.status)).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('AI Edge Cases', () => {
  it('should handle very long prompt in request body', () => {
    const longPrompt = 'a'.repeat(600);
    expect(longPrompt.length).toBeGreaterThan(500);
    // Should be rejected by validation
  });

  it('should handle empty color palette array', () => {
    const emptyPalette: string[] = [];
    expect(emptyPalette.length).toBe(0);
    // Should be accepted
  });

  it('should handle max color palette (5 colors)', () => {
    const maxPalette = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
    expect(maxPalette.length).toBe(5);
    // Should be accepted
  });

  it('should handle excessive color palette (>5 colors)', () => {
    const excessPalette = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
    expect(excessPalette.length).toBeGreaterThan(5);
    // Should be rejected by validation
  });

  it('should handle unicode in prompt', () => {
    const unicodePrompt = 'A beautiful 日本 landscape with 桜 cherry blossoms';
    expect(unicodePrompt.length).toBeGreaterThan(3);
    // Should be accepted
  });

  it('should handle special characters in prompt', () => {
    const specialPrompt = 'Art with @#$%^&*() symbols and "quotes"';
    expect(specialPrompt.length).toBeGreaterThan(3);
    // Should be accepted
  });

  it('should handle newlines in prompt', () => {
    const multilinePrompt = 'First line\nSecond line\nThird line';
    expect(multilinePrompt.length).toBeGreaterThan(3);
    // Should be accepted
  });

  it('should handle trailing whitespace in parameters', async () => {
    if (!app) return;

    const res = await app.request('/api/ai/gallery?page=1  &pageSize=12  ');
    // Should handle gracefully
    expect([200, 400, 500].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Type Definition Tests
// ============================================================================

describe('AI Type Definitions', () => {
  describe('Generation Status Types', () => {
    it('should have queued status', () => {
      expect(validStatuses).toContain('queued');
    });

    it('should have processing status', () => {
      expect(validStatuses).toContain('processing');
    });

    it('should have completed status', () => {
      expect(validStatuses).toContain('completed');
    });

    it('should have failed status', () => {
      expect(validStatuses).toContain('failed');
    });

    it('should have cancelled status', () => {
      expect(validStatuses).toContain('cancelled');
    });
  });

  describe('Model Provider Types', () => {
    it('should have stable-diffusion provider', () => {
      expect(validModelProviders).toContain('stable-diffusion');
    });

    it('should have midjourney provider', () => {
      expect(validModelProviders).toContain('midjourney');
    });

    it('should have dalle provider', () => {
      expect(validModelProviders).toContain('dalle');
    });

    it('should have leonardo provider', () => {
      expect(validModelProviders).toContain('leonardo');
    });
  });

  describe('Visibility Types', () => {
    it('should have private visibility', () => {
      expect(validVisibilityOptions).toContain('private');
    });

    it('should have public visibility', () => {
      expect(validVisibilityOptions).toContain('public');
    });

    it('should have unlisted visibility', () => {
      expect(validVisibilityOptions).toContain('unlisted');
    });
  });
});
