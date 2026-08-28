/**
 * Redeeming a gift card.
 *
 * These tests hit a real Postgres deliberately. The thing under test is a
 * `SELECT ... FOR UPDATE` row lock, and a mocked `db` can only assert that we
 * wrote the words "FOR UPDATE" — not that two concurrent checkouts against one
 * code debit it once. That distinction is the entire reason the lock exists,
 * so it is worth a live connection.
 *
 * Nothing here is destructive: each test creates its own order and card and
 * deletes them again. No table is dropped, no seed row is touched, so this
 * suite does not need the disposable-database guard that tests/database/ uses.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

import {
  giftCards,
  giftCardTransactions,
  orderGiftCards,
} from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import { hashGiftCardCode } from "../../src/lib/gift-card-code";
import {
  liveDbUrl,
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from "../helpers/live-db";
import { freshGiftCardCode } from "../helpers/gift-card-fixtures";

/** Sequences orderNumber within this suite; codes get their own
  * sequence from freshGiftCardCode. */
let uniqueCounter = 0;

const DATABASE_URL = liveDbUrl();

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;

/** Rows this suite created, torn down after each test. */
const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

let redeemGiftCards: typeof import("../../src/services/gift-card").redeemGiftCards;
let quoteGiftCard: typeof import("../../src/services/gift-card").quoteGiftCard;

beforeAll(async () => {
  // A small pool, but more than one: the concurrency test needs two
  // connections open at once or the second transaction can never start.
  ({ client, db, reachable } = await connectLiveDb({ max: 5 }));

  const service = await import("../../src/services/gift-card");
  redeemGiftCards = service.redeemGiftCards;
  quoteGiftCard = service.quoteGiftCard;
});

afterEach(async () => {
  if (!reachable) return;

  if (createdCardIds.length > 0) {
    await db
      .delete(giftCardTransactions)
      .where(inArray(giftCardTransactions.giftCardId, createdCardIds));
  }
  if (createdOrderIds.length > 0) {
    await db
      .delete(orderGiftCards)
      .where(inArray(orderGiftCards.orderId, createdOrderIds));
  }
  if (createdCardIds.length > 0) {
    await db.delete(giftCards).where(inArray(giftCards.id, createdCardIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }

  createdCardIds.length = 0;
  createdOrderIds.length = 0;
});

afterAll(async () => {
  await closeLiveDb(client);
});

async function makeCard(
  balancePaise: number,
  overrides: Partial<typeof giftCards.$inferInsert> = {},
): Promise<{ id: string; code: string }> {
  const code = freshGiftCardCode("TEST");
  const [card] = await db
    .insert(giftCards)
    .values({
      codeHash: hashGiftCardCode(code),
      codeLast4: code.slice(-4),
      initialBalancePaise: balancePaise,
      balancePaise,
      ...overrides,
    })
    .returning();

  createdCardIds.push(card!.id);
  return { id: card!.id, code };
}

async function makeOrder(totalRupees: string): Promise<string> {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `TEST-${Date.now()}-${uniqueCounter++}`,
      shippingAddress: {
        fullName: "Test",
        addressLine1: "1 Test Road",
        city: "Test",
        state: "Test",
        postalCode: "000000",
        country: "IN",
        phone: "0000000000",
      } as never,
      subtotal: totalRupees,
      total: totalRupees,
    })
    .returning();

  createdOrderIds.push(order!.id);
  return order!.id;
}

async function balanceOf(cardId: string): Promise<number> {
  const row = await db.query.giftCards.findFirst({
    where: eq(giftCards.id, cardId),
  });
  return row!.balancePaise;
}

// ============================================================================
// Tests
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

