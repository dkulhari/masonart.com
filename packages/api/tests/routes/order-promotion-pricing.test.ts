/**
 * Sale pricing at order creation.
 *
 * The storefront can show a sale price; only this route decides what is
 * charged. So these tests assert on the row that gets *persisted* — the values
 * handed to `insert(orders)` and `insert(orderItems)` — not on the response
 * body, which is a projection of it.
 *
 * `db` is mocked, so nothing here can catch a reference to a column that does
 * not exist; that guard lives in tests/database/. What these catch is the money
 * model: which bucket each figure lands in, that `subtotal` stays gross, that
 * the discount comes off `total` exactly once, and that a client cannot ask for
 * a price.
 *
 * `resolveSalePrice` is deliberately NOT stubbed — it is pure, and the point is
 * that the real resolver's arithmetic is what reaches the database. Only the
 * two db-touching loaders are replaced.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { FREE_SHIPPING_THRESHOLD } from '@chobii/shared';
import '../setup';

import type { Promotion } from '../../src/database/schema/promotions';
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

/**
 * The threshold is an admin setting as of #569. It is stubbed here rather than
 * left to the real accessor so these tests state which figure is in force, and
 * so `db` — mocked, with no `shippingConfig` query on it — is not what decides
 * the answer.
 */
const getFreeShippingThresholdMock = vi.fn();

vi.mock('../../src/lib/shipping-config', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/shipping-config')>();
  return {
    ...actual,
    getFreeShippingThreshold: (...args: unknown[]) =>
      getFreeShippingThresholdMock(...args),
  };
});

import { ordersApp, createOrderSchema } from '../../src/routes/orders';
import { adminOrdersApp } from '../../src/routes/admin/orders';
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/orders', ordersApp);
app.route('/api/admin/orders', adminOrdersApp);

// ============================================================================
// Fixtures
// ============================================================================

const PROMOTION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROMOTION_ID = '55555555-5555-4555-8555-555555555555';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const CART_ID = '66666666-6666-4666-8666-666666666666';
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
 * One cart line. `unitPrice` is the variant's price and `framePrice` the frame
 * add-on, exactly as `cart.ts` stores them; `lineTotal` is their base sum.
 */
