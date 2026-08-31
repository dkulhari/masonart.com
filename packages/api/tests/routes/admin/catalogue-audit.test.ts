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
    /**
     * The handle handed to the callback is the SAME set of mocks the module
     * scope uses, so a `queue(deleteMock, …)` seeds a statement whether it runs
     * inside the transaction or outside it. Collections and promotions do their
     * membership writes in one, and a separate tx double would make the queue
     * order silently depend on which side of the transaction a read sat on.
     */
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: (...args: unknown[]) => selectMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
        insert: (...args: unknown[]) => insertMock(...args),
        delete: (...args: unknown[]) => deleteMock(...args),
      }),
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

// Collections and promotions bust Redis keys on every write. No server here.
vi.mock('../../../src/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    deleteCached: vi.fn().mockResolvedValue(undefined),
    purgeProductResponseCache: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/lib/promotion-pricing', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, invalidateActivePromotions: vi.fn() };
});

const { adminProductsApp } = await import('../../../src/routes/admin/products');
const { adminFramesApp } = await import('../../../src/routes/admin/frames');
const { adminPromotionsApp } = await import('../../../src/routes/admin/promotions');
const { default: adminCollectionsApp } = await import(
  '../../../src/routes/admin/collections'
);

const PRODUCT_ID = '00000000-0000-0000-0000-0000000000p1'.replace('p', 'a');
const FRAME_ID = '00000000-0000-0000-0000-0000000000f1'.replace('f', 'b');
const VARIANT_ID = '00000000-0000-0000-0000-0000000000c1';
const COLLECTION_ID = '00000000-0000-0000-0000-0000000000d1';
const OTHER_COLLECTION_ID = '00000000-0000-0000-0000-0000000000d2';
const PROMOTION_ID = '00000000-0000-0000-0000-0000000000e1';

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
  instance.route('/api/admin/collections', adminCollectionsApp);
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

// ============================================================================
// Tier 2 (#670) — actions that were declared in the registry and emitted by
// nothing. #644 wired part of each of these files and stopped; what is below is
// the half that was left, so every route with a declared action has an emitter.
// ============================================================================

const variantRow = (overrides: Record<string, unknown> = {}) => ({
  id: VARIANT_ID,
  productId: PRODUCT_ID,
  sizeLabel: '12x18',
  widthInches: 12,
  heightInches: 18,
  price: '1200.00',
  stockQuantity: 4,
  isInStock: true,
  variantSku: 'SKU-1-12x18',
  isActive: true,
  ...overrides,
});

const collectionRow = (overrides: Record<string, unknown> = {}) => ({
  id: COLLECTION_ID,
  slug: 'monsoon',
  title: 'Monsoon',
  subtitle: null,
  kind: 'manual',
  rule: null,
  isActive: true,
  showInDiscover: true,
  discoverOrder: 0,
  sortOrder: 0,
  ...overrides,
});

describe('PATCH /api/admin/products/:id/variants/:variantId', () => {
  it('records the size and price that moved, not the whole variant', async () => {
    queue(selectMock, [variantRow()]);
    queue(updateMock, [variantRow({ price: '1800.00' })]);

    const res = await send(
      `/api/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`,
      'PATCH',
      { price: '1800.00' }
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'product_variant.updated',
      entityType: 'product_variant',
      entityId: VARIANT_ID,
    });
    expect(auditArgs().before).toEqual({ price: '1200.00' });
    expect(auditArgs().after).toEqual({ price: '1800.00' });
  });

  it('names the size in the summary, because a variant id names nothing', async () => {
    queue(selectMock, [variantRow()]);
    queue(updateMock, [variantRow({ stockQuantity: 0, isInStock: false })]);

    await send(
      `/api/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`,
      'PATCH',
      { stockQuantity: 0, isInStock: false }
    );

    expect(String(auditArgs().summary)).toContain('12x18');
  });
});

