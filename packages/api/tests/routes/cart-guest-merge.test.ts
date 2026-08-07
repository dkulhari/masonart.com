/**
 * Guest cart → user cart, on the first authenticated request (#511).
 *
 * The old POST /api/cart/merge asked the client for a guest session id that
 * lives in an httpOnly cookie and is absent from the cart payload — so it could
 * never be called. These tests pin the replacement: the merge happens where the
 * cookie is readable, and the cookie is cleared so it cannot happen twice.
 *
 * `db` is mocked, per the convention in this directory. What this catches is
 * the wiring — who merges, when, and what happens to the cookie.
 *
 * `.where(...)` and `.set(...)` are recorded (not just call-counted) because
 * this suite's double is otherwise entirely call-order-based: with canned
 * per-call return values, a bug that swaps arguments, drops the existing
 * quantity, or merges into the wrong cart would still walk the same call
 * sequence and pass. `paramValues` reads the literal values back out of a real
 * drizzle condition — `eq`/`and` are not mocked — so an assertion here is
 * checking what the query actually targeted, not just that a query happened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const updateMock = vi.fn();
const insertMock = vi.fn();
const cartFindFirstMock = vi.fn();

/** Every `.where(...)` argument seen on any select/update chain, in call order. */
const whereCalls: unknown[] = [];
/** Every `.set(...)` argument seen on any update chain, in call order. */
const setCalls: Record<string, unknown>[] = [];

/**
 * Pull the literal bind values out of a real drizzle where-condition.
 *
 * `eq`/`and` build a tree of `SQL` nodes whose leaves are `Param` instances
 * carrying `.value`; everything else (table/column refs) is structural and
 * self-referential, hence the `seen` guard against the real circularity
 * (`PgUUID.table` points back at the table that owns it).
 */
function paramValues(node: unknown, seen = new Set<unknown>()): unknown[] {
  if (node === null || typeof node !== 'object') return [];
  if (seen.has(node)) return [];
  seen.add(node);

  const out: unknown[] = [];
  const typed = node as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };

  if (typed.constructor?.name === 'Param' && 'value' in typed) {
    out.push(typed.value);
  }

  if (Array.isArray(node)) {
    for (const item of node) out.push(...paramValues(item, seen));
  } else if (Array.isArray(typed.queryChunks)) {
    for (const item of typed.queryChunks) out.push(...paramValues(item, seen));
  }

  return out;
}

/**
 * A drizzle builder double. Every method returns the chain, and the chain
 * itself is thenable, so both `.where(...)` awaited directly and
 * `.where(...).limit(1)` resolve to the same rows. `.where` and `.set` also
 * record their real argument into the shared arrays above.
 */
function chain(rows: unknown[]) {
  const link: Record<string, unknown> = {};
  const self = () => link;
  Object.assign(link, {
    from: self,
    where: (condition: unknown) => {
      whereCalls.push(condition);
      return link;
    },
    set: (values: Record<string, unknown>) => {
      setCalls.push(values);
      return link;
    },
    values: self,
    limit: () => Promise.resolve(rows),
    returning: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  });
  return link;
}

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    query: {
      carts: { findFirst: (...args: unknown[]) => cartFindFirstMock(...args) },
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
  CacheKeys: { CART: 'cart:' },
}));

/** `optionalAuth` reads the session through here; a null session is a guest. */
const getSessionMock = vi.fn();

vi.mock('../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}));

vi.mock('../../src/lib/promotion-pricing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/promotion-pricing')>();
  return {
    ...actual,
    getActivePromotions: vi.fn().mockResolvedValue([]),
    loadPromotionProductSets: vi.fn().mockResolvedValue(new Map()),
  };
});

import { cartApp, mergeGuestCartInto } from '../../src/routes/cart';

const app = new Hono();
app.route('/api/cart', cartApp);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_CART_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_CART_ID = '33333333-3333-4333-8333-333333333333';
const GUEST_SESSION = 'guest_1754000000000_abc123';

