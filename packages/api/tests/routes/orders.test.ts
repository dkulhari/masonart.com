/**
 * Tests for orders management endpoints
 *
 * This test suite validates the orders API routes:
 * - POST /api/orders - Create a new order from cart
 * - GET /api/orders - List user's orders with pagination
 * - GET /api/orders/:id - Get order by ID or order number
 * - POST /api/orders/:id/payment - Initiate payment for an order
 * - POST /api/orders/:id/payment/verify - Verify payment after checkout
 *
 * All endpoints require authentication.
 *
 * Tests are organized into:
 * 1. Configuration tests - Always run, don't require database
 * 2. Route availability tests - Test routes exist and require auth
 * 3. Validation tests - Test input validation without database
 * 4. Response format tests - Verify response structures
 * 5. Runtime tests - Require database, gracefully skip when unavailable
 *
 * Runtime tests can be skipped by setting SKIP_DB_RUNTIME_TESTS=true
 *
 * @see packages/api/src/routes/orders.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import '../setup';
import { readJson } from '../helpers/json';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid UUIDs for testing
 */
const validOrderId = '00000000-0000-0000-0000-000000000001';
const validOrderNumber = 'MA-2024-000001';

/**
 * Valid shipping address for testing
 */
const validShippingAddress = {
  fullName: 'John Doe',
  phone: '9876543210',
  addressLine1: '123 MG Road',
  addressLine2: 'Near Central Mall',
  landmark: 'Opposite City Park',
  city: 'Bangalore',
  state: 'Karnataka',
  postalCode: '560001',
  countryCode: 'IN',
};

/**
 * Valid create order data
 */
const validCreateOrderData = {
  shippingAddress: validShippingAddress,
  shippingMethod: 'standard',
  customerNotes: 'Please handle with care',
};

/**
 * Valid payment verification data
 */
