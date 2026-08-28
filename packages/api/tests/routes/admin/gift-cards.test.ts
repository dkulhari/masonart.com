/**
 * Admin gift card management.
 *
 * Two things carry the weight: the plaintext code appears exactly once, in
 * the issue reply, and the adjustment endpoint — the only one that can create
 * money from nothing — refuses to run without a reason.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §9
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";

import { giftCards, giftCardTransactions } from "../../../src/database/schema/gift-cards";
import { users } from "../../../src/database/schema/users";
import { hashGiftCardCode } from "../../../src/lib/gift-card-code";
import {
  liveDbUrl,
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from "../../helpers/live-db";
import { freshGiftCardCode } from "../../helpers/gift-card-fixtures";

let adminAllowed = true;

vi.mock("../../../src/middleware/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/middleware/auth")>()),
  ...(await import("../../helpers/admin-route-harness")).headerAdminMocks(
    () => adminAllowed,
  ),
}));

const DATABASE_URL = liveDbUrl();

let client: LiveDbConnection["client"];
let db: LiveDbConnection["db"];
let reachable = false;
let app: Hono;

const createdCardIds: string[] = [];

const ADMIN_ID = "test-user-gc-admin";
const ADMIN = JSON.stringify({ id: ADMIN_ID, email: "admin@example.com" });

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb({ max: 3 }));

  if (reachable) {
    await db
      .insert(users)
      .values({
        id: ADMIN_ID,
        name: "Admin",
        email: "admin@gc-admin-test.example.com",
        emailVerified: false,
      })
      .onConflictDoNothing();
  }

  const { adminGiftCardsApp } = await import("../../../src/routes/admin/gift-cards");
  app = new Hono();
  app.route("/api/admin/gift-cards", adminGiftCardsApp);
});

afterEach(async () => {
  adminAllowed = true;
  if (!reachable || createdCardIds.length === 0) return;

  await db
    .delete(giftCardTransactions)
    .where(inArray(giftCardTransactions.giftCardId, createdCardIds));
  await db.delete(giftCards).where(inArray(giftCards.id, createdCardIds));
  createdCardIds.length = 0;
});

afterAll(async () => {
  if (reachable) await db.delete(users).where(eq(users.id, ADMIN_ID));
  await closeLiveDb(client);
});

async function makeCard(
  balancePaise: number,
  overrides: Partial<typeof giftCards.$inferInsert> = {},
) {
  const code = freshGiftCardCode("ADM");
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

/**
 * The app is mounted at /api/admin/gift-cards, and the collection route is
 * "/" — so the mounted path is the bare prefix. A trailing slash, with or
 * without a query string after it, 404s.
 */
function giftCardPath(path: string): string {
  return `/api/admin/gift-cards${path}`.replace(/\/(?=$|\?)/, "");
}

function get(path: string) {
  return app.request(giftCardPath(path), {
    headers: { "X-Test-User": ADMIN },
  });
}

function post(path: string, body: unknown) {
  return app.request(giftCardPath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-User": ADMIN },
    body: JSON.stringify(body),
  });
}

const FULL_CODE = /[0-9A-Z]{16}/;

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

