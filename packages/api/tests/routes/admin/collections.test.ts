/**
 * Admin CRUD for curated collections.
 *
 * Two things here are load-bearing beyond the usual CRUD shape:
 *
 * 1. **Cache busting.** The rail's input is now a table, not a constants file.
 *    The endpoint it replaced never had to invalidate anything; this one does,
 *    and a stale rail after an admin edit is the obvious first bug.
 * 2. **Slug collisions surface as 409**, not as a 500 escaping from the unique
 *    index. The admin needs to be told which slug is taken.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../../setup';

const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const deleteCached = vi.fn();

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const header = c.req.header('X-Test-User');
    if (!header) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', JSON.parse(header));
    return next();
  }),
  requireContentManager: vi.fn((c, next) => {
    const user = c.get('user') as { role?: string } | undefined;
    const allowed = ['content-manager', 'admin', 'super-admin'];
    if (!user || !allowed.includes(user.role ?? '')) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    return next();
  }),
}));

vi.mock('../../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: (...args: unknown[]) => deleteCached(...args),
  redis: { keys: vi.fn().mockResolvedValue([]), del: vi.fn() },
  CacheKeys: { PRODUCT: 'product:', COLLECTION: 'collection:' },
}));

const resolveManualMembers = vi.fn().mockResolvedValue([]);

vi.mock('../../../src/lib/collection-resolver', () => ({
  countCollection: vi.fn().mockResolvedValue(7),
  resolveManualMembers: (...args: unknown[]) => resolveManualMembers(...args),
}));

import { adminCollectionsApp } from '../../../src/routes/admin/collections';
import { readJson } from '../../helpers/json';

const app = new Hono();
app.route('/api/admin/collections', adminCollectionsApp);

const STAFF = JSON.stringify({ id: 'u1', role: 'admin' });
const SHOPPER = JSON.stringify({ id: 'u2', role: 'customer' });

const asStaff = (path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Test-User': STAFF,
      ...(init.headers ?? {}),
    },
  });

function chainReturning(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of ['from', 'where', 'set', 'values', 'orderBy', 'limit', 'returning', 'onConflictDoNothing']) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

const collectionRow = {
  id: 'c1',
  slug: 'pop-art',
  title: 'Pop Art',
  subtitle: null,
  description: null,
  kind: 'rule',
  rule: { styles: ['pop-art'] },
  imageUrl: null,
  isActive: true,
  showInDiscover: true,
  discoverOrder: 0,
  sortOrder: 0,
  seoTitle: null,
  seoDescription: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validCreate = {
  slug: 'staff-picks',
  title: 'Staff Picks',
  kind: 'rule',
  rule: { styles: ['pop-art'] },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveManualMembers.mockResolvedValue([]);
  selectMock.mockImplementation(() => chainReturning([collectionRow]));
  insertMock.mockImplementation(() => chainReturning([collectionRow]));
  updateMock.mockImplementation(() => chainReturning([collectionRow]));
  deleteMock.mockImplementation(() => chainReturning([collectionRow]));
});

describe('access control', () => {
  const cases: [string, string, string | undefined][] = [
    ['GET', '/api/admin/collections', undefined],
    ['POST', '/api/admin/collections', JSON.stringify(validCreate)],
    ['PATCH', '/api/admin/collections/c1', JSON.stringify({ title: 'x' })],
    ['DELETE', '/api/admin/collections/c1', undefined],
  ];

  it.each(cases)('%s %s is 401 without a session', async (method, path, body) => {
    const res = await app.request(path, {
      method,
      body,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it.each(cases)('%s %s is 403 for a shopper', async (method, path, body) => {
    const res = await app.request(path, {
      method,
      body,
      headers: { 'Content-Type': 'application/json', 'X-Test-User': SHOPPER },
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /', () => {
  it('lists collections with their resolved counts', async () => {
    const res = await asStaff('/api/admin/collections');
    expect(res.status).toBe(200);

    const body = (await readJson(res)) as { collections: { slug: string; count: number }[] };
    expect(body.collections[0].slug).toBe('pop-art');
    // The admin needs to see what a rule currently resolves to; a rule that
    // matches nothing is the failure worth catching at authoring time.
    expect(body.collections[0].count).toBe(7);
  });

  it('includes inactive collections, unlike the public endpoint', async () => {
    const res = await asStaff('/api/admin/collections');
    expect(res.status).toBe(200);
    // No isActive filter is applied — asserted by the handler not narrowing.
    const body = (await readJson(res)) as { collections: unknown[] };
    expect(body.collections).toHaveLength(1);
  });
});

describe('GET /:id', () => {
  it('returns the manual members, so the edit form does not wipe them', async () => {
    /**
     * Load-bearing against data loss, not a convenience.
     *
     * CollectionForm REPLACES the member list on save. A form that loaded
     * without the members would post an empty array, so opening a curated
     * collection and fixing a typo in its title would silently delete every
     * product in it. That happened for real the first time a collection was
     * staged from the wishlist (#503).
     */
    selectMock.mockImplementation(() =>
      chainReturning([{ ...collectionRow, kind: 'manual', rule: null }])
    );
    // Position order comes from the resolver, which orders by `position`.
    resolveManualMembers.mockResolvedValue(['p3', 'p1']);

    const res = await asStaff('/api/admin/collections/c1');
    expect(res.status).toBe(200);

    const body = (await readJson(res)) as { collection: { productIds: string[] } };
    // In position order — the order IS the curation.
    expect(body.collection.productIds).toEqual(['p3', 'p1']);
  });

  it('returns no members for a rule collection', async () => {
    // A rule collection has no explicit list, and inventing an empty one here
    // would be a fact the form could act on.
    selectMock.mockImplementation(() => chainReturning([collectionRow]));

    const res = await asStaff('/api/admin/collections/c2');
    const body = (await readJson(res)) as { collection: { productIds: string[] } };

    expect(body.collection.productIds).toEqual([]);
  });

  it('404s an unknown id', async () => {
    selectMock.mockImplementation(() => chainReturning([]));
    const res = await asStaff('/api/admin/collections/nope');
    expect(res.status).toBe(404);
  });
});

