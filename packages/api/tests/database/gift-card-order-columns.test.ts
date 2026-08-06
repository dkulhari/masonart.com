/**
 * Order-side gift card tender.
 *
 * `giftCardAmount` is TENDER, not a discount. The layering order fixed in
 * docs/superpowers/specs/2026-08-05-sale-promotions-design.md §5 is:
 *
 *   line base price
 *   - promotion discount   -> order_items.itemDiscount, orders.promotionDiscount
 *   - code discount        -> orders.couponDiscount
 *   + shipping
 *   + tax
 *   = orders.total
 *   - gift card            -> orders.giftCardAmount   (this column)
 *   = amount charged to Razorpay
 *
 * So it is never summed into `orders.discount` (which is the derived total of
 * promotionDiscount + couponDiscount) and never becomes a fourth discount
 * bucket. What Razorpay is asked for stays derived from total minus tender,
 * so there is exactly one source of truth for what the customer owes.
 *
 * Schema-shape assertions rather than query tests on purpose: the route
 * suites mock `db`, so nothing else in the API catches a missing column.
 */

import { describe, it, expect } from "vitest";
import { orders, orderTypeEnum } from "../../src/database/schema/orders";

describe("orders gift card tender", () => {
  it("records gift card tender in its own column", () => {
    expect(orders.giftCardAmount).toBeDefined();
    expect(orders.giftCardAmount.default).toBe("0.00");
    expect(orders.giftCardAmount.notNull).toBe(true);
  });

  it("is money, not a float", () => {
    expect(orders.giftCardAmount.columnType).toBe("PgNumeric");
  });

  it("keeps the discount buckets untouched — tender is not a discount", () => {
    expect(orders.discount).toBeDefined();
    expect(orders.couponDiscount).toBeDefined();
    expect(orders.tradeDiscount).toBeDefined();
    expect(orders.promotionDiscount).toBeDefined();
  });

  it("is not one of the discount buckets", () => {
    // Sharing a column with a discount would make the order's money path a
    // lie: a discount reduces the price before tax, tender reduces what is
    // charged after it.
    const name = orders.giftCardAmount.name;
    expect(name).toBe("gift_card_amount");
    for (const bucket of [
      orders.discount,
      orders.couponDiscount,
      orders.tradeDiscount,
      orders.promotionDiscount,
    ]) {
      expect(name).not.toBe(bucket.name);
    }
  });

  it("stores no second money total — the charged amount stays derived", () => {
    // razorpayAmount = toPaise(total) - toPaise(giftCardAmount).
    // Persisting that would give two sources of truth for the amount due.
    const columns = orders as unknown as Record<string, unknown>;
    expect(columns.amountDue).toBeUndefined();
    expect(columns.amountCharged).toBeUndefined();
    expect(columns.razorpayAmount).toBeUndefined();
  });
});

describe("order type", () => {
  it("can describe an order that buys a gift card", () => {
    expect(orderTypeEnum.enumValues).toContain("gift_card");
  });

  it("keeps the order types it already had", () => {
    expect(orderTypeEnum.enumValues).toContain("regular");
    expect(orderTypeEnum.enumValues).toContain("ai_generated");
    expect(orderTypeEnum.enumValues).toContain("trade");
  });
});
