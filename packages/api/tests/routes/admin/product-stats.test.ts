/**
 * GET /api/admin/products/stats — the shape of the contract (#602).
 *
 * The dashboard called this endpoint before it existed. Hono matches routes in
 * registration order, so an unregistered `/stats` fell through to
 * `GET /:id` with `id="stats"`, which answered 400 "Invalid product ID
 * format" — and the client turned that into four plausible zeros. The
 * ordering, not just the existence, is the thing worth pinning: registering
 * `/stats` below `/:id` would reintroduce exactly the original bug.
 *
 * The database is mocked here so these assertions run anywhere. The counts
 * themselves are checked against real rows in product-stats-counts.test.ts —
 * a mocked query chain can confirm the handler asks a question, not that
 * Postgres answers it correctly.
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
  purgeProductResponseCache: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { PRODUCT: 'products:', PRODUCT_LIST: 'products:list:' },
}));

import { adminProductsApp } from '../../../src/routes/admin/products';
import { readJson } from '../../helpers/json';

const app = new Hono();
app.route('/api/admin/products', adminProductsApp);

/**
 * Queue the rows each successive `db.select()` chain resolves to.
 *
 * Mirrors product-popularity.test.ts — the chain is thenable so the handler's
 * `await` resolves without a driver.
 */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of [
      'from',
      'where',
      'groupBy',
      'having',
      'orderBy',
      'limit',
      'offset',
      'leftJoin',
      'innerJoin',
    ]) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Every count query the handler makes answers with a single count row.
  queueSelects(
    [{ count: 7 }],
    [{ count: 4 }],
    [{ count: 2 }],
    [{ count: 1 }],
    [{ count: 0 }],
    [{ count: 0 }]
  );
});

describe('GET /api/admin/products/stats', () => {
  it('is not shadowed by GET /:id', async () => {
    // The original bug: "stats" reaching the :id handler, which rejects it as
    // a malformed UUID. Any 400 here means the literal route lost the race.
    const res = await app.request('/api/admin/products/stats');

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).not.toHaveProperty('error');
  });

  it('returns the four counts the dashboard reads', async () => {
    const res = await app.request('/api/admin/products/stats');
    const body = (await readJson(res)) as Record<string, unknown>;

    expect(body).toHaveProperty('totalProducts');
    expect(body).toHaveProperty('activeProducts');
    expect(body).toHaveProperty('lowStockProducts');
    expect(body).toHaveProperty('outOfStockProducts');
  });

  it('returns numbers, not strings — the dashboard renders them raw', async () => {
    const res = await app.request('/api/admin/products/stats');
    const body = (await readJson(res)) as Record<string, unknown>;

    for (const key of [
      'totalProducts',
      'activeProducts',
      'lowStockProducts',
      'outOfStockProducts',
    ]) {
      expect(typeof body[key]).toBe('number');
    }
  });

  it('answers 500 rather than zeros when the query fails', async () => {
    // The failure mode this ticket exists to kill is a wrong number that looks
    // right. A failed stats query must be visibly a failure.
    selectMock.mockImplementation(() => {
      throw new Error('connection terminated');
    });

    const res = await app.request('/api/admin/products/stats');

    expect(res.status).toBe(500);
  });
});
