/**
 * Joining must be visible to server-side pricing immediately (#526).
 *
 * better-auth serves the whole session — `galleryMember` included, it is a
 * `user.additionalFields` entry (#439) — from a signed cookie for five minutes
 * (`session.cookieCache`, packages/api/src/auth/index.ts). `POST
 * /api/gallery/join` writes the row. Without something that also re-issues the
 * session, every server read for the rest of that window still says "guest",
 * and `POST /api/orders` charges base while the storefront, driven by the
 * optimistic client signal (#446), shows the discount unlocked. A customer
 * shown a discount and billed without it is the worst failure this feature can
 * produce, and it is invisible from the browser.
 *
 * So the model here is deliberate: `auth.api.getSession` IS the cookie cache.
 * The tests set the session and the users row to DIFFERENT values on purpose
 * and assert that money follows the row — in both directions. A stale "guest"
 * must not cost a member their discount, and a stale "member" must not buy one
 * that was never earned.
 *
 * `db` is mocked, so nothing here can catch a bad column reference; that guard
 * lives in tests/database/. `resolveSalePrice` is real — the point is that the
 * genuine resolver's arithmetic reaches the persisted row.
 *
 * @see packages/api/src/routes/gallery.ts
 * @see packages/api/src/routes/orders.ts
 * @see packages/api/src/services/gallery-membership.ts
 * @see packages/api/src/lib/session-refresh.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

import type { Promotion } from '../../src/database/schema/promotions';
import { orders, orderItems } from '../../src/database/schema/orders';
import { users } from '../../src/database/schema/users';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const updateMock = vi.fn();
const transactionMock = vi.fn();
const cartFindFirstMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
    query: {
      carts: { findFirst: (...args: unknown[]) => cartFindFirstMock(...args) },
      orders: { findFirst: vi.fn() },
    },
  },
}));

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

import { galleryApp } from '../../src/routes/gallery';
import { ordersApp } from '../../src/routes/orders';
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/gallery', galleryApp);
app.route('/api/orders', ordersApp);

// ============================================================================
// Fixtures
// ============================================================================

const PROMOTION_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const CART_ID = '66666666-6666-4666-8666-666666666666';
const ORDER_ID = '77777777-7777-4777-8777-777777777777';

/** What a refreshed better-auth cookie cache looks like on the wire. */
const REFRESHED_COOKIE =
  'chobii.session_data=refreshed-payload; Path=/; HttpOnly; SameSite=Lax; Max-Age=300';

const shippingAddress = {
  fullName: 'John Doe',
  phone: '9876543210',
  addressLine1: '123 MG Road',
  city: 'Bangalore',
  state: 'Karnataka',
  postalCode: '560001',
  countryCode: 'IN',
};

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: PROMOTION_ID,
    name: 'Gallery Members Sale',
    headline: 'MEMBERS SAVE 40%',
    discountType: 'percentage',
    discountValue: 40,
    scopeType: 'all',
    scopeFilter: null,
    membersOnly: true,
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

function cartItem() {
  return {
    id: 'cart-item-1',
    cartId: CART_ID,
    productId: PRODUCT_ID,
    variantId: 'variant-1',
    frameId: null,
    isSavedForLater: false,
    unitPrice: '1000.00',
    framePrice: '0.00',
    quantity: 2,
    lineTotal: '2000.00',
    isAiGenerated: false,
    aiGenerationId: null,
    customizations: null,
    product: {
      id: PRODUCT_ID,
      title: 'Golden Dunes',
      sku: 'SKU-DUNES',
      images: [],
      status: 'active',
      basePrice: '1000.00',
      styles: ['wabi-sabi'],
      subjects: ['abstract'],
      rooms: ['living-room'],
      isFeatured: false,
    },
    variant: {
      id: 'variant-1',
      sizeLabel: 'A2',
      widthInches: 16,
      heightInches: 24,
      isInStock: true,
    },
    frame: null,
  };
}

// ============================================================================
// The users row — the only membership truth in this file
// ============================================================================

type UserRow = {
  galleryMember: boolean;
  galleryJoinedAt: Date | null;
  marketingConsentAt: Date | null;
  joinSource: string | null;
};

let userRow: UserRow;

/** False models a session whose account row is gone — the select finds none. */
let userRowExists = true;

function givenNeverJoined() {
  userRow = {
    galleryMember: false,
    galleryJoinedAt: null,
    marketingConsentAt: null,
    joinSource: null,
  };
}

function givenAlreadyJoined() {
  userRow = {
    galleryMember: true,
    galleryJoinedAt: new Date('2026-01-04T09:30:00.000Z'),
    marketingConsentAt: new Date('2026-01-04T09:30:00.000Z'),
    joinSource: 'banner',
  };
}

