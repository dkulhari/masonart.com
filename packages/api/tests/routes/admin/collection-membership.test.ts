/**
 * Manual membership and Discover ordering.
 *
 * The two admin operations plain CRUD cannot express, both whole-list replaces
 * rather than per-row edits, and both transactional.
 *
 * Order is the payload in each case. A per-row API would make position
 * arithmetic the client's problem, and a per-row reorder loop that fails
 * halfway leaves the rail in an order that never existed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  chainReturning,
  requestAs,
} from '../../helpers/admin-route-harness';
import '../../setup';

const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const transactionMock = vi.fn();
const deleteCached = vi.fn();

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock('../../../src/middleware/auth', async () =>
  (await import('../../helpers/admin-route-harness')).headerAuthMocks()
);

vi.mock('../../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: (...args: unknown[]) => deleteCached(...args),
  CacheKeys: { PRODUCT: 'product:', COLLECTION: 'collection:' },
}));

vi.mock('../../../src/lib/collection-resolver', () => ({
  countCollection: vi.fn().mockResolvedValue(3),
}));

import { adminCollectionsApp } from '../../../src/routes/admin/collections';

const app = new Hono();
app.route('/api/admin/collections', adminCollectionsApp);

const STAFF = JSON.stringify({ id: 'u1', role: 'admin' });

const asStaff = requestAs(app, STAFF);

const manualCollection = {
  id: 'c1',
  slug: 'staff-picks',
  title: 'Staff Picks',
  kind: 'manual',
  rule: null,
  isActive: true,
  showInDiscover: false,
  discoverOrder: null,
  sortOrder: 0,
};

const ruleCollection = { ...manualCollection, id: 'c2', slug: 'pop-art', kind: 'rule', rule: {} };

/** Records what the transaction body did, so ordering writes can be asserted. */
let txWrites: { table: string; values: unknown }[] = [];

function transactionalDb() {
  transactionMock.mockImplementation(async (body: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      delete: () => chainReturning([]),
      insert: () => {
        const chain = chainReturning([]);
        chain.values = (values: unknown) => {
          txWrites.push({ table: 'insert', values });
          return chain;
        };
        return chain;
      },
      update: () => {
        const chain = chainReturning([]);
        chain.set = (values: unknown) => {
          txWrites.push({ table: 'update', values });
          return chain;
        };
        return chain;
      },
      select: () => chainReturning([]),
    };
    return body(tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  txWrites = [];
  transactionalDb();
  selectMock.mockImplementation(() => chainReturning([manualCollection]));
});

describe('PUT /:id/products', () => {
  it('is 401 without a session', async () => {
    const res = await app.request('/api/admin/collections/c1/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: ['p1'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('writes positions 0..n-1 in the order supplied', async () => {
    // The order IS the data. Positions must follow the array, not the ids.
    selectMock
      .mockImplementationOnce(() => chainReturning([manualCollection]))
      .mockImplementationOnce(() =>
        chainReturning([{ id: 'p3' }, { id: 'p1' }, { id: 'p2' }])
      );

    const res = await asStaff('/api/admin/collections/c1/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: ['p3', 'p1', 'p2'] }),
    });

    expect(res.status).toBe(200);
    const inserted = txWrites.find((w) => w.table === 'insert')?.values as {
      productId: string;
      position: number;
    }[];
    expect(inserted).toEqual([
      { collectionId: 'c1', productId: 'p3', position: 0 },
      { collectionId: 'c1', productId: 'p1', position: 1 },
      { collectionId: 'c1', productId: 'p2', position: 2 },
    ]);
  });

  it('accepts an empty list as "this collection has no members"', async () => {
    const res = await asStaff('/api/admin/collections/c1/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: [] }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects a product id that does not exist, writing nothing', async () => {
    selectMock
      .mockImplementationOnce(() => chainReturning([manualCollection]))
      // Only two of the three requested ids come back as real products.
      .mockImplementationOnce(() => chainReturning([{ id: 'p1' }, { id: 'p2' }]));

    const res = await asStaff('/api/admin/collections/c1/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: ['p1', 'p2', 'ghost'] }),
    });

    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate ids', async () => {
    const res = await asStaff('/api/admin/collections/c1/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: ['p1', 'p1'] }),
    });
    expect(res.status).toBe(400);
  });

  it('refuses to give members to a rule collection', async () => {
    // Two sources of membership is one too many — the same agreement the
    // shared schema enforces on kind/rule.
    selectMock.mockImplementation(() => chainReturning([ruleCollection]));

    const res = await asStaff('/api/admin/collections/c2/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: ['p1'] }),
    });
    expect(res.status).toBe(400);
  });

  it('404s an unknown collection', async () => {
    selectMock.mockImplementation(() => chainReturning([]));
    const res = await asStaff('/api/admin/collections/nope/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('busts the public cache', async () => {
    selectMock
      .mockImplementationOnce(() => chainReturning([manualCollection]))
      .mockImplementationOnce(() => chainReturning([{ id: 'p1' }]));

    await asStaff('/api/admin/collections/c1/products', {
      method: 'PUT',
      body: JSON.stringify({ productIds: ['p1'] }),
    });
    expect(deleteCached).toHaveBeenCalled();
  });
});

describe('PUT /discover-order', () => {
  it('rewrites every listed collection in one transaction', async () => {
    // One transaction, not a loop: a per-row update that fails halfway leaves
    // the rail in an order that never existed.
    selectMock.mockImplementation(() =>
      chainReturning([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    );

    const res = await asStaff('/api/admin/collections/discover-order', {
      method: 'PUT',
      body: JSON.stringify({ collectionIds: ['c', 'a', 'b'] }),
    });

    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);

    const orders = txWrites
      .filter((w) => w.table === 'update')
      .map((w) => (w.values as { discoverOrder: number }).discoverOrder);
    expect(orders).toEqual([0, 1, 2]);
  });

  it('rejects an unknown collection id and writes nothing', async () => {
    selectMock.mockImplementation(() => chainReturning([{ id: 'a' }]));

    const res = await asStaff('/api/admin/collections/discover-order', {
      method: 'PUT',
      body: JSON.stringify({ collectionIds: ['a', 'ghost'] }),
    });

    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate ids', async () => {
    const res = await asStaff('/api/admin/collections/discover-order', {
      method: 'PUT',
      body: JSON.stringify({ collectionIds: ['a', 'a'] }),
    });
    expect(res.status).toBe(400);
  });

  it('busts the public cache', async () => {
    selectMock.mockImplementation(() => chainReturning([{ id: 'a' }]));
    await asStaff('/api/admin/collections/discover-order', {
      method: 'PUT',
      body: JSON.stringify({ collectionIds: ['a'] }),
    });
    expect(deleteCached).toHaveBeenCalled();
  });

  it('is not shadowed by the /:id route', async () => {
    // `discover-order` is a literal segment and must be registered before
    // `/:id/...` — the trap products.ts documents for /facets.
    selectMock.mockImplementation(() => chainReturning([{ id: 'a' }]));
    const res = await asStaff('/api/admin/collections/discover-order', {
      method: 'PUT',
      body: JSON.stringify({ collectionIds: ['a'] }),
    });
    expect(res.status).not.toBe(404);
  });
});