function guestCartRow() {
  return { id: GUEST_CART_ID, userId: null, sessionId: GUEST_SESSION, isActive: true };
}

function userCartRow() {
  return { id: USER_CART_ID, userId: USER_ID, sessionId: null, isActive: true };
}

function guestItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    cartId: GUEST_CART_ID,
    productId: 'prod-1',
    variantId: 'var-1',
    frameId: null,
    quantity: 1,
    unitPrice: '2000.00',
    framePrice: '0.00',
    lineTotal: '2000.00',
    isSavedForLater: false,
    ...overrides,
  };
}

function signedIn() {
  getSessionMock.mockResolvedValue({ user: { id: USER_ID, email: 'a@b.c' } });
}

function guest() {
  getSessionMock.mockResolvedValue(null);
}

/** The cache keys `deleteCached` was called with, in order. */
function droppedCacheKeys(): string[] {
  return deleteCachedMock.mock.calls.map((call) => String(call[0]));
}

/** An empty cart read, so GET /api/cart succeeds after the middleware runs. */
function emptyCartRead() {
  cartFindFirstMock.mockResolvedValue({
    id: USER_CART_ID,
    userId: USER_ID,
    itemCount: 0,
    subtotal: '0.00',
    couponCode: null,
    couponDiscount: '0.00',
    currency: 'INR',
    items: [],
    createdAt: new Date('2026-08-06T06:00:00.000Z'),
    updatedAt: new Date('2026-08-06T06:00:00.000Z'),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  whereCalls.length = 0;
  setCalls.length = 0;
  selectMock.mockReturnValue(chain([]));
  updateMock.mockReturnValue(chain([]));
  insertMock.mockReturnValue(chain([userCartRow()]));
  getCachedMock.mockResolvedValue(null);
  setCachedMock.mockResolvedValue(undefined);
  deleteCachedMock.mockResolvedValue(undefined);
  emptyCartRead();
});

// ============================================================================
// mergeGuestCartInto
// ============================================================================

describe('mergeGuestCartInto', () => {
  it('reports nothing merged when the guest has no cart', async () => {
    selectMock.mockReturnValue(chain([]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(false);

    // No guest cart found means nothing else runs — no write, no cache drop.
    expect(setCalls).toHaveLength(0);
    expect(deleteCachedMock).not.toHaveBeenCalled();
  });

  it('sums the quantity when the user already holds the same line', async () => {
    const existing = { ...guestItemRow(), id: 'user-line-1', cartId: USER_CART_ID, quantity: 2 };
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()])) // find guest cart
      .mockReturnValueOnce(chain([userCartRow()])) // get or create user cart
      .mockReturnValueOnce(chain([guestItemRow()])) // guest items
      .mockReturnValueOnce(chain([existing])) // matching user line
      .mockReturnValue(chain([{ itemCount: 3, subtotal: '6000.00' }]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(true);

    // The guest cart itself was looked up by the session id handed in.
    expect(paramValues(whereCalls[0])).toContain(GUEST_SESSION);
    // 2 already held + 1 arriving — the actual value written, not just that
    // *some* update happened. A regression that dropped the existing count
    // (`newQuantity = item.quantity`) would write `quantity: 1` here.
    expect(setCalls[0]).toEqual({ quantity: 3, lineTotal: '6000.00' });
    // The guest cart's cache entries — both viewer variants — are dropped so
    // a stale read can't survive the merge.
    expect(droppedCacheKeys().filter((key) => key.includes(GUEST_CART_ID))).toHaveLength(2);
  });

  it('moves a line the user does not hold', async () => {
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([guestItemRow()]))
      .mockReturnValueOnce(chain([])) // no matching user line
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '2000.00' }]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(true);

    // The line itself was reassigned to the user's cart, not summed into one
    // that doesn't exist.
    expect(setCalls[0]).toEqual({ cartId: USER_CART_ID });
    expect(droppedCacheKeys().filter((key) => key.includes(GUEST_CART_ID))).toHaveLength(2);
  });

  it('matches the existing-line lookup on frameId, not just product and variant', async () => {
    // Every other case in this file carries `frameId: null`, which takes the
    // ternary's `IS NULL` branch (a raw SQL fragment referencing the column,
    // not a bind parameter — see cart.ts's `item.frameId ? eq(...) : sql\`...\``).
    // A framed line takes the other branch, `eq(cartItems.frameId, ...)`, which
    // nothing else here exercises.
    const guestItem = guestItemRow({ frameId: 'frame-1' });
    const existing = { ...guestItem, id: 'user-line-1', cartId: USER_CART_ID, quantity: 2 };
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([guestItem]))
      .mockReturnValueOnce(chain([existing])) // matching line, same frame
      .mockReturnValue(chain([{ itemCount: 3, subtotal: '6000.00' }]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(true);

    // whereCalls: 0 guest-cart lookup, 1 getOrCreateCart's user-cart lookup,
    // 2 guest-items fetch (cartId only), 3 the existing-line match — the one
    // that carries the frame filter.
    expect(paramValues(whereCalls[3])).toContain('frame-1');
    expect(setCalls[0]).toEqual({ quantity: 3, lineTotal: '6000.00' });
  });
});

