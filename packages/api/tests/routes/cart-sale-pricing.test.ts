/**
 * Sale pricing on the cart routes.
 *
 * The one thing these tests exist to protect: **the stored `lineTotal` is a
 * base price and stays one.** Sale is resolved on every read, so a cart left
 * sitting across the end of a sale reverts to base by itself rather than
 * charging a discount that no longer exists.
 *
 * `db` is mocked, so nothing here can catch a column that does not exist —
 * that guard lives in tests/database/. What these catch is the wiring: that
 * the cart resolves through `promotion-pricing` rather than re-deriving a
 * discount, that the write paths keep writing base figures, and that a guest
 * and a member do not share a cache entry.
 *
 * `resolveSalePrice` is deliberately NOT stubbed — it is pure, and the point
 * is that the real resolver's arithmetic is what reaches the wire. Only the
 * two db-touching loaders are replaced.
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
const updateMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    query: {
      carts: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
  },
}));

const getCachedMock = vi.fn();
const setCachedMock = vi.fn();
const deleteCachedMock = vi.fn();

vi.mock('../../src/lib/redis', () => ({
  getCached: (...args: unknown[]) => getCachedMock(...args),
  setCached: (...args: unknown[]) => setCachedMock(...args),
  deleteCached: (...args: unknown[]) => deleteCachedMock(...args),
  CacheKeys: {
    CART: 'cart:',
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

import { cartApp } from '../../src/routes/cart';

const app = new Hono();
app.route('/api/cart', cartApp);

// ============================================================================
// Fixtures
// ============================================================================

const PROMOTION_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const CART_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';
const VARIANT_ID = '55555555-5555-4555-8555-555555555555';

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

/**
 * The product columns the cart projection carries. Facets are arrays, as the
 * `text[]` columns are — a filter-scoped promotion matches against these.
 */
function cartProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    sku: 'SKU-DUNES',
    title: 'Golden Dunes',
    slug: 'golden-dunes',
    images: [],
    status: 'active',
    basePrice: BASE_PRICE,
    styles: ['wabi-sabi'],
    subjects: ['abstract'],
    rooms: ['living-room'],
    isFeatured: false,
    ...overrides,
  };
}

/**
 * A cart line as the read returns it. `lineTotal` is `(unitPrice +
 * framePrice) * quantity` — the base figure the write path stored.
 */
function cartItemRow(overrides: Record<string, unknown> = {}) {
  const unitPrice = String(overrides.unitPrice ?? BASE_PRICE);
  const framePrice = String(overrides.framePrice ?? '0.00');
  const quantity = Number(overrides.quantity ?? 1);
  return {
    id: ITEM_ID,
    cartId: CART_ID,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    frameId: null,
    quantity,
    unitPrice,
    framePrice,
    lineTotal: (
      (parseFloat(unitPrice) + parseFloat(framePrice)) *
      quantity
    ).toFixed(2),
    isSavedForLater: false,
    isAiGenerated: false,
    aiGenerationId: null,
    aiDetails: null,
    customizations: null,
    product: cartProduct(),
    variant: { id: VARIANT_ID, sizeLabel: 'A2', price: unitPrice },
    frame: null,
    ...overrides,
  };
}

function cartRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CART_ID,
    userId: null,
    sessionId: 'guest_session_1',
    isActive: true,
    itemCount: 1,
    subtotal: BASE_PRICE,
    couponCode: null,
    couponDiscount: '0.00',
    currency: 'INR',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ============================================================================
// Query stubs
// ============================================================================

const CHAIN_METHODS = [
  'from',
  'where',
  'groupBy',
  'orderBy',
  'limit',
  'offset',
  'leftJoin',
  'innerJoin',
  'returning',
];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN_METHODS) chain[key] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

/** Queue up successive `db.select(...)` results, in call order. */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => thenableChain(results[call++] ?? []));
}

/** Every value handed to `db.update(...).set(...)`, in call order. */
const updatedValues: Record<string, unknown>[] = [];

function queueUpdates(...results: unknown[][]) {
  let call = 0;
  updateMock.mockImplementation(() => {
    const chain = thenableChain(results[call++] ?? []) as Record<
      string,
      unknown
    >;
    chain.set = (values: Record<string, unknown>) => {
      updatedValues.push(values);
      return chain;
    };
    return chain;
  });
}

/** The cart the read path loads, items included. */
function givenCart(items: unknown[], overrides: Record<string, unknown> = {}) {
  findFirstMock.mockResolvedValue({ ...cartRow(overrides), items });
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
    user: {
      id: 'user-1',
      email: 'a@b.com',
      role: 'customer',
      galleryMember: true,
    },
    session: { id: 'session-1', userId: 'user-1' },
  });
}

/** The keys `setCached` was called with, in order. */
function cachedKeys(): string[] {
  return setCachedMock.mock.calls.map((call) => String(call[0]));
}

