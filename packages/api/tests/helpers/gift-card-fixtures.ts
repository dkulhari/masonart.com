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
import { GIFT_CARD_CODE_LENGTH } from "../../src/lib/gift-card-code";
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

let counter = 0;

/**
 * A gift card code unique to this run, so parallel suites cannot collide.
 *
 * Seven suites carried their own copy of this, each with a different prefix
 * and — easy to miss — a different counter width (#633). The width was never
 * arbitrary: every copy padded so that prefix + pid + counter came to exactly
 * GIFT_CARD_CODE_LENGTH, which is why a 3-letter prefix padded the counter to
 * 7 and a 4-letter one to 6. Deriving the width here keeps that true for any
 * prefix instead of leaving it to be rediscovered at each call site.
 *
 * The process id is what separates concurrently running suites; the counter
 * separates cards within one. Both are needed — vitest forks per file, so two
 * suites can hold the same counter value at the same moment.
 *
 * @param prefix Short suite tag, so a stray row says which suite made it.
 */
export function freshGiftCardCode(prefix: string): string {
  const PID_WIDTH = 6;
  const counterWidth = GIFT_CARD_CODE_LENGTH - prefix.length - PID_WIDTH;

  if (counterWidth < 1) {
    throw new Error(
      `Gift card code prefix "${prefix}" leaves no room for a counter in ` +
        `${GIFT_CARD_CODE_LENGTH} characters. Use a shorter prefix.`,
    );
  }

  counter += 1;

  return `${prefix}${String(process.pid).padStart(PID_WIDTH, "0")}${String(
    counter,
  ).padStart(counterWidth, "0")}`.slice(0, GIFT_CARD_CODE_LENGTH);
}

/**
 * The `src/lib/razorpay` partial mock the gift-card payment suites share.
 *
 * Every one of them starts from the same premise — Razorpay is configured, so
 * the handler takes the live-payment path rather than the "not set up" branch
 * — and then stubs whichever calls that particular suite exercises. Only the
 * shared premise lives here; the per-suite stubs stay at the call site, where
 * the test that depends on them can be read next to them.
 *
 * Spread it after the original module, so the real exports remain for
 * everything a suite does not override:
 *
 * ```ts
 * vi.mock("../../src/lib/razorpay", async (importOriginal) => ({
 *   ...(await importOriginal<typeof import("../../src/lib/razorpay")>()),
 *   ...(await import("../helpers/gift-card-fixtures")).razorpayMocks({
 *     createRefund: (...args: unknown[]) => createRefundMock(...args),
 *   }),
 * }));
 * ```
 */
export function razorpayMocks<T extends Record<string, unknown>>(
  overrides: T = {} as T,
): { isRazorpayConfigured: () => boolean } & T {
  return { isRazorpayConfigured: () => true, ...overrides };
}