// ============================================================================
// mergeGuestCartOnAuth
// ============================================================================

describe('mergeGuestCartOnAuth', () => {
  it('clears the guest cookie having actually merged the cart the cookie names', async () => {
    signedIn();
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([guestItemRow()])) // one guest line to move
      .mockReturnValueOnce(chain([])) // no matching user line
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '2000.00' }]));

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('cart_session=');
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);

    // The cookie being cleared is necessary but not sufficient — pin that a
    // merge actually ran, against the cart the cookie named, and moved its
    // line. A middleware that just deleted the cookie without merging (or
    // called mergeGuestCartInto with the wrong argument) would still clear
    // the cookie and 200, but neither of these would be true.
    expect(paramValues(whereCalls[0])).toContain(GUEST_SESSION);
    expect(setCalls[0]).toEqual({ cartId: USER_CART_ID });
    expect(droppedCacheKeys().filter((key) => key.includes(GUEST_CART_ID))).toHaveLength(2);
  });

  it('leaves a guest s own cookie alone', async () => {
    guest();
    cartFindFirstMock.mockResolvedValue({
      id: GUEST_CART_ID,
      userId: null,
      itemCount: 0,
      subtotal: '0.00',
      couponCode: null,
      couponDiscount: '0.00',
      currency: 'INR',
      items: [],
      createdAt: new Date('2026-08-06T06:00:00.000Z'),
      updatedAt: new Date('2026-08-06T06:00:00.000Z'),
    });
    selectMock.mockReturnValue(chain([guestCartRow()]));

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/Max-Age=0/i);
    // No user on the request means no merge attempt at all — a guest reading
    // their own cart never writes.
    expect(setCalls).toHaveLength(0);
  });

  it('does nothing for an authenticated request with no guest cookie', async () => {
    signedIn();
    selectMock.mockReturnValue(chain([userCartRow()]));

    const response = await app.request('/api/cart');

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/Max-Age=0/i);
    expect(setCalls).toHaveLength(0);
  });

  it('serves the cart even when the merge blows up', async () => {
    signedIn();
    selectMock.mockImplementationOnce(() => {
      throw new Error('connection reset');
    });

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
  });

  it('keeps the guest cookie when the merge blows up, so a transient failure can retry', async () => {
    signedIn();
    selectMock.mockImplementationOnce(() => {
      throw new Error('connection reset');
    });

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    // Deleting the cookie here would swallow the error and destroy the only
    // handle to the guest cart in the same breath, with no retry. Keeping it
    // costs nothing — the next authenticated request just tries the merge
    // again — and "don't retry forever" is a problem for a marker, not for
    // discarding the cart (#567).
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/Max-Age=0/i);
  });
});
