/**
 * Admin side of the popularity signal.
 *
 * The curator pin and the measurement are deliberately separate: pinning a
 * product lifts it in the Best-selling sort, it does not rewrite what the
 * product actually sold. An admin therefore has to be able to see both at
 * once, or the pin becomes a way to lose track of the truth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../../setup';

const selectMock = vi.fn();

vi.mock('../../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireContentManager: async (_c: unknown, next: () => Promise<void>) => next(),
  optionalAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/redis', () => ({
  deleteCached: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { PRODUCT: 'products:', PRODUCT_LIST: 'products:list:' },
}));

import { adminProductsApp } from '../../../src/routes/admin/products';

const app = new Hono();
app.route('/api/admin/products', adminProductsApp);

let selectedColumns: Record<string, unknown> = {};

function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation((columns?: Record<string, unknown>) => {
    if (columns && typeof columns === 'object') selectedColumns = columns;
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of [
      'from', 'where', 'groupBy', 'orderBy', 'limit', 'offset', 'leftJoin', 'innerJoin',
    ]) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectedColumns = {};
  vi.spyOn(console, 'error').mockImplementation(() => {});
  queueSelects([{ count: 0 }], []);
});

describe('admin product list', () => {
  it('selects units sold', async () => {
    await app.request('/api/admin/products');
    expect(selectedColumns).toHaveProperty('unitsSold');
  });

  it('selects the pin alongside it', async () => {
    // Both, or the admin can pin without seeing what they are overriding.
    await app.request('/api/admin/products');
    expect(selectedColumns).toHaveProperty('isPopular');
    expect(selectedColumns).toHaveProperty('popularOrder');
  });

  it('keeps the featured pair it sits beside', async () => {
    await app.request('/api/admin/products');
    expect(selectedColumns).toHaveProperty('isFeatured');
    expect(selectedColumns).toHaveProperty('featuredOrder');
  });
});

describe('writable popularity fields', () => {
  it('accepts isPopular and popularOrder on update', async () => {
    queueSelects([{ id: '11111111-1111-1111-1111-111111111111' }]);

    const res = await app.request(
      '/api/admin/products/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isPopular: true, popularOrder: 1 }),
      }
    );

    expect(res.status).not.toBe(400);
  });

  it('rejects a non-integer popularOrder', async () => {
    const res = await app.request(
      '/api/admin/products/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ popularOrder: 'first' }),
      }
    );

    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean isPopular', async () => {
    const res = await app.request(
      '/api/admin/products/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isPopular: 'yes' }),
      }
    );

    expect(res.status).toBe(400);
  });

  it('accepts a null popularOrder — unpinning is not the same as rank zero', async () => {
    queueSelects([{ id: '11111111-1111-1111-1111-111111111111' }]);

    const res = await app.request(
      '/api/admin/products/11111111-1111-1111-1111-111111111111',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ popularOrder: null }),
      }
    );

    expect(res.status).not.toBe(400);
  });
});