describe.skipIf(!DATABASE_URL)("admin gift cards", () => {
  it("lists cards with a derived status", async () => {
    if (!reachable) return;

    const { id } = await makeCard(50_000);
    const body = (await (await get("/")).json()) as {
      giftCards: Array<{ id: string; status: string }>;
    };

    const found = body.giftCards.find((card) => card.id === id);
    expect(found?.status).toBe("active");
  });

  it("derives spent and disabled rather than storing them", async () => {
    if (!reachable) return;

    const spent = await makeCard(0);
    const disabled = await makeCard(50_000, { disabledAt: new Date() });

    const body = (await (await get("/")).json()) as {
      giftCards: Array<{ id: string; status: string }>;
    };

    expect(body.giftCards.find((c) => c.id === spent.id)?.status).toBe("spent");
    expect(body.giftCards.find((c) => c.id === disabled.id)?.status).toBe("disabled");
  });

  it("finds a card by its full code", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const body = (await (await get(`/?q=${code}`)).json()) as {
      giftCards: Array<{ id: string }>;
    };

    expect(body.giftCards).toHaveLength(1);
    expect(body.giftCards[0]!.id).toBe(id);
  });

  it("finds a card by its last four", async () => {
    if (!reachable) return;

    const { id, code } = await makeCard(50_000);
    const body = (await (await get(`/?q=${code.slice(-4)}`)).json()) as {
      giftCards: Array<{ id: string }>;
    };

    expect(body.giftCards.map((card) => card.id)).toContain(id);
  });

  it("never echoes a full code back in search", async () => {
    if (!reachable) return;

    const { code } = await makeCard(50_000);
    const text = await (await get(`/?q=${code}`)).text();

    // Searching takes a code in; it must not hand one back out.
    expect(text).not.toContain(code);
    expect(text).not.toMatch(FULL_CODE);
  });

  it("returns the plaintext code exactly once, when issuing", async () => {
    if (!reachable) return;

    const response = await post("/", {
      amountPaise: 100_000,
      reason: "goodwill for a delayed order",
    });

    const body = (await response.json()) as {
      code: string;
      giftCard: { id: string };
    };
    createdCardIds.push(body.giftCard.id);

    expect(body.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

    // And never again.
    const detail = await (await get(`/${body.giftCard.id}`)).text();
    expect(detail).not.toContain(body.code.replace(/-/g, ""));
    expect(detail).not.toMatch(FULL_CODE);
  });

  it("records who issued a card and why", async () => {
    if (!reachable) return;

    const body = (await (
      await post("/", { amountPaise: 100_000, reason: "compensation" })
    ).json()) as { giftCard: { id: string } };
    createdCardIds.push(body.giftCard.id);

    const ledger = await db.query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, body.giftCard.id),
    });

    expect(ledger[0]!.createdBy).toBe(ADMIN_ID);
    expect(ledger[0]!.description).toContain("compensation");
  });

  it("disables and re-enables without deleting", async () => {
    if (!reachable) return;

    const { id } = await makeCard(50_000);

    await post(`/${id}/disable`, {});
    let card = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id) });
    expect(card!.disabledAt).not.toBeNull();
    expect(card!.balancePaise).toBe(50_000);

    await post(`/${id}/enable`, {});
    card = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id) });
    expect(card!.disabledAt).toBeNull();
  });

  it("refuses an adjustment with no reason", async () => {
    if (!reachable) return;

    const { id } = await makeCard(50_000);
    const response = await post(`/${id}/adjust`, { amountPaise: 10_000 });

    // This is the one endpoint that can create money from nothing.
    expect(response.status).toBe(400);
  });

  it("adjusts a balance and writes a ledger row naming the reason", async () => {
    if (!reachable) return;

    const { id } = await makeCard(50_000);
    await post(`/${id}/adjust`, {
      amountPaise: 10_000,
      reason: "credited the wrong card",
    });

    const card = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id) });
    expect(card!.balancePaise).toBe(60_000);

    const ledger = await db.query.giftCardTransactions.findMany({
      where: eq(giftCardTransactions.giftCardId, id),
    });
    const adjustment = ledger.find((entry) => entry.type === "adjustment");
    expect(adjustment!.description).toContain("credited the wrong card");
  });

  it("refuses an adjustment that would leave a negative balance", async () => {
    if (!reachable) return;

    const { id } = await makeCard(50_000);
    const response = await post(`/${id}/adjust`, {
      amountPaise: -60_000,
      reason: "over-credited",
    });

    expect(response.status).toBe(400);
    const card = await db.query.giftCards.findFirst({ where: eq(giftCards.id, id) });
    expect(card!.balancePaise).toBe(50_000);
  });

  it("reports total outstanding liability", async () => {
    if (!reachable) return;

    const before = (await (await get("/liability")).json()) as {
      liabilityPaise: number;
    };

    await makeCard(50_000);
    await makeCard(30_000);
    await makeCard(90_000, { disabledAt: new Date() });

    const after = (await (await get("/liability")).json()) as {
      liabilityPaise: number;
    };

    // Disabled cards cannot be spent, so they are not owed.
    expect(after.liabilityPaise - before.liabilityPaise).toBe(80_000);
  });

  it("refuses a non-admin", async () => {
    if (!reachable) return;

    adminAllowed = false;
    const response = await get("/");
    expect(response.status).toBe(403);
  });
});
