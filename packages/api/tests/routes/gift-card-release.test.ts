/**
 * Releasing a gift card hold.
 *
 * Balance is held from payment initiation. Without a release path an
 * abandoned or cancelled checkout eats it permanently — and nobody reports
 * that, because a card with less money on it looks exactly like a card that
 * was spent. It is the kind of bug only ever found by a customer who kept a
 * receipt.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import {
  giftCardTransactions,
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
import { createGiftCardRowFactories } from "../helpers/gift-card-row-factories";
import {
  purgeGiftCardFixtures,
  resetRazorpayOrderMock,
} from "../helpers/gift-card-fixtures";

vi.mock("../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/middleware/auth")>()),
  ...(await import("../helpers/admin-route-harness")).headerAdminMocks(),
}));

/** Sequences orderNumber within this suite; codes get their own
  * sequence from freshGiftCardCode. */

const createRazorpayOrderMock = vi.fn();

vi.mock("../../src/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/razorpay")>()),
  ...(await import("../helpers/gift-card-fixtures")).razorpayMocks(),
  getRazorpayKeyId: () => "rzp_test_key",
  createRazorpayOrder: (...args: unknown[]) => createRazorpayOrderMock(...args),
  verifyPaymentSignature: () => false,
}));

const DATABASE_URL = liveDbUrl();

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;
let app: Hono;

const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

const USER_ID = "test-user-gc-release";
const USER = JSON.stringify({ id: USER_ID, email: "release@example.com" });

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb({ max: 5 }));

  if (reachable) {
    await db
      .insert(users)
      .values({
        id: USER_ID,
        name: "Releaser",
        email: "release@gc-release-test.example.com",
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  const { ordersApp } = await import("../../src/routes/orders");
  const { adminOrdersApp } = await import("../../src/routes/admin/orders");
  app = new Hono();
  app.route("/api/orders", ordersApp);
  app.route("/api/admin/orders", adminOrdersApp);
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

const { makeCard, makeOrder, balanceOf } = createGiftCardRowFactories(() => db, {
  prefix: "REL",
  userId: USER_ID,
  cardIds: createdCardIds,
  orderIds: createdOrderIds,
});

/** Applies a card the way payment initiation does. */
async function holdCard(orderId: string, code: string) {
  return app.request(`/api/orders/${orderId}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-User": USER },
    body: JSON.stringify({ giftCardCodes: [code] }),
  });
}

function adminCancel(orderId: string) {
  return app.request(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Test-User": USER },
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/** The dedicated status endpoint — a second way to cancel. */
function adminCancelViaStatus(orderId: string) {
  return app.request(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Test-User": USER },
    body: JSON.stringify({ status: "cancelled" }),
  });
}

function failVerification(orderId: string) {
  return app.request(`/api/orders/${orderId}/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-User": USER },
    body: JSON.stringify({
      razorpayOrderId: "order_test_razorpay",
      razorpayPaymentId: "pay_test",
      razorpaySignature: "bad-signature",
    }),
  });
}

async function ledgerOf(cardId: string) {
  return db.query.giftCardTransactions.findMany({
    where: eq(giftCardTransactions.giftCardId, cardId),
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

describe.skipIf(!DATABASE_URL)("releasing a gift card hold", () => {
  it("returns the balance when an admin cancels the order", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");
    await holdCard(orderId, code);
    expect(await balanceOf(id)).toBe(0);

    await adminCancel(orderId);

    expect(await balanceOf(id)).toBe(50_000);
    const voids = (await ledgerOf(id)).filter((entry) => entry.type === "void");
    expect(voids).toHaveLength(1);
  });

  it("clears the tender recorded on the cancelled order", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");
    await holdCard(orderId, code);

    await adminCancel(orderId);

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    expect(order!.giftCardAmount).toBe("0.00");
  });

  it("returns the balance when payment verification fails", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");
    await holdCard(orderId, code);

    await failVerification(orderId);

    expect(await balanceOf(id)).toBe(50_000);
  });

  it("is safe to cancel twice", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");
    await holdCard(orderId, code);

    await adminCancel(orderId);
    await adminCancel(orderId);

    expect(await balanceOf(id)).toBe(50_000);
    expect((await ledgerOf(id)).filter((e) => e.type === "void")).toHaveLength(1);
  });

  it("does not release a paid order", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");
    await holdCard(orderId, code);
    await db
      .update(orders)
      .set({ paymentStatus: "paid" })
      .where(eq(orders.id, orderId));

    await adminCancel(orderId);

    // A refund is not a release. The money moved for a reason, and returning
    // it is the refund path's decision, with its own proportional split.
    expect(await balanceOf(id)).toBe(0);
  });

  it("releases through the dedicated status endpoint too", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");
    await holdCard(orderId, code);

    await adminCancelViaStatus(orderId);

    // There are two admin routes that can cancel an order. A release wired
    // into only one of them loses balance through the other.
    expect(await balanceOf(id)).toBe(50_000);
  });

  it("does nothing for a cancelled order that used no gift card", async () => {
    if (!reachable) return;

    const orderId = await makeOrder("2000.00");
    const response = await adminCancel(orderId);
    expect(response.status).toBe(200);
  });
});
