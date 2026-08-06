/**
 * A sale scheduled to start later must start on time (#528).
 *
 * #525 closed the *end* of a sale: promotion writes purge the product response
 * cache, and `saleCacheTtl` clamps any sale-carrying entry to the soonest
 * active `endsAt` so it lapses with the sale. The start was still open. A body
 * cached at 09:00:00 for a sale that begins at 09:00:30 carried no clamp at
 * all — there was no active promotion to clamp against — so the storefront went
 * on quoting pre-sale prices for the rest of a 300–900s TTL. Nothing runs at
 * the start time: active state is derived from the clock, which is what lets
 * the design manage itself and also what leaves no hook to purge from.
 *
 * This suite is the end-to-end pin for that, and it is deliberately not a unit
 * test of `saleCacheTtl`. Two separate things have to be right before a
 * scheduled sale appears on its own, and asserting the TTL number alone would
 * catch only the first:
 *
 * 1. The Redis entry has to expire at the start boundary.
 * 2. The resolver's own 60s in-process promotion memo has to *notice* the
 *    promotion once the boundary passes. It is filled before the sale starts,
 *    so a memo that stores "the rows that were active when I ran" hides the
 *    promotion for up to 60s more and the freshly-expired cache entry is simply
 *    rebuilt with the same pre-sale prices.
 *
 * So the assertions are on the wire: request, cross the boundary, request
 * again, read the price that comes back.
 *
 * Both caches are real here. `ioredis` is replaced with an in-memory fake that
 * honours TTLs against the (faked) clock, so `setCached`/`getCached` run for
 * real over it, and `promotion-pricing` is NOT mocked — its memo, its clock
 * filtering and the real `resolveSalePrice` are all under test. Only the
 * database is stubbed.
 *
 * @see packages/api/src/lib/promotion-pricing.ts
 * @see packages/api/src/routes/products.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import "../setup";

import type { Promotion } from "../../src/database/schema/promotions";

// ============================================================================
// An in-memory Redis that honours TTL
// ============================================================================

/**
 * The expiry is the whole subject, so the fake cannot ignore it the way the
 * #525 purge fake does — `setex` records a deadline and `get` enforces it
 * against `Date.now()`, which the tests below move.
 */
const { redisStore, resetFakeRedis, FakeRedis } = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();

  class FakeRedis {
    status = "ready";

    constructor(_url?: string, _options?: unknown) {}

    on(): this {
      return this;
    }

    async connect(): Promise<void> {
      this.status = "ready";
    }

    async quit(): Promise<string> {
      return "OK";
    }

    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }

    async setex(key: string, ttl: number, value: string): Promise<string> {
      // Real Redis rejects a non-positive TTL rather than caching forever;
      // `saleCacheTtl`'s floor of one second exists because of that.
      if (ttl <= 0) throw new Error("ERR invalid expire time in 'setex'");
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return "OK";
    }

    async del(...keys: string[]): Promise<number> {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
      }
      return removed;
    }

    async scan(): Promise<[string, string[]]> {
      return ["0", []];
    }
  }

  return {
    redisStore: store,
    FakeRedis,
    resetFakeRedis: () => store.clear(),
  };
});

vi.mock("ioredis", () => ({ default: FakeRedis, Redis: FakeRedis }));

// ============================================================================
// Database
// ============================================================================

const selectMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock("../../src/database", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    query: {
      products: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
    },
  },
}));

/** `optionalAuth` reads the session through here; null is a guest. */
const getSessionMock = vi.fn();

vi.mock("../../src/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

import { frames } from "../../src/database/schema/products";
import { promotions } from "../../src/database/schema/promotions";
import { invalidateActivePromotions } from "../../src/lib/promotion-pricing";
import { productsApp } from "../../src/routes/products";

const app = new Hono();
app.route("/api/products", productsApp);

// ============================================================================
// Fixtures
// ============================================================================

const PROMOTION_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";
const SLUG = "golden-dunes";

/** 40% off 25300.00 is 15180.00. */
const BASE_PRICE = "25300.00";
const SALE_PRICE = "15180.00";

/** Chosen so every offset below stays clear of a minute boundary by accident. */
const OPENING = new Date("2026-08-10T09:00:00.000Z");
const seconds = (n: number) => new Date(OPENING.getTime() + n * 1000);

/**
 * Rows the promotion table hands back.
 *
 * The real query filters on `isEnabled` and `endsAt`; the mock does not, so
 * every fixture here is one the query would genuinely have returned. The
 * disabled row in the last test is the exception, and deliberately so — see
 * the comment there.
 */
function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: PROMOTION_ID,
    name: "Scheduled Sale",
    headline: "SCHEDULED SALE — 40% OFF",
    discountType: "percentage",
    discountValue: 40,
    scopeType: "all",
    scopeFilter: null,
    membersOnly: false,
    startsAt: seconds(30),
    endsAt: new Date("2026-09-01T00:00:00.000Z"),
    isEnabled: true,
    priority: 0,
    perCustomerOrderLimit: null,
    countdownMode: "rolling",
    rollingWindowMinutes: 720,
    rollingJitterMinutes: 90,
    createdBy: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  } as Promotion;
}

function productRow() {
  return {
    id: PRODUCT_ID,
    sku: "SKU-DUNES",
    title: "Golden Dunes",
    slug: SLUG,
    status: "active",
    description: "A quiet desert",
    basePrice: BASE_PRICE,
    styles: ["wabi-sabi"],
    subjects: ["abstract"],
    colors: ["gold"],
    rooms: ["living-room"],
    orientation: "portrait",
    images: [],
    isFeatured: false,
    variants: [],
  };
}