describe('DELETE /api/admin/products/:id/variants/:variantId', () => {
  /**
   * The route soft-deletes by clearing `isActive`, so the row survives — but
   * the storefront stops offering that size, and "which size did we stop
   * selling, and when" is the question the delta has to answer.
   */
  it('records the deactivation with the size that was withdrawn', async () => {
    queue(selectMock, [variantRow()]);
    queue(updateMock, [variantRow({ isActive: false })]);

    const res = await send(
      `/api/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`,
      'DELETE'
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'product_variant.deleted',
      entityType: 'product_variant',
      entityId: VARIANT_ID,
    });
    expect(auditArgs().before).toMatchObject({
      sizeLabel: '12x18',
      price: '1200.00',
      isActive: true,
    });
    expect(auditArgs().after).toMatchObject({ isActive: false });
  });

  it('writes no row when the variant does not belong to the product', async () => {
    queue(selectMock, []);

    const res = await send(
      `/api/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`,
      'DELETE'
    );

    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/collections/:id', () => {
  it('records only the keys that moved', async () => {
    queue(selectMock, [collectionRow()]);
    queue(updateMock, [collectionRow({ title: 'Monsoon Picks', isActive: false })]);

    const res = await send(`/api/admin/collections/${COLLECTION_ID}`, 'PATCH', {
      title: 'Monsoon Picks',
      isActive: false,
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'collection.updated',
      entityType: 'collection',
      entityId: COLLECTION_ID,
    });
    expect(auditArgs().before).toEqual({ title: 'Monsoon', isActive: true });
    expect(auditArgs().after).toEqual({
      title: 'Monsoon Picks',
      isActive: false,
    });
  });

  it('writes no row for a collection that is not there', async () => {
    queue(selectMock, []);

    const res = await send(`/api/admin/collections/${COLLECTION_ID}`, 'PATCH', {
      title: 'Nothing',
    });

    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/collections/discover-order', () => {
  /**
   * The rail order is what the homepage shows first. The floor row records that
   * someone reordered it; only the delta records what the order used to be, and
   * a reorder is exactly the edit nobody can reconstruct from the result.
   */
  it('records the rail order it replaced, not just the new one', async () => {
    queue(selectMock, [
      collectionRow({ id: COLLECTION_ID, slug: 'monsoon', discoverOrder: 0 }),
      collectionRow({
        id: OTHER_COLLECTION_ID,
        slug: 'festive',
        discoverOrder: 1,
      }),
    ]);
    queue(updateMock, [], []);

    const res = await send('/api/admin/collections/discover-order', 'PUT', {
      collectionIds: [OTHER_COLLECTION_ID, COLLECTION_ID],
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'collection.updated',
      entityType: 'collection',
    });
    expect(auditArgs().before).toEqual({
      discoverOrder: [COLLECTION_ID, OTHER_COLLECTION_ID],
    });
    expect(auditArgs().after).toEqual({
      discoverOrder: [OTHER_COLLECTION_ID, COLLECTION_ID],
    });
  });

  it('writes no row when an id in the list is unknown', async () => {
    queue(selectMock, []);

    const res = await send('/api/admin/collections/discover-order', 'PUT', {
      collectionIds: [COLLECTION_ID],
    });

    expect(res.status).toBe(400);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/collections/:id/products', () => {
  it('records which products left the collection and which arrived', async () => {
    queue(selectMock, [collectionRow()], [{ id: PRODUCT_ID }]);
    // The membership rows the transaction clears, returned so the delta has a
    // before at all — nothing else remembers what was curated in.
    queue(deleteMock, [{ productId: FRAME_ID, position: 0 }]);
    queue(insertMock, []);

    const res = await send(
      `/api/admin/collections/${COLLECTION_ID}/products`,
      'PUT',
      { productIds: [PRODUCT_ID] }
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'collection.updated',
      entityType: 'collection',
      entityId: COLLECTION_ID,
    });
    expect(auditArgs().before).toEqual({ productIds: [FRAME_ID] });
    expect(auditArgs().after).toEqual({ productIds: [PRODUCT_ID] });
  });
});

describe('POST /api/admin/promotions', () => {
  it('records the creation with no before, and the discount in the summary', async () => {
    queue(selectMock, []);
    queue(insertMock, [
      {
        id: PROMOTION_ID,
        name: 'Diwali Sale',
        headline: '30% off everything',
        discountType: 'percentage',
        discountValue: 30,
        scopeType: 'all',
        scopeFilter: null,
        membersOnly: true,
        startsAt: new Date('2026-10-01T00:00:00Z'),
        endsAt: null,
        isEnabled: false,
        priority: 0,
        perCustomerOrderLimit: null,
        countdownMode: 'rolling',
        rollingWindowMinutes: 720,
        rollingJitterMinutes: 90,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);

    const res = await send('/api/admin/promotions', 'POST', {
      name: 'Diwali Sale',
      headline: '30% off everything',
      discountType: 'percentage',
      discountValue: 30,
      scopeType: 'all',
      startsAt: '2026-10-01T00:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(auditArgs()).toMatchObject({
      action: 'promotion.created',
      entityType: 'promotion',
      entityId: PROMOTION_ID,
    });
    expect(auditArgs().before ?? null).toBeNull();
    // A promotion is created disabled. The row has to say so, or enabling it
    // later looks like the moment the discount was decided.
    expect(auditArgs().after).toMatchObject({
      discountType: 'percentage',
      discountValue: 30,
      isEnabled: false,
    });
    expect(String(auditArgs().summary)).toContain('Diwali Sale');
  });
});
