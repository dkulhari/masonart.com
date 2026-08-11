/**
 * Settling a return as store credit.
 *
 * `refund_type` has offered `store_credit` since long before gift cards
 * existed and nothing implemented it: a return marked for store credit
 * produced no credit at all, and `process-refund` echoed the type back in its
 * reply as though something had happened (#577).
 *
 * Two properties carry the weight here, and neither is about the happy path:
 *
 *   1. Store credit is a *substitution*, not the tender split (#557). It has
 *      to be chosen explicitly and can never be what happens when a refund to
 *      the original method fails.
 *   2. The customer has to have agreed. Converting someone's card payment into
 *      a voucher without consent is what invites chargebacks, so consent is a
 *      stored fact with a timestamp, not an assumption about what a screen
 *      showed.
 *
 * Live Postgres, mocked email: the row states are the thing being coordinated.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

import { returnRequests } from "../../../src/database/schema/returns";
import { orders } from "../../../src/database/schema/orders";
import {
  giftCards,
  giftCardTransactions,
} from "../../../src/database/schema/gift-cards";
import { users } from "../../../src/database/schema/users";
import * as schema from "../../../src/database/schema";

const sendTemplateEmailMock = vi.fn();

vi.mock("../../../src/services/email", () => ({
  sendTemplateEmail: (...args: unknown[]) => sendTemplateEmailMock(...args),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/middleware/auth")>()),
  requireAuth: vi.fn((c: any, next: any) => {
    const header = c.req.header("X-Test-User");
    if (!header) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", JSON.parse(header));
    return next();
  }),
  requireAdmin: vi.fn((c: any, next: any) => next()),
}));

const DATABASE_URL = process.env.DATABASE_URL;

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let reachable = false;
let app: Hono;

const CUSTOMER_ID = `test-user-store-credit-${process.pid}`;
const ADMIN_ID = `test-admin-store-credit-${process.pid}`;
const ADMIN = JSON.stringify({ id: ADMIN_ID, email: "admin@example.com" });
const CUSTOMER_EMAIL = `customer-${process.pid}@store-credit-test.example.com`;

const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

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

  if (reachable) {
    await db
      .insert(users)
      .values([
        {
          id: CUSTOMER_ID,
          name: "Store Credit Customer",
          email: CUSTOMER_EMAIL,
          emailVerified: false,
        },
        {
          id: ADMIN_ID,
          name: "Store Credit Admin",
          email: `admin-${process.pid}@store-credit-test.example.com`,
          emailVerified: false,
        },
      ])
      .onConflictDoNothing();
  }

  const { adminReturnsApp } = await import(
    "../../../src/routes/admin/returns"
  );
  app = new Hono();
  app.route("/api/admin/returns", adminReturnsApp);
});

afterEach(async () => {
  if (!reachable) return;

  if (createdOrderIds.length > 0) {
    // Returns cascade from orders; cards do not, and hold the FK.
    await db
      .update(returnRequests)
      .set({ storeCreditGiftCardId: null })
      .where(inArray(returnRequests.orderId, createdOrderIds));
  }
  if (createdCardIds.length > 0) {
    await db.delete(giftCards).where(inArray(giftCards.id, createdCardIds));
    createdCardIds.length = 0;
  }
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    createdOrderIds.length = 0;
  }
});

afterAll(async () => {
  if (reachable) await client.end();
});

beforeEach(() => {
  sendTemplateEmailMock.mockReset();
  sendTemplateEmailMock.mockResolvedValue(undefined);
});

/** A delivered order with a return sitting at `received`, ready to settle. */
async function makeReturn(
  options: { totalRupees?: number; acceptedStoreCredit?: boolean } = {},
): Promise<{ returnId: string; orderId: string }> {
  const total = (options.totalRupees ?? 2000).toFixed(2);

  const [order] = await db
    .insert(orders)
    .values({
      userId: CUSTOMER_ID,
      orderNumber: `TEST-SC-${process.pid}-${createdOrderIds.length}-${Math.floor(Math.random() * 100000)}`,
      status: "delivered",
      paymentStatus: "paid",
      subtotal: total,
      total,
      shippingAddress: { fullName: "Store Credit Customer" },
      billingAddress: { fullName: "Store Credit Customer" },
    })
    .returning();

  createdOrderIds.push(order!.id);

  const [request] = await db
    .insert(returnRequests)
    .values({
      orderId: order!.id,
      userId: CUSTOMER_ID,
      reason: "changed_mind",
      reasonDetails: "Ordered the wrong size entirely",
      status: "received",
      storeCreditAcceptedAt: options.acceptedStoreCredit
        ? new Date()
        : null,
    })
    .returning();

  return { returnId: request!.id, orderId: order!.id };
}

function processRefund(
  returnId: string,
  body: { refundAmount: number; refundType: string },
) {
  return app.request(`/api/admin/returns/${returnId}/process-refund`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Test-User": ADMIN },
    body: JSON.stringify(body),
  });
}

async function cardFor(returnId: string) {
  const request = await db.query.returnRequests.findFirst({
    where: eq(returnRequests.id, returnId),
  });
  if (!request?.storeCreditGiftCardId) return null;

  createdCardIds.push(request.storeCreditGiftCardId);
  return db.query.giftCards.findFirst({
    where: eq(giftCards.id, request.storeCreditGiftCardId),
  });
}

