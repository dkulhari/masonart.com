/**
 * Sale pricing on the product routes.
 *
 * `db` is mocked here, so these assertions cannot catch a reference to a column
 * that does not exist — that guard lives in tests/database/. What they do catch
 * is the wiring: that the routes resolve a sale through `promotion-pricing`,
 * load the promotion id sets once per request rather than once per card, keep
 * `endsAt` server-side, and cache a member's body apart from a guest's.
 *
 * `resolveSalePrice` is deliberately NOT stubbed. It is pure, and the whole
 * point of these tests is that the real resolver's output is what reaches the
 * wire — a stub would assert the route can copy a fixture. Only the two
 * db-touching loaders are replaced.
 *
 * Product fixtures carry `styles`/`subjects`/`rooms` as arrays because that is
 * what the `text[]` columns hold. A fixture with singular `style`/`subject`
 * would pass against a schema shape that cannot occur in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

import type { Promotion } from '../../src/database/schema/promotions';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    query: {
      products: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
  },
}));

const getCachedMock = vi.fn();
const setCachedMock = vi.fn();

vi.mock('../../src/lib/redis', () => ({
  getCached: (...args: unknown[]) => getCachedMock(...args),
  setCached: (...args: unknown[]) => setCachedMock(...args),
  CacheKeys: {
    PRODUCT_LIST: 'product-list:',
    PRODUCT: 'product:',
  },
}));

/** `optionalAuth` reads the session through here; a null session is a guest. */
const getSessionMock = vi.fn();

vi.mock('../../src/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

const getActivePromotionsMock = vi.fn();
const loadPromotionProductSetsMock = vi.fn();

vi.mock('../../src/lib/promotion-pricing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/promotion-pricing')>();
  return {
    ...actual,
    getActivePromotions: (...args: unknown[]) =>
      getActivePromotionsMock(...args),
    loadPromotionProductSets: (...args: unknown[]) =>
      loadPromotionProductSetsMock(...args),
  };
});

import { productsApp } from '../../src/routes/products';

const app = new Hono();
app.route('/api/products', productsApp);

// ============================================================================
// Fixtures
// ============================================================================

const PROMOTION_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

/** 40% off 25300.00 lands on 15180.00 — the numbers the ticket names. */
const BASE_PRICE = '25300.00';
const SALE_PRICE = '15180.00';

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: PROMOTION_ID,
    name: 'Summer Sale 2026',
    headline: 'SUMMER SALE — 40% OFF EVERYTHING',
    discountType: 'percentage',
    discountValue: 40,
    scopeType: 'all',
    scopeFilter: null,
    membersOnly: false,
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    // Present on the row and never on the wire — that is what one test checks.
    endsAt: new Date('2026-09-01T00:00:00.000Z'),
    isEnabled: true,
    priority: 0,
    perCustomerOrderLimit: null,
    countdownMode: 'rolling',
    rollingWindowMinutes: 720,
    rollingJitterMinutes: 90,
    createdBy: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  } as Promotion;
}

/** The list projection's shape. Facets are arrays, as the columns are. */
function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    sku: 'SKU-DUNES',
    title: 'Golden Dunes',
    slug: 'golden-dunes',
    description: 'A quiet desert',
    basePrice: BASE_PRICE,
    styles: ['wabi-sabi'],
    subjects: ['abstract'],
    colors: ['gold'],
    rooms: ['living-room'],
    orientation: 'portrait',
    images: [],
    isFeatured: false,
    isAiGenerated: false,
    featuredOrder: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    averageRating: null,
    reviewCount: 0,
    ...overrides,
  };
}

/** Queue up successive `db.select(...)` results, in call order. */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of [
      'from',
      'where',
      'groupBy',
      'orderBy',
      'limit',
      'offset',
      'leftJoin',
      'innerJoin',
    ]) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

