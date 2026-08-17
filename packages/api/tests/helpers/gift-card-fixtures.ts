/**
 * Teardown shared by the two live-database gift-card suites.
 *
 * Both seed real orders and real cards — a balance debit, a tender row and a
 * Razorpay order have to be one unit of work, and a mock cannot hold a row lock
 * — so both need the same delete in the same order afterwards. Children first:
 * `order_gift_cards` and `gift_card_transactions` are FK'd to the rows below
 * them, so deleting a card before its transactions fails on the constraint.
 *
 * @see packages/api/tests/routes/gift-card-payment.test.ts
 * @see packages/api/tests/routes/gift-card-release.test.ts
 */

import { inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";
import type { Mock } from "vitest";

import {
  giftCards,
  giftCardTransactions,
  orderGiftCards,
} from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import type * as schema from "../../src/database/schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** The ids a suite accumulated. Both arrays are emptied once the rows are gone. */
export interface GiftCardFixtureIds {
  cardIds: string[];
  orderIds: string[];
}

/**
 * Back to a configured gateway that returns a zero-amount order, which is what
 * every test starts from — a `mockReset()` alone would leave the next test
 * calling an undefined-returning stub.
 */
export function resetRazorpayOrderMock(createRazorpayOrder: Mock): void {
  createRazorpayOrder.mockReset();
  createRazorpayOrder.mockResolvedValue({
    id: "order_test_razorpay",
    amount: 0,
    currency: "INR",
  });
}

/** Deletes every seeded row, children first, then empties the id arrays. */
export async function purgeGiftCardFixtures(
  db: Db,
  { cardIds, orderIds }: GiftCardFixtureIds,
): Promise<void> {
  if (orderIds.length > 0) {
    await db
      .delete(orderGiftCards)
      .where(inArray(orderGiftCards.orderId, orderIds));
  }
  if (cardIds.length > 0) {
    await db
      .delete(giftCardTransactions)
      .where(inArray(giftCardTransactions.giftCardId, cardIds));
    await db.delete(giftCards).where(inArray(giftCards.id, cardIds));
  }
  if (orderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  cardIds.length = 0;
  orderIds.length = 0;
}
