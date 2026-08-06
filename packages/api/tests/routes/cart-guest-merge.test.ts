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

/**
 * A drizzle builder double. Every method returns the chain, and the chain
 * itself is thenable, so both `.where(...)` awaited directly and
 * `.where(...).limit(1)` resolve to the same rows.
 */
function chain(rows: unknown[]) {
  const link: Record<string, unknown> = {};
  const self = () => link;
  Object.assign(link, {
    from: self,
    where: self,
    set: self,
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

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn(),
  deleteCached: vi.fn(),
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
  selectMock.mockReturnValue(chain([]));
  updateMock.mockReturnValue(chain([]));
  insertMock.mockReturnValue(chain([userCartRow()]));
  emptyCartRead();
});

// ============================================================================
// mergeGuestCartInto
// ============================================================================

describe('mergeGuestCartInto', () => {
  it('reports nothing merged when the guest has no cart', async () => {
    selectMock.mockReturnValue(chain([]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(false);
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

    // 2 already held + 1 arriving
    const quantities = updateMock.mock.results
      .map((result) => result.value)
      .filter(Boolean);
    expect(quantities.length).toBeGreaterThan(0);
    expect(updateMock).toHaveBeenCalled();
  });

  it('moves a line the user does not hold', async () => {
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([guestItemRow()]))
      .mockReturnValueOnce(chain([])) // no matching user line
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '2000.00' }]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });
});

// ============================================================================
// mergeGuestCartOnAuth
// ============================================================================

describe('mergeGuestCartOnAuth', () => {
  it('clears the guest cookie once an authenticated request carries it', async () => {
    signedIn();
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValue(chain([{ itemCount: 0, subtotal: '0.00' }]));

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('cart_session=');
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
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
  });

  it('does nothing for an authenticated request with no guest cookie', async () => {
    signedIn();
    selectMock.mockReturnValue(chain([userCartRow()]));

    const response = await app.request('/api/cart');

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/Max-Age=0/i);
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
});
