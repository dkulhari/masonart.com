/**
 * Tests for Wishlist API Routes
 *
 * - GET    /api/wishlist        — saved products, hydrated
 * - GET    /api/wishlist/count  — just the number, for the header badge
 * - POST   /api/wishlist/:productId
 * - DELETE /api/wishlist/:productId
 *
 * All require authentication.
 *
 * Note on the harness: this imports the route module DIRECTLY rather than
 * through the try/catch-into-null pattern some sibling suites use. That
 * pattern makes every assertion pass vacuously when the module fails to load,
 * which is exactly the case a new route's first test run is in.
 *
 * @see packages/api/src/routes/wishlist.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
    },
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const authUser = c.req.header('X-Test-User');
    if (authUser) {
      c.set('user', JSON.parse(authUser));
      return next();
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }),
}));

import { db } from '../../src/database';
import { wishlistApp } from '../../src/routes/wishlist';

const app = new Hono();
app.route('/api/wishlist', wishlistApp);

// ============================================================================
// Fixtures
// ============================================================================

const USER = { id: 'user-123', email: 'user@example.com', name: 'Test User' };
const AUTH = { 'X-Test-User': JSON.stringify(USER) };

const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';
/** Saved by the user, but no longer in the catalogue. */
const DANGLING = '33333333-3333-4333-8333-333333333333';

const productRow = (id: string, title: string) => ({
  id,
  sku: `SKU-${title}`,
  title,
  slug: title.toLowerCase(),
  basePrice: '999.00',
  images: [],
  orientation: 'square',
  styles: [],
  isFeatured: false,
  isAiGenerated: false,
});

/** Stub `db.query.users.findFirst` with a given wishlist column value. */
function givenWishlistColumn(ids: string[] | null) {
  (db.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: USER.id,
    wishlistProductIds: ids,
  });
}

/** Stub the product join to return exactly these rows. */
function givenCatalogueReturns(rows: unknown[]) {
  selectMock.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  updateMock.mockReturnValue({
    set: () => ({ where: () => Promise.resolve(undefined) }),
  });
});

// ============================================================================
// Schema columns the route depends on
// ============================================================================

describe('schema assumptions', () => {
  /**
   * `db` is mocked in every test below, so a reference to a column that does
   * not exist executes nowhere and every assertion still passes. That is how
   * `products.isActive` got written here — the products table has `status`;
   * only `product_variants` and `frames` have `isActive`.
   *
   * These four lines are the entire defence against that recurring.
   */
  it('products has status, not isActive', async () => {
    const { products } = await import('../../src/database/schema/products');
    expect(products.status).toBeDefined();
    expect(
      (products as unknown as Record<string, unknown>).isActive
    ).toBeUndefined();
  });

  it('users carries the wishlist array column', async () => {
    const { users } = await import('../../src/database/schema/users');
    expect(users.wishlistProductIds).toBeDefined();
  });
});

// ============================================================================
// Auth
// ============================================================================

describe('authentication', () => {
  const cases: Array<[string, string]> = [
    ['GET', '/api/wishlist'],
    ['GET', '/api/wishlist/count'],
    ['POST', `/api/wishlist/${PRODUCT_A}`],
    ['DELETE', `/api/wishlist/${PRODUCT_A}`],
  ];

  for (const [method, path] of cases) {
    it(`${method} ${path} is 401 without a session`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

// ============================================================================
// GET /api/wishlist
// ============================================================================

describe('GET /api/wishlist', () => {
  it('returns the saved products hydrated', async () => {
    givenWishlistColumn([PRODUCT_A, PRODUCT_B]);
    givenCatalogueReturns([
      productRow(PRODUCT_A, 'Alpha'),
      productRow(PRODUCT_B, 'Beta'),
    ]);

    const res = await app.request('/api/wishlist', { headers: AUTH });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items.map((p: { title: string }) => p.title)).toEqual([
      'Alpha',
      'Beta',
    ]);
  });

  it('returns an empty list when the column is null', async () => {
    // Rows predating the column have null rather than the [] default.
    givenWishlistColumn(null);

    const res = await app.request('/api/wishlist', { headers: AUTH });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it('does not query the catalogue at all when nothing is saved', async () => {
    givenWishlistColumn([]);

    const res = await app.request('/api/wishlist', { headers: AUTH });
    expect(res.status).toBe(200);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('drops ids whose product has left the catalogue', async () => {
    // There is no FK on the array column, so a deleted product leaves a
    // dangling id in every wishlist that held it. That must not 404 the
    // whole request.
    givenWishlistColumn([PRODUCT_A, DANGLING]);
    givenCatalogueReturns([productRow(PRODUCT_A, 'Alpha')]);

    const res = await app.request('/api/wishlist', { headers: AUTH });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(PRODUCT_A);
  });
});

// ============================================================================
// GET /api/wishlist/count
// ============================================================================

describe('GET /api/wishlist/count', () => {
  it('returns the number of saved products', async () => {
    givenWishlistColumn([PRODUCT_A, PRODUCT_B]);
    selectMock.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ count: 2 }]) }),
    });

    const res = await app.request('/api/wishlist/count', { headers: AUTH });
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(2);
  });

  it('counts live products, not raw array entries', async () => {
    // Otherwise the header badge says 2 and the list shows 1.
    givenWishlistColumn([PRODUCT_A, DANGLING]);
    selectMock.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ count: 1 }]) }),
    });

    const res = await app.request('/api/wishlist/count', { headers: AUTH });
    expect((await res.json()).count).toBe(1);
  });

  it('is 0 when the column is null', async () => {
    givenWishlistColumn(null);

    const res = await app.request('/api/wishlist/count', { headers: AUTH });
    expect((await res.json()).count).toBe(0);
    expect(selectMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// POST /api/wishlist/:productId
// ============================================================================

describe('POST /api/wishlist/:productId', () => {
  it('adds the product', async () => {
    givenWishlistColumn([]);

    const res = await app.request(`/api/wishlist/${PRODUCT_A}`, {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });

  it('is idempotent — adding twice is not an error', async () => {
    // The UI is an optimistic toggle; a double-click must not 409 or produce
    // a duplicate array entry.
    givenWishlistColumn([PRODUCT_A]);

    const res = await app.request(`/api/wishlist/${PRODUCT_A}`, {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(true);
  });

  it('rejects a non-uuid id', async () => {
    // No FK protects this column — an unvalidated id poisons it permanently.
    givenWishlistColumn([]);

    const res = await app.request('/api/wishlist/not-a-uuid', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// DELETE /api/wishlist/:productId
// ============================================================================

describe('DELETE /api/wishlist/:productId', () => {
  it('removes the product', async () => {
    givenWishlistColumn([PRODUCT_A, PRODUCT_B]);

    const res = await app.request(`/api/wishlist/${PRODUCT_A}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(false);
    expect(updateMock).toHaveBeenCalled();
  });

  it('is idempotent — removing something absent is not an error', async () => {
    givenWishlistColumn([]);

    const res = await app.request(`/api/wishlist/${PRODUCT_B}`, {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(false);
  });

  it('rejects a non-uuid id', async () => {
    givenWishlistColumn([]);

    const res = await app.request('/api/wishlist/not-a-uuid', {
      method: 'DELETE',
      headers: AUTH,
    });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
