/**
 * Issuing a gift card.
 *
 * Two invariants these tests exist to hold.
 *
 * First, a funded balance and its opening ledger entry are written in ONE
 * transaction. A card whose balance has no matching ledger row is
 * unauditable — finance cannot reconcile what the business owes, and no
 * later redemption can be traced back to an origin.
 *
 * Second, the plaintext code is returned exactly once and never persisted.
 * Only the hash and last four reach the row, so a database dump leaks
 * nothing spendable.
 *
 * `db` is mocked rather than hit: the transaction boundary is the thing
 * under test, and a fake transaction that discards its scratch buffer on
 * throw asserts rollback without needing a live server.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface Inserted {
  table: string;
  values: Record<string, unknown>;
}

const { state, transactionMock } = vi.hoisted(() => {
  const state: {
    committed: Inserted[];
    failLedgerInsert: boolean;
    /** One entry consumed per card-insert attempt; null means succeed. */
    cardInsertErrors: (Error | null)[];
    cardInsertAttempts: number;
  } = {
    committed: [],
    failLedgerInsert: false,
    cardInsertErrors: [],
    cardInsertAttempts: 0,
  };

  /**
   * A transaction that behaves like one: writes land in a scratch buffer and
   * are only published to `committed` if the callback returns. A throw
   * discards them, exactly as a rollback would.
   */
  const transactionMock = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const scratch: Inserted[] = [];

    const tx = {
      insert(table: { [k: symbol]: unknown }) {
        const name = String(
          (table as unknown as Record<symbol, unknown>)[
            Symbol.for("drizzle:Name")
          ] ?? "unknown",
        );
        return {
          values(values: Record<string, unknown>) {
            const record = { table: name, values };
            const chain = {
              async returning() {
                if (name === "gift_card") {
                  state.cardInsertAttempts += 1;
                  const failure = state.cardInsertErrors.shift();
                  if (failure) throw failure;
                }
                scratch.push(record);
                return [{ id: "card-uuid-1", ...values }];
              },
              then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
                if (name === "gift_card_transaction" && state.failLedgerInsert) {
                  return Promise.reject(new Error("ledger insert exploded")).then(
                    resolve,
                    reject,
                  );
                }
                scratch.push(record);
                return Promise.resolve(undefined).then(resolve, reject);
              },
            };
            return chain;
          },
        };
      },
    };

    const result = await callback(tx);
    state.committed.push(...scratch);
    return result;
  });

  return { state, transactionMock };
});

vi.mock("../../src/database", () => ({
  db: { transaction: transactionMock },
}));

import { issueGiftCard } from "../../src/services/gift-card";
import { hashGiftCardCode, GIFT_CARD_ALPHABET } from "../../src/lib/gift-card-code";
import {
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
} from "../../src/database/schema/gift-cards";

const rows = (table: string) => state.committed.filter((r) => r.table === table);

beforeEach(() => {
  state.committed = [];
  state.failLedgerInsert = false;
  state.cardInsertErrors = [];
  state.cardInsertAttempts = 0;
  transactionMock.mockClear();
});