describe.skipIf(!DATABASE_URL)("redeemGiftCards", () => {
  it("debits no more than the amount due", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(500_000);
    const orderId = await makeOrder("2000.00");

    const applied = await db.transaction((tx) =>
      redeemGiftCards(tx, orderId, [code], 200_000, null),
    );

    expect(applied.reduce((sum, a) => sum + a.amountPaise, 0)).toBe(200_000);
    expect(await balanceOf(id)).toBe(300_000);
  });

  it("debits no more than the balance", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    const applied = await db.transaction((tx) =>
      redeemGiftCards(tx, orderId, [code], 200_000, null),
    );

    expect(applied.reduce((sum, a) => sum + a.amountPaise, 0)).toBe(50_000);
    expect(await balanceOf(id)).toBe(0);
  });

  it("spreads several cards across one order until the due is met", async () => {
    if (!reachable) return;

    const first = await makeCard(30_000);
    const second = await makeCard(40_000);
    const orderId = await makeOrder("600.00");

    await db.transaction((tx) =>
      redeemGiftCards(tx, orderId, [first.code, second.code], 60_000, null),
    );

    // First card spent to zero, second covers only the shortfall — a card is
    // never debited past what the order still owes.
    expect(await balanceOf(first.id)).toBe(0);
    expect(await balanceOf(second.id)).toBe(10_000);
  });

  it("survives concurrency — two checkouts against one code debit it once", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderA = await makeOrder("500.00");
    const orderB = await makeOrder("500.00");

    /**
     * A barrier, so the race is real rather than hoped for (#580).
     *
     * Firing two redeems with `Promise.all` and trusting them to interleave
     * does not test the lock: whether the window opens is up to the event
     * loop, and in practice it usually does not — this test passed with
     * `FOR UPDATE` deleted, which is exactly the reassurance it exists to
     * provide.
     *
     * So the row is held from a third connection while both redeems start.
     * `FOR UPDATE` makes them queue behind it and then behind each other, so
     * the second re-reads a spent card. Without it they read the same 50000
     * under MVCC, compute the same new balance in JS, and both write it —
     * the business gives away the balance twice.
     */
    const barrier = postgres(DATABASE_URL!, { max: 1, onnotice: () => {} });
    const released = barrier.begin(async (tx) => {
      await tx`SELECT id FROM gift_card WHERE id = ${id} FOR UPDATE`;
      // Long enough for both redeems below to reach their own read.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    // Let the barrier take the lock before the racers ask for it.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const race = Promise.allSettled([
      db.transaction((tx) => redeemGiftCards(tx, orderA, [code], 50_000, null)),
      db.transaction((tx) => redeemGiftCards(tx, orderB, [code], 50_000, null)),
    ]);

    await released;
    const [resultA, resultB] = await race;
    await barrier.end();

    const totalApplied = [resultA, resultB]
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<Array<{ amountPaise: number }>>).value)
      .reduce((sum, a) => sum + a.amountPaise, 0);

    expect(totalApplied).toBe(50_000);
    expect(await balanceOf(id)).toBe(0);

    const ledger = await db.query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, id),
    });
    expect(ledger.filter((entry) => entry.type === "redeem")).toHaveLength(1);
  });

  it("is idempotent — a repeat call for the same order debits nothing more", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("200.00");

    // The payment endpoint returns an existing Razorpay order on a repeat
    // call, so this function genuinely runs twice for one checkout.
    await db.transaction((tx) => redeemGiftCards(tx, orderId, [code], 20_000, null));
    const second = await db.transaction((tx) =>
      redeemGiftCards(tx, orderId, [code], 20_000, null),
    );

    expect(second.reduce((sum, a) => sum + a.amountPaise, 0)).toBe(20_000);
    expect(await balanceOf(id)).toBe(30_000);

    const ledger = await db.query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, id),
    });
    expect(ledger.filter((entry) => entry.type === "redeem")).toHaveLength(1);
  });

  it("writes a redeem ledger row carrying the order it paid for", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("200.00");

    await db.transaction((tx) => redeemGiftCards(tx, orderId, [code], 20_000, null));

    const ledger = await db.query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, id),
    });
    const redeem = ledger.find((entry) => entry.type === "redeem");

    expect(redeem?.orderId).toBe(orderId);
    expect(redeem?.amountPaise).toBe(20_000);
    expect(redeem?.balanceAfterPaise).toBe(30_000);
  });

  it("refuses a disabled card without touching its balance", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000, { disabledAt: new Date() });
    const orderId = await makeOrder("200.00");

    await expect(
      db.transaction((tx) => redeemGiftCards(tx, orderId, [code], 20_000, null)),
    ).rejects.toThrow(/cannot be used/i);

    expect(await balanceOf(id)).toBe(50_000);
  });

  it("refuses an expired card without touching its balance", async () => {
    if (!reachable) return;

    // No card expires under G4; the column is set directly to prove the
    // check works when a future policy starts using it.
    const { id, code } = await makeCard(50_000, {
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    const orderId = await makeOrder("200.00");

    await expect(
      db.transaction((tx) => redeemGiftCards(tx, orderId, [code], 20_000, null)),
    ).rejects.toThrow(/cannot be used/i);

    expect(await balanceOf(id)).toBe(50_000);
  });

  it("refuses an unknown code with the same message as a disabled one", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000, { disabledAt: new Date() });
    const orderA = await makeOrder("200.00");
    const orderB = await makeOrder("200.00");

    const disabled = await db
      .transaction((tx) => redeemGiftCards(tx, orderA, [code], 20_000, null))
      .catch((error: Error) => error.message);
    const unknown = await db
      .transaction((tx) => redeemGiftCards(tx, orderB, ["ZZZZZZZZZZZZZZZZ"], 20_000, null))
      .catch((error: Error) => error.message);

    // Distinguishing "no such card" from "that card is disabled" turns the
    // endpoint into an oracle for which codes exist.
    expect(unknown).toBe(disabled);
  });
});

describe.skipIf(!DATABASE_URL)("quoteGiftCard", () => {
  it("reports what the card could pay without debiting it", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);

    const quote = await quoteGiftCard(code, 20_000);

    expect(quote.applicablePaise).toBe(20_000);
    expect(quote.balancePaise).toBe(50_000);
    expect(await balanceOf(id)).toBe(50_000);
  });

  it("caps what it reports at the balance", async () => {
    if (!reachable) return;

    const { code } = await makeCard(15_000);

    const quote = await quoteGiftCard(code, 90_000);

    expect(quote.applicablePaise).toBe(15_000);
  });

  it("refuses a disabled card", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000, { disabledAt: new Date() });

    await expect(quoteGiftCard(code, 20_000)).rejects.toThrow(/cannot be used/i);
  });
});
