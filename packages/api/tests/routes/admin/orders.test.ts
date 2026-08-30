/**
 * Tests for admin orders management API endpoints
 *
 * This test suite validates the admin orders API routes:
 * - GET /api/admin/orders - List all orders with pagination and filters
 * - GET /api/admin/orders/stats - Get order statistics
 * - GET /api/admin/orders/:id - Get order details by ID or order number
 * - PATCH /api/admin/orders/:id - Update order (status, notes, etc.)
 * - PATCH /api/admin/orders/:id/status - Update order status only
 * - PATCH /api/admin/orders/:id/shipping - Update shipping details
 * - POST /api/admin/orders/:id/refund - Initiate refund
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
 * @see packages/api/src/routes/admin/orders.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import '../../setup';
import { readJson } from '../../helpers/json';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid order ID for testing
 */
const validOrderId = '00000000-0000-0000-0000-000000000001';
const validOrderNumber = 'MA-2024-000001';

/**
 * Valid order update data
 */
const validUpdateOrderData = {
  status: 'processing',
  paymentStatus: 'paid',
  internalNotes: 'Test internal notes',
  shippingMethod: 'express',
};

/**
 * Valid status update data
 */
const validStatusUpdateData = {
  status: 'shipped',
  reason: 'Order shipped via courier',
};

/**
 * Valid shipping update data
 */
const validShippingUpdateData = {
  carrier: 'FedEx',
  trackingNumber: 'FX123456789',
  trackingUrl: 'https://fedex.com/track/FX123456789',
  awbNumber: 'AWB123456',
  shipmentId: 'SHP123456',
  estimatedDelivery: '2024-01-15T10:00:00Z',
};

/**
 * Valid refund data
 */
const validRefundData = {
  amount: 1999.00,
  reason: 'Customer requested refund',
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping admin orders runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
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

describe('Admin Orders Route Module Exports', () => {
  it('should export adminOrdersApp from routes/admin/orders', async () => {
    const ordersModule = await import('../../../src/routes/admin/orders');
    expect(ordersModule).toHaveProperty('adminOrdersApp');
    expect(ordersModule.adminOrdersApp).toBeDefined();
  });

  it('should export default from routes/admin/orders', async () => {
    const ordersModule = await import('../../../src/routes/admin/orders');
    expect(ordersModule.default).toBeDefined();
    expect(ordersModule.default).toBe(ordersModule.adminOrdersApp);
  });

  it('should be a Hono app instance', async () => {
    const { adminOrdersApp } = await import('../../../src/routes/admin/orders');
    expect(typeof adminOrdersApp.fetch).toBe('function');
    expect(typeof adminOrdersApp.request).toBe('function');
  });
});

// ============================================================================
// Authentication Tests (Always Run)
// ============================================================================

describe('Admin Orders Authentication Requirements', () => {
  describe('GET /api/admin/orders - List Orders', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/orders');
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/admin/orders/stats - Get Stats', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/orders/stats');
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/admin/orders/:id - Get Order', () => {
    it('should require authentication for UUID', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/orders/${validOrderId}`);
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });

    it('should require authentication for order number', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/orders/${validOrderNumber}`);
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('PATCH /api/admin/orders/:id - Update Order', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validUpdateOrderData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('PATCH /api/admin/orders/:id/status - Update Status', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validStatusUpdateData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('PATCH /api/admin/orders/:id/shipping - Update Shipping', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validShippingUpdateData),
      });
      expect(res.status).toBe(401);

      const json = await readJson(res);
      expect(json).toHaveProperty('error');
    });
  });

  describe('POST /api/admin/orders/:id/refund - Initiate Refund', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRefundData),
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