/**
 * `db.select()` answered by the table it reads.
 *
 * Every link in the chain returns the chain and the chain is thenable, so it
 * does not matter where a caller stops building and awaits.
 */
function givenTables(rows: Map<unknown, unknown[]>) {
  selectMock.mockImplementation(() => {
    let table: unknown = null;
    const chain: Record<string, unknown> = {};
    for (const key of [
      "from",
      "where",
      "groupBy",
      "orderBy",
      "limit",
      "offset",
      "leftJoin",
      "innerJoin",
    ]) {
      chain[key] = (arg: unknown) => {
        if (key === "from") table = arg;
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => void) =>
      resolve(rows.get(table) ?? []);
    return chain;
  });
}

/** The catalogue, plus whichever promotions the table holds. */
function givenCatalogue(promotionRows: Promotion[]) {
  givenTables(
    new Map<unknown, unknown[]>([
      [promotions, promotionRows],
      [frames, []],
    ])
  );
  findFirstMock.mockResolvedValue(productRow());
}

type ProductBody = {
  basePrice: string;
  sale: { salePrice: string; percentOff: number } | null;
  fromCache?: boolean;
};

async function fetchProduct(): Promise<ProductBody> {
  const res = await app.request(`/api/products/${SLUG}`);
  expect(res.status).toBe(200);
  return (await res.json()) as ProductBody;
}

/** Move the clock without re-entering the fake-timer setup. */
function at(offsetSeconds: number) {
  vi.setSystemTime(seconds(offsetSeconds));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPENING);
  resetFakeRedis();
  // The promotion memo is module state and outlives a test otherwise.
  invalidateActivePromotions();
  selectMock.mockReset();
  findFirstMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// The premise
// ============================================================================

describe("the fake cache", () => {
  it("serves an entry back and then lets it expire on its TTL", async () => {
    givenCatalogue([]);

    const first = await fetchProduct();
    expect(first.fromCache).toBeUndefined();
    expect(redisStore.size).toBe(1);

    // Inside the 600s detail TTL.
    at(60);
    expect((await fetchProduct()).fromCache).toBe(true);

    // Past it.
    at(700);
    expect((await fetchProduct()).fromCache).toBeUndefined();
  });
});

// ============================================================================
// The bug
// ============================================================================

describe("a promotion scheduled to start later", () => {
  it("prices at the sale the moment it starts, with no admin action", async () => {
    // 09:00:00. The sale is real, enabled, and thirty seconds away.
    givenCatalogue([promotion({ startsAt: seconds(30) })]);

    const before = await fetchProduct();
    expect(before.sale).toBeNull();
    expect(before.basePrice).toBe(BASE_PRICE);

    // 09:00:45. Nobody has saved anything, nobody has purged anything — the
    // clock simply crossed `startsAt`.
    at(45);

    const after = await fetchProduct();
    expect(after.sale).not.toBeNull();
    expect(after.sale?.salePrice).toBe(SALE_PRICE);
    expect(after.sale?.percentOff).toBe(40);
  });

  it("does not shorten the TTL for a sale that starts after it would lapse", async () => {
    // Two hours out. A 600s entry cannot survive into the sale, so clamping it
    // would be pure cache loss — the fix has to cost nothing until it matters.
    givenCatalogue([promotion({ startsAt: seconds(7200) })]);

    await fetchProduct();
    at(500);

    expect((await fetchProduct()).fromCache).toBe(true);
  });

  it("ignores a scheduled promotion that is disabled", async () => {
    /**
     * A disabled row has no start time in any sense that matters: nothing
     * happens when the clock passes it, so clamping the cache against it would
     * throw away entries for a sale that never arrives.
     *
     * The mocked table hands this row over even though the real query filters
     * `isEnabled = true`, which is the point — the guard is asserted in the
     * code rather than in the WHERE clause, and it also covers the window in
     * which the memo still holds a row an admin has since switched off.
     */
    givenCatalogue([promotion({ startsAt: seconds(30), isEnabled: false })]);

    const before = await fetchProduct();
    expect(before.sale).toBeNull();

    at(45);

    const after = await fetchProduct();
    expect(after.fromCache).toBe(true);
    expect(after.sale).toBeNull();
  });

  it("clamps to the soonest start when several are queued", async () => {
    givenCatalogue([
      promotion({ id: PROMOTION_ID, startsAt: seconds(400) }),
      promotion({
        id: "55555555-5555-4555-8555-555555555555",
        startsAt: seconds(30),
        discountValue: 10,
      }),
    ]);

    await fetchProduct();
    at(45);

    // The 30s promotion is the one that has started, and the entry cached at
    // 09:00:00 must not have outlived it.
    const after = await fetchProduct();
    expect(after.fromCache).toBeUndefined();
    expect(after.sale?.percentOff).toBe(10);
  });

  it("still clamps to the end of a running sale that ends before the next starts", async () => {
    // #525's clamp has to survive the change: the running sale ends in 30s and
    // the next one is an hour out, so 30s is the boundary that binds.
    givenCatalogue([
      promotion({
        id: PROMOTION_ID,
        startsAt: seconds(-60),
        endsAt: seconds(30),
      }),
      promotion({
        id: "55555555-5555-4555-8555-555555555555",
        startsAt: seconds(3600),
      }),
    ]);

    expect((await fetchProduct()).sale?.percentOff).toBe(40);

    at(45);

    const after = await fetchProduct();
    expect(after.fromCache).toBeUndefined();
    expect(after.sale).toBeNull();
  });
});
