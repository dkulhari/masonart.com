/**
 * Reading a gift card: quote against an order, and bare balance.
 *
 * Neither endpoint debits. The debit happens at payment initiation under a
 * row lock, because a quote taken while the customer is still deciding may be
 * hours stale by the time they pay.
 *
 * Both take a bearer code and answer a question about it, which is exactly a
 * free-money oracle if left unthrottled — hence the rate limiter on each.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §7
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

import { giftCards, giftCardTransactions } from "../../src/database/schema/gift-cards";
import { orders } from "../../src/database/schema/orders";
import { users } from "../../src/database/schema/users";
import * as schema from "../../src/database/schema";
import { hashGiftCardCode } from "../../src/lib/gift-card-code";
import {
  liveDbUrl,
  assertLiveDbReachable,
} from "../helpers/live-db";

// Partial mock: the orders route pulls in cart, which needs optionalAuth and
// the rest of the real middleware. Only the session check is swapped out.
vi.mock("../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/middleware/auth")>()),
  requireAuth: vi.fn((c: any, next: any) => {
    const header = c.req.header("X-Test-User");
    if (!header) return c.json({ error: "Unauthorized" }, 401);
    c.set("user", JSON.parse(header));
    return next();
  }),
}));

const DATABASE_URL = liveDbUrl();

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let reachable = false;
let app: Hono;

const createdOrderIds: string[] = [];
const createdCardIds: string[] = [];

const OWNER_ID = "test-user-gc-quote-owner";
const OTHER_ID = "test-user-gc-quote-other";
const OWNER = JSON.stringify({ id: OWNER_ID, email: "owner@example.com" });
const OTHER = JSON.stringify({ id: OTHER_ID, email: "other@example.com" });

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
          id: OWNER_ID,
          name: "Owner",
          email: "owner@gc-quote-test.example.com",
          emailVerified: false,
        },
        {
          id: OTHER_ID,
          name: "Other",
          email: "other@gc-quote-test.example.com",
          emailVerified: false,
        },
      ])
      .onConflictDoNothing();
  }

  const { giftCardsApp } = await import("../../src/routes/gift-cards");
  const { ordersApp } = await import("../../src/routes/orders");
  app = new Hono();
  app.route("/api/gift-cards", giftCardsApp);
  app.route("/api/orders", ordersApp);
});

afterEach(async () => {
  if (!reachable) return;

  if (createdCardIds.length > 0) {
    await db
      .delete(giftCardTransactions)
      .where(inArray(giftCardTransactions.giftCardId, createdCardIds));
    await db.delete(giftCards).where(inArray(giftCards.id, createdCardIds));
  }
  if (createdOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }
  createdCardIds.length = 0;
  createdOrderIds.length = 0;
});

afterAll(async () => {
  if (reachable) {
    await db.delete(users).where(inArray(users.id, [OWNER_ID, OTHER_ID]));
  }
  if (client) await client.end();
});

// ============================================================================
// Fixtures
// ============================================================================

let counter = 0;

function freshCode(): string {
  counter += 1;
  return `QUOT${String(process.pid).padStart(6, "0")}${String(counter).padStart(6, "0")}`.slice(
    0,
    16,
  );
}

async function makeCard(
  balancePaise: number,
  overrides: Partial<typeof giftCards.$inferInsert> = {},
) {
  const code = freshCode();
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

async function makeOrder(totalRupees: string, userId = OWNER_ID) {
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `QT-${Date.now()}-${counter++}`,
      userId,
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

function quote(orderId: string, code: string, user: string | null = OWNER) {
  return app.request(`/api/orders/${orderId}/gift-card`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { "X-Test-User": user } : {}),
    },
    body: JSON.stringify({ code }),
  });
}

function balance(code: string) {
  return app.request("/api/gift-cards/balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

// ============================================================================
// Quote against an order
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

describe.skipIf(!DATABASE_URL)("POST /api/orders/:id/gift-card", () => {
  it("reports what the card could pay without debiting it", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(500_000);
    const orderId = await makeOrder("2000.00");

    const response = await quote(orderId, code);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      applicablePaise: number;
      balancePaise: number;
      last4: string;
    };
    expect(body.applicablePaise).toBe(200_000);
    expect(body.balancePaise).toBe(500_000);

    const card = await db.query.giftCards.findFirst({
      where: eq(giftCards.id, id),
    });
    expect(card!.balancePaise).toBe(500_000);
  });

  it("caps the quote at the balance when the order is larger", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    const body = (await (await quote(orderId, code)).json()) as {
      applicablePaise: number;
    };
    expect(body.applicablePaise).toBe(50_000);
  });

  it("refuses an order belonging to someone else", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00", OTHER_ID);

    const response = await quote(orderId, code, OWNER);
    // 404, not 403: whether that order exists is not the caller's business.
    expect(response.status).toBe(404);
  });

  it("returns the same error for unknown, disabled and expired codes", async () => {
    if (!reachable) return;

    const orderId = await makeOrder("2000.00");
    const disabled = await makeCard(50_000, { disabledAt: new Date() });
    const expired = await makeCard(50_000, {
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    const bodies = await Promise.all(
      [disabled.code, expired.code, "ZZZZZZZZZZZZZZZZ"].map(async (code) => {
        const response = await quote(orderId, code);
        return { status: response.status, body: await response.text() };
      }),
    );

    // Distinguishing them turns the endpoint into an oracle for which codes
    // exist.
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("requires an account", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const orderId = await makeOrder("2000.00");

    const response = await quote(orderId, code, null);
    expect(response.status).toBe(401);
  });

  it("rejects an empty code before touching the database", async () => {
    if (!reachable) return;

    const orderId = await makeOrder("2000.00");
    const response = await quote(orderId, "");
    expect(response.status).toBe(400);
  });
});

// ============================================================================
// Bare balance
// ============================================================================

describe.skipIf(!DATABASE_URL)("POST /api/gift-cards/balance", () => {
  it("returns balance and last four without an account", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);

    const response = await balance(code);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      balancePaise: number;
      last4: string;
    };
    // A bearer card is forwarded to someone who may not have registered.
    // Making them sign up to read a balance would contradict that.
    expect(body.balancePaise).toBe(50_000);
    expect(body.last4).toHaveLength(4);
  });

  it("never returns anything resembling the full code", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const text = await (await balance(code)).text();

    expect(text).not.toContain(code);
    expect(text).not.toMatch(/[0-9A-Z]{16}/);
  });

  it("refuses a disabled card with the shared message", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000, { disabledAt: new Date() });
    const response = await balance(code);
    expect(response.status).toBe(400);
  });

  // The throttle is proven in tests/routes/gift-card-rate-limit.test.ts.
  //
  // It used to be asserted here, and never was: this suite runs with a real
  // database but no Redis and with DISABLE_RATE_LIMIT set, so the assertion
  // returned early on every run and reported green (#575). Driving the
  // limiter needs the Redis primitives faked and the bypass removed, which
  // are not things this suite wants — so it moved rather than pretending.
});
