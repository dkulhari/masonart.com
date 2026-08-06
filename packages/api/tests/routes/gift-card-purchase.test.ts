/**
 * Buying a gift card.
 *
 * The purchase deliberately does not go through the cart: a cart item needs a
 * real productId AND variantId (both NOT NULL), and the cart derives lineTotal
 * from those rows, so it cannot express a customer-typed amount. A gift card
 * sitting in the products table would also have to be excluded by hand from
 * listing, facets, search, the sitemap and the sale resolver.
 *
 * What this route creates is an order and nothing else. No card exists until
 * the money is delivered — minting on an unpaid order would let an abandoned
 * checkout create spendable money.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §5
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

import { orders, orderItems } from "../../src/database/schema/orders";
import { giftCards } from "../../src/database/schema/gift-cards";
import { users } from "../../src/database/schema/users";
import * as schema from "../../src/database/schema";

// Only auth is mocked. The database is real, because the assertions that
// matter here are about what actually landed in `orders.giftCardPurchase`.
vi.mock("../../src/middleware/auth", () => ({
  requireAuth: vi.fn((c: any, next: any) => {
    const header = c.req.header("X-Test-User");
    if (!header) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", JSON.parse(header));
    return next();
  }),
}));

const DATABASE_URL = process.env.DATABASE_URL;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let reachable = false;

const createdOrderIds: string[] = [];

let app: Hono;

const TEST_USER_ID = "test-user-gift-card";
const TEST_USER = JSON.stringify({
  id: TEST_USER_ID,
  name: "Test Buyer",
  email: "buyer@example.com",
});

beforeAll(async () => {
  if (!DATABASE_URL) return;

  try {
    client = postgres(DATABASE_URL, { max: 3, onnotice: () => {} });
    await client`SELECT 1`;
    db = drizzle(client, { schema });
    reachable = true;
  } catch {
    reachable = false;
  }

  // orders.userId is a real foreign key, so the mocked session needs a real
  // row behind it.
  if (reachable) {
    await db
      .insert(users)
      .values({
        id: TEST_USER_ID,
        name: "Test Buyer",
        email: "buyer@gift-card-test.example.com",
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  const { giftCardsApp } = await import("../../src/routes/gift-cards");
  app = new Hono();
  app.route("/api/gift-cards", giftCardsApp);
});

afterEach(async () => {
  if (!reachable || createdOrderIds.length === 0) return;

  await db.delete(giftCards).where(inArray(giftCards.purchaseOrderId, createdOrderIds));
  await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
  await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  createdOrderIds.length = 0;
});

afterAll(async () => {
  if (reachable) {
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  }
  if (client) await client.end();
});

// ============================================================================
// Helpers
// ============================================================================

const validBody = {
  amountPaise: 200_000,
  recipientEmail: "friend@example.com",
  recipientName: "Friend",
  senderName: "Dhruv",
  message: "Happy birthday",
};

function purchase(body: unknown, authenticated = true) {
  return app.request("/api/gift-cards/purchase", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { "X-Test-User": TEST_USER } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function trackOrder(orderId: string) {
  createdOrderIds.push(orderId);
}

// ============================================================================
// Tests
// ============================================================================

describe.skipIf(!DATABASE_URL)("POST /api/gift-cards/purchase", () => {
  it("creates a gift_card order for the chosen amount", async () => {
    if (!reachable) return;

    const response = await purchase(validBody);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { orderId: string; total: string };
    await trackOrder(body.orderId);

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, body.orderId),
    });

    expect(order!.orderType).toBe("gift_card");
    expect(order!.total).toBe("2000.00");
    expect(order!.paymentStatus).toBe("pending");
  });

  it("writes one order item with no product behind it", async () => {
    if (!reachable) return;

    const response = await purchase(validBody);
    const body = (await response.json()) as { orderId: string };
    await trackOrder(body.orderId);

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, body.orderId));

    expect(items).toHaveLength(1);
    expect(items[0]!.productId).toBeNull();
    expect(items[0]!.snapshot.title).toContain("Gift card");
    expect(items[0]!.lineTotal).toBe("2000.00");
  });

  it("charges no shipping and no tax on a voucher", async () => {
    if (!reachable) return;

    const response = await purchase(validBody);
    const body = (await response.json()) as { orderId: string };
    await trackOrder(body.orderId);

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, body.orderId),
    });

    // A voucher is neither goods nor services: the tax point is the
    // redemption, not the sale.
    expect(order!.shippingCost).toBe("0.00");
    expect(order!.tax).toBe("0.00");
    expect(order!.discount).toBe("0.00");
  });

  it("does not create the card yet", async () => {
    if (!reachable) return;

    const response = await purchase(validBody);
    const body = (await response.json()) as { orderId: string };
    await trackOrder(body.orderId);

    const card = await db.query.giftCards.findFirst({
      where: eq(giftCards.purchaseOrderId, body.orderId),
    });

    // Minting before payment would let an abandoned checkout create
    // spendable money.
    expect(card).toBeUndefined();
  });

  it("records the purchase on the order so a scheduled card can be minted later", async () => {
    if (!reachable) return;

    const sendAt = new Date(Date.now() + 7 * 86_400_000);
    const response = await purchase({ ...validBody, sendAt: sendAt.toISOString() });
    const body = (await response.json()) as { orderId: string };
    await trackOrder(body.orderId);

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, body.orderId),
    });

    expect(order!.giftCardPurchase).toMatchObject({
      amountPaise: 200_000,
      recipientEmail: "friend@example.com",
      recipientName: "Friend",
      senderName: "Dhruv",
      message: "Happy birthday",
    });
    expect(order!.giftCardPurchase!.sendAt).toBe(sendAt.toISOString());
  });

  it("records a null send date when none was chosen", async () => {
    if (!reachable) return;

    const response = await purchase(validBody);
    const body = (await response.json()) as { orderId: string };
    await trackOrder(body.orderId);

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, body.orderId),
    });

    // null means "send as soon as payment clears".
    expect(order!.giftCardPurchase!.sendAt).toBeNull();
  });

  it("rejects an amount below the minimum", async () => {
    if (!reachable) return;

    const response = await purchase({ ...validBody, amountPaise: 100 });
    expect(response.status).toBe(400);
  });

  it("rejects an amount above the maximum", async () => {
    if (!reachable) return;

    const response = await purchase({ ...validBody, amountPaise: 99_000_000 });
    expect(response.status).toBe(400);
  });

  it("rejects a send date more than a year out", async () => {
    if (!reachable) return;

    const farFuture = new Date(Date.now() + 400 * 86_400_000).toISOString();
    const response = await purchase({ ...validBody, sendAt: farFuture });
    expect(response.status).toBe(400);
  });

  it("rejects a malformed recipient address", async () => {
    if (!reachable) return;

    const response = await purchase({ ...validBody, recipientEmail: "not-an-email" });
    expect(response.status).toBe(400);
  });

  it("requires an account", async () => {
    if (!reachable) return;

    const response = await purchase(validBody, false);
    expect(response.status).toBe(401);
  });
});
