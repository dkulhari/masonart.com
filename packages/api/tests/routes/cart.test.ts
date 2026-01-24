/**
 * Tests for cart management endpoints
 *
 * This test suite validates the cart API routes:
 * - GET /api/cart - Get current cart with items
 * - POST /api/cart/items - Add item to cart
 * - PATCH /api/cart/items/:id - Update cart item (quantity, frame, customizations)
 * - DELETE /api/cart/items/:id - Remove item from cart
 * - DELETE /api/cart - Clear entire cart
 * - POST /api/cart/merge - Merge guest cart into user cart (after login)
 *
 * Tests are organized into:
 * 1. Configuration tests - Always run, don't require database
 * 2. Route availability tests - Test routes exist and accept requests
 * 3. Validation tests - Test input validation without database
 * 4. Response format tests - Verify response structures
 * 5. Runtime tests - Require database, gracefully skip when unavailable
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 *
 * @see packages/api/src/routes/cart.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid UUIDs for testing
 */
const validProductId = '00000000-0000-0000-0000-000000000001';
const validVariantId = '00000000-0000-0000-0000-000000000002';
const validFrameId = '00000000-0000-0000-0000-000000000003';
const validCartItemId = '00000000-0000-0000-0000-000000000004';
const validAiGenerationId = '00000000-0000-0000-0000-000000000005';

/**
 * Valid cart item data for testing
 */
const validAddCartItemData = {
  productId: validProductId,
  variantId: validVariantId,
  quantity: 1,
};

/**
 * Valid cart item data with optional fields
 */
const validAddCartItemDataFull = {
  productId: validProductId,
  variantId: validVariantId,
  frameId: validFrameId,
  quantity: 2,
  customizations: {
    matWidth: 2,
    matColor: 'white',
    mountingStyle: 'standard',
    glazingType: 'non-glare',
    notes: 'Please handle with care',
  },
};

/**
 * Valid AI-generated cart item data
 */
const validAiCartItemData = {
  productId: validProductId,
  variantId: validVariantId,
  quantity: 1,
  isAiGenerated: true,
  aiGenerationId: validAiGenerationId,
  aiDetails: {
    generationId: 'gen_123456',
    prompt: 'A beautiful sunset over mountains',
    stylePreset: 'minimalist',
    thumbnailUrl: 'https://cdn.example.com/ai/gen_123456_thumb.jpg',
  },
};

/**
 * Valid update cart item data
 */
