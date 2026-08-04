/**
 * GET /api/reviews/stats — the catalogue-wide review aggregate.
 *
 * The existing stats route is per-product and mounted under
 * /api/products/:productId/reviews. The collection-grid promo tile (§1.3.6)
 * needs the figure for the whole catalogue and there was no endpoint for it.
 *
 * mesonart's tile reads "Rated 4.9/5 by 9,000+ Users". Ours reads whatever is
 * true, or the tile does not render. A synthetic 0.0 average is the case this
 * suite exists to prevent: it renders as "rated badly" rather than "not yet
 * rated", which is the fabricated-social-proof problem the parity analysis
 * rules out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

const selectMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCachedPattern: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { PRODUCT: 'products:' },
}));

vi.mock('../../src/middleware/auth', () => ({
  optionalAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { reviewsApp } from '../../src/routes/reviews';

const app = new Hono();
app.route('/api/reviews', reviewsApp);

function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'groupBy', 'orderBy', 'limit', 'offset', 'leftJoin', 'innerJoin']) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/reviews/stats', () => {
  it('is not read as a review id by the :reviewId route', async () => {
    queueSelects([{ averageRating: null, reviewCount: 0 }]);
    const res = await app.request('/api/reviews/stats');
    expect(res.status).toBe(200);
  });

  it('returns the catalogue average and count', async () => {
    queueSelects([{ averageRating: '4.8', reviewCount: 312 }]);

    const res = await app.request('/api/reviews/stats');
    const body = await res.json();

    expect(body).toEqual({ averageRating: 4.8, reviewCount: 312 });
  });

  it('returns a number, not a string, for the average', async () => {
    // postgres returns numeric as a string over the wire. A string here
    // means the tile renders "4.8" but arithmetic on it silently concatenates.
    queueSelects([{ averageRating: '4.8', reviewCount: 12 }]);

    const body = await (await app.request('/api/reviews/stats')).json();

    expect(typeof body.averageRating).toBe('number');
  });

  it('reports averageRating as null rather than 0 when nothing is approved', async () => {
    queueSelects([{ averageRating: null, reviewCount: 0 }]);

    const body = await (await app.request('/api/reviews/stats')).json();

    expect(body.averageRating).toBeNull();
    expect(body.reviewCount).toBe(0);
  });

  it('survives an empty result set', async () => {
    queueSelects([]);

    const res = await app.request('/api/reviews/stats');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ averageRating: null, reviewCount: 0 });
  });

  it('reports 500 rather than a zeroed aggregate when the query fails', async () => {
    // A tile showing "0 reviews" because the database is down is a lie with
    // a nicer face than an error.
    selectMock.mockImplementation(() => {
      throw new Error('connection refused');
    });

    const res = await app.request('/api/reviews/stats');

    expect(res.status).toBe(500);
  });
});
