/**
 * Promotion writes must purge the Redis product-response cache (#525).
 *
 * `invalidateActivePromotions()` clears the resolver's 60s in-process list, so
 * the promotion chrome — the strip, the countdown, the /sale nav link — turns
 * over the moment an admin saves. The *prices* do not: product list, detail,
 * featured and related bodies are cached in Redis with the resolved `sale`
 * block baked in, for 300–900s. Before this fix a sale could be switched on in
 * admin and the storefront kept quoting base prices until the TTL lapsed, and
 * the same in reverse on the way out.
 *
 * What is asserted here, and why it needs a real cache rather than a spy:
 *
 * 1. **Both viewer variants go.** Every product key is written twice, once
 *    `:member` and once `:guest` (`viewerCacheSuffix` in routes/products.ts).
 *    A purge that names one leaves signed-in customers on the old prices — a
 *    spy on "was a delete called" cannot see that, so this suite seeds real
 *    keys of both shapes and checks the store afterwards.
 * 2. **All four key families go.** `product-list:`, `product:<slug>`,
 *    `product:featured:<n>` and `product:related:<slug>:<n>` (#516).
 * 3. **Nothing else goes.** Carts, sessions and collections are not priced by
 *    a promotion and a purge that took them would log every customer out.
 * 4. **SCAN, not KEYS.** `KEYS` walks the whole keyspace inside one command
 *    and blocks the server for the duration. The fake below implements both,
 *    and the test asserts `keys` is never called — the only way that stays
 *    true is if the implementation iterates with a cursor.
 *
 * `ioredis` is replaced with an in-memory fake, so the real `setCached`,
 * `deleteCachedPattern` and `purgeProductResponseCache` all run for real over
 * it. Promotion rows use the real database, like the sibling admin suite.
 *
 * @see packages/api/src/lib/redis.ts
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
import { eq, like } from "drizzle-orm";
import "../../setup";

// ============================================================================
// An in-memory Redis
// ============================================================================

const { redisStore, redisCalls, resetFakeRedis, FakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const calls = { keys: 0, scan: 0, del: 0 };

  /** Redis glob semantics, as much of them as cache prefixes use. */
  function toRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  }

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
      return store.get(key) ?? null;
    }

    async setex(key: string, _ttl: number, value: string): Promise<string> {
      store.set(key, value);
      return "OK";
    }

    async del(...keys: string[]): Promise<number> {
      calls.del += 1;
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed += 1;
      }
      return removed;
    }

    /**
     * Implemented so a KEYS-based purge would still pass every behavioural
     * assertion below — which is the point. The blocking-command regression is
     * caught by the call counter, not by a missing method.
     */
    async keys(pattern: string): Promise<string[]> {
      calls.keys += 1;
      const match = toRegExp(pattern);
      return [...store.keys()].filter((key) => match.test(key));
    }

    /**
     * Pages three keys at a time regardless of COUNT — real Redis treats COUNT
     * as a hint too, and a small page forces the caller's cursor loop to run
     * more than once.
     *
     * The cursor is the last key handed out, resolved against the sorted
     * keyspace, rather than an index into it. That reproduces the guarantee
     * the caller depends on: keys deleted mid-iteration (which is exactly what
     * a purge does) must not shift the keys after them out of the walk. An
     * index-based cursor would skip one key per deletion and the purge would
     * appear to leak.
     */
    async scan(
      cursor: string | number,
      ...args: unknown[]
    ): Promise<[string, string[]]> {
      calls.scan += 1;

      let pattern = "*";
      for (let i = 0; i < args.length - 1; i += 1) {
        if (String(args[i]).toUpperCase() === "MATCH") {
          pattern = String(args[i + 1]);
        }
      }

      const all = [...store.keys()].sort();
      const from =
        String(cursor) === "0"
          ? 0
          : all.findIndex((key) => key > String(cursor));
      if (from < 0 || from >= all.length) return ["0", []];

      const page = all.slice(from, from + 3);
      const done = from + page.length >= all.length;
      const match = toRegExp(pattern);

      return [
        done ? "0" : String(page[page.length - 1]),
        page.filter((key) => match.test(key)),
      ];
    }
  }

  return {
    redisStore: store,
    redisCalls: calls,
    FakeRedis,
    resetFakeRedis: () => {
      store.clear();
      calls.keys = 0;
      calls.scan = 0;
      calls.del = 0;
    },
  };
});