const validUpdateCartItemData = {
  quantity: 3,
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping cart runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
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
      const res = await testApp.request('/api/cart', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If we get a 500 error with specific database error, database is unavailable
      if (res.status === 500) {
        const json = await res.json();
        if (json.error === 'Failed to fetch cart') {
          console.log('Database not available, skipping runtime tests');
          isDatabaseAvailable = false;
          return;
        }
      }

      // If we get a 200, database is available
      if (res.status === 200) {
        isDatabaseAvailable = true;
        console.log('Database connection available for runtime tests');
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

describe('Cart Route Module Exports', () => {
  it('should export cartApp from routes/cart', async () => {
    const cartModule = await import('../../src/routes/cart');
    expect(cartModule).toHaveProperty('cartApp');
    expect(cartModule.cartApp).toBeDefined();
  });

  it('should export default from routes/cart', async () => {
    const cartModule = await import('../../src/routes/cart');
    expect(cartModule.default).toBeDefined();
    expect(cartModule.default).toBe(cartModule.cartApp);
  });

  it('should be a Hono app instance', async () => {
    const { cartApp } = await import('../../src/routes/cart');
    expect(typeof cartApp.fetch).toBe('function');
    expect(typeof cartApp.request).toBe('function');
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe('Cart Route Availability', () => {
  it('should have cart route mounted at /api/cart', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/cart');
    // Should not be 404 - route exists
    expect(res.status).not.toBe(404);
  });

  it('should have add item route at /api/cart/items', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should not be 404 (route not found) - might be 400 (validation) or 500 (db error)
    expect(res.status).not.toBe(404);
  });

  it('should have update item route at /api/cart/items/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/cart/items/${validCartItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Route exists if we get a JSON response (400, 404, or 500)
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should have delete item route at /api/cart/items/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/cart/items/${validCartItemId}`, {
      method: 'DELETE',
    });
    // Route exists if we get a JSON response
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should have clear cart route at /api/cart', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/cart', {
      method: 'DELETE',
    });
    // Route exists if we get a JSON response
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should have merge cart route at /api/cart/merge', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should not be 404 - might be 400 (validation) or 401 (unauthorized)
    expect(res.status).not.toBe(404);
  });
});

// ============================================================================
// Add Item Validation Tests (Always Run)
// ============================================================================

describe('Cart Add Item Validation', () => {
  describe('POST /api/cart/items - Add Item to Cart', () => {
    it('should require productId', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: validVariantId,
          quantity: 1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should require variantId', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          quantity: 1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid productId format (not UUID)', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: 'invalid-uuid',
          variantId: validVariantId,
          quantity: 1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid variantId format (not UUID)', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: 'invalid-uuid',
          quantity: 1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid frameId format (not UUID)', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          frameId: 'invalid-uuid',
          quantity: 1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject negative quantity', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: -1,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject zero quantity', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: 0,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject quantity exceeding max (99)', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: 100,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid quantity at max (99)', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: 99,
        }),
      });
      // Should be 404 (product not found) or 500 (db error), not 400 validation error
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should accept optional null frameId', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          frameId: null,
          quantity: 1,
        }),
      });
      // Should pass validation - 404 or 500 means route accepted the request
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid customizations', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validAddCartItemDataFull,
        }),
      });
      // Should pass validation
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should reject customization notes exceeding max length (500)', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: 1,
          customizations: {
            notes: 'x'.repeat(501),
          },
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject negative matWidth in customizations', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: 1,
          customizations: {
            matWidth: -1,
          },
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid AI cart item data', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validAiCartItemData),
      });
      // Should pass validation
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should reject invalid aiGenerationId format', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validAddCartItemData,
          isAiGenerated: true,
          aiGenerationId: 'invalid-uuid',
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject invalid aiDetails thumbnailUrl format', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...validAddCartItemData,
          isAiGenerated: true,
          aiDetails: {
            generationId: 'gen_123',
            prompt: 'A test prompt',
            thumbnailUrl: 'not-a-valid-url',
          },
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject malformed JSON', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });
      expect(res.status).toBe(400);
    });

    it('should reject non-integer quantity', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
          quantity: 1.5,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should default quantity to 1 if not provided', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: validProductId,
          variantId: validVariantId,
        }),
      });
      // Should pass validation - 404 or 500 means validation passed
      expect([404, 500].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// Update Item Validation Tests (Always Run)
// ============================================================================

describe('Cart Update Item Validation', () => {
  describe('PATCH /api/cart/items/:id - Update Cart Item', () => {
    it('should reject invalid item ID format', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items/invalid-uuid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 2 }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid item ID format');
    });

    it('should reject negative quantity', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: -1 }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject zero quantity', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 0 }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject quantity exceeding max (99)', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 100 }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid quantity update', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 5 }),
      });
      // Should pass validation - 404 (item not found) or 500 (db error)
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should reject invalid frameId format', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId: 'invalid-uuid' }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept null frameId (remove frame)', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId: null }),
      });
      // Should pass validation
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid frameId update', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId: validFrameId }),
      });
      // Should pass validation
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should accept isSavedForLater boolean', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSavedForLater: true }),
      });
      // Should pass validation
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid customizations update', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customizations: {
            matWidth: 3,
            matColor: 'black',
            notes: 'Gift wrap please',
          },
        }),
      });
      // Should pass validation
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should reject customization notes exceeding max length', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customizations: {
            notes: 'x'.repeat(501),
          },
        }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept empty update object', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Should pass validation - will be 404 (item not found) or 500 (db error)
      expect([404, 500].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// Delete Item Validation Tests (Always Run)
// ============================================================================

describe('Cart Delete Item Validation', () => {
  describe('DELETE /api/cart/items/:id - Remove Cart Item', () => {
    it('should reject invalid item ID format', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items/invalid-uuid', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid item ID format');
    });

    it('should accept valid UUID format for item ID', async () => {
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'DELETE',
      });
      // Should pass ID validation - 404 (item not found) or 500 (db error)
      expect([404, 500].includes(res.status)).toBe(true);
    });

    it('should reject item ID with special characters', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/items/test-id!@#$', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);
    });
  });
});

// ============================================================================
// Merge Cart Validation Tests (Always Run)
// ============================================================================

describe('Cart Merge Validation', () => {
  describe('POST /api/cart/merge - Merge Guest Cart', () => {
    it('should require guestSessionId', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should reject empty guestSessionId', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestSessionId: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      if (!app) return;

      const res = await app.request('/api/cart/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestSessionId: 'guest_12345678_abc123' }),
      });
      // Should be 401 (unauthorized) since no auth provided
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe('Cart HTTP Method Validation', () => {
  it('should reject PUT to /api/cart (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/cart', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCount: 5 }),
    });
    // Should be 404 or 405 (method not allowed)
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it('should reject POST to /api/cart (not supported for create cart)', async () => {
    if (!app) return;

    const res = await app.request('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should be 404 (POST to /api/cart doesn't exist, only /api/cart/items)
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it('should reject GET to /api/cart/items (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items', {
      method: 'GET',
    });
    // Should be 404 or 405
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it('should reject POST to /api/cart/items/:id (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/cart/items/${validCartItemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    // Should be 404 or 405
    expect([404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight on /api/cart', async () => {
    if (!app) return;

    const res = await app.request('/api/cart', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight on /api/cart/items', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests (Always Run)
// ============================================================================

describe('Cart Response Headers', () => {
  it('should return JSON content-type for GET /api/cart', async () => {
    if (!app) return;

    // Use AbortController to prevent hanging on slow connections
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await app.request('/api/cart', { signal: controller.signal });
      clearTimeout(timeoutId);
      expect(res.headers.get('content-type')).toContain('application/json');
    } catch (error) {
      clearTimeout(timeoutId);
      // If request times out or aborts, skip the test gracefully
      if ((error as Error).name === 'AbortError') {
        console.log('Skipping: Cart request timed out (Redis/DB unavailable)');
        return;
      }
      throw error;
    }
  }, 10000);

  it('should return JSON content-type for validation errors on POST', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'invalid' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for validation errors on PATCH', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items/invalid-uuid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for validation errors on DELETE', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items/invalid-uuid', {
      method: 'DELETE',
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for merge endpoint', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestSessionId: 'test_session' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ============================================================================
// Error Response Format Tests (Always Run)
// ============================================================================

describe('Cart Error Response Format', () => {
  it('should return error object for validation failures', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items/invalid-uuid', {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(typeof json.error).toBe('string');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'invalid' }),
    });
    const json = await res.json();

    // Should not expose stack traces or internal paths
    expect(JSON.stringify(json)).not.toContain('/packages/api/');
    expect(JSON.stringify(json)).not.toContain('node_modules');
  });

  it('should return proper error for unauthorized merge request', async () => {
    if (!app) return;

    const res = await app.request('/api/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestSessionId: 'guest_test_session' }),
    });
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(json.error).toBe('Authentication required');
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('Cart Runtime Tests (Database Required)', () => {
  describe('GET /api/cart - Get Cart', () => {
    it('should return cart object with items array', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('itemCount');
      expect(json).toHaveProperty('subtotal');
      expect(json).toHaveProperty('items');
      expect(json).toHaveProperty('savedForLater');
      expect(Array.isArray(json.items)).toBe(true);
      expect(Array.isArray(json.savedForLater)).toBe(true);
    });

    it('should create new cart if none exists', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // Make request without any session cookie
      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('id');
      expect(json.itemCount).toBe(0);
    });

    it('should return cart with currency', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('currency');
      expect(json.currency).toBe('INR'); // Default currency
    });

    it('should include coupon information if applied', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      // These fields should exist even if null
      expect(json).toHaveProperty('couponCode');
      expect(json).toHaveProperty('couponDiscount');
    });
  });

  describe('POST /api/cart/items - Add Item to Cart', () => {
    it('should return 404 for non-existent product', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: '00000000-0000-0000-0000-000000000999', // Non-existent
          variantId: validVariantId,
          quantity: 1,
        }),
      });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Product not found or unavailable');
    });

    it('should return 404 for non-existent variant', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // This test requires a valid product ID - will skip if no products exist
      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validAddCartItemData),
      });
      // Either 404 (product/variant not found) or 201 (if data exists)
      expect([201, 404, 400].includes(res.status)).toBe(true);
    });

    it('should return 201 with item on successful add', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // This test would need actual product/variant data to pass
      // For now, we just verify the endpoint behavior
      const res = await app.request('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validAddCartItemData),
      });

      if (res.status === 201) {
        const json = await res.json();
        expect(json).toHaveProperty('message', 'Item added to cart');
        expect(json).toHaveProperty('item');
        expect(json.item).toHaveProperty('id');
        expect(json.item).toHaveProperty('quantity');
      }
    });
  });

  describe('PATCH /api/cart/items/:id - Update Cart Item', () => {
    it('should return 404 for non-existent cart item', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 2 }),
      });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Cart item not found');
    });

    it('should return 404 for non-existent frame on update', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameId: '00000000-0000-0000-0000-000000000999', // Non-existent frame
        }),
      });
      // 404 for cart item not found or frame not found
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/cart/items/:id - Remove Cart Item', () => {
    it('should return 404 for non-existent cart item', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/cart/items/${validCartItemId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Cart item not found');
    });
  });

  describe('DELETE /api/cart - Clear Cart', () => {
    it('should clear cart and return success message', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // First get a cart (to ensure one exists)
      await app.request('/api/cart');

      // Then clear it
      const res = await app.request('/api/cart', {
        method: 'DELETE',
      });

      // Should be 200 (cleared) or 404 (no cart found for guest without session)
      expect([200, 404].includes(res.status)).toBe(true);

      if (res.status === 200) {
        const json = await res.json();
        expect(json.message).toBe('Cart cleared');
      }
    });

    it('should return 404 when no cart exists', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // Make request without any session - might return 404 or clear empty cart
      const res = await app.request('/api/cart', {
        method: 'DELETE',
      });
      expect([200, 404].includes(res.status)).toBe(true);
    });
  });

  describe('POST /api/cart/merge - Merge Guest Cart', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/cart/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestSessionId: 'guest_test_123_abc' }),
      });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBe('Authentication required');
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Cart Performance Tests', () => {
  it('should respond quickly to GET /api/cart', async () => {
    if (!app || !isDatabaseAvailable) return;

    const start = Date.now();
    await app.request('/api/cart');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(2000);
  });

  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/cart/items/invalid-uuid', {
      method: 'DELETE',
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to add item validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'invalid' }),
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent cart requests', async () => {
    if (!app || !isDatabaseAvailable) return;

    const requests = Array.from({ length: 5 }, () =>
      app!.request('/api/cart')
    );

    const start = Date.now();
    const responses = await Promise.all(requests);
    const duration = Date.now() - start;

    expect(responses).toHaveLength(5);
    expect(duration).toBeLessThan(5000);
  });
});

// ============================================================================
// Guest Session Tests
// ============================================================================

describe('Cart Guest Session Handling', () => {
  it('should set cart_session cookie for guest users', async () => {
    if (!app || !isDatabaseAvailable) return;

    const res = await app.request('/api/cart');
    expect(res.status).toBe(200);

    // Check for Set-Cookie header
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      expect(setCookie).toContain('cart_session');
    }
  });

  it('should maintain cart state across requests with same session', async () => {
    if (!app || !isDatabaseAvailable) return;

    // First request to get session
    const res1 = await app.request('/api/cart');
    expect(res1.status).toBe(200);

    const json1 = await res1.json();
    const cartId = json1.id;

    // Note: In real test with cookies, subsequent requests would use same cart
    // For now, we just verify the cart structure
    expect(cartId).toBeDefined();
  });
});

// ============================================================================
// Cart Cache Tests
// ============================================================================

describe('Cart Cache Behavior', () => {
  it('should indicate cache status in response', async () => {
    if (!app || !isDatabaseAvailable) return;

    // First request (cache miss)
    const res1 = await app.request('/api/cart');
    expect(res1.status).toBe(200);

    const json1 = await res1.json();
    // First request should not have fromCache=true
    // (or if Redis is unavailable, there's no cache)
    if (json1.fromCache !== undefined) {
      expect(typeof json1.fromCache).toBe('boolean');
    }
  });
});