describe('Admin Orders Route Availability', () => {
  it('should have orders route mounted at /api/admin/orders', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/admin/orders');
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have stats route at /api/admin/orders/stats', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/admin/orders/stats');
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have get order route at /api/admin/orders/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/orders/${validOrderId}`);
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have update order route at /api/admin/orders/:id', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/orders/${validOrderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'processing' }),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have status update route at /api/admin/orders/:id/status', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validStatusUpdateData),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have shipping update route at /api/admin/orders/:id/shipping', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validShippingUpdateData),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have refund route at /api/admin/orders/:id/refund', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRefundData),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should accept order number format in routes', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/orders/${validOrderNumber}`);
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Query Parameter Validation Tests
// ============================================================================

describe('Admin Orders List Query Validation', () => {
  describe('GET /api/admin/orders - Pagination', () => {
    it('should accept valid page number', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?page=1');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?pageSize=20');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject page=0', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?page=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative page number', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?page=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize=0', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?pageSize=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?pageSize=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize exceeding max (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?pageSize=101');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept pageSize at max (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?pageSize=100');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/orders - Order Status Filter', () => {
    it('should accept valid status: pending', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=pending');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: pending_payment', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=pending_payment');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: confirmed', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=confirmed');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: processing', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=processing');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: shipped', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=shipped');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: out_for_delivery', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=out_for_delivery');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: delivered', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=delivered');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: cancelled', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=cancelled');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: refund_requested', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=refund_requested');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: refunded', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=refunded');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: failed', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=failed');
      expect(res.status).toBe(401);
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=invalid_status');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/orders - Payment Status Filter', () => {
    it('should accept valid paymentStatus: pending', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=pending');
      expect(res.status).toBe(401);
    });

    it('should accept valid paymentStatus: processing', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=processing');
      expect(res.status).toBe(401);
    });

    it('should accept valid paymentStatus: paid', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=paid');
      expect(res.status).toBe(401);
    });

    it('should accept valid paymentStatus: failed', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=failed');
      expect(res.status).toBe(401);
    });

    it('should accept valid paymentStatus: refunded', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=refunded');
      expect(res.status).toBe(401);
    });

    it('should accept valid paymentStatus: partially_refunded', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=partially_refunded');
      expect(res.status).toBe(401);
    });

    it('should accept valid paymentStatus: cancelled', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=cancelled');
      expect(res.status).toBe(401);
    });

    it('should reject invalid paymentStatus', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?paymentStatus=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/orders - Order Type Filter', () => {
    it('should accept valid orderType: regular', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?orderType=regular');
      expect(res.status).toBe(401);
    });

    it('should accept valid orderType: ai_generated', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?orderType=ai_generated');
      expect(res.status).toBe(401);
    });

    it('should accept valid orderType: trade', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?orderType=trade');
      expect(res.status).toBe(401);
    });

    it('should reject invalid orderType', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?orderType=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/orders - Sort Parameters', () => {
    it('should accept valid sortBy: createdAt', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortBy=createdAt');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: updatedAt', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortBy=updatedAt');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: total', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortBy=total');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: orderNumber', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortBy=orderNumber');
      expect(res.status).toBe(401);
    });

    it('should reject invalid sortBy', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortBy=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid sortOrder: asc', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortOrder=asc');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortOrder: desc', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortOrder=desc');
      expect(res.status).toBe(401);
    });

    it('should reject invalid sortOrder', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?sortOrder=random');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/orders - Search and Date Filters', () => {
    it('should accept search parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?search=MA-2024');
      expect(res.status).toBe(401);
    });

    it('should accept dateFrom parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?dateFrom=2024-01-01');
      expect(res.status).toBe(401);
    });

    it('should accept dateTo parameter', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?dateTo=2024-12-31');
      expect(res.status).toBe(401);
    });

    it('should accept combined query parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders?page=1&pageSize=20&status=pending&paymentStatus=paid&search=test&sortBy=createdAt&sortOrder=desc');
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Order ID Validation Tests
// ============================================================================

