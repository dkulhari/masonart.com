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
  it("allows only one card per purchase order line", () => {
    const { uniqueConstraints } = getTableConfig(giftCards);

    const onPurchaseOrderItem = uniqueConstraints.find((constraint) =>
      constraint.columns.some(
        (column) => column.name === "purchase_order_item_id",
      ),
    );

    // This constraint is the idempotency guarantee, not a lookup optimisation:
    // a retried payment verification and two racing sweep workers all reach
    // the insert, and exactly one may win.
    //
    // It hangs off the LINE rather than the order since #579: one order can
    // buy several cards alongside posters, so one card per order was only ever
    // the right guarantee while a gift card had to be an order of its own.
    expect(onPurchaseOrderItem).toBeDefined();
  });

  it("still allows only one card per standalone gift card order", () => {
    const { indexes } = getTableConfig(giftCards);

    const standaloneUnique = indexes.find(
      (index) =>
        index.config.name === "gift_card_standalone_purchase_order_unique",
    );

    // The standalone /gift-cards flow creates an order with no line items, so
    // its cards have nothing to be unique against on the line. Partial on
    // exactly those rows. Dropping the old blanket unique without this would
    // have silently removed the protection from every card bought before
    // mixed carts existed.
    expect(standaloneUnique).toBeDefined();
    expect(standaloneUnique?.config.unique).toBe(true);
    expect(standaloneUnique?.config.where).toBeDefined();
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

describe("what the sweep costs to run", () => {
  it("indexes orders, which is the table the sweep actually reads", () => {
    const { indexes } = getTableConfig(orders);

    const deliveryIndex = indexes.find(
      (index) => index.config.name === "orders_gift_card_delivery_idx",
    );

    // Every five minutes, forever, against the largest table here. Without
    // this the sweep scans all of orders to find the fraction of a percent
    // that are gift cards.
    expect(deliveryIndex).toBeDefined();
  });

  it("keeps that index partial, or it indexes the whole orders table", () => {
    const { indexes } = getTableConfig(orders);

    const deliveryIndex = indexes.find(
      (index) => index.config.name === "orders_gift_card_delivery_idx",
    );

    expect(deliveryIndex?.config.where).toBeDefined();
  });

  it("does not index gift_card.send_at, which nothing queries", () => {
    const { indexes } = getTableConfig(giftCards);

    const sendAtIndex = indexes.find(
      (index) => index.config.name === "gift_card_send_at_idx",
    );

    // The sweep decides what is due from orders — a scheduled card does not
    // exist yet at that point. gift_card.send_at is a record of what the buyer
    // chose, copied at mint, and an index on it is write cost for no reads.
    expect(sendAtIndex).toBeUndefined();
  });
});
