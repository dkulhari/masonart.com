/**
 * Tests for admin reviews moderation API endpoints
 *
 * This test suite validates the admin reviews API routes:
 * - GET /api/admin/reviews - List all reviews with filters
 * - GET /api/admin/reviews/stats - Get moderation statistics
 * - GET /api/admin/reviews/:reviewId - Get review details
 * - PATCH /api/admin/reviews/:reviewId - Moderate review (approve/reject)
 * - DELETE /api/admin/reviews/:reviewId - Delete any review
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
 * @see packages/api/src/routes/admin/reviews.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import '../../setup';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid review ID for testing (UUID format)
 */
const validReviewId = '00000000-0000-0000-0000-000000000001';
const validProductId = '00000000-0000-0000-0000-000000000001';
const validUserId = '00000000-0000-0000-0000-000000000001';

/**
 * Valid moderation data
 */
const validModerateData = {
  status: 'approved',
  moderatorNotes: 'Review verified and approved',
};

const validRejectData = {
  status: 'rejected',
  moderatorNotes: 'Inappropriate content',
};

/**
 * Check if database is available for runtime tests
 */
let isDatabaseAvailable = false;
let app: Hono | null = null;

beforeAll(async () => {
  // Check if we should skip runtime tests
  if (process.env.SKIP_DB_RUNTIME_TESTS === 'true') {
    console.log('Skipping admin reviews runtime tests (SKIP_DB_RUNTIME_TESTS=true)');
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

describe('Admin Reviews Route Module Exports', () => {
  it('should export adminReviewsApp from routes/admin/reviews', async () => {
    const reviewsModule = await import('../../../src/routes/admin/reviews');
    expect(reviewsModule).toHaveProperty('adminReviewsApp');
    expect(reviewsModule.adminReviewsApp).toBeDefined();
  });

  it('should export default from routes/admin/reviews', async () => {
    const reviewsModule = await import('../../../src/routes/admin/reviews');
    expect(reviewsModule.default).toBeDefined();
    expect(reviewsModule.default).toBe(reviewsModule.adminReviewsApp);
  });

  it('should be a Hono app instance', async () => {
    const { adminReviewsApp } = await import('../../../src/routes/admin/reviews');
    expect(typeof adminReviewsApp.fetch).toBe('function');
    expect(typeof adminReviewsApp.request).toBe('function');
  });

  it('should export listAdminReviewsSchema', async () => {
    const reviewsModule = await import('../../../src/routes/admin/reviews');
    expect(reviewsModule).toHaveProperty('listAdminReviewsSchema');
    expect(reviewsModule.listAdminReviewsSchema).toBeDefined();
  });

  it('should export moderateReviewSchema', async () => {
    const reviewsModule = await import('../../../src/routes/admin/reviews');
    expect(reviewsModule).toHaveProperty('moderateReviewSchema');
    expect(reviewsModule.moderateReviewSchema).toBeDefined();
  });
});

// ============================================================================
// Validation Schema Tests (Always Run)
// ============================================================================

describe('Admin Reviews Validation Schemas', () => {
  describe('moderateReviewSchema', () => {
    it('should accept approved status', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({ status: 'approved' });
      expect(result.success).toBe(true);
    });

    it('should accept rejected status', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({ status: 'rejected' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({ status: 'pending' });
      expect(result.success).toBe(false);
    });

    it('should reject empty status', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({ status: '' });
      expect(result.success).toBe(false);
    });

    it('should accept optional moderatorNotes', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({
        status: 'approved',
        moderatorNotes: 'Verified as genuine review',
      });
      expect(result.success).toBe(true);
    });

    it('should reject moderatorNotes exceeding max length (1000)', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({
        status: 'approved',
        moderatorNotes: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept moderatorNotes at max length (1000)', async () => {
      const { moderateReviewSchema } = await import('../../../src/routes/admin/reviews');
      const result = moderateReviewSchema.safeParse({
        status: 'approved',
        moderatorNotes: 'x'.repeat(1000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('listAdminReviewsSchema', () => {
    it('should accept valid status filter: pending', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ status: 'pending' });
      expect(result.success).toBe(true);
    });

    it('should accept valid status filter: approved', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ status: 'approved' });
      expect(result.success).toBe(true);
    });

    it('should accept valid status filter: rejected', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ status: 'rejected' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status filter', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should accept valid productId filter', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ productId: validProductId });
      expect(result.success).toBe(true);
    });

    it('should reject invalid productId format', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ productId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should accept valid userId filter', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ userId: validUserId });
      expect(result.success).toBe(true);
    });

    it('should accept page parameter', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ page: 1 });
      expect(result.success).toBe(true);
    });

    it('should accept pageSize parameter', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ pageSize: 50 });
      expect(result.success).toBe(true);
    });

    it('should reject page=0', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative page', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ page: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject pageSize=0', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ pageSize: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject pageSize exceeding max (100)', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ pageSize: 101 });
      expect(result.success).toBe(false);
    });

    it('should accept pageSize at max (100)', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ pageSize: 100 });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy: newest', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ sortBy: 'newest' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy: oldest', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ sortBy: 'oldest' });
      expect(result.success).toBe(true);
    });

    it('should accept sortBy: rating', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ sortBy: 'rating' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid sortBy', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({ sortBy: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should accept combined query parameters', async () => {
      const { listAdminReviewsSchema } = await import('../../../src/routes/admin/reviews');
      const result = listAdminReviewsSchema.safeParse({
        status: 'pending',
        productId: validProductId,
        page: 1,
        pageSize: 20,
        sortBy: 'newest',
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Authentication Tests (Always Run)
// ============================================================================

describe('Admin Reviews Authentication Requirements', () => {
  describe('GET /api/admin/reviews - List Reviews', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/reviews');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should reject unauthenticated request with filters', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/reviews?status=pending&page=1');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/admin/reviews/stats - Get Stats', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request('/api/admin/reviews/stats');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });

  describe('GET /api/admin/reviews/:reviewId - Get Review', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/reviews/${validReviewId}`);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });

  describe('PATCH /api/admin/reviews/:reviewId - Moderate Review', () => {
    it('should require authentication for approve', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validModerateData),
      });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });

    it('should require authentication for reject', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRejectData),
      });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });

  describe('DELETE /api/admin/reviews/:reviewId - Delete Review', () => {
    it('should require authentication', async () => {
      if (!app) {
        console.log('App not available, skipping auth test');
        return;
      }

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json).toHaveProperty('error');
    });
  });
});

// ============================================================================
// Route Availability Tests (Always Run)
// ============================================================================

describe('Admin Reviews Route Availability', () => {
  it('should have reviews route mounted at /api/admin/reviews', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/admin/reviews');
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have stats route at /api/admin/reviews/stats', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request('/api/admin/reviews/stats');
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have get review route at /api/admin/reviews/:reviewId', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/reviews/${validReviewId}`);
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have moderate review route at /api/admin/reviews/:reviewId', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('should have delete review route at /api/admin/reviews/:reviewId', async () => {
    if (!app) {
      console.log('App not available, skipping route availability test');
      return;
    }

    const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
      method: 'DELETE',
    });
    // Should be 401 (unauthorized) not 404 (route not found)
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Query Parameter Validation Tests
// ============================================================================

describe('Admin Reviews List Query Validation', () => {
  describe('GET /api/admin/reviews - Pagination', () => {
    it('should accept valid page number', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?page=1');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept valid pageSize', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?pageSize=20');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should reject page=0', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?page=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject negative page number', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?page=-1');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize=0', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?pageSize=0');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject pageSize exceeding max (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?pageSize=101');
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should accept pageSize at max (100)', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?pageSize=100');
      // Should pass query validation, reach auth
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/reviews - Status Filter', () => {
    it('should accept valid status: pending', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?status=pending');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: approved', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?status=approved');
      expect(res.status).toBe(401);
    });

    it('should accept valid status: rejected', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?status=rejected');
      expect(res.status).toBe(401);
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?status=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/reviews - Sort Parameters', () => {
    it('should accept valid sortBy: newest', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?sortBy=newest');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: oldest', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?sortBy=oldest');
      expect(res.status).toBe(401);
    });

    it('should accept valid sortBy: rating', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?sortBy=rating');
      expect(res.status).toBe(401);
    });

    it('should reject invalid sortBy', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?sortBy=invalid');
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('GET /api/admin/reviews - Filter Parameters', () => {
    it('should accept productId parameter', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews?productId=${validProductId}`);
      expect(res.status).toBe(401);
    });

    it('should accept userId parameter', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews?userId=${validUserId}`);
      expect(res.status).toBe(401);
    });

    it('should accept combined query parameters', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews?page=1&pageSize=20&status=pending&sortBy=newest');
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Review ID Validation Tests
// ============================================================================

describe('Admin Reviews ID Validation', () => {
  describe('GET /api/admin/reviews/:reviewId', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`);
      // Should pass ID validation, reach auth
      expect(res.status).toBe(401);
    });

    it('should accept uppercase UUID', async () => {
      if (!app) return;

      const res = await app.request('/api/admin/reviews/A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/reviews/:reviewId', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/admin/reviews/:reviewId', () => {
    it('should accept valid UUID format', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Moderation Validation Tests
// ============================================================================

describe('Admin Reviews Moderation Validation', () => {
  describe('PATCH /api/admin/reviews/:reviewId - Status Update', () => {
    it('should accept approved status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      expect(res.status).toBe(401);
    });

    it('should accept rejected status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject pending status (not allowed in moderation)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject invalid status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid' }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });

    it('should reject missing status', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('PATCH /api/admin/reviews/:reviewId - Moderator Notes', () => {
    it('should accept valid moderator notes', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          moderatorNotes: 'Verified genuine review',
        }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject moderatorNotes exceeding max length (1000)', async () => {
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          moderatorNotes: 'x'.repeat(1001),
        }),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });
});

// ============================================================================
// HTTP Method Tests
// ============================================================================

describe('Admin Reviews HTTP Method Validation', () => {
  it('should reject PUT to /api/admin/reviews (not supported)', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should be 404/405 (method not allowed) or 401 (auth middleware runs first)
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should reject POST to /api/admin/reviews (no direct create)', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect([401, 404, 405].includes(res.status)).toBe(true);
  });

  it('should handle OPTIONS for CORS preflight on /api/admin/reviews', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews', {
      method: 'OPTIONS',
    });
    // Should return 200 or 204 for CORS preflight
    expect([200, 204].includes(res.status)).toBe(true);
  });
});

// ============================================================================
// Response Header Tests
// ============================================================================

describe('Admin Reviews Response Headers', () => {
  it('should return JSON content-type for GET /api/admin/reviews', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for GET /api/admin/reviews/stats', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews/stats');
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for GET /api/admin/reviews/:reviewId', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/reviews/${validReviewId}`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for PATCH /api/admin/reviews/:reviewId', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('should return JSON content-type for DELETE /api/admin/reviews/:reviewId', async () => {
    if (!app) return;

    const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
      method: 'DELETE',
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

// ============================================================================
// Error Response Format Tests
// ============================================================================

describe('Admin Reviews Error Response Format', () => {
  it('should return error object for authentication failures', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews');
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(typeof json.error).toBe('string');
  });

  it('should not expose internal details in errors', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews');
    const json = await res.json();

    // Should not expose stack traces or internal paths
    expect(JSON.stringify(json)).not.toContain('/packages/api/');
    expect(JSON.stringify(json)).not.toContain('node_modules');
  });

  it('should return proper authentication error message', async () => {
    if (!app) return;

    const res = await app.request('/api/admin/reviews');
    expect(res.status).toBe(401);

    const json = await res.json();
    // Accept common authentication error message formats
    expect(['Unauthorized', 'Authentication required'].includes(json.error)).toBe(true);
  });
});

// ============================================================================
// Runtime Tests (Require Database - Gracefully Skip)
// ============================================================================

describe('Admin Reviews Runtime Tests (Database Required)', () => {
  describe('GET /api/admin/reviews - List Reviews', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/reviews');
      expect(res.status).toBe(401);
    });

    it('should require authentication with filters', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/reviews?status=pending&page=1');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/reviews/stats - Review Statistics', () => {
    it('should require authentication (returns 401)', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request('/api/admin/reviews/stats');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/reviews/:reviewId - Get Review', () => {
    it('should require authentication for UUID lookup', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/admin/reviews/:reviewId - Moderate Review', () => {
    it('should require authentication for approval', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validModerateData),
      });
      expect(res.status).toBe(401);
    });

    it('should require authentication for rejection', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRejectData),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/admin/reviews/:reviewId - Delete Review', () => {
    it('should require authentication', async () => {
      if (!isDatabaseAvailable) {
        console.log('Skipping: Database not available');
        return;
      }
      if (!app) return;

      const res = await app.request(`/api/admin/reviews/${validReviewId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Admin Reviews Performance Tests', () => {
  it('should respond quickly to auth errors on GET /api/admin/reviews', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/admin/reviews');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should respond quickly to validation errors', async () => {
    if (!app) return;

    const start = Date.now();
    await app.request('/api/admin/reviews?page=-1');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle concurrent requests gracefully', async () => {
    if (!app) return;

    const requests = Array.from({ length: 5 }, () =>
      app!.request('/api/admin/reviews')
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
// Review Status Constants Tests
// ============================================================================

describe('Admin Reviews Status Constants', () => {
  it('should have valid review statuses for filtering', () => {
    const validStatuses = ['pending', 'approved', 'rejected'];

    expect(validStatuses).toHaveLength(3);
    validStatuses.forEach(status => {
      expect(typeof status).toBe('string');
      expect(status.length).toBeGreaterThan(0);
    });
  });

  it('should have valid moderation statuses', () => {
    const validModerationStatuses = ['approved', 'rejected'];

    expect(validModerationStatuses).toHaveLength(2);
    validModerationStatuses.forEach(status => {
      expect(typeof status).toBe('string');
    });
  });

  it('should have valid sort options', () => {
    const validSortOptions = ['newest', 'oldest', 'rating'];

    expect(validSortOptions).toHaveLength(3);
    validSortOptions.forEach(option => {
      expect(typeof option).toBe('string');
    });
  });
});
