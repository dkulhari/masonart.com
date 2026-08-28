/**
 * Refunding an order that gift cards helped pay for.
 *
 * The refund has to be split by tender, in paise. `refundAmount` arrives as a
 * float in rupees, and splitting a float is how a rupee goes missing.
 *
 * Two existing behaviours had to change: a missing paymentId used to be
 * fatal, and it is now a legitimate state when cards covered everything; and
 * the only cap was against the order total, which would happily ask Razorpay
 * for more than it ever captured.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §8
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";

import {
  orderGiftCards,
} from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import { users } from "../../src/database/schema/users";
import {
  liveDbUrl,
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from "../helpers/live-db";
import { purgeGiftCardFixtures } from "../helpers/gift-card-fixtures";
import { createGiftCardRowFactories } from "../helpers/gift-card-row-factories";

vi.mock("../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/middleware/auth")>()),
  ...(await import("../helpers/admin-route-harness")).headerAdminMocks(),
}));

/** Sequences orderNumber within this suite; codes get their own
  * sequence from freshGiftCardCode. */
let counter = 0;

const createRefundMock = vi.fn();

vi.mock("../../src/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/razorpay")>()),
  ...(await import("../helpers/gift-card-fixtures")).razorpayMocks(),
  createRefund: (...args: unknown[]) => createRefundMock(...args),
}));

const DATABASE_URL = liveDbUrl();

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;
let app: Hono;

const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

const USER_ID = "test-user-gc-admin-refund";
const USER = JSON.stringify({ id: USER_ID, email: "admin@example.com" });

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb({ max: 5 }));

  if (reachable) {
    await db
      .insert(users)
      .values({
        id: USER_ID,
        name: "Admin",
        email: "admin@gc-refund-test.example.com",
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  const { adminOrdersApp } = await import("../../src/routes/admin/orders");
  app = new Hono();
  app.route("/api/admin/orders", adminOrdersApp);
});

afterEach(async () => {
  createRefundMock.mockReset();
  createRefundMock.mockResolvedValue({ id: "rfnd_test", status: "processed" });

  if (!reachable) return;

  if (createdOrderIds.length > 0) {
    await db
      .delete(orderGiftCards)
      .where(inArray(orderGiftCards.orderId, createdOrderIds));
  }
  await purgeGiftCardFixtures(db, {
    cardIds: createdCardIds,
    orderIds: createdOrderIds,
  });
});

afterAll(async () => {
  if (reachable) await db.delete(users).where(eq(users.id, USER_ID));
  await closeLiveDb(client);
});

const { makeCard, balanceOf } = createGiftCardRowFactories(() => db, {
  prefix: "RFA",
  cardIds: createdCardIds,
  orderIds: [],
});

/**
 * A paid order that gift cards contributed to, wired up directly rather than
 * through the payment endpoint so the split arithmetic can be set exactly.
 */
async function makePaidOrder(options: {
  totalRupees: string;
  giftCardRupees: string;
  cardIds: Array<{ id: string; paise: number }>;
  withPaymentId?: boolean;
}) {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `RFA-${Date.now()}-${counter++}`,
      userId: USER_ID,
      paymentStatus: "paid",
      shippingAddress: {
        fullName: "Test",
        addressLine1: "1 Road",
        city: "Test",
        state: "Test",
        postalCode: "000000",
        country: "IN",
        phone: "0000000000",
      } as never,
      subtotal: options.totalRupees,
      total: options.totalRupees,
      giftCardAmount: options.giftCardRupees,
      paymentDetails:
        options.withPaymentId === false
          ? ({ provider: "razorpay" } as never)
          : ({ provider: "razorpay", paymentId: "pay_test_123" } as never),
    })
    .returning();

  createdOrderIds.push(order!.id);

  for (const card of options.cardIds) {
    await db.insert(orderGiftCards).values({
      orderId: order!.id,
      giftCardId: card.id,
      amountPaise: card.paise,
    });
  }

  return order!.id;
}

function refund(orderId: string, amount?: number) {
  return app.request(`/api/admin/orders/${orderId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-User": USER },
    body: JSON.stringify({ reason: "test refund", ...(amount ? { amount } : {}) }),
  });
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

describe.skipIf(!DATABASE_URL)("refunding an order paid partly by gift card", () => {
  it("splits proportionally by tender", async () => {
    if (!reachable) return;

    // Total 1000, card paid 400, Razorpay 600. Refund 500 -> card 200.
    const card = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "400.00",
      cardIds: [{ id: card.id, paise: 40_000 }],
    });

    await refund(orderId, 500);

    expect(await balanceOf(card.id)).toBe(20_000);
    expect(createRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30_000 }),
    );
  });

  it("makes the two legs sum to exactly the refund", async () => {
    if (!reachable) return;

    // An awkward ratio: 333 of 1000, refunding 777.77.
    const card = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "333.00",
      cardIds: [{ id: card.id, paise: 33_300 }],
    });

    await refund(orderId, 777.77);

    const giftCardLeg = await balanceOf(card.id);
    const razorpayLeg = createRefundMock.mock.calls[0]![0].amount;

    expect(giftCardLeg + razorpayLeg).toBe(77_777);
  });

  it("refunds a fully gift-card-paid order that has no paymentId", async () => {
    if (!reachable) return;

    const card = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "500.00",
      giftCardRupees: "500.00",
      cardIds: [{ id: card.id, paise: 50_000 }],
      withPaymentId: false,
    });

    const response = await refund(orderId);

    // Previously a hard 400. There is legitimately no Razorpay payment when
    // gift cards covered the whole order.
    expect(response.status).toBe(200);
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(await balanceOf(card.id)).toBe(50_000);
  });

  it("never asks Razorpay for more than it captured", async () => {
    if (!reachable) return;

    const card = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "900.00",
      cardIds: [{ id: card.id, paise: 90_000 }],
    });

    await refund(orderId, 1000);

    // Razorpay only ever took 100 of this order.
    const razorpayLeg = createRefundMock.mock.calls[0]?.[0]?.amount ?? 0;
    expect(razorpayLeg).toBeLessThanOrEqual(10_000);
  });

  it("splits the gift card leg across two cards to the paisa", async () => {
    if (!reachable) return;

    const first = await makeCard(0);
    const second = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "1000.00",
      cardIds: [
        { id: first.id, paise: 33_333 },
        { id: second.id, paise: 66_667 },
      ],
    });

    await refund(orderId, 333.33);

    const total = (await balanceOf(first.id)) + (await balanceOf(second.id));
    expect(total).toBe(33_333);
  });

  it("rejects a refund larger than the order total", async () => {
    if (!reachable) return;

    const card = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "400.00",
      cardIds: [{ id: card.id, paise: 40_000 }],
    });

    const response = await refund(orderId, 2000);

    expect(response.status).toBe(400);
    expect(await balanceOf(card.id)).toBe(0);
  });

  it("does not credit the card when the Razorpay leg fails", async () => {
    if (!reachable) return;

    createRefundMock.mockRejectedValueOnce(new Error("gateway down"));
    const card = await makeCard(0);
    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "400.00",
      cardIds: [{ id: card.id, paise: 40_000 }],
    });

    await refund(orderId, 500);

    expect(await balanceOf(card.id)).toBe(0);
  });

  it("still refunds an ordinary order with no gift cards", async () => {
    if (!reachable) return;

    const orderId = await makePaidOrder({
      totalRupees: "1000.00",
      giftCardRupees: "0.00",
      cardIds: [],
    });

    const response = await refund(orderId, 500);

    expect(response.status).toBe(200);
    expect(createRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50_000 }),
    );
  });
});