/**
 * Every `db.select(...)` in play, answered by the table it reads.
 *
 * `users` gets the row above — that is what both `joinGallery` and the order's
 * membership check read. Everything else is a count (settled orders under a
 * promotion, and the order-number sequence), and zero is right for both.
 */
function installSelect() {
  selectMock.mockImplementation(() => {
    let rows: unknown[] = [{ count: 0 }];
    const chain: Record<string, unknown> = {};
    for (const key of [
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
    chain.from = (table: unknown) => {
      if (table === users) rows = userRowExists ? [{ ...userRow }] : [];
      return chain;
    };
    chain.then = (resolve: (value: unknown) => void) => resolve(rows);
    return chain;
  });
}

/** The join's write, reflected back into the row the selects serve. */
function installUpdate() {
  updateMock.mockImplementation((table: unknown) => ({
    set: (payload: Partial<UserRow>) => ({
      where: async () => {
        if (table === users) userRow = { ...userRow, ...payload };
        return undefined;
      },
    }),
  }));
}

// ============================================================================
// The session — i.e. better-auth's five-minute cookie cache
// ============================================================================

/** What the CACHED cookie says, which is not necessarily what the row says. */
let cachedGalleryMember = false;

/** Set-Cookie headers better-auth hands back from a cache-bypassing read. */
let refreshCookies: string[] = [REFRESHED_COOKIE];

function sessionPayload() {
  return {
    user: {
      id: USER_ID,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'customer',
      status: 'active',
      galleryMember: cachedGalleryMember,
    },
    session: { id: 'session-1', userId: USER_ID },
  };
}

/**
 * `auth.api.getSession` stands in for the cookie cache: a plain call answers
 * from the cached payload, and a `returnHeaders` call — the shape the refresh
 * uses — additionally hands back the Set-Cookie better-auth would have written.
 */
function installSession() {
  getSessionMock.mockImplementation(
    async (options: { returnHeaders?: boolean } = {}) => {
      if (options.returnHeaders) {
        const headers = new Headers();
        for (const cookie of refreshCookies) {
          headers.append('set-cookie', cookie);
        }
        return { headers, response: sessionPayload() };
      }
      return sessionPayload();
    }
  );
}

// ============================================================================
// The order transaction
// ============================================================================

let persistedOrder: Record<string, string | null> = {};
let persistedItems: Record<string, string>[] = [];

function installTransaction() {
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (
            values: Record<string, unknown> | Record<string, unknown>[]
          ) => {
            if (table === orders) {
              persistedOrder = values as Record<string, string | null>;
            }
            if (table === orderItems) {
              persistedItems = values as Record<string, string>[];
            }
            return {
              returning: async () => [
                { id: ORDER_ID, createdAt: new Date(), ...(values as object) },
              ],
              then: (resolve: (value: unknown) => void) => resolve(undefined),
            };
          },
        }),
        delete: () => ({ where: async () => undefined }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      };
      return callback(tx);
    }
  );
}

// ============================================================================
// Requests
// ============================================================================

function givenPromotions(active: Promotion[]) {
  getActivePromotionsMock.mockResolvedValue(active);
  loadPromotionProductSetsMock.mockResolvedValue({
    includedIds: new Set<string>(),
    excludedIds: new Set<string>(),
  });
}

const join = (body: unknown = { source: 'banner' }) =>
  app.request('/api/gallery/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const postOrder = () =>
  app.request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shippingAddress, shippingMethod: 'standard' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  persistedOrder = {};
  persistedItems = [];
  cachedGalleryMember = false;
  refreshCookies = [REFRESHED_COOKIE];
  userRowExists = true;

  givenNeverJoined();
  installSelect();
  installUpdate();
  installSession();
  installTransaction();
  givenPromotions([promotion()]);

  cartFindFirstMock.mockResolvedValue({
    id: CART_ID,
    userId: USER_ID,
    isActive: true,
    items: [cartItem()],
  });
});

// ============================================================================
// The acceptance bar
// ============================================================================

describe('join, then immediately create an order', () => {
  it('applies the members-only discount even though the cached session still says guest', async () => {
    const joined = await join();
    expect(joined.status).toBe(200);

    // The cookie cache has NOT expired — this is the whole bug. Five minutes
    // of a fresh member reading as a guest to the server.
    expect(cachedGalleryMember).toBe(false);

    const res = await postOrder();
    expect(res.status).toBe(201);

    // 40% of 1000.00 a unit, two units.
    expect(persistedOrder.promotionDiscount).toBe('800.00');
    expect(persistedOrder.promotionId).toBe(PROMOTION_ID);
    expect(persistedItems[0]?.itemDiscount).toBe('800.00');
    // Gross subtotal, 2000.00 clears free shipping, discount off once.
    expect(persistedOrder.total).toBe('1200.00');
  });

  it('applies it for a member whose session agrees, unchanged', async () => {
    givenAlreadyJoined();
    cachedGalleryMember = true;

    await postOrder();

    expect(persistedOrder.promotionDiscount).toBe('800.00');
    expect(persistedOrder.promotionId).toBe(PROMOTION_ID);
  });
});

