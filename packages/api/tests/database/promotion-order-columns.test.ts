/**
 * Order-side promotion columns.
 *
 * A discount must be recorded as a discount. The alternative — inflating a
 * compare-at price — hides the discount from every revenue report.
 *
 * These are schema-shape assertions rather than query tests on purpose: the
 * route suites mock `db`, so nothing else in the API catches a column that
 * does not exist.
 */

import { describe, it, expect } from 'vitest';
import { orders, orderItems } from '../../src/database/schema/orders';

describe('orders promotion columns', () => {
  it('records which promotion priced the order', () => {
    expect(orders.promotionId).toBeDefined();
  });

  it('promotionId is nullable — most orders carry no promotion', () => {
    expect(orders.promotionId.notNull).toBe(false);
  });

  it('gives the promotion its own money bucket', () => {
    // Separate from couponDiscount, or a settled order cannot be
    // attributed once discount codes exist (design D8).
    expect(orders.promotionDiscount).toBeDefined();
    expect(orders.promotionDiscount.default).toBe('0.00');
  });

  it('promotionDiscount is money, not a float', () => {
    expect(orders.promotionDiscount.columnType).toBe('PgNumeric');
    expect(orders.promotionDiscount.notNull).toBe(true);
  });

  it('promotionDiscount is a column of its own, not couponDiscount', () => {
    // One bucket per discount source: an automatic sale and a leaked code
    // must stay separable in reporting (design D8).
    expect(orders.promotionDiscount.name).toBe('promotion_discount');
    expect(orders.couponDiscount.name).toBe('coupon_discount');
    expect(orders.promotionDiscount.name).not.toBe(orders.couponDiscount.name);
  });

  it('keeps the money columns it already had', () => {
    expect(orders.discount).toBeDefined();
    expect(orders.couponDiscount).toBeDefined();
  });
});

describe('order item discount', () => {
  it('itemDiscount is the per-line store', () => {
    expect(orderItems.itemDiscount).toBeDefined();
  });
});
