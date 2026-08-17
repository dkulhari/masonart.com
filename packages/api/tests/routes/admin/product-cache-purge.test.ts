/**
 * Admin product writes must purge the Redis product-response cache (#527).
 *
 * `admin/products.ts` used to invalidate by naming keys:
 *
 * ```ts
 * await deleteCached(CacheKeys.PRODUCT_LIST);              // "product-list:"
 * await deleteCached(`${CacheKeys.PRODUCT}${slug}`);       // "product:<slug>"
 * ```
 *
 * Neither string is ever a key. `CacheKeys.PRODUCT_LIST` is a **prefix** — the
 * real key is `product-list:<query-json><:member|:guest>` — and the detail key
 * carries the same viewer suffix (`viewerCacheSuffix`, routes/products.ts). So
 * both deletes matched nothing, `DEL` on a missing key resolves happily, and an
 * admin retitling or repricing a product left the storefront serving the old
 * body for the rest of the TTL.
 *
 * That is why this suite asserts on the **cache contents**, never on the call.
 * A test that spied `deleteCached` and checked it was invoked passed the whole
 * time the bug was live — it was called, five times, against nothing. The only
 * assertion that can tell the difference is "is the entry still there".
 *
 * What is covered:
 *
 * 1. **Every mutating handler.** Create, update, archive, and all three variant
 *    writes. A variant price is the product's displayed price, so a variant
 *    edit has to bust the list too — the old code never touched the list on
 *    those paths at all.
 * 2. **Both viewer variants.** Every product key is written twice, `:member`
 *    and `:guest`. A purge that names one leaves signed-in customers stale.
 * 3. **All four key families.** `product-list:`, `product:<slug>`,
 *    `product:featured:<n>`, `product:related:<slug>:<n>`.
 * 4. **Nothing else.** Carts and sessions are not product bodies; a purge that
 *    took them would sign every customer out.
 * 5. **SCAN, not KEYS.** `KEYS` blocks the server for its whole walk. The fake
 *    implements both and the counter proves which one ran.
 *
 * `ioredis` is replaced with an in-memory fake so the real `setCached` and
 * `purgeProductResponseCache` run for real over it. Product rows use the real
 * database, like the sibling admin suites.
 *
 * @see packages/api/src/lib/redis.ts
 * @see packages/api/src/routes/admin/products.ts
 * @see packages/api/tests/routes/admin/promotion-cache-purge.test.ts
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
import { eq, like } from "drizzle-orm";
import {
  buildCachePurgeApp,
  cachePurgeSessionFor,
} from "../../helpers/cache-purge-harness";
import "../../setup";

// ============================================================================
// An in-memory Redis
// ============================================================================

const { redisStore, redisCalls, resetFakeRedis, FakeRedis } = await vi.hoisted(
  async () =>
    (await import("../../helpers/cache-purge-harness")).createFakeRedis()
);

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
const SKU_PREFIX = "PRODCACHE-TEST-";
const SLUG_PREFIX = "prod-cache-purge-test-";
const CALLER_ID = "prod-cache-purge-test-caller";

/** The slug of the row seeded fresh for each test that needs one to exist. */
const SEEDED_SLUG = `${SLUG_PREFIX}fixture`;

function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * One cached response of every shape an admin product write changes, in both
 * viewer variants. The strings mirror routes/products.ts exactly — if a key
 * there ever changes shape, this list is what notices.
 */
function productCacheKeys(): string[] {
  const keys: string[] = [];
  for (const suffix of [":guest", ":member"]) {
    keys.push(`product-list:{"page":1,"pageSize":24}${suffix}`);
    keys.push(`product-list:{"page":2,"pageSize":24,"status":"active"}${suffix}`);
    keys.push(`product:${SEEDED_SLUG}${suffix}`);
    keys.push(`product:featured:8${suffix}`);
    keys.push(`product:related:${SEEDED_SLUG}:4${suffix}`);
  }
  return keys;
}

