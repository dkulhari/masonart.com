/**
 * POST /api/wishlist/replace — swap the whole list for a different one.
 *
 * WHY THIS IS NOT `PUT /api/wishlist`
 *
 * `PUT` refuses any change to the SET. Its permutation guard exists so a tab
 * left open since before an item was saved on another device cannot silently
 * drop it (#500). Loading a collection into the wishlist is exactly a set
 * change, so it cannot go through that door.
 *
 * Loosening the guard would reopen the hole it closed. Two operations, two
 * endpoints: reordering stays absolutely guarded, and replacement is opt-in
 * and named for what it does.
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

const USER = JSON.stringify({ id: 'u1', email: 'staff@chobii.art' });

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

/** Which of the requested ids are real products. */
function productsExist(ids: string[]) {
  selectMock.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'limit']) chain[key] = () => chain;
    chain.then = (resolve: (v: unknown) => void) =>
      resolve(ids.map((id) => ({ id })));
    return chain;
  });
}

function replace(body: unknown, authed = true) {
  return app.request('/api/wishlist/replace', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(authed ? { 'X-Test-User': USER } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirstMock.mockResolvedValue({ id: 'u1', wishlistProductIds: [A] });
  productsExist([A, B, C]);
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
    const res = await replace({ productIds: [A] }, false);
    expect(res.status).toBe(401);
  });
});

describe('replacing', () => {
  it('writes a completely different set, in the order given', async () => {
    // The whole point: `PUT` would refuse this.
    const res = await replace({ productIds: [C, B] });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { productIds: string[] };
    expect(body.productIds).toEqual([C, B]);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wishlistProductIds: [C, B] })
    );
  });

  it('accepts an empty list, which clears the wishlist', async () => {
    // Legitimate here, unlike on PUT where an empty list against a non-empty
    // wishlist is a stale write.
    productsExist([]);
    const res = await replace({ productIds: [] });
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wishlistProductIds: [] })
    );
  });

  it('preserves the given order rather than sorting', async () => {
    await replace({ productIds: [C, A, B] });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wishlistProductIds: [C, A, B] })
    );
  });
});

describe('validation', () => {
  it('rejects ids that are not real products, writing nothing', async () => {
    // A wishlist of ids matching nothing renders an empty page with a
    // non-zero badge — the shape of bug the count endpoint already guards.
    productsExist([A, B]);

    const res = await replace({ productIds: [A, B, C] });

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('names the ids it rejected', async () => {
    productsExist([A]);
    const res = await replace({ productIds: [A, C] });
    const body = (await res.json()) as { unknown?: string[] };
    expect(body.unknown).toEqual([C]);
  });

  it('rejects duplicates', async () => {
    const res = await replace({ productIds: [A, A] });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects ids that are not uuids', async () => {
    const res = await replace({ productIds: ['nope'] });
    expect(res.status).toBe(400);
  });

  it('caps the payload', async () => {
    const res = await replace({
      productIds: Array.from({ length: 501 }, () => A),
    });
    expect(res.status).toBe(400);
  });
});

describe('routing', () => {
  it('is not shadowed by POST /:productId', async () => {
    /**
     * Both are POST and Hono matches in registration order. Registered below
     * the param route, "replace" would be read as a product id and answer 400
     * for every call — the same trap `/merge` documents.
     */
    const res = await replace({ productIds: [A] });
    expect(res.status).toBe(200);
  });
});
