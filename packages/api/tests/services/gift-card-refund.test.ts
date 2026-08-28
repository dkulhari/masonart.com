/**
 * Releasing gift card holds, and refunding to the cards that paid.
 *
 * Live Postgres for the same reason as the redemption suite: the properties
 * under test are transactional and arithmetic, and a mocked `db` would assert
 * the mock.
 *
 * Two invariants carry the weight here.
 *
 * A hold that is never released loses customer money silently — an abandoned
 * checkout looks exactly like a card that was spent, so nobody reports it.
 *
 * A refund that is not capped mints money. `order_gift_card` records what was
 * applied and is never mutated, so two partial refunds must not add up to
 * more than the card actually paid on that order.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7, §8
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

import {
  giftCards,
  orderGiftCards,
} from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import {
  liveDbUrl,
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from "../helpers/live-db";
import { purgeGiftCardFixtures } from "../helpers/gift-card-fixtures";
import { createGiftCardServiceHarness } from "../helpers/gift-card-service-harness";

const DATABASE_URL = liveDbUrl();

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;

const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

let redeemGiftCards: typeof import("../../src/services/gift-card").redeemGiftCards;
let voidGiftCardHold: typeof import("../../src/services/gift-card").voidGiftCardHold;
let refundToGiftCards: typeof import("../../src/services/gift-card").refundToGiftCards;

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb({ max: 5 }));

  const service = await import("../../src/services/gift-card");
  redeemGiftCards = service.redeemGiftCards;
  voidGiftCardHold = service.voidGiftCardHold;
  refundToGiftCards = service.refundToGiftCards;
});

afterEach(async () => {
  if (!reachable) return;

  await purgeGiftCardFixtures(db, {
    cardIds: createdCardIds,
    orderIds: createdOrderIds,
  });
});

afterAll(async () => {
  await closeLiveDb(client);
});

const { makeCard, makeOrder, balanceOf, ledgerOf } = createGiftCardServiceHarness(
  () => db,
  { prefix: "RFND", cardIds: createdCardIds, orderIds: createdOrderIds },
);

/** Redeem a card against an order, the way payment initiation would. */
async function applyCard(orderId: string, codes: string[], duePaise: number) {
  return db.transaction((tx) => redeemGiftCards(tx, orderId, codes, duePaise, null));
}

// ============================================================================
// Releasing a hold
// ============================================================================

/**
 * Loud, not silent (#580).
 *
 * Everything below asserts something a mock cannot have — a row lock, a unique
 * constraint settling a race, transactional rollback — and every one of those
 * assertions is behind `if (!reachable) return`. Without this, a run with no
 * database reports green having tested nothing.
 */
describe("this suite needs a real database", () => {
  it("has one", () => {
    assertLiveDbReachable(reachable);
  });
});

describe.skipIf(!DATABASE_URL)("voidGiftCardHold", () => {
  it("returns the held balance when an order never completes", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);
    expect(await balanceOf(id)).toBe(20_000);

    const released = await db.transaction((tx) => voidGiftCardHold(tx, orderId));

    expect(released).toBe(30_000);
    expect(await balanceOf(id)).toBe(50_000);

    const voids = (await ledgerOf(id)).filter((entry) => entry.type === "void");
    expect(voids).toHaveLength(1);
    expect(voids[0]!.balanceAfterPaise).toBe(50_000);
  });

  it("clears the tender recorded on the order", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);
    await db
      .update(orders)
      .set({ giftCardAmount: "300.00" })
      .where(eq(orders.id, orderId));

    await db.transaction((tx) => voidGiftCardHold(tx, orderId));

    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    expect(order!.giftCardAmount).toBe("0.00");
  });

  it("is idempotent — cancelling twice credits once", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);

    await db.transaction((tx) => voidGiftCardHold(tx, orderId));
    const second = await db.transaction((tx) => voidGiftCardHold(tx, orderId));

    expect(second).toBe(0);
    expect(await balanceOf(id)).toBe(50_000);
    expect((await ledgerOf(id)).filter((entry) => entry.type === "void")).toHaveLength(1);
  });

  it("does nothing for an order no card ever paid for", async () => {
    if (!reachable) return;

    const orderId = await makeOrder("300.00");
    const released = await db.transaction((tx) => voidGiftCardHold(tx, orderId));
    expect(released).toBe(0);
  });
});

// ============================================================================
// Refunding
// ============================================================================

describe.skipIf(!DATABASE_URL)("refundToGiftCards", () => {
  it("credits the card that paid", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);

    await db.transaction((tx) => refundToGiftCards(tx, orderId, 30_000));

    expect(await balanceOf(id)).toBe(50_000);
    const refunds = (await ledgerOf(id)).filter((entry) => entry.type === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amountPaise).toBe(30_000);
  });

  it("leaves order_gift_card untouched — it records what was applied", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);

    await db.transaction((tx) => refundToGiftCards(tx, orderId, 10_000));

    const [application] = await db
      .select()
      .from(orderGiftCards)
      .where(eq(orderGiftCards.orderId, orderId));
    expect(application!.amountPaise).toBe(30_000);
  });

  it("splits across two cards so the parts sum to exactly the leg", async () => {
    if (!reachable) return;

    // Deliberately awkward: 33333 and 66667 of 100000, refunding 33333.
    // Rounding each share independently loses or invents a paisa.
    const first = await makeCard(33_333);
    const second = await makeCard(66_667);
    const orderId = await makeOrder("1000.00");
    await applyCard(orderId, [first.code, second.code], 100_000);

    const results = await db.transaction((tx) =>
      refundToGiftCards(tx, orderId, 33_333),
    );

    const total = results.reduce((sum, r) => sum + r.amountPaise, 0);
    expect(total).toBe(33_333);
  });

  it("refuses to credit a card more than it paid on that order", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);

    await db.transaction((tx) => refundToGiftCards(tx, orderId, 20_000));

    // A second refund that would take cumulative credit past the 30000 the
    // card actually paid must be refused, or the balance is minted.
    await expect(
      db.transaction((tx) => refundToGiftCards(tx, orderId, 20_000)),
    ).rejects.toThrow(/exceed/i);

    expect(await balanceOf(id)).toBe(40_000);
  });

  it("allows partial refunds that stay within what was paid", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);

    await db.transaction((tx) => refundToGiftCards(tx, orderId, 10_000));
    await db.transaction((tx) => refundToGiftCards(tx, orderId, 20_000));

    expect(await balanceOf(id)).toBe(50_000);
    expect((await ledgerOf(id)).filter((entry) => entry.type === "refund")).toHaveLength(2);
  });

  it("credits a disabled card — it is still the customer's money", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);
    await db
      .update(giftCards)
      .set({ disabledAt: new Date() })
      .where(eq(giftCards.id, id));

    await db.transaction((tx) => refundToGiftCards(tx, orderId, 30_000));

    expect(await balanceOf(id)).toBe(50_000);
  });

  it("does nothing for a zero or negative leg", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("300.00");
    await applyCard(orderId, [code], 30_000);

    const results = await db.transaction((tx) => refundToGiftCards(tx, orderId, 0));

    expect(results).toHaveLength(0);
    expect(await balanceOf(id)).toBe(20_000);
  });
});