/** Keys an admin product write has no business touching. */
const UNRELATED_KEYS = [
  "cart:cart-abc",
  "session:session-xyz",
  "user:user-1",
  "rate-limit:ip-1",
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

const CALLER = {
  id: CALLER_ID,
  name: "Product Cache Purge Test Caller",
  email: "prod-cache-purge-test-caller@example.com",
  sessionId: "prod-cache-purge-test-session",
  sessionToken: "prod-cache-purge-test-token",
};

function sessionFor(role: string) {
  return cachePurgeSessionFor(CALLER, role);
}

async function buildApp(): Promise<Hono> {
  const { adminProductsApp } = await import(
    "../../../src/routes/admin/products"
  );
  return buildCachePurgeApp("/api/admin/products", adminProductsApp);
}

async function asAdmin(): Promise<Hono> {
  mockGetSession.mockResolvedValue(sessionFor("admin"));
  return buildApp();
}

function productBody(overrides: Record<string, unknown> = {}) {
  const id = uniqueSuffix();
  return {
    sku: `${SKU_PREFIX}${id}`,
    title: "Product Cache Purge Test Poster",
    slug: `${SLUG_PREFIX}${id}`,
    description: "Seeded by the #527 cache-purge suite",
    basePrice: "1999.00",
    styles: ["minimalist"],
    subjects: ["nature"],
    colors: ["blue"],
    rooms: ["living-room"],
    tags: ["test"],
    orientation: "portrait",
    status: "active",
    isFeatured: false,
    isAiGenerated: false,
    ...overrides,
  };
}

function variantBody(overrides: Record<string, unknown> = {}) {
  return {
    sizeLabel: "12x16 inches",
    widthInches: 12,
    heightInches: 16,
    widthCm: 30,
    heightCm: 41,
    price: "1499.00",
    stockQuantity: 100,
    lowStockThreshold: 10,
    isInStock: true,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

/**
 * A product that exists, at the slug the cache fixtures name.
 *
 * Inserted directly rather than through the API so the create handler's own
 * purge cannot be what cleared the cache in a test about the update handler.
 */
async function seedProduct(
  slug: string = SEEDED_SLUG
): Promise<{ id: string; slug: string }> {
  const { db } = await import("../../../src/database");
  const { products } = await import("../../../src/database/schema/products");

  const inserted = await db
    .insert(products)
    .values({
      sku: `${SKU_PREFIX}${uniqueSuffix()}`,
      title: "Product Cache Purge Test Poster",
      slug,
      basePrice: "1999.00",
      orientation: "portrait",
      status: "active",
    })
    .returning({ id: products.id, slug: products.slug });

  const row = inserted[0];
  if (!row) throw new Error("failed to seed product fixture");
  return row;
}

async function seedVariant(productId: string): Promise<string> {
  const { db } = await import("../../../src/database");
  const { productVariants } = await import(
    "../../../src/database/schema/products"
  );

  const inserted = await db
    .insert(productVariants)
    .values({
      productId,
      sizeLabel: "12x16 inches",
      widthInches: 12,
      heightInches: 16,
      price: "1499.00",
      stockQuantity: 10,
    })
    .returning({ id: productVariants.id });

  const row = inserted[0];
  if (!row) throw new Error("failed to seed variant fixture");
  return row.id;
}

async function cleanup(): Promise<void> {
  const { db } = await import("../../../src/database");
  const { users } = await import("../../../src/database/schema/users");
  const { products } = await import("../../../src/database/schema/products");

  await db.delete(products).where(like(products.sku, `${SKU_PREFIX}%`));
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
      name: "Product Cache Purge Test Caller",
      email: "prod-cache-purge-test-caller@example.com",
      role: "admin",
    })
    .onConflictDoNothing();
});

afterAll(cleanup);