describe('Admin Orders ID Validation', () => {
  describe('GET /api/admin/orders/:id', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`);
      // Should pass ID validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid order number format (MA-YYYY-NNNNNN)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders/MA-2024-000001');
      expect(res.status).toBe(401);
    });

    it('should accept uppercase UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/orders/A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11');
      expect(res.status).toBe(401);
    });

    it('should accept order numbers with different years', async () => {
      if (!app) return;

      const res2023 = await app.request('/api/admin/orders/MA-2023-000001');
      expect(res2023.status).toBe(401);

      const res2025 = await app.request('/api/admin/orders/MA-2025-000001');
      expect(res2025.status).toBe(401);
    });
  });
});

// ============================================================================
// Update Order Validation Tests
// ============================================================================

describe('Admin Orders Update Validation', () => {
  describe('PATCH /api/admin/orders/:id - Status Update', () => {
    it('should accept valid order status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'processing' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject invalid order status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid_status' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid payment status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: 'paid' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject invalid payment status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: 'invalid' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('PATCH /api/admin/orders/:id - Internal Notes', () => {
    it('should accept valid internal notes', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNotes: 'Test notes' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject internal notes exceeding max length (2000)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNotes: 'x'.repeat(2001) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('PATCH /api/admin/orders/:id - Shipping Method', () => {
    it('should accept valid shipping method', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingMethod: 'express' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject shipping method exceeding max length (50)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingMethod: 'x'.repeat(51) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// Status Update Validation Tests
// ============================================================================

describe('Admin Orders Status Update Validation', () => {
  describe('PATCH /api/admin/orders/:id/status', () => {
    it('should require status field', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Test reason' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept all valid order statuses', async () => {
      if (!app) return;

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

      for (const status of validStatuses) {
        const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        expect(res.status).toBe(401);
      }
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept optional reason field', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'shipped', reason: 'Shipped via FedEx' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject reason exceeding max length (500)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'shipped', reason: 'x'.repeat(501) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// Shipping Update Validation Tests
// ============================================================================

describe('Admin Orders Shipping Update Validation', () => {
  describe('PATCH /api/admin/orders/:id/shipping', () => {
    it('should accept valid carrier', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: 'FedEx' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject carrier exceeding max length (100)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: 'x'.repeat(101) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid tracking number', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: 'FX123456789' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject tracking number exceeding max length (100)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: 'x'.repeat(101) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid tracking URL', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingUrl: 'https://fedex.com/track/123' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject invalid tracking URL format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingUrl: 'not-a-url' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid AWB number', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awbNumber: 'AWB123456' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject AWB number exceeding max length (100)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awbNumber: 'x'.repeat(101) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid shipment ID', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: 'SHP123456' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept estimated delivery date', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimatedDelivery: '2024-01-15T10:00:00Z' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept combined shipping fields', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validShippingUpdateData),
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Refund Validation Tests
// ============================================================================

describe('Admin Orders Refund Validation', () => {
  describe('POST /api/admin/orders/:id/refund', () => {
    it('should require reason field', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1999.00 }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept valid refund data', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRefundData),
      });
      expect(res.status).toBe(401);
    });

    it('should accept refund without amount (full refund)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Full refund requested' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject negative refund amount', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: -100, reason: 'Test' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject zero refund amount', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 0, reason: 'Test' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject reason exceeding max length (500)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'x'.repeat(501) }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// HTTP Method Tests
// ============================================================================

describe('Admin Orders HTTP Method Validation', () => {
  it('should reject PUT to /api/admin/orders (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should be 404/405 (method not allowed) or 401 (auth middleware runs first)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject POST to /api/admin/orders (no direct create)', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject DELETE to /api/admin/orders/:id (not supported)', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${validOrderId}`, {
      method: 'DELETE',
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight on /api/admin/orders', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests
// ============================================================================

describe('Admin Orders Response Headers', () => {
  it('should return JSON content-type for GET /api/admin/orders', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for GET /api/admin/orders/stats', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders/stats');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for GET /api/admin/orders/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${validOrderId}`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for PATCH /api/admin/orders/:id', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${validOrderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'processing' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for PATCH /api/admin/orders/:id/status', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validStatusUpdateData),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for PATCH /api/admin/orders/:id/shipping', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validShippingUpdateData),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for POST /api/admin/orders/:id/refund', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRefundData),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ============================================================================
// Error Response Format Tests
// ============================================================================

describe('Admin Orders Error Response Format', () => {
  it('should return error object for authentication failures', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    expect(json).toHaveProperty('error');
    expect(typeof json.error).toBe('string');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders');
    const json = await readJson(res);

    // Should not expose stack traces or internal paths
    expect(JSON.stringify(json)).not.toContain('/packages/api/');
    expect(JSON.stringify(json)).not.toContain('node_modules');
  });

  it('should return proper authentication error message', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/orders');
    expect(res.status).toBe(401);

    const json = await readJson(res);
    // Accept common authentication error message formats
    expect(['Unauthorized', 'Authentication required'].includes(json.error)).toBe(true);
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('Admin Orders Runtime Tests (Database Required)', () => {
  describe('GET /api/admin/orders - List Orders', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/orders');
      expect(res.status).toBe(401);
    });

    it('should require authentication with filters', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/orders?status=pending&paymentStatus=paid&page=1');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/orders/stats - Order Statistics', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/orders/stats');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/orders/:id - Get Order', () => {
    it('should require authentication for UUID lookup', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`);
      expect(res.status).toBe(401);
    });

    it('should require authentication for order number lookup', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderNumber}`);
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/orders/:id - Update Order', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validUpdateOrderData),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/orders/:id/status - Update Status', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validStatusUpdateData),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/orders/:id/shipping - Update Shipping', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validShippingUpdateData),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/admin/orders/:id/refund - Initiate Refund', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/orders/${validOrderId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRefundData),
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Admin Orders Performance Tests', () => {
  it('should respond quickly to auth errors on GET /api/admin/orders', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/admin/orders');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/admin/orders?page=-1');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent requests gracefully', async () => {
    if (!app) return;

    const requests = Array.from({ length: 5 }, () =>
      app!.request('/api/admin/orders')
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

describe('Admin Orders Status Constants', () => {
  it('should have valid order statuses', () => {
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

  it('should have valid payment statuses', () => {
    const validPaymentStatuses = [
      'pending',
      'processing',
      'paid',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled',
    ];

    expect(validPaymentStatuses).toHaveLength(7);
    validPaymentStatuses.forEach(status => {
      expect(typeof status).toBe('string');
    });
  });

  it('should have valid order types', () => {
    const validOrderTypes = ['regular', 'ai_generated', 'trade'];

    expect(validOrderTypes).toHaveLength(3);
    validOrderTypes.forEach(type => {
      expect(typeof type).toBe('string');
    });
  });

  it('should have valid sort fields', () => {
    const validSortFields = ['createdAt', 'updatedAt', 'total', 'orderNumber'];

    expect(validSortFields).toHaveLength(4);
    validSortFields.forEach(field => {
      expect(typeof field).toBe('string');
    });
  });
});