describe("issueGiftCard", () => {
  it("returns the plaintext code exactly once, and never stores it", async () => {
    const { card, code } = await issueGiftCard({ amountPaise: 200_000 });

    expect(code).toHaveLength(16);
    for (const ch of code) expect(GIFT_CARD_ALPHABET).toContain(ch);

    // Nothing on the stored row equals the code.
    for (const value of Object.values(card as Record<string, unknown>)) {
      expect(value).not.toBe(code);
    }
    expect(JSON.stringify(rows("gift_card")[0].values)).not.toContain(code);
  });

  it("stores only the hash and last four", async () => {
    const { code } = await issueGiftCard({ amountPaise: 200_000 });
    const stored = rows("gift_card")[0].values;

    expect(stored.codeHash).toBe(hashGiftCardCode(code));
    expect(stored.codeLast4).toBe(code.slice(-4));
    expect(stored.code).toBeUndefined();
  });

  it("funds the card in integer paise, balance equal to initial", async () => {
    await issueGiftCard({ amountPaise: 200_000 });
    const stored = rows("gift_card")[0].values;

    expect(stored.initialBalancePaise).toBe(200_000);
    expect(stored.balancePaise).toBe(200_000);
  });

  it("opens the ledger with an issue entry matching the balance", async () => {
    await issueGiftCard({ amountPaise: 200_000 });
    const ledger = rows("gift_card_transaction");

    expect(ledger).toHaveLength(1);
    expect(ledger[0].values.type).toBe("issue");
    expect(ledger[0].values.amountPaise).toBe(200_000);
    expect(ledger[0].values.balanceAfterPaise).toBe(200_000);
    expect(ledger[0].values.description).toBeTruthy();
  });

  it("writes the card and its ledger row in one transaction", async () => {
    state.failLedgerInsert = true;

    await expect(issueGiftCard({ amountPaise: 200_000 })).rejects.toThrow();

    // A balance with no opening ledger entry cannot be reconciled, so the
    // card must not survive the failure.
    expect(rows("gift_card")).toHaveLength(0);
    expect(rows("gift_card_transaction")).toHaveLength(0);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("records a customer purchase against its order", async () => {
    await issueGiftCard({ amountPaise: 200_000, purchaseOrderId: "order-1" });
    const stored = rows("gift_card")[0].values;

    expect(stored.purchaseOrderId).toBe("order-1");
    expect(stored.issuedByUserId).toBeNull();
    expect(rows("gift_card_transaction")[0].values.orderId).toBe("order-1");
  });

  it("records an admin issuance against the admin", async () => {
    await issueGiftCard({ amountPaise: 200_000, issuedByUserId: "admin-1" });
    const stored = rows("gift_card")[0].values;

    expect(stored.issuedByUserId).toBe("admin-1");
    expect(stored.purchaseOrderId).toBeNull();
    expect(rows("gift_card_transaction")[0].values.createdBy).toBe("admin-1");
  });

  it("carries the delivery details onto the card", async () => {
    const sendAt = new Date("2026-09-01T00:00:00.000Z");
    await issueGiftCard({
      amountPaise: 200_000,
      recipientEmail: "friend@example.com",
      recipientName: "Friend",
      senderName: "Dhruv",
      message: "Happy birthday",
      sendAt,
    });
    const stored = rows("gift_card")[0].values;

    expect(stored.recipientEmail).toBe("friend@example.com");
    expect(stored.recipientName).toBe("Friend");
    expect(stored.senderName).toBe("Dhruv");
    expect(stored.message).toBe("Happy birthday");
    expect(stored.sendAt).toBe(sendAt);
  });

  it("leaves sentAt unset — the delivery sweep owns it", async () => {
    await issueGiftCard({ amountPaise: 200_000 });
    expect(rows("gift_card")[0].values.sentAt).toBeUndefined();
  });

  it("never sets an expiry — no card expires today", async () => {
    // G4: expiresAt exists so a future policy is configuration rather than a
    // migration. Nothing in this feature may set it.
    await issueGiftCard({ amountPaise: 200_000 });
    expect(rows("gift_card")[0].values.expiresAt).toBeUndefined();
  });

  it("writes no discount-shaped field — a gift card is tender", async () => {
    await issueGiftCard({ amountPaise: 200_000 });
    const keys = Object.keys(rows("gift_card")[0].values);
    for (const forbidden of ["discount", "discountAmount", "percentOff", "discountType"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("refuses an amount below the configured minimum", async () => {
    await expect(issueGiftCard({ amountPaise: 100 })).rejects.toThrow();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses an amount above the configured maximum", async () => {
    await expect(issueGiftCard({ amountPaise: 99_000_000 })).rejects.toThrow();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("accepts exactly the bounds", async () => {
    await expect(issueGiftCard({ amountPaise: GIFT_CARD_MIN_PAISE })).resolves.toBeDefined();
    await expect(issueGiftCard({ amountPaise: GIFT_CARD_MAX_PAISE })).resolves.toBeDefined();
  });

  it("refuses a fractional amount — paise are integers", async () => {
    await expect(issueGiftCard({ amountPaise: 200_000.5 })).rejects.toThrow();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("retries with a fresh code on a unique-index collision", async () => {
    // Pre-checking for a collision would race with a concurrent issue; the
    // unique index is the authority, so the violation is what we react to.
    state.cardInsertErrors = [
      new Error(
        'duplicate key value violates unique constraint "gift_card_code_hash_unique"',
      ),
    ];

    const { code } = await issueGiftCard({ amountPaise: 200_000 });

    expect(code).toHaveLength(16);
    expect(state.cardInsertAttempts).toBe(2);
    expect(rows("gift_card")).toHaveLength(1);
    // The retry used a different code, not the one that collided.
    expect(rows("gift_card")[0].values.codeHash).toBe(hashGiftCardCode(code));
  });

  it("rethrows an error that is not a code collision", async () => {
    state.cardInsertErrors = [new Error("connection terminated unexpectedly")];

    await expect(issueGiftCard({ amountPaise: 200_000 })).rejects.toThrow(
      /connection terminated/,
    );
    // One attempt only: retrying an unrelated failure just multiplies it.
    expect(state.cardInsertAttempts).toBe(1);
  });
});