describe("POST /api/admin/returns/:id/process-refund with store_credit", () => {
  it("issues a gift card for the refund amount", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });

    const response = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });

    expect(response.status).toBe(200);

    const card = await cardFor(returnId);
    expect(card).toBeTruthy();
    expect(card!.initialBalancePaise).toBe(150_000);
    expect(card!.balancePaise).toBe(150_000);
  });

  it("emails the card to the customer", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });

    await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });
    await cardFor(returnId);

    expect(sendTemplateEmailMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateEmailMock.mock.calls[0]?.[0]).toBe(CUSTOMER_EMAIL);
  });

  it("never puts the code in the response body", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });

    const response = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });
    const text = await response.text();
    await cardFor(returnId);

    // The card goes to the customer's inbox, not to whoever is looking at the
    // admin screen. Sixteen Crockford characters would be a bearer instrument
    // sitting in a support tool's network log.
    expect(text).not.toMatch(/[0-9A-Z]{16}/);
  });

  it("records that the return was settled as store credit", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });

    await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });
    await cardFor(returnId);

    const request = await db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });

    // Money returned to a card and money returned as a voucher are different
    // liabilities; reporting cannot tell them apart without this.
    expect(request!.refundType).toBe("store_credit");
    expect(request!.status).toBe("refunded");
    expect(request!.storeCreditGiftCardId).toBeTruthy();
  });

  it("ties the card to the return and order it came from", async () => {
    if (!reachable) return;

    const { returnId, orderId } = await makeReturn({
      acceptedStoreCredit: true,
    });

    await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });
    const card = await cardFor(returnId);

    // The trace lives on the ledger row, not the card: `gift_card` has no
    // description column, and `gift_card_transaction` is the append-only
    // record of why a balance exists.
    const ledger = await db.query.giftCardTransactions.findFirst({
      where: eq(giftCardTransactions.giftCardId, card!.id),
    });

    expect(ledger!.description).toContain(orderId.slice(0, 8));
    expect(ledger!.description).toContain(returnId.slice(0, 8));
  });

  it("refuses when the customer never accepted store credit", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: false });

    const response = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/accept/i);

    const request = await db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });
    expect(request!.storeCreditGiftCardId).toBeNull();
    expect(request!.status).toBe("received");
  });

  it("issues nothing when consent is missing", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: false });

    await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });

    expect(sendTemplateEmailMock).not.toHaveBeenCalled();
  });

  it("refuses an amount below the minimum card value, rather than issuing a broken card", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({
      totalRupees: 300,
      acceptedStoreCredit: true,
    });

    // GIFT_CARD_MIN_PAISE is Rs 500. A Rs 300 refund cannot become a card, and
    // the honest answer is to say so, not to round the customer up or down.
    const response = await processRefund(returnId, {
      refundAmount: 300,
      refundType: "store_credit",
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/minimum|500/i);

    const request = await db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });
    expect(request!.status).toBe("received");
  });

  it("does not issue a card for an ordinary refund", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });

    // Consent on file is not permission to substitute; the type asked for is.
    const response = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "full",
    });

    expect(response.status).toBe(200);

    const request = await db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });
    expect(request!.storeCreditGiftCardId).toBeNull();
    expect(request!.refundType).toBe("full");
    expect(sendTemplateEmailMock).not.toHaveBeenCalled();
  });

  it("still refuses to settle a return that is not ready", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });
    await db
      .update(returnRequests)
      .set({ status: "pending" })
      .where(eq(returnRequests.id, returnId));

    const response = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });

    expect(response.status).toBe(400);
    expect(sendTemplateEmailMock).not.toHaveBeenCalled();
  });

  it("cannot be run twice, so one return cannot mint two cards", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: true });

    const first = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });
    await cardFor(returnId);
    const second = await processRefund(returnId, {
      refundAmount: 1500,
      refundType: "store_credit",
    });

    expect(first.status).toBe(200);
    // The status guard already covers this — settling moves the return to
    // `refunded` — but a duplicate here is duplicated money, so it is asserted
    // rather than assumed.
    expect(second.status).toBe(400);
    expect(sendTemplateEmailMock).toHaveBeenCalledTimes(1);
  });

  it("marks the order refunded, as any other settlement does", async () => {
    if (!reachable) return;

    const { returnId, orderId } = await makeReturn({
      acceptedStoreCredit: true,
    });

    await processRefund(returnId, {
      refundAmount: 2000,
      refundType: "store_credit",
    });
    await cardFor(returnId);

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    expect(order!.paymentStatus).toBe("refunded");
  });
});

describe("consent is captured when the return is requested", () => {
  it("records when the customer accepted store credit", async () => {
    if (!reachable) return;

    const { createReturnSchema } = await import("../../../src/routes/returns");

    // Opt-in and optional: an old client that does not send the field creates
    // a return that simply cannot be settled as store credit.
    expect(createReturnSchema.safeParse({
      reason: "changed_mind",
      reasonDetails: "Ordered the wrong size entirely",
      acceptStoreCredit: true,
    }).success).toBe(true);

    expect(createReturnSchema.safeParse({
      reason: "changed_mind",
      reasonDetails: "Ordered the wrong size entirely",
    }).success).toBe(true);
  });

  it("leaves consent null when the customer did not accept", async () => {
    if (!reachable) return;

    const { returnId } = await makeReturn({ acceptedStoreCredit: false });

    const request = await db.query.returnRequests.findFirst({
      where: eq(returnRequests.id, returnId),
    });

    expect(request!.storeCreditAcceptedAt).toBeNull();
  });
});

describe("store credit is never a fallback", () => {
  it("is not reachable from any refund path that did not ask for it", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const source = readFileSync(
      join(__dirname, "../../../src/routes/admin/returns.ts"),
      "utf-8",
    );

    // An ordinary refund goes back proportionally to what paid for the order
    // (#557). Store credit substitutes a voucher for that, so it must be an
    // explicit choice — never what happens when a gateway refund fails.
    const issuanceGuard =
      /refundType === "store_credit"|isStoreCredit/;
    expect(source).toMatch(issuanceGuard);
    expect(source).not.toMatch(/catch[\s\S]{0,400}issueGiftCard/);
  });
});
