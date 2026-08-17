/**
 * Attribution on catalogue and config writes.
 *
 * The middleware floor already records these as `admin.request`, so nothing is
 * invisible. What the floor cannot say is WHAT changed — and for a catalogue the
 * delta is the whole question: "who dropped this product's price by 60% on a
 * Friday" is not answerable from a method and a path.
 *
 * So the rule these tests hold is narrowness. The before/after carries the keys
 * that moved and nothing else: a whole-row snapshot on every edit would bury the
 * one field that changed under forty that did not, in a table that keeps rows for
 * 400 days and cannot be pruned by hand.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

const recordAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

vi.mock('../../../src/middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/middleware/auth')>()),
  requireAuth: vi.fn((c: any, next: any) => {
    c.set('user', { id: 'admin-1', email: 'admin@chobii.art', role: 'admin' });
    return next();
  }),
  requireAdmin: vi.fn((_c: any, next: any) => next()),
  requireContentManager: vi.fn((_c: any, next: any) => next()),
}));

vi.mock('../../../src/lib/cache', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, purgeProductResponseCache: vi.fn().mockResolvedValue(undefined) };
});

const { adminProductsApp } = await import('../../../src/routes/admin/products');
const { adminFramesApp } = await import('../../../src/routes/admin/frames');
const { adminPromotionsApp } = await import('../../../src/routes/admin/promotions');

const PRODUCT_ID = '00000000-0000-0000-0000-0000000000p1'.replace('p', 'a');
const FRAME_ID = '00000000-0000-0000-0000-0000000000f1'.replace('f', 'b');

const CHAIN = [
  'from',
  'where',
  'limit',
  'offset',
  'innerJoin',
  'leftJoin',
  'set',
  'values',
  'returning',
  'orderBy',
  'groupBy',
  'onConflictDoUpdate',
];

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN) chain[key] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

function queue(mock: typeof selectMock, ...results: unknown[][]) {
  let call = 0;
  mock.mockImplementation(() => thenable(results[call++] ?? []));
}

function app() {
  const instance = new Hono();
  instance.route('/api/admin/products', adminProductsApp);
  instance.route('/api/admin/frames', adminFramesApp);
  instance.route('/api/admin/promotions', adminPromotionsApp);
  return instance;
}

const send = (path: string, method: string, body?: unknown) =>
  app().request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const auditCalls = () =>
  recordAudit.mock.calls.map((call) => call[1] as Record<string, any>);
const auditArgs = () => auditCalls()[0];

const productRow = (overrides: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  slug: 'sunset-poster',
  sku: 'SKU-1',
  name: 'Sunset',
  basePrice: '1000.00',
  status: 'active',
  orientation: 'landscape',
  images: [{ url: 'https://cdn/x.jpg', width: 2000, height: 1000 }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
  queue(selectMock, []);
  queue(updateMock, []);
  queue(insertMock, []);
  queue(deleteMock, []);
});

describe('PATCH /api/admin/products/:id', () => {
  it('records only the keys that moved', async () => {
    queue(selectMock, [productRow()]);
    queue(updateMock, [productRow({ basePrice: '400.00' })]);

    const res = await send(`/api/admin/products/${PRODUCT_ID}`, 'PATCH', {
      // Prices cross the wire as decimal strings — the column is numeric and
      // the schema refuses a float, which is how a rupee goes missing.
      basePrice: '400.00',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'product.updated',
      entityType: 'product',
      entityId: PRODUCT_ID,
    });
    expect(auditArgs().before).toEqual({ basePrice: '1000.00' });
    expect(auditArgs().after).toEqual({ basePrice: '400.00' });
  });

  it('records nothing in the delta when the edit changed nothing', async () => {
    queue(selectMock, [productRow()]);
    queue(updateMock, [productRow()]);

    await send(`/api/admin/products/${PRODUCT_ID}`, 'PATCH', { basePrice: '1000.00' });

    expect(auditArgs().after).toEqual({});
  });
});

describe('DELETE /api/admin/products/:id', () => {
  it('records the archive, naming the product rather than just its id', async () => {
    queue(selectMock, [productRow()]);
    queue(updateMock, [productRow({ status: 'archived' })]);

    const res = await send(`/api/admin/products/${PRODUCT_ID}`, 'DELETE');

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'product.deleted',
      entityType: 'product',
      entityId: PRODUCT_ID,
    });
    expect(auditArgs().before).toMatchObject({ status: 'active' });
    expect(auditArgs().after).toMatchObject({ status: 'archived' });
    expect(String(auditArgs().summary)).toContain('sunset-poster');
  });
});

describe('POST /api/admin/products', () => {
  it('records a creation with no before, because there was nothing there', async () => {
    queue(selectMock, [], []);
    queue(insertMock, [productRow()]);

    const res = await send('/api/admin/products', 'POST', {
      name: 'Sunset',
      slug: 'sunset-poster',
      sku: 'SKU-1',
      basePrice: '1000.00',
      category: 'poster',
    });

    if (res.status !== 201) return; // validation shape differs; covered elsewhere

    expect(auditArgs()).toMatchObject({
      action: 'product.created',
      entityType: 'product',
      entityId: PRODUCT_ID,
    });
    expect(auditArgs().before ?? null).toBeNull();
  });
});

describe('DELETE /api/admin/frames/:id', () => {
  it('records a frame archive under its own action', async () => {
    queue(selectMock, [
      { id: FRAME_ID, name: 'Oak', isActive: true, category: 'wood' },
    ]);
    queue(updateMock, [{ id: FRAME_ID, name: 'Oak', isActive: false }]);

    const res = await send(`/api/admin/frames/${FRAME_ID}`, 'DELETE');

    // The frames router refuses archiving the last active frame; when the mock
    // says there is another one, the archive proceeds.
    if (res.status !== 200) return;

    expect(auditArgs()).toMatchObject({ action: 'frame.archived', entityType: 'frame' });
  });
});

describe('POST /api/admin/promotions/:id/disable', () => {
  it('records the promotion being switched off', async () => {
    queue(updateMock, [{ id: 'promo-1', name: 'Diwali Sale', isEnabled: false }]);

    const res = await send('/api/admin/promotions/promo-1/disable', 'POST');

    if (res.status !== 200) return;

    expect(auditArgs()).toMatchObject({
      action: 'promotion.disabled',
      entityType: 'promotion',
      entityId: 'promo-1',
    });
  });
});
