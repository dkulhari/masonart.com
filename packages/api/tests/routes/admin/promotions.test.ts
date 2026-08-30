/**
 * Tests for the admin promotions API.
 *
 * - GET    /api/admin/promotions          - list, with DERIVED isActive
 * - POST   /api/admin/promotions          - create
 * - PATCH  /api/admin/promotions/:id      - update, replacing membership sets
 * - POST   /api/admin/promotions/:id/enable | /disable
 * - DELETE /api/admin/promotions/:id
 *
 * Invariants under test:
 * - Gated by requireAdmin: a customer or content-manager gets 403
 * - `isActive` is computed per row from isEnabled/startsAt/endsAt, never read
 *   from a column — there is no status column to read
 * - Every mutating handler invalidates the resolver's 60s cache, so enabling a
 *   sale is visible on the storefront immediately
 * - PATCH replaces the pinned-product and exclusion sets wholesale; a partial
 *   replacement that leaves stale rows is the failure this guards against
 *
 * Mocks Better Auth's getSession for role selection and the resolver's cache
 * invalidator (to observe the call); uses the real database for promotion and
 * product rows, seeded and cleaned per run.
 *
 * @see packages/api/src/routes/admin/promotions.ts
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, inArray, like } from "drizzle-orm";
import "../../setup";
import { readJson } from '../../helpers/json';

const mockGetSession = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("../../../src/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

/**
 * Only the invalidator is replaced. `isPromotionActive` stays real, so the
 * derived-state assertions below exercise the actual predicate rather than a
 * stub that could agree with a buggy route.
 */
vi.mock("../../../src/lib/promotion-pricing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/lib/promotion-pricing")>();
  return {
    ...actual,
    invalidateActivePromotions: () => mockInvalidate(),
  };
});

// ============================================================================
// Fixtures
// ============================================================================

/** Everything this suite creates is prefixed so cleanup cannot touch real rows. */
const NAME_PREFIX = "promo-admin-test ";

const PRODUCT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const PRODUCT_B = "aaaaaaaa-0000-4000-8000-00000000000b";
const PRODUCT_C = "aaaaaaaa-0000-4000-8000-00000000000c";
const SEEDED_PRODUCT_IDS = [PRODUCT_A, PRODUCT_B, PRODUCT_C];

const CALLER_ID = "promo-admin-test-caller";

const PAST = "2020-01-01T00:00:00.000Z";
const PAST_END = "2020-06-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";
const FUTURE_END = "2099-06-01T00:00:00.000Z";

