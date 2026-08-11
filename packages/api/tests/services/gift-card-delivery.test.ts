/**
 * Scheduled gift card delivery.
 *
 * The property under test is that minting and sending are the same event. A
 * card cannot be created when payment clears and emailed months later,
 * because the plaintext code is returned once by `issueGiftCard()` and never
 * stored — by the send date there would be nothing to put in the email.
 *
 * Live Postgres, mocked email. The database is the thing being coordinated;
 * the mail provider is not.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §6
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

import { orders, orderItems } from "../../src/database/schema/orders";
import { giftCards, giftCardTransactions } from "../../src/database/schema/gift-cards";
import { users } from "../../src/database/schema/users";
import * as schema from "../../src/database/schema";
import {
  liveDbUrl,
  assertLiveDbReachable,
} from "../helpers/live-db";

const sendTemplateEmailMock = vi.fn();

vi.mock("../../src/services/email", () => ({
  sendTemplateEmail: (...args: unknown[]) => sendTemplateEmailMock(...args),
}));

const DATABASE_URL = liveDbUrl();

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let reachable = false;

const createdOrderIds: string[] = [];

let sweepScheduledGiftCards: typeof import("../../src/services/gift-card-delivery").sweepScheduledGiftCards;

const TEST_USER_ID = "test-user-gift-delivery";

beforeAll(async () => {
  if (!DATABASE_URL) return;

  try {
    client = postgres(DATABASE_URL, { max: 5, onnotice: () => {} });
    await client`SELECT 1`;
    db = drizzle(client, { schema });
    reachable = true;
  } catch {
    reachable = false;
  }

  if (reachable) {
    await db
      .insert(users)
      .values({
        id: TEST_USER_ID,
        name: "Delivery Test",
        email: "delivery@gift-card-test.example.com",
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  const module = await import("../../src/services/gift-card-delivery");
  sweepScheduledGiftCards = module.sweepScheduledGiftCards;
});

afterEach(async () => {
  sendTemplateEmailMock.mockReset();
  if (!reachable || createdOrderIds.length === 0) return;

  const cards = await db
    .select({ id: giftCards.id })
    .from(giftCards)
    .where(inArray(giftCards.purchaseOrderId, createdOrderIds));

  if (cards.length > 0) {
    await db.delete(giftCardTransactions).where(
      inArray(
        giftCardTransactions.giftCardId,
        cards.map((card) => card.id),
      ),
    );
    await db.delete(giftCards).where(
      inArray(
        giftCards.id,
        cards.map((card) => card.id),
      ),
    );
  }

  await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
  await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  createdOrderIds.length = 0;
});

afterAll(async () => {
  if (reachable) await db.delete(users).where(eq(users.id, TEST_USER_ID));
  if (client) await client.end();
});

// ============================================================================
// Fixtures
// ============================================================================

let counter = 0;

/** A paid gift card order awaiting delivery. */
async function makePurchase(options: {
  sendAt: Date | null;
  paid?: boolean;
  amountPaise?: number;
  recipientEmail?: string;
}): Promise<string> {
  const amountPaise = options.amountPaise ?? 200_000;
  const rupees = (amountPaise / 100).toFixed(2);

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `GCD-${Date.now()}-${counter++}`,
      userId: TEST_USER_ID,
      status: "pending",
      paymentStatus: options.paid === false ? "pending" : "paid",
      orderType: "gift_card",
      shippingAddress: {
        fullName: "Test",
        addressLine1: "—",
        city: "—",
        state: "—",
        postalCode: "—",
        country: "IN",
        phone: "—",
      } as never,
      shippingCost: "0.00",
      tax: "0.00",
      subtotal: rupees,
      total: rupees,
      itemCount: 1,
      giftCardPurchase: {
        amountPaise,
        recipientEmail: options.recipientEmail ?? "friend@example.com",
        recipientName: "Friend",
        senderName: "Dhruv",
        message: "Happy birthday",
        sendAt: options.sendAt ? options.sendAt.toISOString() : null,
      },
    })
    .returning();

  createdOrderIds.push(order!.id);
  return order!.id;
}

async function cardFor(orderId: string) {
  return db.query.giftCards.findFirst({
    where: eq(giftCards.purchaseOrderId, orderId),
  });
}

const yesterday = () => new Date(Date.now() - 86_400_000);
const nextWeek = () => new Date(Date.now() + 7 * 86_400_000);

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