function cartItem(overrides: Record<string, unknown> = {}) {
  const unitPrice = String(overrides.unitPrice ?? '1000.00');
  const framePrice = String(overrides.framePrice ?? '0.00');
  const quantity = Number(overrides.quantity ?? 2);

  return {
    id: 'cart-item-1',
    cartId: CART_ID,
    productId: PRODUCT_ID,
    variantId: 'variant-1',
    frameId: null,
    isSavedForLater: false,
    unitPrice,
    framePrice,
    quantity,
    lineTotal: (
      (parseFloat(unitPrice) + parseFloat(framePrice)) *
      quantity
    ).toFixed(2),
    isAiGenerated: false,
    aiGenerationId: null,
    customizations: null,
    product: {
      id: PRODUCT_ID,
      title: 'Golden Dunes',
      sku: 'SKU-DUNES',
      images: [],
      status: 'active',
      // The catalogue price. Pricing works off the variant's `unitPrice`, so a
      // stale base here must not change what is charged.
      basePrice: '999999.00',
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
    ...overrides,
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

/**
 * What the users row says about membership.
 *
 * Order creation reads this from the database rather than the session (#526):
 * `galleryMember` rides a five-minute cookie cache, and money must not be
 * decided by a cache in either direction. `signIn({ galleryMember })` therefore
 * sets what the SESSION believes and nothing more — it no longer moves a price.
 */
let memberRow = { galleryMember: false };

function givenMember(isMember: boolean) {
  memberRow = { galleryMember: isMember };
}

/**
 * Answers successive `db.select(...)` calls in order. Order creation issues one
 * count per limited promotion in play, then one for the order number.
 *
 * The membership read is addressed by TABLE rather than by position: it happens
 * only when a members-only promotion is in play, so letting it consume a queued
 * slot would shift every count in every other test.
 */
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
      rows = table === users ? [{ ...memberRow }] : (results[call++] ?? []);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

function signIn(user: Record<string, unknown> = {}) {
  getSessionMock.mockResolvedValue({
    user: {
      id: USER_ID,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'customer',
      status: 'active',
      galleryMember: false,
      ...user,
    },
    session: { id: 'session-1', userId: USER_ID },
  });
}

// What the transaction was asked to persist.
let persistedOrder: Record<string, string | null> = {};
let persistedItems: Record<string, string>[] = [];

function installTransaction() {
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (table: unknown) => ({
          values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
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
              then: (resolve: (v: unknown) => void) => resolve(undefined),
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

async function postOrder(body: Record<string, unknown> = {}) {
  return app.request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shippingAddress,
      shippingMethod: 'standard',
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  persistedOrder = {};
  persistedItems = [];
  memberRow = { galleryMember: false };
  installTransaction();
  signIn();
  givenCart([cartItem()]);
  givenPromotions([]);
  // Nothing configured, so the shared constant is what is in force — the same
  // answer the real accessor gives against an empty table.
  getFreeShippingThresholdMock.mockResolvedValue(FREE_SHIPPING_THRESHOLD);
  // Only the order-number count, for a promotion with no per-customer limit.
  queueSelects([{ count: 0 }]);
});

// ============================================================================
// The money model
// ============================================================================

describe('order creation — promotion discount', () => {
  it('writes zeros in every discount bucket when no promotion is active', async () => {
    givenPromotions([]);

    const res = await postOrder();
    expect(res.status).toBe(201);

    expect(persistedOrder.promotionId).toBeNull();
    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.couponDiscount).toBe('0.00');
    expect(persistedOrder.discount).toBe('0.00');
    expect(persistedItems[0]?.itemDiscount).toBe('0.00');
    // 2 x 1000.00, well clear of the free-shipping threshold, nothing off.
    expect(persistedOrder.subtotal).toBe('2000.00');
    expect(persistedOrder.total).toBe('2000.00');
  });

  it('writes the per-line discount, the promotion total and the promotion id', async () => {
    givenPromotions([promotion()]);

    const res = await postOrder();
    expect(res.status).toBe(201);

    // 40% of 1000.00 is 400.00 a unit, two units on the line.
    expect(persistedItems).toHaveLength(1);
    expect(persistedItems[0]?.itemDiscount).toBe('800.00');
    expect(persistedOrder.promotionDiscount).toBe('800.00');
    expect(persistedOrder.promotionId).toBe(PROMOTION_ID);
  });

  it('leaves couponDiscount alone and derives discount from the two buckets', async () => {
    givenPromotions([promotion()]);

    await postOrder();

    // Codes are D8's column. This feature never writes it.
    expect(persistedOrder.couponDiscount).toBe('0.00');
    expect(persistedOrder.discount).toBe(
      (
        parseFloat(String(persistedOrder.promotionDiscount)) +
        parseFloat(String(persistedOrder.couponDiscount))
      ).toFixed(2)
    );
  });

  it('keeps subtotal gross and takes the discount off the total exactly once', async () => {
    givenPromotions([promotion()]);

    await postOrder();

    // Settled by owner decision, 2026-08-07: subtotal is the sum of base line
    // totals, and `total` is the only place the discount is subtracted.
    expect(persistedOrder.subtotal).toBe('2000.00');
    expect(persistedOrder.discount).toBe('800.00');
    // 1200.00 net still clears the threshold, so 0.00 shipping.
    expect(persistedOrder.shippingCost).toBe('0.00');
    expect(persistedOrder.total).toBe('1200.00');
  });

  it('discounts the poster, not the frame it is sold in', async () => {
    givenPromotions([promotion()]);
    givenCart([
      cartItem({ unitPrice: '1000.00', framePrice: '500.00', quantity: 1 }),
    ]);

    await postOrder();

    // 40% of the 1000.00 poster, never of the 500.00 frame: a promotion is
    // scoped over products, and frames are not products.
    expect(persistedItems[0]?.itemDiscount).toBe('400.00');
    expect(persistedOrder.subtotal).toBe('1500.00');
    // 1100.00 net, still clear of the threshold.
    expect(persistedOrder.total).toBe('1100.00');
  });

  it('prices from the variant on the line, not the catalogue base price', async () => {
    // The fixture's product row carries a deliberately absurd basePrice.
    givenPromotions([promotion()]);

    await postOrder();

    expect(persistedItems[0]?.itemDiscount).toBe('800.00');
  });

  it('leaves an excluded product at base', async () => {
    givenPromotions([promotion()], { excludedIds: [PRODUCT_ID] });

    await postOrder();

    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.promotionId).toBeNull();
    expect(persistedItems[0]?.itemDiscount).toBe('0.00');
  });

  it('discounts only the lines the promotion covers', async () => {
    givenPromotions([
      promotion({ scopeType: 'products' }),
    ], { includedIds: [PRODUCT_ID] });
    givenCart([
      cartItem({ id: 'cart-item-1', quantity: 1 }),
      cartItem({
        id: 'cart-item-2',
        quantity: 1,
        productId: OTHER_PRODUCT_ID,
        product: { ...cartItem().product, id: OTHER_PRODUCT_ID },
      }),
    ]);

    await postOrder();

    expect(persistedItems[0]?.itemDiscount).toBe('400.00');
    expect(persistedItems[1]?.itemDiscount).toBe('0.00');
    expect(persistedOrder.promotionDiscount).toBe('400.00');
  });
});

// ============================================================================
// The free-shipping threshold
// ============================================================================

/**
 * Settled by owner decision, 2026-08-07 (design §5).
 *
 * The threshold reads the NET, post-discount figure — the promotion is
 * price-level, and §5's layering puts price above shipping. It does NOT read
 * the gift card: a card is tender, applied after tax against the amount due, so
 * it can never buy free shipping.
 *
 * `FREE_SHIPPING_THRESHOLD` is imported rather than written as a literal on
 * purpose. It is the same module the cart page reads (#568), and a test that
 * hardcoded 999 would keep passing on the day the two sides drifted apart —
 * which is precisely the bug: a cart promising free shipping that the checkout
 * then charges for.
 */
describe('order creation — the free-shipping threshold', () => {
  it('charges shipping on a cart that clears the threshold gross but not net', async () => {
    // 2 x 800.00 = 1600.00 gross, clear of 999. 40% off leaves 960.00, which
    // is not.
    givenCart([cartItem({ unitPrice: '800.00', quantity: 2 })]);
    givenPromotions([promotion()]);

    await postOrder();

    expect(persistedOrder.subtotal).toBe('1600.00');
    expect(persistedOrder.discount).toBe('640.00');
    expect(persistedOrder.shippingCost).toBe('99.00');
    // 1600.00 + 99.00 − 640.00.
    expect(persistedOrder.total).toBe('1059.00');
  });

  it('ships free when the cart clears the threshold after the discount too', async () => {
    // 2000.00 gross, 1200.00 net — over on both readings.
    givenPromotions([promotion()]);

    await postOrder();

    expect(persistedOrder.shippingCost).toBe('0.00');
    expect(persistedOrder.total).toBe('1200.00');
  });

  it('ships free exactly at the shared threshold', async () => {
    givenCart([
      cartItem({
        unitPrice: FREE_SHIPPING_THRESHOLD.toFixed(2),
        quantity: 1,
      }),
    ]);

    await postOrder();

    expect(persistedOrder.subtotal).toBe(FREE_SHIPPING_THRESHOLD.toFixed(2));
    expect(persistedOrder.shippingCost).toBe('0.00');
  });

  it('charges shipping a rupee below the shared threshold', async () => {
    givenCart([
      cartItem({
        unitPrice: (FREE_SHIPPING_THRESHOLD - 1).toFixed(2),
        quantity: 1,
      }),
    ]);

    await postOrder();

    expect(persistedOrder.shippingCost).toBe('99.00');
  });

  it('charges by the configured threshold, not the bundled constant (#569)', async () => {
    // The whole point of moving the number into `shipping_config`: an admin
    // raises the bar to ₹1,499 and a ₹1,200 basket starts paying for shipping,
    // with no deploy.
    getFreeShippingThresholdMock.mockResolvedValue(1499);
    givenCart([cartItem({ unitPrice: '1200.00', quantity: 1 })]);

    await postOrder();

    expect(persistedOrder.shippingCost).toBe('99.00');
  });

  it('still reads the NET figure when the threshold is configured', async () => {
    // 1600.00 gross clears a configured 1500; 960.00 net does not. Moving where
    // the number comes from must not move what it is measured against
    // (design §5) — nor let a gift card in, which the case below covers.
    getFreeShippingThresholdMock.mockResolvedValue(1500);
    givenCart([cartItem({ unitPrice: '800.00', quantity: 2 })]);
    givenPromotions([promotion()]);

    await postOrder();

    expect(persistedOrder.subtotal).toBe('1600.00');
    expect(persistedOrder.shippingCost).toBe('99.00');
  });

  it('prices express shipping above standard below the threshold', async () => {
    givenCart([cartItem({ unitPrice: '100.00', quantity: 1 })]);

    await postOrder({ shippingMethod: 'express' });

    expect(persistedOrder.shippingCost).toBe('199.00');
  });

  it('does not let a gift card buy free shipping', async () => {
    // 1600.00 gross, 960.00 net: below the threshold, so shipping is charged.
    // A gift card worth more than the whole order drops the amount DUE to
    // nothing, and must still not move a price-level threshold.
    givenCart([cartItem({ unitPrice: '800.00', quantity: 2 })]);
    givenPromotions([promotion()]);

    await postOrder({
      giftCardCodes: ['GIFTCARD00000001'],
      giftCardAmount: '5000.00',
    });

    expect(persistedOrder.shippingCost).toBe('99.00');
    expect(persistedOrder.total).toBe('1059.00');
    // Tender is settled at the payment endpoint, under a row lock. Order
    // creation writes no gift card figure at all — see the payment-side pin in
    // tests/routes/gift-card-payment.test.ts.
    expect(persistedOrder.giftCardAmount).toBeUndefined();
  });

  it('does not let a gift card take free shipping away either', async () => {
    givenPromotions([promotion()]);

    await postOrder({ giftCardAmount: '1500.00' });

    // 1200.00 net still ships free, whatever the customer is actually paying.
    expect(persistedOrder.shippingCost).toBe('0.00');
    expect(persistedOrder.total).toBe('1200.00');
    expect(persistedOrder.giftCardAmount).toBeUndefined();
  });
});

// ============================================================================
// The server is the only pricing authority
// ============================================================================

describe('order creation — pricing authority', () => {
  it('ignores prices and promotion ids sent by the client', async () => {
    givenPromotions([]);

    await postOrder({
      total: '1.00',
      subtotal: '1.00',
      discount: '9999.00',
      promotionId: OTHER_PROMOTION_ID,
      promotionDiscount: '9999.00',
      items: [{ unitPrice: '1.00' }],
    });

    expect(persistedOrder.total).toBe('2000.00');
    expect(persistedOrder.discount).toBe('0.00');
    expect(persistedOrder.promotionId).toBeNull();
    expect(persistedOrder.promotionDiscount).toBe('0.00');
  });

  it('charges base when the buyer is not a gallery member at order time', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    givenMember(false);

    await postOrder();

    // The cart may have been opened while they were a member. What matters is
    // membership now.
    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.promotionId).toBeNull();
    expect(persistedOrder.total).toBe('2000.00');
  });

  it('applies a members-only promotion for a gallery member', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    givenMember(true);

    await postOrder();

    expect(persistedOrder.promotionDiscount).toBe('800.00');
    expect(persistedOrder.promotionId).toBe(PROMOTION_ID);
  });

  it('reads membership from the row, not from the session cookie (#526)', async () => {
    givenPromotions([promotion({ membersOnly: true })]);
    // Exactly the five-minute window after a join: the row is current, the
    // signed session cookie better-auth is still serving is not.
    signIn({ galleryMember: false });
    givenMember(true);

    await postOrder();

    expect(persistedOrder.promotionDiscount).toBe('800.00');
    expect(persistedOrder.promotionId).toBe(PROMOTION_ID);
  });
});

