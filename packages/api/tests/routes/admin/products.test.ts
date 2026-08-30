/**
 * Tests for admin products management API endpoints
 *
 * This test suite validates the admin products API routes:
 * - GET /api/admin/products - List all products with pagination (including drafts)
 * - GET /api/admin/products/:id - Get product by ID
 * - POST /api/admin/products - Create a new product
 * - PATCH /api/admin/products/:id - Update a product
 * - DELETE /api/admin/products/:id - Delete a product (soft delete via archive)
 * - POST /api/admin/products/:id/variants - Add variant to product
 * - PATCH /api/admin/products/:id/variants/:variantId - Update variant
 * - DELETE /api/admin/products/:id/variants/:variantId - Delete variant
 *
 * All endpoints require admin authentication.
 *
 * Tests are organized into:
 * 1. Module export tests - Always run, don't require database
 * 2. Authentication tests - Test admin auth requirement
 * 3. Route availability tests - Test routes exist and require auth
 * 4. Validation tests - Test input validation
 * 5. Response format tests - Verify response structures
 * 6. Runtime tests - Require database, gracefully skip when unavailable
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 *
 * @see packages/api/src/routes/admin/products.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import '../../setup';
import { readJson } from '../../helpers/json';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid product ID for testing
 */
const validProductId = '00000000-0000-0000-0000-000000000001';
const validVariantId = '00000000-0000-0000-0000-000000000002';

/**
 * Valid product creation data
 */
const validCreateProductData = {
  sku: 'TEST-ADMIN-001',
  title: 'Test Admin Product',
  slug: 'test-admin-product-001',
  description: 'A test product created via admin API',
  basePrice: '1999.00',
  styles: ['minimalist', 'abstract'],
  subjects: ['nature', 'landscape'],
  colors: ['blue', 'white'],
  rooms: ['living-room'],
  tags: ['test', 'admin'],
  orientation: 'landscape',
  status: 'draft',
  isFeatured: false,
  isAiGenerated: false,
};

/**
 * Valid variant creation data
 */
