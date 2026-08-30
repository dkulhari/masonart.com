/**
 * A gift card bought in the same cart as a poster (#579).
 *
 * `cart_items.productId` and `variantId` used to be NOT NULL and the cart
 * derived every line total from the product and variant rows. A gift card has
 * neither, and its price is whatever the customer typed, so buying one meant
 * an order of its own: two purchases, two payments, two receipts.
 *
 * The properties that carry this, none of which are the happy path:
 *
 *   1. A gift card line is never discounted. Stored value is not a product; a
 *      sale on it would mint money.
 *   2. A gift card line is never merged with another. Two ₹1000 cards can be
 *      going to two different people.
 *   3. Gift card tender may not pay for gift card lines, however they were
 *      bought — the rule used to be `orderType === 'gift_card'`, which a mixed
 *      order cannot answer.
 *
 * Live Postgres: the columns being nullable, and the constraints that replace
 * what they used to guarantee, are the thing under test.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";

import { carts, cartItems } from "../../src/database/schema/cart";
import { orders, orderItems } from "../../src/database/schema/orders";
import { giftCards } from "../../src/database/schema/gift-cards";
import { users } from "../../src/database/schema/users";
import {
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from "../helpers/live-db";
import { readJson } from '../helpers/json';

vi.mock("../../src/services/email", () => ({
  sendTemplateEmail: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

let currentUser: { id: string; email: string } | null = null;

vi.mock("../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/middleware/auth")>()),
  requireAuth: vi.fn((c: any, next: any) => {
    if (!currentUser) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", currentUser);
    return next();
  }),
  optionalAuth: vi.fn((c: any, next: any) => {
    c.set("user", currentUser);
    return next();
  }),
}));

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;
let app: Hono;

const USER_ID = `test-user-mixed-cart-${process.pid}`;

const createdCartIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb({ max: 3 }));

  if (reachable) {
    await db
      .insert(users)
      .values({
        id: USER_ID,
        name: "Mixed Cart",
        email: `mixed-cart-${process.pid}@example.com`,
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  currentUser = { id: USER_ID, email: `mixed-cart-${process.pid}@example.com` };

  const { cartApp } = await import("../../src/routes/cart");
  app = new Hono();
  app.route("/api/cart", cartApp);
});

afterEach(async () => {
  if (!reachable) return;

  if (createdCardIds.length > 0) {
    await db.delete(giftCards).where(inArray(giftCards.id, createdCardIds));
    createdCardIds.length = 0;
  }
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    createdOrderIds.length = 0;
  }
  if (createdCartIds.length > 0) {
    await db.delete(carts).where(inArray(carts.id, createdCartIds));
    createdCartIds.length = 0;
  }
  // The user's active cart is reused across tests by getOrCreateCart.
  const usersCarts = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.userId, USER_ID));
  for (const cart of usersCarts) {
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  }
});

afterAll(async () => {
  await closeLiveDb(client);
});

const GIFT_CARD_BODY = {
  amountPaise: 200_000,
  recipientEmail: "friend@example.com",
  recipientName: "Friend",
  senderName: "Dhruv",
  message: "For the empty wall",
};

function addGiftCard(body: Record<string, unknown> = GIFT_CARD_BODY) {
  return app.request("/api/cart/gift-cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}


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

describe("POST /api/cart/gift-cards", () => {
  it("adds a line with no product and no variant behind it", async () => {
    if (!reachable) return;

    const response = await addGiftCard();
    expect(response.status).toBe(201);

    const body = (await readJson(response)) as { item: Record<string, unknown> };

    // The whole point of #579: a cart line that is not a catalogue entry.
    expect(body.item.productId).toBeNull();
    expect(body.item.variantId).toBeNull();
    expect(body.item.lineType).toBe("gift_card");
  });

  it("prices the line from what the customer typed", async () => {
    if (!reachable) return;

    const response = await addGiftCard();
    const body = (await readJson(response)) as {
      item: { unitPrice: string; lineTotal: string };
    };

    // Nothing about this can be re-derived from a catalogue row, which is why
    // the amount is stored on the line.
    expect(body.item.unitPrice).toBe("2000.00");
    expect(body.item.lineTotal).toBe("2000.00");
  });

  it("refuses an amount below the minimum card value", async () => {
    if (!reachable) return;

    const response = await addGiftCard({ ...GIFT_CARD_BODY, amountPaise: 100 });

    // Same bounds as the standalone /gift-cards flow. Two ways to buy the
    // same instrument must not disagree about what a valid one is.
    expect(response.status).toBe(400);
  });

  it("refuses a send date more than a year out", async () => {
    if (!reachable) return;

    const response = await addGiftCard({
      ...GIFT_CARD_BODY,
      sendAt: new Date(Date.now() + 400 * 86_400_000).toISOString(),
    });

    expect(response.status).toBe(400);
  });

  it("keeps two cards as two lines, never merged", async () => {
    if (!reachable) return;

    await addGiftCard()
    await addGiftCard({ ...GIFT_CARD_BODY, recipientName: "Someone else" });

    const cart = await db.query.carts.findFirst({
      where: eq(carts.userId, USER_ID),
      with: { items: true },
    });

    // Two ₹2000 cards to two people are not "quantity 2". Each code needs its
    // own recipient and message.
    expect(cart!.items).toHaveLength(2);
    expect(cart!.items.every((item) => item.quantity === 1)).toBe(true);
  });
});

describe("the cart read", () => {
  it("returns a gift card line without a product joined to it", async () => {
    if (!reachable) return;

    await addGiftCard();

    const response = await app.request("/api/cart");
    const body = (await readJson(response)) as {
      items: Array<{
        lineType: string;
        product: unknown;
        giftCardPurchase: { amountPaise: number } | null;
        pricing: { sale: string | null };
      }>;
    };

    const line = body.items.find((item) => item.lineType === "gift_card");
    expect(line).toBeTruthy();
    expect(line!.product).toBeNull();
    expect(line!.giftCardPurchase?.amountPaise).toBe(200_000);
  });

  it("never puts a gift card line on sale", async () => {
    if (!reachable) return;

    await addGiftCard();

    const response = await app.request("/api/cart");
    const body = (await readJson(response)) as {
      items: Array<{ lineType: string; pricing: { sale: string | null } }>;
    };

    const line = body.items.find((item) => item.lineType === "gift_card");

    // Stored value at a discount mints money: ₹2000 of balance sold for
    // ₹1600. The resolver never sees a line with no product, and this is the
    // assertion that keeps it that way.
    expect(line!.pricing.sale).toBeNull();
  });

  it("counts the card in the cart subtotal", async () => {
    if (!reachable) return;

    await addGiftCard();

    const response = await app.request("/api/cart");
    const body = (await readJson(response)) as { subtotal: string };

    expect(parseFloat(body.subtotal)).toBe(2000);
  });
});

describe("PATCH on a gift card line", () => {
  it("refuses to change it", async () => {
    if (!reachable) return;

    const created = (await readJson(await addGiftCard())) as {
      item: { id: string };
    };

    const response = await app.request(`/api/cart/items/${created.item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 5 }),
    });

    // Quantity would have to mean "how many codes", and each code needs its
    // own recipient. Editing the amount would be an endpoint for editing
    // money.
    expect(response.status).toBe(400);

    const line = await db.query.cartItems.findFirst({
      where: eq(cartItems.id, created.item.id),
    });
    expect(line!.quantity).toBe(1);
    expect(line!.lineTotal).toBe("2000.00");
  });

  it("still allows saving it for later", async () => {
    if (!reachable) return;

    const created = (await readJson(await addGiftCard())) as {
      item: { id: string };
    };

    const response = await app.request(`/api/cart/items/${created.item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isSavedForLater: true }),
    });

    expect(response.status).toBe(200);

    const line = await db.query.cartItems.findFirst({
      where: eq(cartItems.id, created.item.id),
    });
    expect(line!.isSavedForLater).toBe(true);
  });

  it("can be removed like any other line", async () => {
    if (!reachable) return;

    const created = (await readJson(await addGiftCard())) as {
      item: { id: string };
    };

    const response = await app.request(`/api/cart/items/${created.item.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);

    const line = await db.query.cartItems.findFirst({
      where: eq(cartItems.id, created.item.id),
    });
    expect(line).toBeUndefined();
  });
});

describe("gift card tender against a mixed order", () => {
  it("is capped at the part of the order that is not stored value", async () => {
    if (!reachable) return;

    // ₹5000 order: a ₹3000 poster and a ₹2000 gift card.
    const [order] = await db
      .insert(orders)
      .values({
        userId: USER_ID,
        orderNumber: `TEST-CAP-${process.pid}-${Date.now()}`,
        status: "pending",
        paymentStatus: "pending",
        subtotal: "5000.00",
        total: "5000.00",
        shippingAddress: { fullName: "Mixed Cart" },
        billingAddress: { fullName: "Mixed Cart" },
      })
      .returning();
    createdOrderIds.push(order!.id);

    await db.insert(orderItems).values([
      {
        orderId: order!.id,
        snapshot: { title: "Poster", sku: "P-1", sizeLabel: "A2", widthInches: 16, heightInches: 24 },
        unitPrice: "3000.00",
        framePrice: "0.00",
        quantity: 1,
        lineTotal: "3000.00",
      },
      {
        orderId: order!.id,
        giftCardPurchase: {
          amountPaise: 200_000,
          recipientEmail: "friend@example.com",
          recipientName: "Friend",
          senderName: "Dhruv",
          message: null,
          sendAt: null,
        },
        snapshot: { title: "Gift card", sku: "GIFT-CARD", sizeLabel: "", widthInches: 0, heightInches: 0 },
        unitPrice: "2000.00",
        framePrice: "0.00",
        quantity: 1,
        lineTotal: "2000.00",
      },
    ]);

    const { sumGiftCardLinesPaise } = await import(
      "../../src/routes/orders"
    );

    // Tender may cover the ₹3000 poster and not a paisa of the ₹2000 card.
    // Letting it pay for the card would cycle balance between instruments and
    // turn every refund into a graph traversal.
    expect(await sumGiftCardLinesPaise(order!.id)).toBe(200_000);
  });

  it("counts nothing on an order with no gift card lines", async () => {
    if (!reachable) return;

    const [order] = await db
      .insert(orders)
      .values({
        userId: USER_ID,
        orderNumber: `TEST-CAP2-${process.pid}-${Date.now()}`,
        status: "pending",
        paymentStatus: "pending",
        subtotal: "3000.00",
        total: "3000.00",
        shippingAddress: { fullName: "Mixed Cart" },
        billingAddress: { fullName: "Mixed Cart" },
      })
      .returning();
    createdOrderIds.push(order!.id);

    await db.insert(orderItems).values({
      orderId: order!.id,
      snapshot: { title: "Poster", sku: "P-1", sizeLabel: "A2", widthInches: 16, heightInches: 24 },
      unitPrice: "3000.00",
      framePrice: "0.00",
      quantity: 1,
      lineTotal: "3000.00",
    });

    const { sumGiftCardLinesPaise } = await import(
      "../../src/routes/orders"
    );

    // An ordinary order is unaffected: the cap equals the total, exactly as
    // before #579.
    expect(await sumGiftCardLinesPaise(order!.id)).toBe(0);
  });
});

describe("minting identity moved from the order to the line", () => {
  it("allows two cards against one order", async () => {
    if (!reachable) return;

    const [order] = await db
      .insert(orders)
      .values({
        userId: USER_ID,
        orderNumber: `TEST-MIX-${process.pid}-${Date.now()}`,
        status: "confirmed",
        paymentStatus: "paid",
        subtotal: "4000.00",
        total: "4000.00",
        shippingAddress: { fullName: "Mixed Cart" },
        billingAddress: { fullName: "Mixed Cart" },
      })
      .returning();
    createdOrderIds.push(order!.id);

    const lines = await db
      .insert(orderItems)
      .values([1, 2].map((n) => ({
        orderId: order!.id,
        snapshot: { title: `Gift card ${n}`, sku: "GIFT-CARD", sizeLabel: "", widthInches: 0, heightInches: 0 },
        unitPrice: "2000.00",
        framePrice: "0.00",
        quantity: 1,
        lineTotal: "2000.00",
      })))
      .returning();

    const created = await db
      .insert(giftCards)
      .values(
        lines.map((line, index) => ({
          codeHash: `hash-mixed-${process.pid}-${Date.now()}-${index}`,
          codeLast4: "ABCD",
          initialBalancePaise: 200_000,
          balancePaise: 200_000,
          purchaseOrderId: order!.id,
          purchaseOrderItemId: line.id,
        })),
      )
      .returning();

    createdCardIds.push(...created.map((card) => card.id));

    // One card per ORDER was the guarantee only while a gift card had to be
    // an order of its own.
    expect(created).toHaveLength(2);
  });

  it("still allows only one card per order line", async () => {
    if (!reachable) return;

    const [order] = await db
      .insert(orders)
      .values({
        userId: USER_ID,
        orderNumber: `TEST-MIX2-${process.pid}-${Date.now()}`,
        status: "confirmed",
        paymentStatus: "paid",
        subtotal: "2000.00",
        total: "2000.00",
        shippingAddress: { fullName: "Mixed Cart" },
        billingAddress: { fullName: "Mixed Cart" },
      })
      .returning();
    createdOrderIds.push(order!.id);

    const [line] = await db
      .insert(orderItems)
      .values({
        orderId: order!.id,
        snapshot: { title: "Gift card", sku: "GIFT-CARD", sizeLabel: "", widthInches: 0, heightInches: 0 },
        unitPrice: "2000.00",
        framePrice: "0.00",
        quantity: 1,
        lineTotal: "2000.00",
      })
      .returning();

    const [first] = await db
      .insert(giftCards)
      .values({
        codeHash: `hash-line-${process.pid}-${Date.now()}`,
        codeLast4: "ABCD",
        initialBalancePaise: 200_000,
        balancePaise: 200_000,
        purchaseOrderId: order!.id,
        purchaseOrderItemId: line!.id,
      })
      .returning();
    createdCardIds.push(first!.id);

    // The idempotency guarantee, one level down: a retried verification and
    // the sweep both reach the insert, and exactly one may win.
    await expect(
      db.insert(giftCards).values({
        codeHash: `hash-line-dup-${process.pid}-${Date.now()}`,
        codeLast4: "EFGH",
        initialBalancePaise: 200_000,
        balancePaise: 200_000,
        purchaseOrderId: order!.id,
        purchaseOrderItemId: line!.id,
      }),
    ).rejects.toThrow();
  });

  it("still allows only one card per standalone gift card order", async () => {
    if (!reachable) return;

    const [order] = await db
      .insert(orders)
      .values({
        userId: USER_ID,
        orderNumber: `TEST-MIX3-${process.pid}-${Date.now()}`,
        orderType: "gift_card",
        status: "confirmed",
        paymentStatus: "paid",
        subtotal: "2000.00",
        total: "2000.00",
        shippingAddress: { fullName: "Mixed Cart" },
        billingAddress: { fullName: "Mixed Cart" },
      })
      .returning();
    createdOrderIds.push(order!.id);

    const [first] = await db
      .insert(giftCards)
      .values({
        codeHash: `hash-standalone-${process.pid}-${Date.now()}`,
        codeLast4: "ABCD",
        initialBalancePaise: 200_000,
        balancePaise: 200_000,
        purchaseOrderId: order!.id,
      })
      .returning();
    createdCardIds.push(first!.id);

    // Dropping the old blanket unique without the partial index would have
    // silently removed this protection from every card bought before mixed
    // carts existed.
    await expect(
      db.insert(giftCards).values({
        codeHash: `hash-standalone-dup-${process.pid}-${Date.now()}`,
        codeLast4: "EFGH",
        initialBalancePaise: 200_000,
        balancePaise: 200_000,
        purchaseOrderId: order!.id,
      }),
    ).rejects.toThrow();
  });
});
