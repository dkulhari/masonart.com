/**
 * Row factories shared by the gift-card service suites (#633).
 *
 * `gift-card-redeem` and `gift-card-refund` both drive the real service
 * against a real database — a balance debit and its ledger row have to be one
 * transaction, and a mock cannot hold the row lock that makes that true — so
 * both need the same three fixtures: a card with a known balance, an order to
 * spend it against, and a way to read the balance back. They had grown
 * identical copies of all three, differing only in a prefix string.
 *
 * The factory takes a `getDb` accessor rather than a database, because the
 * connection is not open at module scope: it is assigned in `beforeAll`, after
 * these bindings are created. Reading it at call time is what lets a suite
 * destructure the helpers at the top of the file and keep every call site
 * spelled the way it already was.
 *
 * @see packages/api/tests/services/gift-card-redeem.test.ts
 * @see packages/api/tests/services/gift-card-refund.test.ts
 */

import { eq } from "drizzle-orm";

import {
  giftCards,
  giftCardTransactions,
} from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import { hashGiftCardCode } from "../../src/lib/gift-card-code";
import { freshGiftCardCode } from "./gift-card-fixtures";
import type { LiveDbConnection } from "./live-db";

type Db = LiveDbConnection["db"];

export interface GiftCardServiceHarnessOptions {
  /** Suite tag for generated codes and order numbers, e.g. "RFND". */
  prefix: string;
  /** The suite's own id lists, so its existing teardown still sees the rows. */
  cardIds: string[];
  orderIds: string[];
}

/**
 * The address of an order used only to satisfy NOT NULL. Nothing under test
 * reads it, which is why it is a constant rather than a parameter.
 */
const PLACEHOLDER_ADDRESS = {
  fullName: "Test",
  addressLine1: "1 Test Road",
  city: "Test",
  state: "Test",
  postalCode: "000000",
  country: "IN",
  phone: "0000000000",
} as never;

export function createGiftCardServiceHarness(
  getDb: () => Db,
  { prefix, cardIds, orderIds }: GiftCardServiceHarnessOptions,
) {
  // Sequences order numbers within one suite. Codes get their own sequence
  // from freshGiftCardCode; keeping them separate means neither is perturbed
  // by how many of the other a test happens to create.
  let orderCounter = 0;

  /** A gift card with a known balance, recorded for teardown. */
  async function makeCard(
    balancePaise: number,
    overrides: Partial<typeof giftCards.$inferInsert> = {},
  ): Promise<{ id: string; code: string }> {
    const code = freshGiftCardCode(prefix);
    const [card] = await getDb()
      .insert(giftCards)
      .values({
        codeHash: hashGiftCardCode(code),
        codeLast4: code.slice(-4),
        initialBalancePaise: balancePaise,
        balancePaise,
        ...overrides,
      })
      .returning();

    cardIds.push(card!.id);
    return { id: card!.id, code };
  }

  /** An order to spend a card against, recorded for teardown. */
  async function makeOrder(totalRupees: string): Promise<string> {
    const [order] = await getDb()
      .insert(orders)
      .values({
        orderNumber: `${prefix}-${Date.now()}-${orderCounter++}`,
        shippingAddress: PLACEHOLDER_ADDRESS,
        subtotal: totalRupees,
        total: totalRupees,
      })
      .returning();

    orderIds.push(order!.id);
    return order!.id;
  }

  /** The card's balance as the database now holds it, not as a test hoped. */
  async function balanceOf(cardId: string): Promise<number> {
    const row = await getDb().query.giftCards.findFirst({
      where: eq(giftCards.id, cardId),
    });
    return row!.balancePaise;
  }

  /** Every ledger row written against the card, in insertion order. */
  async function ledgerOf(cardId: string) {
    return getDb().query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, cardId),
    });
  }

  return { makeCard, makeOrder, balanceOf, ledgerOf };
}