function sessionFor(role: string) {
  const now = new Date();
  return {
    user: {
      id: CALLER_ID,
      name: "Promo Admin Test Caller",
      email: "promo-admin-test-caller@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: "active",
    },
    session: {
      id: "promo-admin-test-session",
      token: "promo-admin-test-token",
      userId: CALLER_ID,
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function buildApp(): Promise<Hono> {
  const { adminPromotionsApp } = await import(
    "../../../src/routes/admin/promotions"
  );
  const app = new Hono();
  app.route("/api/admin/promotions", adminPromotionsApp);
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    return c.json({ error: err.message }, 500);
  });
  return app;
}

/** A valid create body; every test overrides only what it is about. */
function promotionBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `${NAME_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
    headline: "TEST SALE — 40% OFF",
    discountType: "percentage",
    discountValue: 40,
    scopeType: "all",
    startsAt: PAST,
    endsAt: FUTURE_END,
    ...overrides,
  };
}

async function asAdmin() {
  mockGetSession.mockResolvedValue(sessionFor("admin"));
  return buildApp();
}

async function createPromotion(
  app: Hono,
  overrides: Record<string, unknown> = {}
) {
  const res = await app.request("/api/admin/promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(promotionBody(overrides)),
  });
  return res;
}

/** Create and assert 201, returning the body — for tests that are about something else. */
async function createOk(app: Hono, overrides: Record<string, unknown> = {}) {
  const res = await createPromotion(app, overrides);
  expect(res.status).toBe(201);
  return readJson(res);
}

async function seedProducts() {
  const { db } = await import("../../../src/database");
  const { products } = await import("../../../src/database/schema/products");
  const { users } = await import("../../../src/database/schema/users");

  await db
    .insert(users)
    .values({
      id: CALLER_ID,
      name: "Promo Admin Test Caller",
      email: "promo-admin-test-caller@example.com",
      role: "admin",
    })
    .onConflictDoNothing();

  await db
    .insert(products)
    .values(
      SEEDED_PRODUCT_IDS.map((id, index) => ({
        id,
        sku: `PROMO-ADMIN-TEST-${index}`,
        title: `Promo Admin Test Product ${index}`,
        slug: `promo-admin-test-product-${index}`,
        basePrice: "1000.00",
        orientation: "portrait" as const,
        status: "active" as const,
      }))
    )
    .onConflictDoNothing();
}

async function cleanup() {
  const { db } = await import("../../../src/database");
  const { products } = await import("../../../src/database/schema/products");
  const { users } = await import("../../../src/database/schema/users");
  const { promotions } = await import(
    "../../../src/database/schema/promotions"
  );

  // Membership rows cascade from the promotion delete
  await db.delete(promotions).where(like(promotions.name, `${NAME_PREFIX}%`));
  await db.delete(products).where(inArray(products.id, SEEDED_PRODUCT_IDS));
  await db.delete(users).where(eq(users.id, CALLER_ID));
}

async function pinnedIds(promotionId: string): Promise<string[]> {
  const { db } = await import("../../../src/database");
  const { promotionProducts } = await import(
    "../../../src/database/schema/promotions"
  );
  const rows = await db
    .select({ productId: promotionProducts.productId })
    .from(promotionProducts)
    .where(eq(promotionProducts.promotionId, promotionId));
  return rows.map((row) => row.productId).sort();
}

async function excludedIds(promotionId: string): Promise<string[]> {
  const { db } = await import("../../../src/database");
  const { promotionExclusions } = await import(
    "../../../src/database/schema/promotions"
  );
  const rows = await db
    .select({ productId: promotionExclusions.productId })
    .from(promotionExclusions)
    .where(eq(promotionExclusions.promotionId, promotionId));
  return rows.map((row) => row.productId).sort();
}

beforeAll(async () => {
  await cleanup();
  await seedProducts();
});
afterAll(cleanup);

beforeEach(() => {
  mockGetSession.mockReset();
  mockInvalidate.mockReset();
});

// ============================================================================
// Admin gate
// ============================================================================

describe("admin promotions - role gate", () => {
  it("rejects a non-admin with 403 on the list", async () => {
    mockGetSession.mockResolvedValue(sessionFor("customer"));
    const app = await buildApp();

    const res = await app.request("/api/admin/promotions");
    expect(res.status).toBe(403);
  });

  it("rejects a content-manager with 403 on create", async () => {
    mockGetSession.mockResolvedValue(sessionFor("content-manager"));
    const app = await buildApp();

    const res = await createPromotion(app);
    expect(res.status).toBe(403);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    mockGetSession.mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.request("/api/admin/promotions");
    expect(res.status).toBe(401);
  });
});

// ============================================================================
// POST /api/admin/promotions
// ============================================================================

describe("POST /api/admin/promotions", () => {
  it("creates a sitewide promotion, disabled by default", async () => {
    const app = await asAdmin();

    const res = await createPromotion(app, { scopeType: "all" });
    expect(res.status).toBe(201);

    const body = await readJson(res);
    expect(body.id).toBeTruthy();
    expect(body.scopeType).toBe("all");
    // isEnabled defaults to false: a new sale never goes live on save
    expect(body.isEnabled).toBe(false);
    expect(body.isActive).toBe(false);
  });

  it("rejects a filter scope with no filter (400)", async () => {
    const app = await asAdmin();

    const res = await createPromotion(app, {
      scopeType: "filter",
      scopeFilter: undefined,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a percentage discount above 100 (400)", async () => {
    const app = await asAdmin();

    const res = await createPromotion(app, {
      discountType: "percentage",
      discountValue: 140,
    });
    expect(res.status).toBe(400);
  });

  it("rejects endsAt on or before startsAt (400)", async () => {
    const app = await asAdmin();

    const res = await createPromotion(app, {
      startsAt: FUTURE,
      endsAt: PAST,
    });
    expect(res.status).toBe(400);
  });

  it("stores the pinned product list for a products scope", async () => {
    const app = await asAdmin();

    const body = await createOk(app, {
      scopeType: "products",
      productIds: [PRODUCT_A, PRODUCT_B],
    });

    expect(await pinnedIds(body.id)).toEqual([PRODUCT_A, PRODUCT_B].sort());
  });

  it("rejects a products scope with no products (400)", async () => {
    const app = await asAdmin();

    const res = await createPromotion(app, {
      scopeType: "products",
      productIds: [],
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown product ids with 400 rather than a foreign key error", async () => {
    const app = await asAdmin();

    const res = await createPromotion(app, {
      scopeType: "products",
      productIds: ["dddddddd-0000-4000-8000-00000000000d"],
    });
    expect(res.status).toBe(400);
  });

  it("stores exclusions independently of scope", async () => {
    const app = await asAdmin();

    const body = await createOk(app, {
      scopeType: "all",
      excludedProductIds: [PRODUCT_C],
    });

    // An exclusion applies to a sitewide promotion, which has no pinned list
    expect(await excludedIds(body.id)).toEqual([PRODUCT_C]);
    expect(await pinnedIds(body.id)).toEqual([]);
  });

  it("invalidates the resolver cache on create", async () => {
    const app = await asAdmin();

    await createOk(app);
    expect(mockInvalidate).toHaveBeenCalled();
  });
});

// ============================================================================
// GET /api/admin/promotions
// ============================================================================

describe("GET /api/admin/promotions", () => {
  it("lists promotions with derived active state", async () => {
    const app = await asAdmin();

    const running = await createOk(app, {
      isEnabled: true,
      startsAt: PAST,
      endsAt: FUTURE_END,
    });
    const scheduled = await createOk(app, {
      isEnabled: true,
      startsAt: FUTURE,
      endsAt: FUTURE_END,
    });
    const ended = await createOk(app, {
      isEnabled: true,
      startsAt: PAST,
      endsAt: PAST_END,
    });
    const disabled = await createOk(app, {
      isEnabled: false,
      startsAt: PAST,
      endsAt: FUTURE_END,
    });

    const res = await app.request("/api/admin/promotions");
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);

    const byId = new Map<string, { isActive: boolean; isEnabled: boolean }>(
      body.map((row: { id: string }) => [row.id, row as never])
    );

    // Derived, not stored: same isEnabled=true, three different answers
    expect(byId.get(running.id)?.isActive).toBe(true);
    expect(byId.get(scheduled.id)?.isActive).toBe(false);
    expect(byId.get(ended.id)?.isActive).toBe(false);
    expect(byId.get(disabled.id)?.isActive).toBe(false);

    expect(byId.get(scheduled.id)?.isEnabled).toBe(true);
    expect(byId.get(ended.id)?.isEnabled).toBe(true);
  });

  it("returns the membership sets so the edit form can round-trip them", async () => {
    const app = await asAdmin();

    const created = await createOk(app, {
      scopeType: "products",
      productIds: [PRODUCT_A],
      excludedProductIds: [PRODUCT_B],
    });

    const res = await app.request("/api/admin/promotions");
    const body = await readJson(res);
    const row = body.find((r: { id: string }) => r.id === created.id);

    expect(row.productIds).toEqual([PRODUCT_A]);
    expect(row.excludedProductIds).toEqual([PRODUCT_B]);
  });
});

// ============================================================================
// PATCH /api/admin/promotions/:id
// ============================================================================

describe("PATCH /api/admin/promotions/:id", () => {
  async function patch(app: Hono, id: string, body: Record<string, unknown>) {
    return app.request(`/api/admin/promotions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("updates the editable fields", async () => {
    const app = await asAdmin();
    const created = await createOk(app);

    const res = await patch(
      app,
      created.id,
      promotionBody({
        name: created.name,
        headline: "UPDATED HEADLINE",
        discountValue: 25,
      })
    );
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.headline).toBe("UPDATED HEADLINE");
    expect(body.discountValue).toBe(25);
  });

  it("replaces the pinned and excluded sets rather than adding to them", async () => {
    const app = await asAdmin();
    const created = await createOk(app, {
      scopeType: "products",
      productIds: [PRODUCT_A, PRODUCT_B],
      excludedProductIds: [PRODUCT_C],
    });

    expect(await pinnedIds(created.id)).toEqual([PRODUCT_A, PRODUCT_B].sort());

    const res = await patch(
      app,
      created.id,
      promotionBody({
        name: created.name,
        scopeType: "products",
        productIds: [PRODUCT_C],
        excludedProductIds: [PRODUCT_A],
      })
    );
    expect(res.status).toBe(200);

    // The old ids are gone, not merged with the new ones
    expect(await pinnedIds(created.id)).toEqual([PRODUCT_C]);
    expect(await excludedIds(created.id)).toEqual([PRODUCT_A]);
  });

  it("clears the sets when the new lists are empty", async () => {
    const app = await asAdmin();
    const created = await createOk(app, {
      scopeType: "all",
      excludedProductIds: [PRODUCT_A, PRODUCT_B],
    });

    const res = await patch(
      app,
      created.id,
      promotionBody({ name: created.name, scopeType: "all" })
    );
    expect(res.status).toBe(200);
    expect(await excludedIds(created.id)).toEqual([]);
  });

  it("leaves the sets untouched when validation fails", async () => {
    const app = await asAdmin();
    const created = await createOk(app, {
      scopeType: "products",
      productIds: [PRODUCT_A],
    });

    const res = await patch(
      app,
      created.id,
      promotionBody({
        name: created.name,
        scopeType: "products",
        productIds: [],
      })
    );
    expect(res.status).toBe(400);
    expect(await pinnedIds(created.id)).toEqual([PRODUCT_A]);
  });

  it("invalidates the resolver cache", async () => {
    const app = await asAdmin();
    const created = await createOk(app);
    mockInvalidate.mockReset();

    await patch(app, created.id, promotionBody({ name: created.name }));
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    const app = await asAdmin();

    const res = await patch(
      app,
      "dddddddd-0000-4000-8000-00000000000e",
      promotionBody()
    );
    expect(res.status).toBe(404);
  });

  it("rejects a non-admin with 403", async () => {
    const admin = await asAdmin();
    const created = await createOk(admin);

    mockGetSession.mockResolvedValue(sessionFor("customer"));
    const app = await buildApp();

    const res = await patch(app, created.id, promotionBody());
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// POST /api/admin/promotions/:id/enable | /disable
// ============================================================================

describe("POST /api/admin/promotions/:id/enable and /disable", () => {
  function toggle(app: Hono, id: string, action: "enable" | "disable") {
    return app.request(`/api/admin/promotions/${id}/${action}`, {
      method: "POST",
    });
  }

  it("enable flips isEnabled and invalidates the resolver cache", async () => {
    const app = await asAdmin();
    const created = await createOk(app, {
      isEnabled: false,
      startsAt: PAST,
      endsAt: FUTURE_END,
    });
    expect(created.isEnabled).toBe(false);
    mockInvalidate.mockReset();

    const res = await toggle(app, created.id, "enable");
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.isEnabled).toBe(true);
    // Enabled, started and not ended — the derived state follows immediately
    expect(body.isActive).toBe(true);
    // Without this the storefront would keep the old answer for up to 60s
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("disable flips isEnabled back and invalidates", async () => {
    const app = await asAdmin();
    const created = await createOk(app, {
      isEnabled: true,
      startsAt: PAST,
      endsAt: FUTURE_END,
    });
    mockInvalidate.mockReset();

    const res = await toggle(app, created.id, "disable");
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.isEnabled).toBe(false);
    expect(body.isActive).toBe(false);
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    const app = await asAdmin();

    const res = await toggle(app, "dddddddd-0000-4000-8000-00000000000f", "enable");
    expect(res.status).toBe(404);
  });

  it("rejects a non-admin with 403", async () => {
    const admin = await asAdmin();
    const created = await createOk(admin);

    mockGetSession.mockResolvedValue(sessionFor("customer"));
    const app = await buildApp();

    const res = await toggle(app, created.id, "enable");
    expect(res.status).toBe(403);
  });
});

// ============================================================================
// DELETE /api/admin/promotions/:id
// ============================================================================

describe("DELETE /api/admin/promotions/:id", () => {
  it("deletes the promotion and its membership rows, and invalidates", async () => {
    const app = await asAdmin();
    const created = await createOk(app, {
      scopeType: "products",
      productIds: [PRODUCT_A],
      excludedProductIds: [PRODUCT_B],
    });
    mockInvalidate.mockReset();

    const res = await app.request(`/api/admin/promotions/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const list = await readJson(await app.request("/api/admin/promotions"));
    expect(list.some((row: { id: string }) => row.id === created.id)).toBe(
      false
    );
    expect(await pinnedIds(created.id)).toEqual([]);
    expect(await excludedIds(created.id)).toEqual([]);
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    const app = await asAdmin();

    const res = await app.request(
      "/api/admin/promotions/dddddddd-0000-4000-8000-000000000010",
      { method: "DELETE" }
    );
    expect(res.status).toBe(404);
  });

  it("rejects a non-admin with 403", async () => {
    const admin = await asAdmin();
    const created = await createOk(admin);

    mockGetSession.mockResolvedValue(sessionFor("customer"));
    const app = await buildApp();

    const res = await app.request(`/api/admin/promotions/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });
});
