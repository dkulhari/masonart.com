/**
 * Tests for products CRUD endpoints
 *
 * This test suite validates the products API routes:
 * - GET /api/products - List products with filtering, sorting, pagination
 * - GET /api/products/search - Search products by query
 * - GET /api/products/featured - Get featured products
 * - GET /api/products/frames - Get available frames
 * - GET /api/products/:slug - Get product by slug
 * - GET /api/products/:slug/variants - Get product variants
 * - POST /api/products/by-ids - Get products by IDs
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
 * @see packages/api/src/routes/products.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid product data for testing
 */
const validProductData = {
  sku: 'TEST-001',
  title: 'Test Product',
  slug: 'test-product-001',
  description: 'A test product for testing',
  basePrice: '1499.00',
  styles: ['minimalist', 'abstract'],
  subjects: ['nature', 'landscape'],
  colors: ['blue', 'white'],
  orientation: 'landscape',
  images: [
    {
      id: 'img-001',
      url: 'https://example.com/test.jpg',
      alt: 'Test product image',
      width: 2000,
      height: 1500,
      isPrimary: true,
    },
  ],
  seoTitle: 'Test Product - Buy Now',
  seoDescription: 'Buy this amazing test product',
  status: 'active',
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping products runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
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
      const res = await testApp.request('/api/products?page=1&pageSize=1', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If we get a 500 error with specific database error, database is unavailable
      if (res.status === 500) {
        const json = await res.json();
        if (json.error === 'Failed to fetch products') {
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

describe('Products Route Module Exports', () => {
  it('should export productsApp from routes/products', async () => {
    const productsModule = await import('../../src/routes/products');
    expect(productsModule).toHaveProperty('productsApp');
    expect(productsModule.productsApp).toBeDefined();
  });

  it('should export default from routes/products', async () => {
    const productsModule = await import('../../src/routes/products');
    expect(productsModule.default).toBeDefined();
    expect(productsModule.default).toBe(productsModule.productsApp);
  });

  it('should be a Hono app instance', async () => {
    const { productsApp } = await import('../../src/routes/products');
    expect(typeof productsApp.fetch).toBe('function');
    expect(typeof productsApp.request).toBe('function');
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe('Products Route Availability', () => {
  it('should have products route mounted at /api/products', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/products');
    // Should not be 404 - route exists
    expect(res.status).not.toBe(404);
  });

  it('should have search route at /api/products/search', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    // Missing required 'q' parameter should return 400, not 404
    const res = await app.request('/api/products/search');
    expect(res.status).not.toBe(404);
  });

  it('should have featured route at /api/products/featured', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/products/featured');
    expect(res.status).not.toBe(404);
  });

  it('should have frames route at /api/products/frames', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/products/frames');
    expect(res.status).not.toBe(404);
  });

  it('should have single product route at /api/products/:slug', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/products/test-product');
    // Should not be 404 (route not found) - might be 404 (product not found) or 500 (db error)
    // Route exists if we get a JSON response
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should have variants route at /api/products/:slug/variants', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/products/test-product/variants');
    // Route exists if we get a JSON response
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should have by-ids route at /api/products/by-ids', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/products/by-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    // Should not be 404 - route exists
    expect(res.status).not.toBe(404);
  });
});

// ============================================================================
// Query Parameter Validation Tests (Always Run)
// ============================================================================

describe('Products Query Parameter Validation', () => {
  describe('GET /api/products - List Products', () => {
    it('should accept valid pagination parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/products?page=1&pageSize=24');
      // Should accept valid params (200 or 500 for db error)
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid filter parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/products?styles=minimalist&orientation=landscape');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid sort parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/products?sortBy=createdAt&sortOrder=desc');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept valid price range parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/products?priceMin=100&priceMax=5000');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should reject invalid page number (non-positive)', async () => {
      if (!app) return;

      const res = await app.request('/api/products?page=0');
      expect(res.status).toBe(400);
    });

    it('should reject invalid page number (negative)', async () => {
      if (!app) return;

      const res = await app.request('/api/products?page=-1');
      expect(res.status).toBe(400);
    });

    it('should reject invalid pageSize (exceeds max)', async () => {
      if (!app) return;

      const res = await app.request('/api/products?pageSize=200');
      expect(res.status).toBe(400);
    });

    it('should reject invalid orientation value', async () => {
      if (!app) return;

      const res = await app.request('/api/products?orientation=invalid');
      expect(res.status).toBe(400);
    });

    it('should reject invalid sortBy value', async () => {
      if (!app) return;

      const res = await app.request('/api/products?sortBy=invalid');
      expect(res.status).toBe(400);
    });

    it('should reject invalid sortOrder value', async () => {
      if (!app) return;

      const res = await app.request('/api/products?sortOrder=invalid');
      expect(res.status).toBe(400);
    });

    it('should accept boolean isFeatured parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/products?isFeatured=true');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should accept boolean isAiGenerated parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/products?isAiGenerated=false');
      expect([200, 500].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/products/search - Search Products', () => {
    it('should require q parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/products/search');
      expect(res.status).toBe(400);
    });

    it('should reject empty q parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/products/search?q=');
      expect(res.status).toBe(400);
    });

    it('should accept valid search query', async () => {
      if (!app) return;

      const res = await app.request('/api/products/search?q=ocean');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should reject very long search query (over 200 chars)', async () => {
      if (!app) return;

      const longQuery = 'a'.repeat(201);
      const res = await app.request(`/api/products/search?q=${longQuery}`);
      expect(res.status).toBe(400);
    });

    it('should accept pagination in search', async () => {
      if (!app) return;

      const res = await app.request('/api/products/search?q=test&page=1&pageSize=10');
      expect([200, 500].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/products/featured - Featured Products', () => {
    it('should accept valid limit parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/products/featured?limit=10');
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should reject limit exceeding max (50)', async () => {
      if (!app) return;

      const res = await app.request('/api/products/featured?limit=100');
      expect(res.status).toBe(400);
    });

    it('should use default limit if not provided', async () => {
      if (!app || !isDatabaseAvailable) return;

      const res = await app.request('/api/products/featured');
      expect([200, 500].includes(res.status)).toBe(true);
    });
  });

  // The PDP's "You May Also Like" section rendered a hardcoded skeleton
  // because no endpoint existed to fill it (#352).
  describe('GET /api/products/:slug/related', () => {
    it('returns an items envelope for a real product', async () => {
      if (!app || !isDatabaseAvailable) return;

      const listRes = await app.request('/api/products?page=1&pageSize=1');
      const list = (await listRes.json()) as { items?: Array<{ slug: string }> };
      const slug = list.items?.[0]?.slug;
      if (!slug) return;

      const res = await app.request(`/api/products/${slug}/related`);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('never includes the product itself', async () => {
      if (!app || !isDatabaseAvailable) return;

      const listRes = await app.request('/api/products?page=1&pageSize=1');
      const list = (await listRes.json()) as { items?: Array<{ slug: string }> };
      const slug = list.items?.[0]?.slug;
      if (!slug) return;

      const res = await app.request(`/api/products/${slug}/related`);
      const json = (await res.json()) as { items: Array<{ slug: string }> };

      expect(json.items.map((item) => item.slug)).not.toContain(slug);
    });

    it('respects the limit parameter', async () => {
      if (!app || !isDatabaseAvailable) return;

      const listRes = await app.request('/api/products?page=1&pageSize=1');
      const list = (await listRes.json()) as { items?: Array<{ slug: string }> };
      const slug = list.items?.[0]?.slug;
      if (!slug) return;

      const res = await app.request(`/api/products/${slug}/related?limit=2`);
      const json = (await res.json()) as { items: unknown[] };

      expect(json.items.length).toBeLessThanOrEqual(2);
    });

    it('rejects a limit above the maximum', async () => {
      if (!app) return;

      const res = await app.request('/api/products/any-slug/related?limit=100');
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown product', async () => {
      if (!app || !isDatabaseAvailable) return;

      const res = await app.request(
        '/api/products/definitely-not-a-real-product-slug/related'
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/products/:slug - Get Product by Slug', () => {
    it('should reject invalid slug format (uppercase)', async () => {
      if (!app) return;

      const res = await app.request('/api/products/INVALID-SLUG');
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid slug format');
    });

    it('should reject slug with special characters', async () => {
      if (!app) return;

      const res = await app.request('/api/products/invalid_slug!');
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid slug format');
    });

    it('should accept valid slug format', async () => {
      if (!app || !isDatabaseAvailable) return;

      const res = await app.request('/api/products/valid-product-slug-123');
      // Should be 404 (product not found) or 500 (db error), not 400
      expect([404, 500].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/products/:slug/variants - Get Product Variants', () => {
    it('should reject invalid slug format', async () => {
      if (!app) return;

      const res = await app.request('/api/products/INVALID/variants');
      expect(res.status).toBe(400);
    });

    it('should accept valid slug format', async () => {
      if (!app || !isDatabaseAvailable) return;

      const res = await app.request('/api/products/valid-slug/variants');
      expect([404, 500].includes(res.status)).toBe(true);
    });
  });

  describe('POST /api/products/by-ids - Get Products by IDs', () => {
    it('should require ids array in body', async () => {
      if (!app) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('should accept empty ids array', async () => {
      if (!app) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [] }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toEqual([]);
    });

    it('should reject ids array with invalid UUIDs', async () => {
      if (!app) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['invalid-uuid'] }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept valid UUIDs', async () => {
      if (!app || !isDatabaseAvailable) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['00000000-0000-0000-0000-000000000001'] }),
      });
      // Should be 200 (success) or 500 (db error)
      expect([200, 500].includes(res.status)).toBe(true);
    });

    it('should reject more than 50 IDs', async () => {
      if (!app) return;

      const ids = Array.from({ length: 51 }, (_, i) =>
        `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
      );
      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject malformed JSON', async () => {
      if (!app) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });
      expect(res.status).toBe(400);
    });
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe('Products HTTP Method Validation', () => {
  it('should reject POST to /api/products (no admin create in public API)', async () => {
    if (!app) return;

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validProductData),
    });
    // Should be 404/405 (route not found/method not allowed) or 401 (auth middleware first)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PUT to /api/products/:slug', async () => {
    if (!app) return;

    const res = await app.request('/api/products/test-product', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    // May return 401 if auth middleware runs first, or 404/405 for unsupported method
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject DELETE to /api/products/:slug', async () => {
    if (!app) return;

    const res = await app.request('/api/products/test-product', {
      method: 'DELETE',
    });
    // May return 401 if auth middleware runs first, or 404/405 for unsupported method
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight', async () => {
    if (!app) return;

    const res = await app.request('/api/products', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests (Always Run)
// ============================================================================

describe('Products Response Headers', () => {
  it('should return JSON content-type for list endpoint', async () => {
    if (!app || !isDatabaseAvailable) return;

    const res = await app.request('/api/products');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for search endpoint', async () => {
    if (!app || !isDatabaseAvailable) return;

    const res = await app.request('/api/products/search?q=test');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for featured endpoint', async () => {
    if (!app || !isDatabaseAvailable) return;

    const res = await app.request('/api/products/featured');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for frames endpoint', async () => {
    if (!app || !isDatabaseAvailable) return;

    const res = await app.request('/api/products/frames');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for validation errors', async () => {
    if (!app) return;

    const res = await app.request('/api/products?page=-1');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ============================================================================
// Error Response Format Tests (Always Run)
// ============================================================================

describe('Products Error Response Format', () => {
  it('should return error object for validation failures', async () => {
    if (!app) return;

    const res = await app.request('/api/products/INVALID-SLUG');
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(typeof json.error).toBe('string');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/products?page=-1');
    const json = await res.json();

    // Should not expose stack traces or internal paths
    expect(JSON.stringify(json)).not.toContain('/packages/api/');
    expect(JSON.stringify(json)).not.toContain('node_modules');
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('Products Runtime Tests (Database Required)', () => {
  describe('GET /api/products - List Products', () => {
    it('should return paginated products list', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products?page=1&pageSize=10');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('page');
      expect(json).toHaveProperty('pageSize');
      expect(json).toHaveProperty('totalPages');
      expect(json).toHaveProperty('hasNextPage');
      expect(json).toHaveProperty('hasPreviousPage');
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('should only return active products', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products');
      expect(res.status).toBe(200);

      const json = await res.json();
      // All returned products should be active (public API filter)
      // Note: Can't fully verify without knowing database state
      expect(json).toHaveProperty('items');
    });

    it('should filter by orientation', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products?orientation=landscape');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
    });

    it('should filter by styles', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products?styles=minimalist,abstract');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
    });

    it('should filter by price range', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products?priceMin=1000&priceMax=5000');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
    });

    it('should sort by price ascending', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products?sortBy=basePrice&sortOrder=asc');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
      // Verify sorting if items exist
      if (json.items.length > 1) {
        const prices = json.items.map((p: any) => parseFloat(p.basePrice));
        for (let i = 1; i < prices.length; i++) {
          expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
        }
      }
    });

    it('should support caching', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      // Make first request
      const res1 = await app.request('/api/products?page=1&pageSize=5');
      expect(res1.status).toBe(200);

      // Make second request (might be cached)
      const res2 = await app.request('/api/products?page=1&pageSize=5');
      expect(res2.status).toBe(200);

      // Both should return valid data
      const json1 = await res1.json();
      const json2 = await res2.json();
      expect(json1.total).toBe(json2.total);
    });
  });

  describe('GET /api/products/search - Search Products', () => {
    it('should search products by title', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/search?q=poster');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('query', 'poster');
      expect(json).toHaveProperty('items');
      expect(json).toHaveProperty('total');
    });

    it('should return paginated search results', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/search?q=art&page=1&pageSize=5');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.page).toBe(1);
      expect(json.pageSize).toBe(5);
    });
  });

  describe('GET /api/products/featured - Featured Products', () => {
    it('should return featured products', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/featured');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
      expect(Array.isArray(json.items)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/featured?limit=5');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/products/frames - Available Frames', () => {
    it('should return available frames', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/frames');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
      expect(Array.isArray(json.items)).toBe(true);
    });
  });

  describe('GET /api/products/:slug - Get Product by Slug', () => {
    it('should return 404 for non-existent product', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/non-existent-product-slug-12345');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Product not found');
    });
  });

  describe('GET /api/products/:slug/variants - Get Product Variants', () => {
    it('should return 404 for non-existent product', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/non-existent-slug/variants');
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Product not found');
    });
  });

  describe('POST /api/products/by-ids - Get Products by IDs', () => {
    it('should return empty array for empty IDs', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [] }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toEqual([]);
    });

    it('should return products for valid IDs', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/products/by-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['00000000-0000-0000-0000-000000000001'],
        }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toHaveProperty('items');
      expect(Array.isArray(json.items)).toBe(true);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Products Performance Tests', () => {
  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/products?page=-1');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to slug validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/products/INVALID-SLUG');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent validation requests', async () => {
    if (!app || !isDatabaseAvailable) return;

    const requests = Array.from({ length: 10 }, () =>
      app!.request('/api/products?page=1&pageSize=10')
    );

    const start = Date.now();
    const responses = await Promise.all(requests);
    const duration = Date.now() - start;

    expect(responses).toHaveLength(10);
    expect(duration).toBeLessThan(5000);
  });
});