/** The two db-touching loaders, answered without touching the database. */
function givenPromotions(
  active: Promotion[],
  sets: { includedIds?: string[]; excludedIds?: string[] } = {}
) {
  getActivePromotionsMock.mockResolvedValue(active);
  loadPromotionProductSetsMock.mockResolvedValue({
    includedIds: new Set(sets.includedIds ?? []),
    excludedIds: new Set(sets.excludedIds ?? []),
  });
}

function signInAsMember() {
  getSessionMock.mockResolvedValue({
    user: { id: 'user-1', email: 'a@b.com', role: 'customer', galleryMember: true },
    session: { id: 'session-1', userId: 'user-1' },
  });
}

/** The keys `setCached` was called with, in order. */
function cachedKeys(): string[] {
  return setCachedMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getCachedMock.mockResolvedValue(null);
  setCachedMock.mockResolvedValue(undefined);
  // Guest by default.
  getSessionMock.mockResolvedValue(null);
  givenPromotions([]);
});

// ============================================================================
// GET /api/products
// ============================================================================

describe('product list sale payload', () => {
  it('carries sale: null when no promotion is active', async () => {
    givenPromotions([]);
    queueSelects([{ count: 1 }], [productRow()]);

    const res = await app.request('/api/products');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].sale).toBeNull();
  });

  it('carries the resolved sale price for an eligible product', async () => {
    givenPromotions([promotion()]);
    queueSelects([{ count: 1 }], [productRow()]);

    const body = await (await app.request('/api/products')).json();

    expect(body.items[0].sale).toEqual({
      promotionId: PROMOTION_ID,
      headline: 'SUMMER SALE — 40% OFF EVERYTHING',
      percentOff: 40,
      basePrice: BASE_PRICE,
      salePrice: SALE_PRICE,
      locked: false,
    });
  });

  it('matches a filter-scoped promotion against the array facet columns', async () => {
    // `styles` is text[]. A resolver reading a singular `style` would find
    // nothing here, which is exactly the production failure to guard.
    givenPromotions([
      promotion({
        scopeType: 'filter',
        scopeFilter: { styles: ['wabi-sabi'] },
      }),
    ]);
    queueSelects([{ count: 1 }], [productRow({ styles: ['wabi-sabi'] })]);

    const body = await (await app.request('/api/products')).json();
    expect(body.items[0].sale?.salePrice).toBe(SALE_PRICE);
  });

  it('leaves an excluded product off the sale', async () => {
    givenPromotions([promotion()], { excludedIds: [PRODUCT_ID] });
    queueSelects([{ count: 1 }], [productRow()]);

    const body = await (await app.request('/api/products')).json();
    expect(body.items[0].sale).toBeNull();
  });

  it('marks the price locked for a guest under a membersOnly promotion', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    queueSelects([{ count: 1 }], [productRow()]);

    const body = await (await app.request('/api/products')).json();
    expect(body.items[0].sale.locked).toBe(true);
    // The price is still shown — locked means "shown, base charged".
    expect(body.items[0].sale.salePrice).toBe(SALE_PRICE);
  });

  it('unlocks the same promotion for a signed-in gallery member', async () => {
    signInAsMember();
    givenPromotions([promotion({ membersOnly: true })]);
    queueSelects([{ count: 1 }], [productRow()]);

    const body = await (await app.request('/api/products')).json();
    expect(body.items[0].sale.locked).toBe(false);
  });

  it('never leaks the real end date', async () => {
    givenPromotions([promotion()]);
    queueSelects([{ count: 1 }], [productRow()]);

    const body = await (await app.request('/api/products')).json();
    expect(JSON.stringify(body).includes('endsAt')).toBe(false);
  });

  it('loads the promotion id sets once per request, not once per product', async () => {
    givenPromotions([promotion()]);
    queueSelects(
      [{ count: 3 }],
      [
        productRow({ id: PRODUCT_ID, slug: 'a' }),
        productRow({ id: '33333333-3333-4333-8333-333333333333', slug: 'b' }),
        productRow({ id: '44444444-4444-4444-8444-444444444444', slug: 'c' }),
      ]
    );

    const body = await (await app.request('/api/products')).json();

    expect(body.items).toHaveLength(3);
    expect(loadPromotionProductSetsMock).toHaveBeenCalledTimes(1);
    expect(getActivePromotionsMock).toHaveBeenCalledTimes(1);
  });

  it('keys the product-list cache on member state', async () => {
    givenPromotions([promotion({ membersOnly: true })]);

    queueSelects([{ count: 1 }], [productRow()]);
    await app.request('/api/products');

    signInAsMember();
    queueSelects([{ count: 1 }], [productRow()]);
    await app.request('/api/products');

    const [guestKey, memberKey] = cachedKeys();
    expect(guestKey).toBeDefined();
    expect(memberKey).toBeDefined();
    expect(guestKey).toContain('product-list:');
    expect(memberKey).toContain('product-list:');
    // Same query, different viewer: a shared key serves the guest's locked
    // body to the member.
    expect(memberKey).not.toBe(guestKey);
  });

  it('serves the cached body back without re-resolving', async () => {
    getCachedMock.mockResolvedValue({
      items: [{ id: PRODUCT_ID, sale: null }],
      total: 1,
    });

    const body = await (await app.request('/api/products')).json();

    expect(body.fromCache).toBe(true);
    expect(body.items[0].sale).toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// GET /api/products/:slug
// ============================================================================

describe('product detail sale payload', () => {
  /** findFirst returns the whole row, variants included. */
  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      ...productRow(),
      status: 'active',
      tags: [],
      variants: [],
      ...overrides,
    };
  }

  it('carries sale: null when no promotion is active', async () => {
    givenPromotions([]);
    findFirstMock.mockResolvedValue(detailRow());
    queueSelects([]); // frames

    const res = await app.request('/api/products/golden-dunes');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.sale).toBeNull();
  });

  it('carries the resolved sale price for an eligible product', async () => {
    givenPromotions([promotion()]);
    findFirstMock.mockResolvedValue(detailRow());
    queueSelects([]);

    const body = await (await app.request('/api/products/golden-dunes')).json();

    expect(body.sale).toEqual({
      promotionId: PROMOTION_ID,
      headline: 'SUMMER SALE — 40% OFF EVERYTHING',
      percentOff: 40,
      basePrice: BASE_PRICE,
      salePrice: SALE_PRICE,
      locked: false,
    });
  });

  it('marks the price locked for a guest under a membersOnly promotion', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    findFirstMock.mockResolvedValue(detailRow());
    queueSelects([]);

    const body = await (await app.request('/api/products/golden-dunes')).json();
    expect(body.sale.locked).toBe(true);
  });

  it('never leaks the real end date', async () => {
    givenPromotions([promotion()]);
    findFirstMock.mockResolvedValue(detailRow());
    queueSelects([]);

    const body = await (await app.request('/api/products/golden-dunes')).json();
    expect(JSON.stringify(body).includes('endsAt')).toBe(false);
  });

  it('loads the promotion id sets once per request', async () => {
    givenPromotions([promotion()]);
    findFirstMock.mockResolvedValue(detailRow());
    queueSelects([]);

    await app.request('/api/products/golden-dunes');
    expect(loadPromotionProductSetsMock).toHaveBeenCalledTimes(1);
  });

  it('keys the detail cache on member state', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    findFirstMock.mockResolvedValue(detailRow());

    queueSelects([]);
    await app.request('/api/products/golden-dunes');

    signInAsMember();
    queueSelects([]);
    await app.request('/api/products/golden-dunes');

    const [guestKey, memberKey] = cachedKeys();
    expect(guestKey).toContain('golden-dunes');
    expect(memberKey).toContain('golden-dunes');
    expect(memberKey).not.toBe(guestKey);
  });
});
