/**
 * Paying with gift cards.
 *
 * This is where the money actually moves, and where the three things that
 * matter most are decided:
 *
 *   - the debit, the tender record and the Razorpay order are one unit of
 *     work, so a gateway failure cannot eat a customer's balance
 *   - full coverage skips the gateway entirely, on an EXACT zero remainder
 *   - a gift card cannot buy a gift card
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";

import { giftCards, giftCardTransactions, orderGiftCards } from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import { users } from "../../src/database/schema/users";
import { hashGiftCardCode } from "../../src/lib/gift-card-code";
import {
  liveDbUrl,
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from "../helpers/live-db";
import {
  purgeGiftCardFixtures,
  resetRazorpayOrderMock,
} from "../helpers/gift-card-fixtures";

vi.mock("../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/middleware/auth")>()),
  requireAuth: vi.fn((c: any, next: any) => {
    const header = c.req.header("X-Test-User");
    if (!header) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", JSON.parse(header));
    return next();
  }),
}));

const createRazorpayOrderMock = vi.fn();

vi.mock("../../src/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/razorpay")>()),
  isRazorpayConfigured: () => true,
  getRazorpayKeyId: () => "rzp_test_key",
  createRazorpayOrder: (...args: unknown[]) => createRazorpayOrderMock(...args),
}));

const DATABASE_URL = liveDbUrl();

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;
let app: Hono;

const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

const USER_ID = "test-user-gc-payment";
const USER = JSON.stringify({ id: USER_ID, email: "payer@example.com" });

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb({ max: 5 }));

  if (reachable) {
    await db
      .insert(users)
      .values({
        id: USER_ID,
        name: "Payer",
        email: "payer@gc-payment-test.example.com",
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  const { ordersApp } = await import("../../src/routes/orders");
  app = new Hono();
  app.route("/api/orders", ordersApp);
});

afterEach(async () => {
  resetRazorpayOrderMock(createRazorpayOrderMock);
  if (!reachable) return;
  await purgeGiftCardFixtures(db, {
    cardIds: createdCardIds,
    orderIds: createdOrderIds,
  });
});

afterAll(async () => {
  if (reachable) await db.delete(users).where(eq(users.id, USER_ID));
  await closeLiveDb(client);
});

// ============================================================================
// Fixtures
// ============================================================================

let counter = 0;

function freshCode(): string {
  counter += 1;
  return `PAY${String(process.pid).padStart(6, "0")}${String(counter).padStart(7, "0")}`.slice(
    0,
    16,
  );
}

async function makeCard(balancePaise: number) {
  const code = freshCode();
  const [card] = await db
    .insert(giftCards)
    .values({
      codeHash: hashGiftCardCode(code),
      codeLast4: code.slice(-4),
      initialBalancePaise: balancePaise,
      balancePaise,
    })
    .returning();

  createdCardIds.push(card!.id);
  return { id: card!.id, code };
}

async function makeOrder(totalRupees: string, orderType = "regular") {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `PAY-${Date.now()}-${counter++}`,
      userId: USER_ID,
      orderType: orderType as never,
      shippingAddress: {
        fullName: "Test",
        addressLine1: "1 Road",
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

function pay(orderId: string, codes: string[] = []) {
  return app.request(`/api/orders/${orderId}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-User": USER },
    body: JSON.stringify({ giftCardCodes: codes }),
  });
}

async function balanceOf(cardId: string) {
  const row = await db.query.giftCards.findFirst({
    where: eq(giftCards.id, cardId),
  });
  return row!.balancePaise;
}

async function orderRow(orderId: string) {
  return db.query.orders.findFirst({ where: eq(orders.id, orderId) });
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

describe.skipIf(!DATABASE_URL)("POST /api/orders/:id/payment with gift cards", () => {
  it("asks Razorpay only for the remainder", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    await pay(orderId, [code]);

    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 150_000 }),
    );
  });

  it("records the tender on the order", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    await pay(orderId, [code]);

    const order = await orderRow(orderId);
    expect(order!.giftCardAmount).toBe("500.00");

    const applications = await db
      .select()
      .from(orderGiftCards)
      .where(eq(orderGiftCards.orderId, orderId));
    expect(applications).toHaveLength(1);
    expect(applications[0]!.amountPaise).toBe(50_000);
  });

  it("skips Razorpay entirely when cards cover the total", async () => {
    if (!reachable) return;

    const { code } = await makeCard(200_000);
    const orderId = await makeOrder("2000.00");

    const response = await pay(orderId, [code]);
    const body = (await response.json()) as { fullyCoveredByGiftCard?: boolean };

    expect(body.fullyCoveredByGiftCard).toBe(true);
    expect(createRazorpayOrderMock).not.toHaveBeenCalled();

    const order = await orderRow(orderId);
    expect(order!.paymentStatus).toBe("paid");
  });

  it("treats a one-paisa remainder as a payment, not full coverage", async () => {
    if (!reachable) return;

    const { code } = await makeCard(199_999);
    const orderId = await makeOrder("2000.00");

    const response = await pay(orderId, [code]);
    const body = (await response.json()) as { fullyCoveredByGiftCard?: boolean };

    // The guard is an exact zero. A threshold would let a near-zero balance
    // mark an order paid that was never paid.
    expect(body.fullyCoveredByGiftCard).toBeFalsy();
    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1 }),
    );
  });

  it("rolls the debit back when Razorpay fails", async () => {
    if (!reachable) return;

    createRazorpayOrderMock.mockRejectedValueOnce(new Error("gateway down"));
    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    await pay(orderId, [code]);

    // Otherwise the customer's balance is gone and they have no payment to
    // show for it.
    expect(await balanceOf(id)).toBe(50_000);
    const applications = await db
      .select()
      .from(orderGiftCards)
      .where(eq(orderGiftCards.orderId, orderId));
    expect(applications).toHaveLength(0);

    const order = await orderRow(orderId);
    expect(order!.giftCardAmount).toBe("0.00");
  });

  it("refuses to pay for a gift card order with a gift card", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00", "gift_card");

    const response = await pay(orderId, [code]);

    // Balance would otherwise cycle between instruments and every refund
    // becomes a graph traversal.
    expect(response.status).toBe(400);
    expect(await balanceOf(id)).toBe(50_000);
  });

  it("does not debit twice on a repeat call", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    await pay(orderId, [code]);
    await pay(orderId, [code]);

    expect(await balanceOf(id)).toBe(0);
    const ledger = await db.query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, id),
    });
    expect(ledger.filter((entry) => entry.type === "redeem")).toHaveLength(1);
  });

  it("quotes the remainder, not the total, on a repeat call", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    await pay(orderId, [code]);
    const response = await pay(orderId, [code]);
    const body = (await response.json()) as { amount: number };

    // The existing-Razorpay-order branch used to echo the full total, which
    // would show the customer an amount they are not being charged.
    expect(body.amount).toBe(150_000);
  });

  it("does not buy free shipping", async () => {
    if (!reachable) return;

    // The order priced free shipping at creation, off a net 1200.00 that
    // cleared the threshold. A 1000.00 card drops what is DUE to 200.00 — well
    // under it — and must not turn shipping back on: a gift card is tender,
    // settled after tax, and never moves a price-level threshold (design §5,
    // owner decision 2026-08-07).
    const { code } = await makeCard(100_000);
    const orderId = await makeOrder("1200.00");

    await pay(orderId, [code]);

    const order = await orderRow(orderId);
    expect(order!.giftCardAmount).toBe("1000.00");
    expect(order!.shippingCost).toBe("0.00");
    expect(order!.total).toBe("1200.00");
  });

  it("still works for an order with no gift cards", async () => {
    if (!reachable) return;

    const orderId = await makeOrder("2000.00");

    await pay(orderId, []);

    expect(createRazorpayOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 200_000 }),
    );
    const order = await orderRow(orderId);
    expect(order!.giftCardAmount).toBe("0.00");
  });
});