vi.mock("ioredis", () => ({ default: FakeRedis, Redis: FakeRedis }));

// ============================================================================
// Auth
// ============================================================================

const mockGetSession = vi.fn();

vi.mock("../../../src/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// ============================================================================
// Fixtures
// ============================================================================

/** Everything this suite creates is prefixed so cleanup cannot touch real rows. */
const NAME_PREFIX = "promo-cache-purge-test ";
const CALLER_ID = "promo-cache-purge-test-caller";

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE_END = "2099-06-01T00:00:00.000Z";

/**
 * One cached response of every shape a promotion changes the price of, in both
 * viewer variants. The strings mirror routes/products.ts exactly — if a key
 * there ever changes shape, this list is what notices.
 */
function productCacheKeys(): string[] {
  const keys: string[] = [];
  for (const suffix of [":guest", ":member"]) {
    keys.push(`product-list:{"page":1,"pageSize":24}${suffix}`);
    keys.push(`product-list:{"page":2,"pageSize":24,"onSale":true}${suffix}`);
    keys.push(`product:a-poster-slug${suffix}`);
    keys.push(`product:featured:8${suffix}`);
    keys.push(`product:related:a-poster-slug:4${suffix}`);
  }
  return keys;
}

/** Keys a promotion has no business touching. */
const UNRELATED_KEYS = [
  "cart:cart-abc",
  "session:session-xyz",
  "collection:new-arrivals",
  "user:user-1",
];

async function seedCache(): Promise<void> {
  const { setCached } = await import("../../../src/lib/redis");
  for (const key of [...productCacheKeys(), ...UNRELATED_KEYS]) {
    await setCached(key, { cached: true }, 600);
  }
}

/** The seeded product keys that survived — empty is the passing answer. */
function survivingProductKeys(): string[] {
  return productCacheKeys().filter((key) => redisStore.has(key));
}

function sessionFor(role: string) {
  const now = new Date();
  return {
    user: {
      id: CALLER_ID,
      name: "Promo Cache Purge Test Caller",
      email: "promo-cache-purge-test-caller@example.com",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: "active",
    },
    session: {
      id: "promo-cache-purge-test-session",
      token: "promo-cache-purge-test-token",
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
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err.message }, 500);
  });
  return app;
}

function promotionBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `${NAME_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
    headline: "PURGE TEST SALE — 40% OFF",
    discountType: "percentage",
    discountValue: 40,
    scopeType: "all",
    startsAt: PAST,
    endsAt: FUTURE_END,
    ...overrides,
  };
}

async function asAdmin(): Promise<Hono> {
  mockGetSession.mockResolvedValue(sessionFor("admin"));
  return buildApp();
}

/** Create a promotion and hand back its id — the cache is re-seeded after. */
async function createOk(
  app: Hono,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; name: string }> {
  const res = await app.request("/api/admin/promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(promotionBody(overrides)),
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function cleanup(): Promise<void> {
  const { db } = await import("../../../src/database");
  const { users } = await import("../../../src/database/schema/users");
  const { promotions } = await import(
    "../../../src/database/schema/promotions"
  );

  await db.delete(promotions).where(like(promotions.name, `${NAME_PREFIX}%`));
  await db.delete(users).where(eq(users.id, CALLER_ID));
}

beforeAll(async () => {
  const { db } = await import("../../../src/database");
  const { users } = await import("../../../src/database/schema/users");

  await cleanup();
  await db
    .insert(users)
    .values({
      id: CALLER_ID,
      name: "Promo Cache Purge Test Caller",
      email: "promo-cache-purge-test-caller@example.com",
      role: "admin",
    })
    .onConflictDoNothing();
});

afterAll(cleanup);

beforeEach(() => {
  mockGetSession.mockReset();
  resetFakeRedis();
});

// ============================================================================
// The seeding itself has to work, or every assertion below is vacuous
// ============================================================================

describe("the fake cache", () => {
  it("holds the seeded keys before anything is purged", async () => {
    await seedCache();

    expect(survivingProductKeys()).toHaveLength(productCacheKeys().length);
    expect(productCacheKeys()).toHaveLength(10);
  });
});

// ============================================================================
// Every mutating handler
// ============================================================================

describe("promotion writes purge the product response cache", () => {
  it("purges on create", async () => {
    const app = await asAdmin();
    await seedCache();

    await createOk(app);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on update", async () => {
    const app = await asAdmin();
    const created = await createOk(app);
    await seedCache();

    const res = await app.request(`/api/admin/promotions/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        promotionBody({ name: created.name, discountValue: 15 })
      ),
    });
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on enable — the sale has to show up now, not in five minutes", async () => {
    const app = await asAdmin();
    const created = await createOk(app, { isEnabled: false });
    await seedCache();

    const res = await app.request(
      `/api/admin/promotions/${created.id}/enable`,
      { method: "POST" }
    );
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on disable — and the sale has to stop showing up now too", async () => {
    const app = await asAdmin();
    const created = await createOk(app, { isEnabled: true });
    await seedCache();

    const res = await app.request(
      `/api/admin/promotions/${created.id}/disable`,
      { method: "POST" }
    );
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on delete", async () => {
    const app = await asAdmin();
    const created = await createOk(app, { isEnabled: true });
    await seedCache();

    const res = await app.request(`/api/admin/promotions/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });
});

// ============================================================================
// Both viewer variants, named one at a time
// ============================================================================

describe("the member and guest variants of every key", () => {
  it("drops the :member copy as well as the :guest one", async () => {
    const app = await asAdmin();
    const created = await createOk(app, { isEnabled: false });
    await seedCache();

    await app.request(`/api/admin/promotions/${created.id}/enable`, {
      method: "POST",
    });

    // Named individually: a purge that globs only the guest suffix, or only
    // the list prefix, fails on exactly the line that describes what it missed.
    expect(redisStore.has('product-list:{"page":1,"pageSize":24}:guest')).toBe(
      false
    );
    expect(redisStore.has('product-list:{"page":1,"pageSize":24}:member')).toBe(
      false
    );
    expect(redisStore.has("product:a-poster-slug:guest")).toBe(false);
    expect(redisStore.has("product:a-poster-slug:member")).toBe(false);
    expect(redisStore.has("product:featured:8:guest")).toBe(false);
    expect(redisStore.has("product:featured:8:member")).toBe(false);
    expect(redisStore.has("product:related:a-poster-slug:4:guest")).toBe(false);
    expect(redisStore.has("product:related:a-poster-slug:4:member")).toBe(
      false
    );
  });
});

// ============================================================================
// Blast radius
// ============================================================================

describe("what a promotion write must not purge", () => {
  it("leaves carts, sessions, users and collections alone", async () => {
    const app = await asAdmin();
    const created = await createOk(app, { isEnabled: false });
    await seedCache();

    await app.request(`/api/admin/promotions/${created.id}/enable`, {
      method: "POST",
    });

    for (const key of UNRELATED_KEYS) {
      expect(redisStore.has(key)).toBe(true);
    }
  });

  it("does not purge when the write is rejected", async () => {
    mockGetSession.mockResolvedValue(sessionFor("customer"));
    const app = await buildApp();
    await seedCache();

    const res = await app.request("/api/admin/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(promotionBody()),
    });
    expect(res.status).toBe(403);

    expect(survivingProductKeys()).toHaveLength(productCacheKeys().length);
  });

  it("does not purge when the promotion id does not exist", async () => {
    const app = await asAdmin();
    await seedCache();

    const res = await app.request(
      "/api/admin/promotions/dddddddd-0000-4000-8000-000000000011",
      { method: "DELETE" }
    );
    expect(res.status).toBe(404);

    expect(survivingProductKeys()).toHaveLength(productCacheKeys().length);
  });
});

// ============================================================================
// How it purges, not just that it does
// ============================================================================

describe("the purge iterates rather than blocking Redis", () => {
  it("uses SCAN and never KEYS", async () => {
    const app = await asAdmin();
    const created = await createOk(app, { isEnabled: false });
    await seedCache();
    redisCalls.scan = 0;
    redisCalls.keys = 0;

    await app.request(`/api/admin/promotions/${created.id}/enable`, {
      method: "POST",
    });

    // KEYS is O(keyspace) inside one command and stalls every other client for
    // the duration. A cache purge is never worth that.
    expect(redisCalls.keys).toBe(0);
    // More than one iteration: the cursor loop is real, not a single call that
    // happens to return everything.
    expect(redisCalls.scan).toBeGreaterThan(1);
  });
});
