/**
 * Schema support for delivery-time minting.
 *
 * A scheduled gift card is deliberately NOT created at payment time: the
 * plaintext code is returned once by issueGiftCard() and never stored, so a
 * card minted in March for a June send date could never be emailed. Two things
 * follow from that, and both are asserted here:
 *
 *   1. the purchase has to live somewhere between payment and delivery
 *   2. minting must be safe to attempt twice, from the verify path and from
 *      the sweep, without a read-then-write check that races
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §4, §6
 */

import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { giftCards } from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";

describe("minting idempotency", () => {
  it("allows only one card per purchase order", () => {
    const { uniqueConstraints } = getTableConfig(giftCards);

    const onPurchaseOrder = uniqueConstraints.find((constraint) =>
      constraint.columns.some((column) => column.name === "purchase_order_id"),
    );

    // This constraint is the idempotency guarantee, not a lookup optimisation:
    // a retried payment verification and two racing sweep workers all reach
    // the insert, and exactly one may win.
    expect(onPurchaseOrder).toBeDefined();
  });

  it("does not settle for a plain index on the purchase order", () => {
    const { indexes } = getTableConfig(giftCards);

    const plainIndex = indexes.find(
      (index) => index.config.name === "gift_card_purchase_order_idx",
    );

    // A non-unique index would let both racers insert.
    expect(plainIndex).toBeUndefined();
  });
});

describe("orders.giftCardPurchase", () => {
  it("carries the purchase until the card is minted", () => {
    expect(orders.giftCardPurchase).toBeDefined();
  });

  it("is nullable — ordinary orders buy no gift card", () => {
    expect(orders.giftCardPurchase.notNull).toBe(false);
  });
});