describe.skipIf(!DATABASE_URL)("sweepScheduledGiftCards", () => {
  it("mints and sends when the send date has arrived", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: yesterday() });

    const sent = await sweepScheduledGiftCards();

    expect(sent).toBe(1);
    const card = await cardFor(orderId);
    expect(card).toBeDefined();
    expect(card!.balancePaise).toBe(200_000);
    expect(card!.sentAt).not.toBeNull();
    expect(sendTemplateEmailMock).toHaveBeenCalledTimes(1);
  });

  it("puts the code in the email and nowhere else", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: yesterday() });
    await sweepScheduledGiftCards();

    const [, template] = sendTemplateEmailMock.mock.calls[0]!;
    const card = await cardFor(orderId);

    // The email carries a code; the stored row carries only a hash and the
    // last four, so the code in the email cannot be reconstructed from it.
    expect(template.html).toMatch(/[0-9A-Z]{16}/);
    expect(card!.codeHash).not.toContain(card!.codeLast4);
  });

  it("leaves a future-dated purchase alone", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: nextWeek() });

    const sent = await sweepScheduledGiftCards();

    expect(sent).toBe(0);
    expect(await cardFor(orderId)).toBeUndefined();
    expect(sendTemplateEmailMock).not.toHaveBeenCalled();
  });

  it("ignores an unpaid order however old its send date", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: yesterday(), paid: false });

    await sweepScheduledGiftCards();

    // Minting on an unpaid order would create spendable money from an
    // abandoned checkout.
    expect(await cardFor(orderId)).toBeUndefined();
  });

  it("mints once — a second sweep creates no second card", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: yesterday() });

    await sweepScheduledGiftCards();
    const second = await sweepScheduledGiftCards();

    expect(second).toBe(0);
    const all = await db
      .select()
      .from(giftCards)
      .where(eq(giftCards.purchaseOrderId, orderId));
    expect(all).toHaveLength(1);
    expect(sendTemplateEmailMock).toHaveBeenCalledTimes(1);
  });

  it("survives losing the mint race to a concurrent worker", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: yesterday() });

    // Two sweeps at once, as two processes would. The unique constraint on
    // purchase_order_id decides; the loser must not throw.
    const results = await Promise.allSettled([
      sweepScheduledGiftCards(),
      sweepScheduledGiftCards(),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const all = await db
      .select()
      .from(giftCards)
      .where(eq(giftCards.purchaseOrderId, orderId));
    expect(all).toHaveLength(1);
  });

  it("leaves a minted-but-unsent card when the email fails", async () => {
    if (!reachable) return;

    sendTemplateEmailMock.mockRejectedValueOnce(new Error("provider down"));
    const orderId = await makePurchase({ sendAt: yesterday() });

    const sent = await sweepScheduledGiftCards();

    expect(sent).toBe(0);
    const card = await cardFor(orderId);
    // Recoverable from the admin screen — strictly better than a customer
    // holding two codes for one balance.
    expect(card).toBeDefined();
    expect(card!.sentAt).toBeNull();
  });

  it("keeps going when one card fails to send", async () => {
    if (!reachable) return;

    sendTemplateEmailMock.mockRejectedValueOnce(new Error("bad address"));
    await makePurchase({ sendAt: yesterday(), recipientEmail: "bad@example.com" });
    await makePurchase({ sendAt: yesterday() });

    const sent = await sweepScheduledGiftCards();

    // One failure must not stall the batch.
    expect(sent).toBe(1);
  });

  it("never logs the code", async () => {
    if (!reachable) return;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendTemplateEmailMock.mockRejectedValueOnce(new Error("provider down"));
    await makePurchase({ sendAt: yesterday() });

    await sweepScheduledGiftCards();

    // The failure path logs the order, never the instrument.
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/[0-9A-Z]{16}/);
    }
    errorSpy.mockRestore();
  });
});

// ============================================================================
// Immediate delivery, from the payment-verification path
// ============================================================================

describe.skipIf(!DATABASE_URL)("deliverImmediateGiftCard", () => {
  let deliverImmediateGiftCard: typeof import("../../src/services/gift-card-delivery").deliverImmediateGiftCard;

  beforeAll(async () => {
    const module = await import("../../src/services/gift-card-delivery");
    deliverImmediateGiftCard = module.deliverImmediateGiftCard;
  });

  it("mints and sends when no send date was chosen", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: null });

    const delivered = await deliverImmediateGiftCard(orderId);

    expect(delivered).toBe(true);
    const card = await cardFor(orderId);
    expect(card!.balancePaise).toBe(200_000);
    expect(card!.sentAt).not.toBeNull();
    expect(sendTemplateEmailMock).toHaveBeenCalledTimes(1);
  });

  it("mints nothing at all for a future-dated purchase", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: nextWeek() });

    const delivered = await deliverImmediateGiftCard(orderId);

    // The card cannot be created early: its code is returned once and never
    // stored, so it would be unrecoverable when the sweep needs to email it.
    expect(delivered).toBe(false);
    expect(await cardFor(orderId)).toBeUndefined();
    expect(sendTemplateEmailMock).not.toHaveBeenCalled();
  });

  it("creates nothing while the order is unpaid", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: null, paid: false });

    expect(await deliverImmediateGiftCard(orderId)).toBe(false);
    expect(await cardFor(orderId)).toBeUndefined();
  });

  it("is idempotent — a second verification mints no second card", async () => {
    if (!reachable) return;

    const orderId = await makePurchase({ sendAt: null });

    await deliverImmediateGiftCard(orderId);
    const second = await deliverImmediateGiftCard(orderId);

    // Razorpay can deliver a verification twice and the client can retry.
    expect(second).toBe(false);
    const all = await db
      .select()
      .from(giftCards)
      .where(eq(giftCards.purchaseOrderId, orderId));
    expect(all).toHaveLength(1);
    expect(sendTemplateEmailMock).toHaveBeenCalledTimes(1);
  });

  it("ignores an ordinary order", async () => {
    if (!reachable) return;

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `GCD-ORD-${Date.now()}-${counter++}`,
        userId: TEST_USER_ID,
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
        subtotal: "100.00",
        total: "100.00",
      })
      .returning();
    createdOrderIds.push(order!.id);

    expect(await deliverImmediateGiftCard(order!.id)).toBe(false);
  });

  it("a past send date delivers now rather than waiting", async () => {
    if (!reachable) return;

    // A date that has already passed by the time payment clears should not
    // sit until the next sweep.
    const orderId = await makePurchase({ sendAt: yesterday() });

    expect(await deliverImmediateGiftCard(orderId)).toBe(true);
  });
});