// ============================================================================
// perCustomerOrderLimit
// ============================================================================

describe('order creation — per-customer order limit', () => {
  it('applies the promotion while the customer is under the limit', async () => {
    givenPromotions([promotion({ perCustomerOrderLimit: 1 })]);
    // Settled orders already carrying this promotion, then the order number.
    queueSelects([{ count: 0 }], [{ count: 0 }]);

    await postOrder();

    expect(persistedOrder.promotionDiscount).toBe('800.00');
    expect(persistedOrder.promotionId).toBe(PROMOTION_ID);
  });

  it('charges base once the customer has spent the limit', async () => {
    givenPromotions([promotion({ perCustomerOrderLimit: 1 })]);
    queueSelects([{ count: 1 }], [{ count: 0 }]);

    const res = await postOrder();

    // The order still goes through — at base price. Refusing it at the till
    // would lose the sale rather than the discount.
    expect(res.status).toBe(201);
    expect(persistedOrder.promotionDiscount).toBe('0.00');
    expect(persistedOrder.promotionId).toBeNull();
    expect(persistedItems[0]?.itemDiscount).toBe('0.00');
    expect(persistedOrder.total).toBe('2000.00');
  });

  it('does not count order history for a promotion with no limit', async () => {
    givenPromotions([promotion({ perCustomerOrderLimit: null })]);

    await postOrder();

    // One select only: the order number. An unlimited promotion has nothing
    // to count.
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('does not count order history when no promotion applies', async () => {
    givenPromotions([]);

    await postOrder();

    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// The dead coupon path
// ============================================================================

describe('order creation — coupon code', () => {
  it('has no couponCode key in the create-order input schema', () => {
    expect(Object.keys(createOrderSchema.shape)).not.toContain('couponCode');
  });

  it('writes couponCode: null even when the request sends one', async () => {
    await postOrder({ couponCode: 'SAVE10' });

    // An order that records a code beside a zero discount claims a code was
    // applied when none was.
    expect(persistedOrder.couponCode).toBeNull();
    expect(persistedOrder.couponDiscount).toBe('0.00');
  });
});

// ============================================================================
// Response mappings
// ============================================================================

describe('order responses carry the promotion figures', () => {
  const storedOrder = {
    id: ORDER_ID,
    orderNumber: 'MA-2026-000001',
    userId: USER_ID,
    status: 'confirmed',
    paymentStatus: 'paid',
    orderType: 'regular',
    shippingAddress,
    shippingDetails: null,
    shippingMethod: 'standard',
    shippingCost: '0.00',
    subtotal: '2000.00',
    discount: '800.00',
    tax: '0.00',
    total: '1200.00',
    couponCode: null,
    couponDiscount: '0.00',
    promotionId: PROMOTION_ID,
    promotionDiscount: '800.00',
    tradeDiscount: '0.00',
    itemCount: 2,
    currency: 'INR',
    customerNotes: null,
    internalNotes: null,
    paymentDetails: null,
    user: { id: USER_ID, email: 'john@example.com' },
    items: [],
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
  };

  it('returns promotionId and promotionDiscount from the created order', async () => {
    givenPromotions([promotion()]);

    const body = await readJson(await postOrder());

    expect(body.order.promotionId).toBe(PROMOTION_ID);
    expect(body.order.promotionDiscount).toBe('800.00');
  });

  it('returns them from GET /api/orders/:id', async () => {
    orderFindFirstMock.mockResolvedValue(storedOrder);
    queueSelects([]); // approvals

    const res = await app.request(`/api/orders/${ORDER_ID}`);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.promotionId).toBe(PROMOTION_ID);
    expect(body.promotionDiscount).toBe('800.00');
    // The columns they sit beside, still there.
    expect(body.couponCode).toBeNull();
    expect(body.couponDiscount).toBe('0.00');
  });

  it('returns them from the admin order detail', async () => {
    signIn({ role: 'admin' });
    orderFindFirstMock.mockResolvedValue(storedOrder);
    queueSelects([]); // approvals

    const res = await app.request(`/api/admin/orders/${ORDER_ID}`);
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.promotionId).toBe(PROMOTION_ID);
    expect(body.promotionDiscount).toBe('800.00');
  });
});