async function getCart() {
  const res = await app.request('/api/cart');
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  updatedValues.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getCachedMock.mockResolvedValue(null);
  setCachedMock.mockResolvedValue(undefined);
  deleteCachedMock.mockResolvedValue(undefined);
  // Guest by default.
  getSessionMock.mockResolvedValue(null);
  givenPromotions([]);
  // getOrCreateCart's lookup finds an existing cart.
  queueSelects([cartRow()]);
  queueUpdates();
  givenCart([cartItemRow()]);
});

// ============================================================================
// GET /api/cart
// ============================================================================

describe('cart sale pricing', () => {
  it('returns base, sale and locked per line', async () => {
    givenPromotions([promotion()]);

    const body = await getCart();

    expect(body.items[0].pricing).toEqual({
      base: BASE_PRICE,
      sale: SALE_PRICE,
      locked: false,
      headline: 'SUMMER SALE — 40% OFF EVERYTHING',
      percentOff: 40,
    });
    expect(body.savingTotal).toBe('10120.00');
  });

  it('carries a null sale on a line no promotion reaches', async () => {
    givenPromotions([promotion()], { excludedIds: [PRODUCT_ID] });

    const body = await getCart();

    expect(body.items[0].pricing).toEqual({
      base: BASE_PRICE,
      sale: null,
      locked: false,
      headline: null,
      percentOff: null,
    });
    expect(body.savingTotal).toBe('0.00');
  });

  it('matches a filter-scoped promotion against the array facet columns', async () => {
    // `rooms` is text[] and lives in the cart's product projection. Dropping
    // that column would price a room-scoped sale on the PDP and not in the
    // cart — the same product at two prices on two pages.
    givenPromotions([
      promotion({ scopeType: 'filter', scopeFilter: { rooms: ['living-room'] } }),
    ]);

    const body = await getCart();
    expect(body.items[0].pricing.sale).toBe(SALE_PRICE);
  });

  it('leaves the stored lineTotal at the base figure', async () => {
    // A cart held across the end of a sale must not still charge sale prices,
    // so the discount never reaches the stored column: the read returns the
    // stored base untouched and hands the sale figure back beside it.
    givenPromotions([promotion()]);

    const body = await getCart();

    expect(body.items[0].lineTotal).toBe(BASE_PRICE);
    expect(body.items[0].pricing.base).toBe(BASE_PRICE);
    expect(body.subtotal).toBe(BASE_PRICE);
    // Reading a cart writes nothing.
    expect(updatedValues).toHaveLength(0);
  });

  it('never writes a discounted lineTotal when a quantity changes mid-sale', async () => {
    // The other half of the same rule, on the write path: PATCH recomputes
    // `(unitPrice + framePrice) * quantity` and that stays a base figure even
    // while a 40% promotion is live.
    givenPromotions([promotion()]);
    queueSelects(
      [{ cartItem: cartItemRow(), cart: cartRow() }],
      [{ itemCount: 2, subtotal: '50600.00' }]
    );
    queueUpdates([cartItemRow({ quantity: 2 })]);

    const res = await app.request(`/api/cart/items/${ITEM_ID}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'cart_session=guest_session_1',
      },
      body: JSON.stringify({ quantity: 2 }),
    });
    expect(res.status).toBe(200);

    expect(updatedValues[0]?.lineTotal).toBe('50600.00');
    // 15180.00 * 2 — what a sale price baked into the column would look like.
    expect(updatedValues[0]?.lineTotal).not.toBe('30360.00');
  });

  it('locks every line for a guest under a membersOnly promotion', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    givenCart([
      cartItemRow(),
      cartItemRow({ id: '66666666-6666-4666-8666-666666666666' }),
    ]);

    const body = await getCart();

    expect(body.items).toHaveLength(2);
    expect(body.items.every((i: { pricing: { locked: boolean } }) => i.pricing.locked)).toBe(true);
    // Locked means shown, not hidden — the price is the teaser behind the gate.
    expect(body.items[0].pricing.sale).toBe(SALE_PRICE);
    // ...and it is not money the guest has yet.
    expect(body.savingTotal).toBe('0.00');
  });

  it('unlocks the same promotion for a signed-in gallery member', async () => {
    signInAsMember();
    givenPromotions([promotion({ membersOnly: true })]);
    queueSelects([cartRow({ userId: 'user-1', sessionId: null })]);

    const body = await getCart();

    expect(body.items[0].pricing.locked).toBe(false);
    expect(body.savingTotal).toBe('10120.00');
  });

  it('discounts the line off its own variant price, not the product base price', async () => {
    // A cart line is priced from the variant (`cartItems.unitPrice`), so an
    // A1 print at 40000.00 comes down to 24000.00 — not to the 15180.00 the
    // product's own base price would resolve to.
    givenPromotions([promotion()]);
    givenCart([cartItemRow({ unitPrice: '40000.00' })]);

    const body = await getCart();

    expect(body.items[0].pricing.base).toBe('40000.00');
    expect(body.items[0].pricing.sale).toBe('24000.00');
    expect(body.savingTotal).toBe('16000.00');
  });

  it('multiplies across quantity and leaves the frame at full price', async () => {
    givenPromotions([promotion()]);
    givenCart([cartItemRow({ quantity: 2, framePrice: '2000.00' })]);

    const body = await getCart();

    // (25300 + 2000) * 2 base, (15180 + 2000) * 2 on sale — the frame is not
    // part of the artwork's discount.
    expect(body.items[0].pricing.base).toBe('54600.00');
    expect(body.items[0].pricing.sale).toBe('34360.00');
    expect(body.savingTotal).toBe('20240.00');
  });

  it('totals the saving across lines, rounding per line not on the subtotal', async () => {
    givenPromotions([promotion({ discountValue: 25 })]);
    givenCart([
      // 25% off 10.01 is 7.5075 → 7.51 a unit, so the line is 22.53.
      // Discounting the 30.03 line total instead would give 22.52.
      cartItemRow({ unitPrice: '10.01', quantity: 3 }),
      cartItemRow({ id: '66666666-6666-4666-8666-666666666666' }),
    ]);

    const body = await getCart();

    expect(body.items[0].pricing.base).toBe('30.03');
    expect(body.items[0].pricing.sale).toBe('22.53');
    expect(body.items[1].pricing.sale).toBe('18975.00');
    // 7.50 + 6325.00, each line's saving rounded before it is added.
    expect(body.savingTotal).toBe('6332.50');
  });

  it('reports no saving once the promotion has expired', async () => {
    // `getActivePromotions` is the clock: it filters on startsAt/endsAt, so an
    // ended sale is simply absent from the list (the filter itself is covered
    // by the resolver's own tests). What this pins is the cart's half of it —
    // the stored figure was never discounted, so base is what is left.
    givenPromotions([]);

    const body = await getCart();

    expect(body.items[0].pricing.sale).toBeNull();
    expect(body.items[0].pricing.locked).toBe(false);
    expect(body.items[0].lineTotal).toBe(BASE_PRICE);
    expect(body.savingTotal).toBe('0.00');
  });

  it('keeps a saved-for-later line out of the saving total', async () => {
    // The saving has to reconcile against `subtotal`, which counts active
    // lines only.
    givenPromotions([promotion()]);
    givenCart([
      cartItemRow(),
      cartItemRow({
        id: '66666666-6666-4666-8666-666666666666',
        isSavedForLater: true,
      }),
    ]);

    const body = await getCart();

    expect(body.items).toHaveLength(1);
    expect(body.savedForLater[0].pricing.sale).toBe(SALE_PRICE);
    expect(body.savingTotal).toBe('10120.00');
  });

  it('loads the promotion id sets once per request, not once per line', async () => {
    givenPromotions([promotion()]);
    givenCart([
      cartItemRow(),
      cartItemRow({ id: '66666666-6666-4666-8666-666666666666' }),
      cartItemRow({ id: '77777777-7777-4777-8777-777777777777' }),
    ]);

    await getCart();

    expect(getActivePromotionsMock).toHaveBeenCalledTimes(1);
    expect(loadPromotionProductSetsMock).toHaveBeenCalledTimes(1);
  });

  it('keys the cart cache on member state', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    await getCart();

    signInAsMember();
    queueSelects([cartRow({ userId: 'user-1', sessionId: null })]);
    await getCart();

    const [guestKey, memberKey] = cachedKeys();
    expect(guestKey).toContain(CART_ID);
    expect(memberKey).toContain(CART_ID);
    // Same cart, different viewer: one shared entry serves the guest's locked
    // body to the member.
    expect(memberKey).not.toBe(guestKey);
  });

  it('drops both viewer cache entries when a line is written', async () => {
    // Two keys mean two things to invalidate. Clearing only the writer's own
    // entry would leave the other viewer served the pre-mutation cart for the
    // rest of the TTL.
    queueSelects(
      [{ cartItem: cartItemRow(), cart: cartRow() }],
      [{ itemCount: 2, subtotal: '50600.00' }]
    );
    queueUpdates([cartItemRow({ quantity: 2 })]);

    await app.request(`/api/cart/items/${ITEM_ID}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'cart_session=guest_session_1',
      },
      body: JSON.stringify({ quantity: 2 }),
    });

    const dropped = deleteCachedMock.mock.calls.map((call) => String(call[0]));
    expect(dropped).toContain(`cart:${CART_ID}:guest`);
    expect(dropped).toContain(`cart:${CART_ID}:member`);
  });
});