beforeEach(async () => {
  mockGetSession.mockReset();
  resetFakeRedis();
  // Each test seeds its own rows; drop the previous test's so SEEDED_SLUG is
  // free to be re-inserted.
  const { db } = await import("../../../src/database");
  const { products } = await import("../../../src/database/schema/products");
  await db.delete(products).where(like(products.sku, `${SKU_PREFIX}%`));
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

describe("admin product writes purge the product response cache", () => {
  it("purges on create — a new product has to appear in the grid now", async () => {
    const app = await asAdmin();
    await seedCache();

    const res = await app.request("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productBody()),
    });
    expect(res.status).toBe(201);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on update — a retitled or repriced product cannot stay stale", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    await seedCache();

    const res = await app.request(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed", basePrice: "2499.00" }),
    });
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on archive — an archived product must leave the grid", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    await seedCache();

    const res = await app.request(`/api/admin/products/${product.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on variant create — a variant price is the price the grid shows", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    await seedCache();

    const res = await app.request(
      `/api/admin/products/${product.id}/variants`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variantBody()),
      }
    );
    expect(res.status).toBe(201);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on variant update", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    const variantId = await seedVariant(product.id);
    await seedCache();

    const res = await app.request(
      `/api/admin/products/${product.id}/variants/${variantId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: "999.00" }),
      }
    );
    expect(res.status).toBe(200);

    expect(survivingProductKeys()).toEqual([]);
  });

  it("purges on variant delete", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    const variantId = await seedVariant(product.id);
    await seedCache();

    const res = await app.request(
      `/api/admin/products/${product.id}/variants/${variantId}`,
      { method: "DELETE" }
    );
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
    const product = await seedProduct();
    await seedCache();

    const res = await app.request(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });
    expect(res.status).toBe(200);

    // Named individually: a purge that globs only the guest suffix, or only the
    // list prefix, fails on exactly the line that describes what it missed.
    expect(redisStore.has('product-list:{"page":1,"pageSize":24}:guest')).toBe(
      false
    );
    expect(redisStore.has('product-list:{"page":1,"pageSize":24}:member')).toBe(
      false
    );
    expect(redisStore.has(`product:${SEEDED_SLUG}:guest`)).toBe(false);
    expect(redisStore.has(`product:${SEEDED_SLUG}:member`)).toBe(false);
    expect(redisStore.has("product:featured:8:guest")).toBe(false);
    expect(redisStore.has("product:featured:8:member")).toBe(false);
    expect(redisStore.has(`product:related:${SEEDED_SLUG}:4:guest`)).toBe(false);
    expect(redisStore.has(`product:related:${SEEDED_SLUG}:4:member`)).toBe(
      false
    );
  });

  it("purges the list even when the write only changed one product's variant", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    await seedCache();

    // The pre-fix code invalidated no list key at all on the variant paths —
    // it only named `product:<slug>`, which was itself a miss.
    await app.request(`/api/admin/products/${product.id}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variantBody()),
    });

    expect(redisStore.has('product-list:{"page":1,"pageSize":24}:guest')).toBe(
      false
    );
    expect(redisStore.has('product-list:{"page":1,"pageSize":24}:member')).toBe(
      false
    );
  });
});

// ============================================================================
// Blast radius
// ============================================================================

describe("what an admin product write must not purge", () => {
  it("leaves carts, sessions, users and rate limits alone", async () => {
    const app = await asAdmin();
    const product = await seedProduct();
    await seedCache();

    await app.request(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });

    for (const key of UNRELATED_KEYS) {
      expect(redisStore.has(key)).toBe(true);
    }
  });

  it("does not purge when the caller is not a content manager", async () => {
    mockGetSession.mockResolvedValue(sessionFor("customer"));
    const app = await buildApp();
    await seedCache();

    const res = await app.request("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productBody()),
    });
    expect(res.status).toBe(403);

    expect(survivingProductKeys()).toHaveLength(productCacheKeys().length);
  });

  it("does not purge when the product id does not exist", async () => {
    const app = await asAdmin();
    await seedCache();

    const res = await app.request(
      "/api/admin/products/dddddddd-0000-4000-8000-000000000011",
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
    const product = await seedProduct();
    await seedCache();
    redisCalls.scan = 0;
    redisCalls.keys = 0;

    await app.request(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });

    // KEYS is O(keyspace) inside one command and stalls every other client for
    // the duration. A cache purge is never worth that.
    expect(redisCalls.keys).toBe(0);
    // More than one iteration: the cursor loop is real, not a single call that
    // happens to return everything.
    expect(redisCalls.scan).toBeGreaterThan(1);
  });
});
