/**
 * Retiring a frame.
 *
 * DELETE archives. It must never issue a SQL delete, and the reason is not
 * squeamishness: cartItems.frameId and orderItems.frameId are both
 * onDelete 'set null', so a hard delete would succeed silently and strip the
 * frame off historical orders — no error anywhere, just orders that stop
 * recording what was bought.
 *
 * And it must refuse the last active frame. There is no unframed fallback:
 * Rolled Canvas is itself a frame row, so zero active frames is a product page
 * with no buyable option at all.
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

import { adminFramesApp } from '../../../src/routes/admin/frames';

const app = new Hono();
app.route('/api/admin/frames', adminFramesApp);

const STAFF = JSON.stringify({ id: 'u1', role: 'admin' });

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
  for (const key of [
    'from',
    'where',
    'set',
    'values',
    'orderBy',
    'limit',
    'returning',
  ]) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

const activeFrame = {
  id: 'f1',
  name: 'Stretch + Gold Frame',
  type: 'gold',
  category: 'framed',
  priceModifier: '1.40',
  priceAddition: '0.00',
  isActive: true,
  sortOrder: 2,
};

/**
 * The route reads the target row, then counts active frames. Sequencing the
 * two select() calls is what lets a test say "this frame is the last one".
 */
function selectSequence(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[Math.min(call, results.length - 1)];
    call += 1;
    return chainReturning(rows);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockImplementation(() => chainReturning([activeFrame]));
});

describe('DELETE /api/admin/frames/:id', () => {
  it('archives rather than deleting — a delete would strip the frame off past orders', async () => {
    selectSequence([activeFrame], [{ count: 5 }]);

    const res = await asStaff('/api/admin/frames/f1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('busts the frames cache', async () => {
    selectSequence([activeFrame], [{ count: 5 }]);

    await asStaff('/api/admin/frames/f1', { method: 'DELETE' });

    expect(deleteCached).toHaveBeenCalledWith('product:frames');
  });

  it('refuses the last active frame — a page with no format option is broken', async () => {
    selectSequence([activeFrame], [{ count: 1 }]);

    const res = await asStaff('/api/admin/frames/f1', { method: 'DELETE' });

    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('counts only ACTIVE frames when deciding — archived ones do not rescue it', async () => {
    // Three other rows exist but all are archived, so the count query — which
    // filters on isActive — still returns 1.
    selectSequence([activeFrame], [{ count: 1 }]);

    const res = await asStaff('/api/admin/frames/f1', { method: 'DELETE' });

    expect(res.status).toBe(409);
  });

  it('404s an unknown id', async () => {
    selectSequence([]);

    const res = await asStaff('/api/admin/frames/nope', { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('is idempotent on an already-archived frame', async () => {
    selectSequence([{ ...activeFrame, isActive: false }]);

    const res = await asStaff('/api/admin/frames/f1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('rejects a non-admin', async () => {
    const res = await app.request('/api/admin/frames/f1', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('unarchiving', () => {
  it('goes through PATCH isActive:true rather than a second endpoint', async () => {
    selectSequence([{ ...activeFrame, isActive: false }]);
    updateMock.mockImplementation(() =>
      chainReturning([{ ...activeFrame, isActive: true }])
    );

    const res = await asStaff('/api/admin/frames/f1', {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(deleteCached).toHaveBeenCalledWith('product:frames');
  });
});
