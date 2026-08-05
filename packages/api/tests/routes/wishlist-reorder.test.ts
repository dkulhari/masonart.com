/**
 * PUT /api/wishlist — rewrite the saved order.
 *
 * `users.wishlist_product_ids` is a `text[]`, so the array order IS the order
 * and a reorder is one write. The endpoint is trivial; the guard is not.
 *
 * WHY THE PERMUTATION GUARD EXISTS
 *
 * A plain "replace the array" endpoint is a data-loss bug. A tab left open
 * since before the shopper saved something on their phone would post the list
 * as it knew it, and silently drop the newer item. So the write is accepted
 * only when the incoming ids are the same SET as the stored ones — which is
 * exactly what a reorder is, and never what a stale write is.
 *
 * Imported directly rather than through the try/catch-into-null pattern some
 * sibling suites use: that pattern makes every assertion pass vacuously when
 * the module fails to load, which is the state a new endpoint's first run is
 * in. Same reasoning as wishlist.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

const findFirstMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();
const setSpy = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    query: {
      users: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
    },
    update: (...args: unknown[]) => updateMock(...args),
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const header = c.req.header('X-Test-User');
    if (!header) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', JSON.parse(header));
    return next();
  }),
}));

import { wishlistApp } from '../../src/routes/wishlist';

const app = new Hono();
app.route('/api/wishlist', wishlistApp);

const USER = JSON.stringify({ id: 'u1', email: 'shopper@example.com' });

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

/** What the user currently has saved. */
function stored(ids: string[]) {
  findFirstMock.mockResolvedValue({ id: 'u1', wishlistProductIds: ids });
}

function put(body: unknown, authed = true) {
  return app.request('/api/wishlist', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(authed ? { 'X-Test-User': USER } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.set = (values: unknown) => {
      setSpy(values);
      return chain;
    };
    chain.where = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve([]);
    return chain;
  });
});

describe('access', () => {
  it('is 401 without a session', async () => {
    const res = await put({ productIds: [A, B] }, false);
    expect(res.status).toBe(401);
  });
});

describe('a legitimate reorder', () => {
  it('writes the new order', async () => {
    stored([A, B, C]);

    const res = await put({ productIds: [C, A, B] });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { productIds: string[] };
    expect(body.productIds).toEqual([C, A, B]);
    expect(updateMock).toHaveBeenCalled();
  });

  it('accepts the same order — a no-op reorder is not an error', async () => {
    // Dropping an item back where it started is a normal thing to do with a
    // mouse, and rejecting it would surface as a phantom failure.
    stored([A, B, C]);
    const res = await put({ productIds: [A, B, C] });
    expect(res.status).toBe(200);
  });

  it('accepts an empty list when nothing is saved', async () => {
    stored([]);
    const res = await put({ productIds: [] });
    expect(res.status).toBe(200);
  });
});

describe('the permutation guard', () => {
  it('rejects an id that is not saved, and writes nothing', async () => {
    stored([A, B]);

    const res = await put({ productIds: [A, B, C] });

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a MISSING id — the stale-tab case', async () => {
    // The bug this endpoint is shaped around: a tab open since before D was
    // saved elsewhere posts [A, B, C] and would otherwise delete D.
    stored([A, B, C, D]);

    const res = await put({ productIds: [C, B, A] });

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns the current list with the 409, so the client can resync', async () => {
    stored([A, B, C, D]);

    const res = await put({ productIds: [A, B] });
    const body = (await res.json()) as { productIds: string[] };

    expect(body.productIds).toEqual([A, B, C, D]);
  });

  it('rejects duplicates rather than collapsing them', async () => {
    // [A, A, B] has the same set as [A, B] but is not a permutation of it, and
    // silently de-duplicating would make the response disagree with the write.
    stored([A, B]);

    const res = await put({ productIds: [A, A, B] });

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects an empty list when items are saved', async () => {
    // Clearing a wishlist is DELETE's job. A reorder that empties it is a bug
    // in the caller.
    stored([A, B]);

    const res = await put({ productIds: [] });
    expect(res.status).toBe(409);
  });
});

describe('GET returns the stored order', () => {
  it('hydrates in array order, not whatever the planner returns', async () => {
    // Caught live: `inArray` places no ordering on the result, so this
    // endpoint handed back an arbitrary sequence. The client sets its `ids`
    // from this response, so a signed-in shopper's saved order was the
    // planner's opinion — and a reorder would have appeared to do nothing
    // after a reload.
    stored([C, A, B]);
    selectMock.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      for (const key of ['from', 'where']) chain[key] = () => chain;
      // Deliberately NOT in array order.
      chain.then = (resolve: (v: unknown) => void) =>
        resolve([
          { id: A, title: 'A' },
          { id: B, title: 'B' },
          { id: C, title: 'C' },
        ]);
      return chain;
    });

    const res = await app.request('/api/wishlist', {
      headers: { 'X-Test-User': USER },
    });
    const body = (await res.json()) as { items: { id: string }[] };

    expect(body.items.map((i) => i.id)).toEqual([C, A, B]);
  });

  it('drops an id whose product is gone rather than leaving a hole', async () => {
    stored([A, B, C]);
    selectMock.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      for (const key of ['from', 'where']) chain[key] = () => chain;
      // B was deleted from the catalogue.
      chain.then = (resolve: (v: unknown) => void) =>
        resolve([{ id: C, title: 'C' }, { id: A, title: 'A' }]);
      return chain;
    });

    const res = await app.request('/api/wishlist', {
      headers: { 'X-Test-User': USER },
    });
    const body = (await res.json()) as { items: { id: string }[] };

    expect(body.items.map((i) => i.id)).toEqual([A, C]);
  });
});

describe('validation', () => {
  it('rejects ids that are not uuids', async () => {
    stored([A]);
    const res = await put({ productIds: ['not-a-uuid'] });
    expect(res.status).toBe(400);
  });

  it('rejects a missing productIds field', async () => {
    stored([A]);
    const res = await put({});
    expect(res.status).toBe(400);
  });

  it('caps the payload', async () => {
    stored([A]);
    const res = await put({ productIds: Array.from({ length: 501 }, () => A) });
    expect(res.status).toBe(400);
  });
});
