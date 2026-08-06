/**
 * Order creation and the cart cache (#511 final review, finding 4).
 *
 * `POST /api/orders` deletes the cart's lines and zeroes its totals inside its
 * transaction, but `GET /api/cart` answers out of a five-minute Redis entry —
 * one per viewer variant, member and guest — and nothing in `orders.ts` dropped
 * either of them.
 *
 * What that costs: payment verifies, the client empties its store and
 * invalidates its cart query, `CartSync` refetches, and the API serves the
 * CACHED pre-order payload. The customer lands on the order-success page with a
 * full cart badge holding the items they just bought.
 *
 * `db` is mocked, per the convention in this directory. The assertions are on
 * the cache keys actually dropped, because the whole bug was a correct database
 * write beside a cache that was never told.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

import { orders, orderItems } from '../../src/database/schema/orders';
import { users } from '../../src/database/schema/users';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const transactionMock = vi.fn();
const cartFindFirstMock = vi.fn();
const orderFindFirstMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
    query: {
      carts: { findFirst: (...args: unknown[]) => cartFindFirstMock(...args) },
      orders: { findFirst: (...args: unknown[]) => orderFindFirstMock(...args) },
    },
  },
}));

const deleteCachedMock = vi.fn();

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: (...args: unknown[]) => deleteCachedMock(...args),
  CacheKeys: { CART: 'cart:' },
}));

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
    loadPromotionProductSets: vi
      .fn()
      .mockResolvedValue({ includedIds: new Set(), excludedIds: new Set() }),
  };
});

import { ordersApp } from '../../src/routes/orders';

const app = new Hono();
app.route('/api/orders', ordersApp);

// ============================================================================
// Fixtures
// ============================================================================

const USER_ID = '44444444-4444-4444-8444-444444444444';
const CART_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '77777777-7777-4777-8777-777777777777';

const shippingAddress = {
  fullName: 'John Doe',
  phone: '9876543210',
  addressLine1: '123 MG Road',
  city: 'Bangalore',
  state: 'Karnataka',
  postalCode: '560001',
  countryCode: 'IN',
};

function cartItem() {
  return {
    id: 'cart-item-1',
    cartId: CART_ID,
    productId: PRODUCT_ID,
    variantId: 'variant-1',
    frameId: null,
    isSavedForLater: false,
    unitPrice: '2000.00',
    framePrice: '800.00',
    quantity: 1,
    lineTotal: '2800.00',
    isAiGenerated: false,
    aiGenerationId: null,
    customizations: null,
    product: {
      id: PRODUCT_ID,
      title: 'Golden Dunes',
      sku: 'SKU-DUNES',
      images: [],
      status: 'active',
      basePrice: '2000.00',
      styles: [],
      subjects: [],
      rooms: [],
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

function givenCart(items: ReturnType<typeof cartItem>[]) {
  cartFindFirstMock.mockResolvedValue({
    id: CART_ID,
    userId: USER_ID,
    isActive: true,
    items,
  });
}

function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    let rows: unknown[] = [];
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
      rows =
        table === users ? [{ galleryMember: false }] : (results[call++] ?? []);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

/** Records whether the cart rows were actually deleted, and when. */
let cartEmptied = false;

function installTransaction() {
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
            returning: async () => [
              {
                id: ORDER_ID,
                createdAt: new Date(),
                ...(Array.isArray(values) ? {} : (values as object)),
              },
            ],
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }),
          _table: table === orders || table === orderItems,
        }),
        delete: () => ({
          where: async () => {
            cartEmptied = true;
            // The cache must not be dropped before the rows are gone, or the
            // next read repopulates it from the state this is clearing.
            expect(deleteCachedMock).not.toHaveBeenCalled();
          },
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      };
      return callback(tx);
    }
  );
}

function signIn() {
  getSessionMock.mockResolvedValue({
    user: {
      id: USER_ID,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'customer',
      status: 'active',
      galleryMember: false,
    },
    session: { id: 'session-1', userId: USER_ID },
  });
}

async function postOrder() {
  return app.request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shippingAddress, shippingMethod: 'standard' }),
  });
}

/** The cache keys `deleteCached` was called with, in order. */
function droppedCacheKeys(): string[] {
  return deleteCachedMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  cartEmptied = false;
  deleteCachedMock.mockResolvedValue(undefined);
  installTransaction();
  signIn();
  givenCart([cartItem()]);
  queueSelects([{ count: 0 }]);
});

// ============================================================================
// Tests
// ============================================================================

describe('order creation drops the cart cache', () => {
  it('drops both viewer variants of the cart it just emptied', async () => {
    const res = await postOrder();

    expect(res.status).toBe(201);
    expect(cartEmptied).toBe(true);
    // Both, together. A member and a guest get different bodies for the same
    // cart, so clearing one leaves the other serving the pre-order payload for
    // the rest of the five-minute TTL.
    expect(droppedCacheKeys()).toEqual(
      expect.arrayContaining([`cart:${CART_ID}:guest`, `cart:${CART_ID}:member`])
    );
  });

  it('does not touch the cache when the cart is empty and no order is made', async () => {
    givenCart([]);

    const res = await postOrder();

    expect(res.status).toBe(400);
    expect(deleteCachedMock).not.toHaveBeenCalled();
  });
});