describe('POST /', () => {
  it('creates a valid rule collection', async () => {
    const res = await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify(validCreate),
    });
    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalled();
  });

  it('rejects a rule collection with no rule', async () => {
    const res = await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify({ slug: 'x', title: 'X', kind: 'rule' }),
    });
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects a manual collection that carries a rule', async () => {
    const res = await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'x',
        title: 'X',
        kind: 'manual',
        rule: { styles: ['pop-art'] },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a rule naming a style outside the vocabulary', async () => {
    const res = await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'x',
        title: 'X',
        kind: 'rule',
        rule: { styles: ['neo-brutalist-art'] },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 naming the slug when it is taken', async () => {
    // Not a 500 leaking out of the unique index — the admin has to be told
    // which slug collided so they can pick another.
    insertMock.mockImplementation(() => {
      const chain = chainReturning([]);
      chain.then = (_r: unknown, reject: (e: unknown) => void) =>
        reject(Object.assign(new Error('duplicate key'), { code: '23505' }));
      return chain;
    });

    const res = await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify(validCreate),
    });

    expect(res.status).toBe(409);
    const body = (await readJson(res)) as { error: string; slug: string };
    expect(body.slug).toBe('staff-picks');
  });

  it('recognises the unique violation as Drizzle actually throws it', async () => {
    // Caught against the live database: Drizzle WRAPS the driver error. The
    // thrown object is `{ query, params, cause, stack }` with `code: undefined`
    // at the top level and `cause.code: '23505'` beneath. Checking only
    // `error.code` matches nothing, and every collision would have been a 500.
    insertMock.mockImplementation(() => {
      const chain = chainReturning([]);
      chain.then = (_r: unknown, reject: (e: unknown) => void) =>
        reject(
          Object.assign(new Error('Failed query: insert into "collections"'), {
            query: 'insert into "collections"',
            cause: { code: '23505', constraint_name: 'collections_slug_unique' },
          })
        );
      return chain;
    });

    const res = await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify(validCreate),
    });

    expect(res.status).toBe(409);
  });

  it('busts the public cache', async () => {
    await asStaff('/api/admin/collections', {
      method: 'POST',
      body: JSON.stringify(validCreate),
    });
    expect(deleteCached).toHaveBeenCalled();
  });
});

describe('PATCH /:id', () => {
  it('updates only the supplied fields', async () => {
    const res = await asStaff('/api/admin/collections/c1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it('404s an unknown id', async () => {
    updateMock.mockImplementation(() => chainReturning([]));
    const res = await asStaff('/api/admin/collections/nope', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(res.status).toBe(404);
  });

  it('still refuses a rule on a patch that turns the collection manual', async () => {
    const res = await asStaff('/api/admin/collections/c1', {
      method: 'PATCH',
      body: JSON.stringify({ kind: 'manual', rule: { styles: ['pop-art'] } }),
    });
    expect(res.status).toBe(400);
  });

  it('busts the public cache', async () => {
    await asStaff('/api/admin/collections/c1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(deleteCached).toHaveBeenCalled();
  });
});

describe('DELETE /:id', () => {
  it('deletes and busts the cache', async () => {
    const res = await asStaff('/api/admin/collections/c1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalled();
    expect(deleteCached).toHaveBeenCalled();
  });

  it('404s an unknown id', async () => {
    deleteMock.mockImplementation(() => chainReturning([]));
    const res = await asStaff('/api/admin/collections/nope', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