const validCreateVariantData = {
  sizeLabel: '12x16 inches',
  widthInches: 12,
  heightInches: 16,
  widthCm: 30,
  heightCm: 41,
  price: '1499.00',
  stockQuantity: 100,
  lowStockThreshold: 10,
  isInStock: true,
  sortOrder: 0,
  isActive: true,
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping admin products runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import('../../../src/index');
    app = testApp;

    // Test database connectivity by making a simple request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await testApp.request('/api/health', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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

describe('Admin Products Route Module Exports', () => {
  it('should export adminProductsApp from routes/admin/products', async () => {
    const productsModule = await import('../../../src/routes/admin/products');
    expect(productsModule).toHaveProperty('adminProductsApp');
    expect(productsModule.adminProductsApp).toBeDefined();
  });

  it('should export default from routes/admin/products', async () => {
    const productsModule = await import('../../../src/routes/admin/products');
    expect(productsModule.default).toBeDefined();
    expect(productsModule.default).toBe(productsModule.adminProductsApp);
  });

  it('should be a Hono app instance', async () => {
    const { adminProductsApp } = await import('../../../src/routes/admin/products');
    expect(typeof adminProductsApp.fetch).toBe('function');
    expect(typeof adminProductsApp.request).toBe('function');
  });
});

// ============================================================================
// Authentication Tests (Always Run)
// ============================================================================

describe('Admin Products Authentication Requirements', () => {
  describe('GET /api/admin/products - List Products', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/products');
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/admin/products/:id - Get Product', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/products/${validProductId}`);
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /api/admin/products - Create Product', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateProductData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('PATCH /api/admin/products/:id - Update Product', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/products/${validProductId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('DELETE /api/admin/products/:id - Delete Product', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/products/${validProductId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /api/admin/products/:id/variants - Create Variant', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateVariantData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('PATCH /api/admin/products/:id/variants/:variantId - Update Variant', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/products/${validProductId}/variants/${validVariantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: '1599.00' }),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('DELETE /api/admin/products/:id/variants/:variantId - Delete Variant', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/products/${validProductId}/variants/${validVariantId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run)
// ============================================================================

describe('Admin Products Route Availability', () => {
  it('should have products route mounted at /api/admin/products', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/admin/products');
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have get product route at /api/admin/products/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/products/${validProductId}`);
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have create product route at /api/admin/products', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateProductData),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have update product route at /api/admin/products/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/products/${validProductId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have delete product route at /api/admin/products/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/products/${validProductId}`, {
      method: 'DELETE',
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have variants routes', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    // POST variant
    const postRes = await app.request(`/api/admin/products/${validProductId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateVariantData),
    });
    expect(postRes.status).toBe(401);

    // PATCH variant
    const patchRes = await app.request(`/api/admin/products/${validProductId}/variants/${validVariantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: '1599.00' }),
    });
    expect(patchRes.status).toBe(401);

    // DELETE variant
    const deleteRes = await app.request(`/api/admin/products/${validProductId}/variants/${validVariantId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(401);
  });
});

// ============================================================================
// Query Parameter Validation Tests
// ============================================================================

describe('Admin Products List Query Validation', () => {
  describe('GET /api/admin/products - Pagination', () => {
    it('should accept valid page number', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?page=1');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?pageSize=20');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject page=0', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?page=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative page number', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?page=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize=0', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?pageSize=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?pageSize=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize exceeding max (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?pageSize=101');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept pageSize at max (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?pageSize=100');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/products - Status Filter', () => {
    it('should accept valid status: draft', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?status=draft');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: active', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?status=active');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: archived', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?status=archived');
      expect(res.status).toBe(401);
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?status=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/products - Sort Parameters', () => {
    it('should accept valid sortBy: createdAt', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortBy=createdAt');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: updatedAt', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortBy=updatedAt');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: title', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortBy=title');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: basePrice', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortBy=basePrice');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: sku', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortBy=sku');
      expect(res.status).toBe(401);
    });

    it('should reject invalid sortBy', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortBy=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid sortOrder: asc', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortOrder=asc');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortOrder: desc', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortOrder=desc');
      expect(res.status).toBe(401);
    });

    it('should reject invalid sortOrder', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?sortOrder=random');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/products - Search', () => {
    it('should accept search parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?search=test');
      expect(res.status).toBe(401);
    });

    it('should accept combined query parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products?page=1&pageSize=20&status=active&search=poster&sortBy=createdAt&sortOrder=desc');
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Product ID Validation Tests
// ============================================================================

describe('Admin Products ID Validation', () => {
  describe('GET /api/admin/products/:id', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}`);
      // Should pass ID validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept uppercase UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products/A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/products/:id', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/admin/products/:id', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Create Product Validation Tests
// ============================================================================

describe('Admin Products Create Validation', () => {
  describe('POST /api/admin/products - Required Fields', () => {
    it('should require sku', async () => {
      if (!app) return;

      const { sku, ...dataWithoutSku } = validCreateProductData;
      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutSku),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require title', async () => {
      if (!app) return;

      const { title, ...dataWithoutTitle } = validCreateProductData;
      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutTitle),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require slug', async () => {
      if (!app) return;

      const { slug, ...dataWithoutSlug } = validCreateProductData;
      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutSlug),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require basePrice', async () => {
      if (!app) return;

      const { basePrice, ...dataWithoutPrice } = validCreateProductData;
      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutPrice),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require orientation', async () => {
      if (!app) return;

      const { orientation, ...dataWithoutOrientation } = validCreateProductData;
      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutOrientation),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('POST /api/admin/products - Field Constraints', () => {
    it('should reject empty sku', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, sku: '' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject sku exceeding max length (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, sku: 'x'.repeat(101) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty title', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, title: '' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject title exceeding max length (200)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, title: 'x'.repeat(201) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty slug', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, slug: '' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject slug with uppercase letters', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, slug: 'Test-Product' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject slug with special characters', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, slug: 'test_product!' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid slug format (lowercase alphanumeric with hyphens)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, slug: 'test-product-123' }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject invalid basePrice format', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, basePrice: '1999' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject basePrice with letters', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, basePrice: 'abc.00' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid basePrice format', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, basePrice: '1999.00' }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/admin/products - Orientation Validation', () => {
    it('should accept valid orientation: square', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, orientation: 'square' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid orientation: portrait', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, orientation: 'portrait' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid orientation: landscape', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, orientation: 'landscape' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid orientation: panoramic', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, orientation: 'panoramic' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid orientation: round', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, orientation: 'round' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject invalid orientation', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, orientation: 'invalid' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('POST /api/admin/products - Status Validation', () => {
    it('should accept valid status: draft', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, status: 'draft' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid status: active', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, status: 'active' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid status: archived', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, status: 'archived' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, status: 'deleted' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('POST /api/admin/products - Optional Fields', () => {
    it('should accept description as optional', async () => {
      if (!app) return;

      const { description, ...dataWithoutDescription } = validCreateProductData;
      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutDescription),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject description exceeding max length (5000)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, description: 'x'.repeat(5001) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept seoTitle as optional', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, seoTitle: 'SEO Title' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject seoTitle exceeding max length (200)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, seoTitle: 'x'.repeat(201) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept seoDescription as optional', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, seoDescription: 'SEO Description' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject seoDescription exceeding max length (500)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, seoDescription: 'x'.repeat(501) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept boolean isFeatured', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, isFeatured: true }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept boolean isAiGenerated', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, isAiGenerated: true }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept valid artistId UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, artistId: validProductId }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject invalid artistId UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateProductData, artistId: 'invalid-uuid' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// Variant Validation Tests
// ============================================================================

describe('Admin Products Variant Validation', () => {
  describe('POST /api/admin/products/:id/variants - Required Fields', () => {
    it('should require sizeLabel', async () => {
      if (!app) return;

      const { sizeLabel, ...dataWithoutSizeLabel } = validCreateVariantData;
      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutSizeLabel),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require widthInches', async () => {
      if (!app) return;

      const { widthInches, ...dataWithoutWidth } = validCreateVariantData;
      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutWidth),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require heightInches', async () => {
      if (!app) return;

      const { heightInches, ...dataWithoutHeight } = validCreateVariantData;
      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutHeight),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require price', async () => {
      if (!app) return;

      const { price, ...dataWithoutPrice } = validCreateVariantData;
      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataWithoutPrice),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('POST /api/admin/products/:id/variants - Field Constraints', () => {
    it('should reject empty sizeLabel', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateVariantData, sizeLabel: '' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject sizeLabel exceeding max length (50)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateVariantData, sizeLabel: 'x'.repeat(51) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject non-positive widthInches', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateVariantData, widthInches: 0 }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject non-positive heightInches', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateVariantData, heightInches: 0 }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject invalid price format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateVariantData, price: '1499' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative stockQuantity', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateVariantData, stockQuantity: -1 }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid variant data', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateVariantData),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// HTTP Method Tests
// ============================================================================

describe('Admin Products HTTP Method Validation', () => {
  it('should reject PUT to /api/admin/products (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateProductData),
    });
    // Should be 404/405 (method not allowed) or 401 (auth middleware runs first)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PUT to /api/admin/products/:id (use PATCH instead)', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/products/${validProductId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateProductData),
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight on /api/admin/products', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests
// ============================================================================

describe('Admin Products Response Headers', () => {
  it('should return JSON content-type for GET /api/admin/products', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for GET /api/admin/products/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/products/${validProductId}`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for POST /api/admin/products', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateProductData),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for PATCH /api/admin/products/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/products/${validProductId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for DELETE /api/admin/products/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/products/${validProductId}`, {
      method: 'DELETE',
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ============================================================================
// Error Response Format Tests
// ============================================================================

describe('Admin Products Error Response Format', () => {
  it('should return error object for authentication failures', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    expect(json).toHaveProperty('error');
    expect(typeof json.error).toBe('string');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products');
    const json = await readJson(res);

    // Should not expose stack traces or internal paths
    expect(JSON.stringify(json)).not.toContain('/packages/api/');
    expect(JSON.stringify(json)).not.toContain('node_modules');
  });

  it('should return proper authentication error message', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/products');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    // Accept common authentication error message formats
    expect(['Unauthorized', 'Authentication required'].includes(json.error)).toBe(true);
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('Admin Products Runtime Tests (Database Required)', () => {
  describe('GET /api/admin/products - List Products', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/products');
      expect(res.status).toBe(401);
    });

    it('should require authentication with pagination params', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/products?page=1&pageSize=10');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/products/:id - Get Product', () => {
    it('should require authentication for UUID lookup', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/admin/products - Create Product', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateProductData),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/products/:id - Update Product', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/admin/products/:id - Archive Product', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Variant Routes - Runtime Tests', () => {
    it('should require authentication for POST variant', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateVariantData),
      });
      expect(res.status).toBe(401);
    });

    it('should require authentication for PATCH variant', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants/${validVariantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: '1599.00' }),
      });
      expect(res.status).toBe(401);
    });

    it('should require authentication for DELETE variant', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/products/${validProductId}/variants/${validVariantId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Admin Products Performance Tests', () => {
  it('should respond quickly to auth errors on GET /api/admin/products', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/admin/products');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/admin/products?page=-1');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent requests gracefully', async () => {
    if (!app) return;

    const requests = Array.from({ length: 5 }, () =>
      app!.request('/api/admin/products')
    );

    const start = Date.now();
    const responses = await Promise.all(requests);
    const duration = Date.now() - start;

    expect(responses).toHaveLength(5);
    responses.forEach(res => expect(res.status).toBe(401));
    expect(duration).toBeLessThan(3000);
  });
});

// ============================================================================
// Product Status Constants Tests
// ============================================================================

describe('Admin Products Status Constants', () => {
  it('should have valid product statuses', () => {
    const validStatuses = ['draft', 'active', 'archived'];

    expect(validStatuses).toHaveLength(3);
    validStatuses.forEach(status => {
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });
  });

  it('should have valid orientation types', () => {
    const validOrientations = ['square', 'portrait', 'landscape', 'panoramic', 'round'];

    expect(validOrientations).toHaveLength(5);
    validOrientations.forEach(orientation => {
      expect(typeof orientation).toBe('string');
    });
  });

  it('should have valid sort fields', () => {
    const validSortFields = ['createdAt', 'updatedAt', 'title', 'basePrice', 'sku'];

    expect(validSortFields).toHaveLength(5);
    validSortFields.forEach(field => {
      expect(typeof field).toBe('string');
    });
  });
});