// ============================================================================
// The mirror case
// ============================================================================

describe('a discount nobody earned', () => {
  it('charges base when the cached session says member but the row does not', async () => {
    // No join has happened. Whatever the cookie is carrying — a stale value,
    // a replayed one — the row is what the till reads.
    cachedGalleryMember = true;
    givenNeverJoined();

    const res = await postOrder();
    expect(res.status).toBe(201);

    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.promotionId).toBeNull();
    expect(persistedItems[0]?.itemDiscount).toBe('0.00');
    expect(persistedOrder.total).toBe('2000.00');
  });

  it('charges base when neither the row nor the session claims membership', async () => {
    await postOrder();

    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.total).toBe('2000.00');
  });

  it('charges base for a live session over a users row that no longer exists', async () => {
    cachedGalleryMember = true;
    // The session outlives the account it was issued for. A membership held by
    // no one is not a membership.
    userRowExists = false;

    const res = await postOrder();
    expect(res.status).toBe(201);

    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.total).toBe('2000.00');
  });
});

// ============================================================================
// What the join does to the session
// ============================================================================

describe('POST /api/gallery/join re-issues the session', () => {
  it('answers with the refreshed session cookie', async () => {
    const res = await join();

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('chobii.session_data=');
  });

  it('asks better-auth for the session with the cookie cache bypassed', async () => {
    await join();

    expect(getSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ disableCookieCache: true }),
        returnHeaders: true,
      })
    );
  });

  it('forwards every cookie better-auth sets as its own header, not just the first', async () => {
    // Not hypothetical: the cached payload is chunked, so a real refresh comes
    // back as two `chobii.session_data` headers. Collapsing them into one
    // comma-joined value gives the browser a cookie it cannot parse.
    refreshCookies = [
      REFRESHED_COOKIE,
      'chobii.session_data_1=chunk-two; Path=/; HttpOnly',
    ];

    const res = await join();

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('chobii.session_data=');
    expect(setCookies[1]).toContain('chobii.session_data_1=');
  });

  it('refreshes for a re-join too, so an already-member with a stale cookie recovers', async () => {
    givenAlreadyJoined();

    const res = await join();

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('chobii.session_data=');
  });

  it('still returns the membership when the refresh throws', async () => {
    getSessionMock.mockImplementation(
      async (options: { returnHeaders?: boolean } = {}) => {
        if (options.returnHeaders) throw new Error('better-auth is unhappy');
        return sessionPayload();
      }
    );

    const res = await join();

    // The row is written. A cookie that would not re-issue costs a stale UI
    // for a few minutes, not the join and not the price.
    expect(res.status).toBe(200);
    expect((await readJson(res)).galleryMember).toBe(true);
    expect(userRow.galleryMember).toBe(true);
  });

  it('does not fail the join when better-auth sets no cookie at all', async () => {
    refreshCookies = [];

    const res = await join();

    expect(res.status).toBe(200);
    expect((await readJson(res)).galleryMember).toBe(true);
  });

  it('leaves a rejected join alone — nothing to re-issue', async () => {
    const res = await join({ source: 'not-a-real-surface' });

    expect(res.status).toBe(400);
    expect(getSessionMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ returnHeaders: true })
    );
  });
});

// ============================================================================
// What the extra read costs
// ============================================================================

describe('the membership read at order time', () => {
  it('is not paid for when no promotion is members-only', async () => {
    givenPromotions([promotion({ membersOnly: false })]);

    await postOrder();

    // Membership cannot change a price here, so nothing asks the database for
    // it: the only select is the order-number sequence.
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(persistedOrder.promotionDiscount).toBe('800.00');
  });

  it('is not paid for when no promotion is active', async () => {
    givenPromotions([]);

    await postOrder();

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(persistedOrder.promotionDiscount).toBe('0.00');
  });

  it('is one read, not one per line', async () => {
    cartFindFirstMock.mockResolvedValue({
      id: CART_ID,
      userId: USER_ID,
      isActive: true,
      items: [
        { ...cartItem(), id: 'cart-item-1' },
        { ...cartItem(), id: 'cart-item-2' },
        { ...cartItem(), id: 'cart-item-3' },
      ],
    });
    givenAlreadyJoined();

    await postOrder();

    // Membership, then the order number. Nothing per line.
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});