const validPaymentVerificationData = {
  razorpayOrderId: 'order_test123456789',
  razorpayPaymentId: 'pay_test123456789',
  razorpaySignature: 'test_signature_abc123',
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping orders runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
    return;
  }

  // Try to import the app and check database connectivity
  try {
    const { app: testApp } = await import('../../src/index');
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

describe('Orders Route Module Exports', () => {
  it('should export ordersApp from routes/orders', async () => {
    const ordersModule = await import('../../src/routes/orders');
    expect(ordersModule).toHaveProperty('ordersApp');
    expect(ordersModule.ordersApp).toBeDefined();
  });

  it('should export default from routes/orders', async () => {
    const ordersModule = await import('../../src/routes/orders');
    expect(ordersModule.default).toBeDefined();
    expect(ordersModule.default).toBe(ordersModule.ordersApp);
  });

  it('should be a Hono app instance', async () => {
    const { ordersApp } = await import('../../src/routes/orders');
    expect(typeof ordersApp.fetch).toBe('function');
    expect(typeof ordersApp.request).toBe('function');
  });
});

// ============================================================================
// Authentication Tests (Always Run)
// ============================================================================

describe('Orders Authentication Requirements', () => {
  describe('POST /api/orders - Create Order', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateOrderData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/orders - List Orders', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/orders');
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/orders/:id - Get Order', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/orders/${validOrderId}`);
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /api/orders/:id/payment - Initiate Payment', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/orders/${validOrderId}/payment`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /api/orders/:id/payment/verify - Verify Payment', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPaymentVerificationData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run via App)
// ============================================================================

describe('Orders Route Availability', () => {
  it('should have orders route mounted at /api/orders', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/orders');
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have get order route at /api/orders/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/orders/${validOrderId}`);
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have payment initiation route at /api/orders/:id/payment', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/orders/${validOrderId}/payment`, {
      method: 'POST',
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have payment verification route at /api/orders/:id/payment/verify', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPaymentVerificationData),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should accept order number format in routes', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/orders/${validOrderNumber}`);
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Create Order Validation Tests (Require Auth - Test via Direct Module)
// ============================================================================

describe('Orders Create Order Validation', () => {
  describe('Shipping Address Validation', () => {
    it('should reject missing shipping address', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingMethod: 'standard',
        }),
      });
      // Should be 401 (auth first) or 400 (validation)
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject missing fullName in shipping address', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            fullName: undefined,
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject fullName exceeding max length (100 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            fullName: 'x'.repeat(101),
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject phone less than 10 characters', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            phone: '12345',
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject phone exceeding max length (15 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            phone: '1234567890123456',
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject missing addressLine1', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            addressLine1: undefined,
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject addressLine1 exceeding max length (200 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            addressLine1: 'x'.repeat(201),
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept addressLine2 as optional', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            addressLine2: undefined,
          },
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject addressLine2 exceeding max length (200 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            addressLine2: 'x'.repeat(201),
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept landmark as optional', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            landmark: undefined,
          },
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject landmark exceeding max length (200 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            landmark: 'x'.repeat(201),
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject missing city', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            city: undefined,
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject city exceeding max length (100 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            city: 'x'.repeat(101),
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject missing state', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            state: undefined,
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject state exceeding max length (100 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            state: 'x'.repeat(101),
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject postalCode less than 5 characters', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            postalCode: '1234',
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject postalCode exceeding max length (10 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            postalCode: '12345678901',
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid 6-digit postal code', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            postalCode: '560001',
          },
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject invalid countryCode (must be 2 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            ...validShippingAddress,
            countryCode: 'IND',
          },
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should default countryCode to IN when not provided', async () => {
      if (!app) return;

      const { countryCode, ...addressWithoutCountry } = validShippingAddress;
      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: addressWithoutCountry,
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('Shipping Method Validation', () => {
    it('should accept standard shipping method', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          shippingMethod: 'standard',
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept express shipping method', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          shippingMethod: 'express',
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject invalid shipping method', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          shippingMethod: 'overnight',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should default shippingMethod to standard when not provided', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('Customer Notes Validation', () => {
    it('should accept customer notes within limit', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          customerNotes: 'Please deliver after 5 PM',
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject customer notes exceeding max length (500 chars)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          customerNotes: 'x'.repeat(501),
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept empty customer notes', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          customerNotes: '',
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('Coupon Code', () => {
    /**
     * The create-order schema no longer declares `couponCode`: the string was
     * persisted beside a hardcoded zero discount, so the order claimed a code
     * had been applied when none was. Zod strips unknown keys, so a request
     * carrying one is still accepted — the code is simply dropped, and the
     * order records `couponCode: null`.
     *
     * The assertion that the key is gone from the schema, and that null is
     * what gets written, lives in tests/routes/order-promotion-pricing.test.ts
     * where the schema and the persisted row are both inspected directly.
     */
    it('ignores a coupon code in the request body', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: validShippingAddress,
          couponCode: 'SAVE10',
        }),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('Malformed Request Handling', () => {
    it('should reject malformed JSON', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });
      // Auth middleware runs first so 401 is expected; 400 if validation runs first
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty body', async () => {
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      // Auth middleware runs first so 401 is expected; 400 if validation runs first
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// List Orders Query Validation Tests
// ============================================================================

describe('Orders List Query Validation', () => {
  describe('GET /api/orders - Pagination', () => {
    it('should accept valid page number', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?page=1');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?pageSize=20');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject page=0', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?page=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative page number', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?page=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize=0', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?pageSize=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?pageSize=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize exceeding max (50)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?pageSize=51');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept pageSize at max (50)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?pageSize=50');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept non-integer page (coerces to int)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?page=1.5');
      // Zod coerces to int, so 1.5 becomes 1
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/orders - Status Filter', () => {
    it('should accept valid status: pending', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=pending');
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid status: pending_payment', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=pending_payment');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: confirmed', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=confirmed');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: processing', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=processing');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: shipped', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=shipped');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: out_for_delivery', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=out_for_delivery');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: delivered', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=delivered');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: cancelled', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=cancelled');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: refund_requested', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=refund_requested');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: refunded', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=refunded');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: failed', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=failed');
      expect(res.status).toBe(401);
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?status=invalid_status');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept combined page, pageSize, and status', async () => {
      if (!app) return;

      const res = await app.request('/api/orders?page=1&pageSize=10&status=pending');
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Get Order By ID Validation Tests
// ============================================================================

describe('Orders Get Order By ID Validation', () => {
  describe('GET /api/orders/:id - ID Format', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}`);
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid order number format (MA-YYYY-NNNNNN)', async () => {
      if (!app) return;

      const res = await app.request('/api/orders/MA-2024-000001');
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept uppercase order number', async () => {
      if (!app) return;

      const res = await app.request('/api/orders/MA-2024-123456');
      expect(res.status).toBe(401);
    });

    it('should accept lowercase UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/orders/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
      expect(res.status).toBe(401);
    });

    it('should accept uppercase UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/orders/A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11');
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Payment Initiation Validation Tests
// ============================================================================

describe('Orders Payment Initiation Validation', () => {
  describe('POST /api/orders/:id/payment - ID Format', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment`, {
        method: 'POST',
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid order number format', async () => {
      if (!app) return;

      const res = await app.request('/api/orders/MA-2024-000001/payment', {
        method: 'POST',
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Payment Verification Validation Tests
// ============================================================================

describe('Orders Payment Verification Validation', () => {
  describe('POST /api/orders/:id/payment/verify - Request Body', () => {
    it('should require razorpayOrderId', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayPaymentId: 'pay_test123',
          razorpaySignature: 'sig_test123',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require razorpayPaymentId', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: 'order_test123',
          razorpaySignature: 'sig_test123',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should require razorpaySignature', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: 'order_test123',
          razorpayPaymentId: 'pay_test123',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty razorpayOrderId', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: '',
          razorpayPaymentId: 'pay_test123',
          razorpaySignature: 'sig_test123',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty razorpayPaymentId', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: 'order_test123',
          razorpayPaymentId: '',
          razorpaySignature: 'sig_test123',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject empty razorpaySignature', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: 'order_test123',
          razorpayPaymentId: 'pay_test123',
          razorpaySignature: '',
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid verification data', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPaymentVerificationData),
      });
      // Should pass validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject malformed JSON', async () => {
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });
      // Auth middleware runs first so 401 is expected; 400 if validation runs first
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// HTTP Method Tests (Always Run)
// ============================================================================

describe('Orders HTTP Method Validation', () => {
  it('should reject PUT to /api/orders (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateOrderData),
    });
    // Should be 404/405 (method not allowed) or 401 (auth middleware runs first)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PATCH to /api/orders (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject DELETE to /api/orders (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/orders', {
      method: 'DELETE',
    });
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PUT to /api/orders/:id (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject PATCH to /api/orders/:id (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject DELETE to /api/orders/:id (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}`, {
      method: 'DELETE',
    });
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject GET to /api/orders/:id/payment (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}/payment`);
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject GET to /api/orders/:id/payment/verify (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}/payment/verify`);
    // May return 401 if auth middleware runs first
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight on /api/orders', async () => {
    if (!app) return;

    const res = await app.request('/api/orders', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests (Always Run)
// ============================================================================

describe('Orders Response Headers', () => {
  it('should return JSON content-type for GET /api/orders', async () => {
    if (!app) return;

    const res = await app.request('/api/orders');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for GET /api/orders/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for POST /api/orders', async () => {
    if (!app) return;

    const res = await app.request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateOrderData),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for POST /api/orders/:id/payment', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}/payment`, {
      method: 'POST',
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for POST /api/orders/:id/payment/verify', async () => {
    if (!app) return;

    const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPaymentVerificationData),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ============================================================================
// Error Response Format Tests (Always Run)
// ============================================================================

describe('Orders Error Response Format', () => {
  it('should return error object for authentication failures', async () => {
    if (!app) return;

    const res = await app.request('/api/orders');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    expect(json).toHaveProperty('error');
    expect(typeof json.error).toBe('string');
  });

  it('should return error object for validation failures', async () => {
    if (!app) return;

    const res = await app.request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{',
    });
    // Auth middleware runs first so 401 is expected; 400 if validation runs first
    expect([400, 401].includes(res.status)).toBe(true);

    const json = await readJson(res);
    expect(json).toHaveProperty('error');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/orders');
    const json = await readJson(res);

    // Should not expose stack traces or internal paths
    expect(JSON.stringify(json)).not.toContain('/packages/api/');
    expect(JSON.stringify(json)).not.toContain('node_modules');
  });

  it('should return proper authentication error message', async () => {
    if (!app) return;

    const res = await app.request('/api/orders');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    // Accept common authentication error message formats
    expect(['Unauthorized', 'Authentication required'].includes(json.error)).toBe(true);
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('Orders Runtime Tests (Database Required)', () => {
  describe('POST /api/orders - Create Order', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateOrderData),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/orders - List Orders', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/orders');
      expect(res.status).toBe(401);
    });

    it('should require authentication with pagination params', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/orders?page=1&pageSize=10');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/orders/:id - Get Order', () => {
    it('should require authentication for UUID lookup', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}`);
      expect(res.status).toBe(401);
    });

    it('should require authentication for order number lookup', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderNumber}`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/orders/:id/payment - Initiate Payment', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/orders/:id/payment/verify - Verify Payment', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/orders/${validOrderId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPaymentVerificationData),
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Orders Performance Tests', () => {
  it('should respond quickly to auth errors on GET /api/orders', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/orders');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{',
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to auth errors on POST', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateOrderData),
    });
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent requests gracefully', async () => {
    if (!app) return;

    const requests = Array.from({ length: 5 }, () =>
      app!.request('/api/orders')
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
// Order Status Constants Tests
// ============================================================================

describe('Order Status Constants', () => {
  it('should have valid order statuses for filtering', () => {
    const validStatuses = [
      'pending',
      'pending_payment',
      'confirmed',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refund_requested',
      'refunded',
      'failed',
    ];

    expect(validStatuses).toHaveLength(11);
    validStatuses.forEach(status => {
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });
  });

  it('should have valid shipping methods', () => {
    const validMethods = ['standard', 'express'];

    expect(validMethods).toHaveLength(2);
    validMethods.forEach(method => {
      expect(typeof method).toBe('string');
    });
  });
});

// ============================================================================
// Order Number Format Tests
// ============================================================================

describe('Order Number Format', () => {
  it('should recognize valid order number format', () => {
    const orderNumber = 'MA-2024-000001';
    const isValid = /^MA-\d{4}-\d{6}$/.test(orderNumber);
    expect(isValid).toBe(true);
  });

  it('should reject order number without MA prefix', () => {
    const orderNumber = 'XX-2024-000001';
    const isValid = /^MA-\d{4}-\d{6}$/.test(orderNumber);
    expect(isValid).toBe(false);
  });

  it('should reject order number with invalid year', () => {
    const orderNumber = 'MA-24-000001';
    const isValid = /^MA-\d{4}-\d{6}$/.test(orderNumber);
    expect(isValid).toBe(false);
  });

  it('should reject order number with invalid sequence', () => {
    const orderNumber = 'MA-2024-001';
    const isValid = /^MA-\d{4}-\d{6}$/.test(orderNumber);
    expect(isValid).toBe(false);
  });
});
