/**
 * Admin CRUD for frames.
 *
 * Three things here carry weight beyond the usual CRUD shape:
 *
 * 1. **Cache busting.** GET /api/products/frames caches for fifteen minutes.
 *    An admin who saves a price, reloads the PDP and sees the old number will
 *    save again — the obvious first bug, and invisible in a unit test unless
 *    it is asserted here.
 * 2. **Archived rows are returned, not filtered.** The screen dims them and
 *    offers Unarchive. A list that hides them makes archiving irreversible
 *    through the UI.
 * 3. **A duplicate type is a 409, not a 500** escaping the unique index. The
 *    admin has to be told which slug is taken.
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
const deleteCached = vi.fn();

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock('../../../src/middleware/auth', async () =>
  (await import('../../helpers/admin-route-harness')).headerAuthMocks()
);

vi.mock('../../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: (...args: unknown[]) => deleteCached(...args),
  redis: { keys: vi.fn().mockResolvedValue([]), del: vi.fn() },
  CacheKeys: { PRODUCT: 'product:', COLLECTION: 'collection:' },
}));

import { adminFramesApp } from '../../../src/routes/admin/frames';

const app = new Hono();
app.route('/api/admin/frames', adminFramesApp);

const STAFF = JSON.stringify({ id: 'u1', role: 'admin' });
const SHOPPER = JSON.stringify({ id: 'u2', role: 'customer' });

const asStaff = requestAs(app, STAFF);

const frameRow = {
  id: 'f1',
  name: 'Stretch + Gold Frame',
  type: 'gold',
  category: 'framed',
  description: null,
  material: 'Composite with Gold Leaf',
  thickness: '1.25',
  color: 'Antique Gold',
  priceModifier: '1.40',
  priceAddition: '0.00',
  imageUrl: '/frames/gold.png',
  thumbnailUrl: '/frames/gold.png',
  availableSizes: null,
  isActive: true,
  sortOrder: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const archivedRow = {
  ...frameRow,
  id: 'f2',
  name: 'Stretch + Oak Frame',
  type: 'stretch-oak',
  isActive: false,
  sortOrder: 9,
};

const validCreate = {
  name: 'Stretch + Maple Frame',
  type: 'stretch-maple',
  category: 'framed',
  priceModifier: '1.40',
  priceAddition: '0.00',
};

/** Drizzle wraps the driver error; the pg code sits on `cause.code`. */
const uniqueViolation = () =>
  Object.assign(new Error('duplicate key value'), {
    cause: { code: '23505' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  selectMock.mockImplementation(() => chainReturning([frameRow]));
  insertMock.mockImplementation(() => chainReturning([frameRow]));
  updateMock.mockImplementation(() => chainReturning([frameRow]));
});

describe('GET /api/admin/frames', () => {
  it('returns archived frames too — the screen dims them rather than hiding them', async () => {
    selectMock.mockImplementation(() =>
      chainReturning([frameRow, archivedRow])
    );

    const res = await asStaff('/api/admin/frames');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { frames: Array<{ id: string }> };
    expect(body.frames.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('rejects an anonymous caller', async () => {
    const res = await app.request('/api/admin/frames');
    expect(res.status).toBe(401);
  });

  it('rejects a shopper', async () => {
    const res = await app.request('/api/admin/frames', {
      headers: { 'X-Test-User': SHOPPER },
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/frames/:id', () => {
  it('returns one frame', async () => {
    const res = await asStaff('/api/admin/frames/f1');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { frame: { type: string } };
    expect(body.frame.type).toBe('gold');
  });

  it('404s an unknown id', async () => {
    selectMock.mockImplementation(() => chainReturning([]));
    const res = await asStaff('/api/admin/frames/nope');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/frames', () => {
  it('creates a frame and busts the frames cache', async () => {
    const res = await asStaff('/api/admin/frames', {
      method: 'POST',
      body: JSON.stringify(validCreate),
    });

    expect(res.status).toBe(201);
    expect(deleteCached).toHaveBeenCalledWith('product:frames');
  });

  it('rejects a modifier the pricing formula would silently ignore', async () => {
    const res = await asStaff('/api/admin/frames', {
      method: 'POST',
      body: JSON.stringify({ ...validCreate, priceModifier: '0.5' }),
    });

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects a display name in the type field', async () => {
    const res = await asStaff('/api/admin/frames', {
      method: 'POST',
      body: JSON.stringify({ ...validCreate, type: 'Stretch Maple' }),
    });

    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('reports a duplicate type as 409, not a 500 out of the unique index', async () => {
    insertMock.mockImplementation(() => {
      throw uniqueViolation();
    });

    const res = await asStaff('/api/admin/frames', {
      method: 'POST',
      body: JSON.stringify(validCreate),
    });

    expect(res.status).toBe(409);

    const body = (await res.json()) as { type?: string };
    expect(body.type).toBe('stretch-maple');
  });
});

describe('PATCH /api/admin/frames/:id', () => {
  it('accepts a price-only edit without resending the whole frame', async () => {
    const res = await asStaff('/api/admin/frames/f1', {
      method: 'PATCH',
      body: JSON.stringify({ priceModifier: '1.60' }),
    });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it('busts the frames cache', async () => {
    await asStaff('/api/admin/frames/f1', {
      method: 'PATCH',
      body: JSON.stringify({ priceModifier: '1.60' }),
    });

    expect(deleteCached).toHaveBeenCalledWith('product:frames');
  });

  it('404s an unknown id rather than silently updating nothing', async () => {
    updateMock.mockImplementation(() => chainReturning([]));

    const res = await asStaff('/api/admin/frames/nope', {
      method: 'PATCH',
      body: JSON.stringify({ priceModifier: '1.60' }),
    });

    expect(res.status).toBe(404);
  });

  it('still enforces the bounds on the fields it is given', async () => {
    const res = await asStaff('/api/admin/frames/f1', {
      method: 'PATCH',
      body: JSON.stringify({ priceModifier: '9.00' }),
    });

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('reports a duplicate type as 409', async () => {
    updateMock.mockImplementation(() => {
      throw uniqueViolation();
    });

    const res = await asStaff('/api/admin/frames/f1', {
      method: 'PATCH',
      body: JSON.stringify({ type: 'gold' }),
    });

    expect(res.status).toBe(409);
  });
});
