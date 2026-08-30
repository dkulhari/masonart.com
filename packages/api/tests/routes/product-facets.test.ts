/**
 * Facet counts and the review aggregate.
 *
 * Two things the collection UI needs that the API did not return:
 *
 *  - per-option counts for every facet (analysis §1.3.4 — "Wabi-Sabi Art (788)").
 *    Counting client-side is wrong: the client only holds the current page of 24.
 *  - averageRating / reviewCount on the list, so the card can show a star row.
 *    The reviews tables exist and are populated; the product API returned
 *    nothing from them.
 *
 * NOTE: `db` is mocked here, so these assertions cannot catch a reference to a
 * column that does not exist — that is how `products.isActive` shipped in #387
 * past 17 green tests. The schema-assumption block at the bottom is the guard,
 * and the real queries are exercised against the dev database separately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../setup';

const selectMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  CacheKeys: {
    PRODUCT_LIST: 'products:list:',
    PRODUCT: 'products:',
    PRODUCT_FACETS: 'products:facets:',
  },
  CACHE_TTL_PRODUCTS: 300,
}));

import { productsApp } from '../../src/routes/products';
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/products', productsApp);

/** Queue up successive `db.select(...)` results, in call order. */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'groupBy', 'orderBy', 'limit', 'offset', 'leftJoin', 'innerJoin']) {
      chain[key] = () => chain;
    }
    // Awaiting the builder resolves to the rows.
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/products/facets', () => {
  it('returns counts grouped by facet', async () => {
    queueSelects(
      [{ value: 'wabi-sabi', count: 788 }, { value: 'minimalist', count: 474 }],
      [{ value: 'abstract', count: 2959 }],
      [{ value: 'black', count: 120 }],
      [{ value: 'living-room', count: 300 }],
      [{ value: 'square', count: 18 }]
    );

    const res = await app.request('/api/products/facets');
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.styles).toEqual([
      { value: 'wabi-sabi', count: 788 },
      { value: 'minimalist', count: 474 },
    ]);
    expect(body.subjects[0]).toEqual({ value: 'abstract', count: 2959 });
    expect(body).toHaveProperty('colors');
    expect(body).toHaveProperty('rooms');
    expect(body).toHaveProperty('orientation');
  });

  it('survives a facet with no rows', async () => {
    queueSelects([], [], [], [], []);

    const res = await app.request('/api/products/facets');
    expect(res.status).toBe(200);
    expect((await readJson(res)).styles).toEqual([]);
  });

  it('500s cleanly rather than throwing', async () => {
    selectMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const res = await app.request('/api/products/facets');
    expect(res.status).toBe(500);
  });
});

describe('review aggregate on the product list', () => {
  /**
   * Source-level, deliberately. With `db` mocked, the route returns whatever
   * the mock hands back, so a response-shape assertion passes whether or not
   * the query actually selects the aggregate — it tests the mock, not the
   * route. What can genuinely fail is whether the select names the columns.
   * The values themselves are verified against the dev database.
   */
  const src = readFileSync(
    join(process.cwd(), 'src/routes/products.ts'),
    'utf8'
  );

  it('selects the aggregate in the list query', () => {
    expect(src).toContain('averageRating');
    expect(src).toContain('reviewCount');
  });

  it('aggregates with a join rather than a per-product subquery', () => {
    // A correlated subquery per row is an N+1 in disguise on a 24-card page.
    expect(src).toMatch(/leftJoin|LEFT JOIN/);
  });

  it('counts only approved reviews', () => {
    // Pending and rejected reviews must not move a public rating.
    expect(src).toMatch(/reviews\.status[^\n]*approved|"approved"/);
  });

  it('never fabricates a score for an unreviewed product', () => {
    // No COALESCE(avg, 0) — that renders as "rated 0/5" rather than "unrated".
    expect(src).not.toMatch(/coalesce\([^)]*avg[^)]*,\s*0/i);
  });
});

describe('schema assumptions', () => {
  it('reviews has rating, productId and a status enum', async () => {
    const { reviews } = await import('../../src/database/schema/reviews');
    expect(reviews.rating).toBeDefined();
    expect(reviews.productId).toBeDefined();
    expect(reviews.status).toBeDefined();
  });

  it('products has the four array facet columns', async () => {
    const { products } = await import('../../src/database/schema/products');
    for (const column of ['styles', 'subjects', 'colors', 'rooms'] as const) {
      expect(products[column]).toBeDefined();
    }
    expect(products.orientation).toBeDefined();
  });
});
