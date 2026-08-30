/**
 * Gift card schema shape.
 *
 * Mirrors wallet.ts: integer paise, denormalized balance, append-only ledger
 * with a balanceAfter snapshot. Status is derived, so there is deliberately
 * no status column to assert.
 *
 * These are schema-shape assertions rather than query tests on purpose: the
 * route suites mock `db`, so nothing else in the API catches a column that
 * does not exist.
 */

import { describe, it, expect } from "vitest";
import {
  giftCards,
  giftCardTransactions,
  orderGiftCards,
  giftCardStatus,
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
} from "../../src/database/schema/gift-cards";

describe("gift_card", () => {
  it("stores only the hash and last four of the code", () => {
    expect(giftCards.codeHash).toBeDefined();
    expect(giftCards.codeLast4).toBeDefined();
    // The plaintext code must never be a column: a database dump would then
    // leak spendable money.
    expect((giftCards as unknown as Record<string, unknown>).code).toBeUndefined();
  });

  it("tracks balance in integer paise, like the wallet", () => {
    expect(giftCards.initialBalancePaise).toBeDefined();
    expect(giftCards.balancePaise).toBeDefined();
    expect(giftCards.balancePaise.columnType).toBe("PgInteger");
    expect(giftCards.initialBalancePaise.columnType).toBe("PgInteger");
  });

  it("has no status column — status is derived", () => {
    // Deriving from balance/disabledAt/expiresAt is the contract; a stored
    // status would drift from the balance on every redemption.
    expect((giftCards as unknown as Record<string, unknown>).status).toBeUndefined();
    expect(giftCards.disabledAt).toBeDefined();
    expect(giftCards.expiresAt).toBeDefined();
    expect(giftCards.expiresAt.notNull).toBe(false);
  });

  it("carries delivery fields", () => {
    expect(giftCards.recipientEmail).toBeDefined();
    expect(giftCards.sendAt).toBeDefined();
    expect(giftCards.sentAt).toBeDefined();
  });

  it("records both issuance paths", () => {
    expect(giftCards.issuedByUserId).toBeDefined();
    expect(giftCards.purchaseOrderId).toBeDefined();
    expect(giftCards.issuedByUserId.notNull).toBe(false);
    expect(giftCards.purchaseOrderId.notNull).toBe(false);
  });
});

describe("gift_card_transaction", () => {
  it("snapshots the balance after each entry", () => {
    expect(giftCardTransactions.balanceAfterPaise).toBeDefined();
    expect(giftCardTransactions.amountPaise).toBeDefined();
    expect(giftCardTransactions.balanceAfterPaise.columnType).toBe("PgInteger");
  });

  it("links an entry to the order that caused it", () => {
    expect(giftCardTransactions.orderId).toBeDefined();
  });

  it("carries the direction on the type, as the wallet does", () => {
    expect(giftCardTransactions.type).toBeDefined();
    expect(giftCardTransactions.type.enumValues).toEqual([
      "issue",
      "redeem",
      "refund",
      "adjustment",
      "void",
    ]);
  });
});

describe("order_gift_card", () => {
  it("records what each card paid on an order", () => {
    expect(orderGiftCards.orderId).toBeDefined();
    expect(orderGiftCards.giftCardId).toBeDefined();
    expect(orderGiftCards.amountPaise).toBeDefined();
  });

  it("holds tender in paise, not a decimal discount", () => {
    // A gift card is tender. It never lands in a discount column and never
    // borrows the decimal-rupee shape of orders.discount.
    expect(orderGiftCards.amountPaise.columnType).toBe("PgInteger");
  });
});

describe("derived status", () => {
  const base = { balancePaise: 100_000, disabledAt: null, expiresAt: null };

  it("is active while there is money on it", () => {
    expect(giftCardStatus(base)).toBe("active");
  });

  it("is spent at a zero balance", () => {
    expect(giftCardStatus({ ...base, balancePaise: 0 })).toBe("spent");
  });

  it("is disabled when the kill switch is set, whatever the balance", () => {
    expect(giftCardStatus({ ...base, disabledAt: new Date() })).toBe("disabled");
  });

  it("is expired once expiresAt has passed", () => {
    const past = new Date(Date.now() - 1000);
    expect(giftCardStatus({ ...base, expiresAt: past })).toBe("expired");
  });

  it("a future expiry is still active", () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(giftCardStatus({ ...base, expiresAt: future })).toBe("active");
  });
});

describe("bounds", () => {
  it("bounds a purchased card, so the amount field is not a fraud surface", () => {
    expect(GIFT_CARD_MIN_PAISE).toBe(50_000);
    expect(GIFT_CARD_MAX_PAISE).toBe(5_000_000);
  });
});
