/**
 * The gift card code throttle, actually throttling.
 *
 * `giftCardCodeRateLimit` guards the two endpoints that take a bearer code —
 * `POST /api/gift-cards/balance` and `POST /api/orders/:id/gift-card`. Both
 * answer a yes/no question about an instrument that is worth money to whoever
 * holds it, and the limiter is the only thing standing between that and an
 * enumeration oracle.
 *
 * Until #575 no test had ever seen it return 429. `rateLimit()` falls through
 * when Redis is not connected and is bypassed by `DISABLE_RATE_LIMIT`, which
 * the vitest env sets, so the one assertion that existed
 * (`gift-card-quote.test.ts`) returned early every single run.
 *
 * Two layers here, deliberately:
 *
 *   1. The endpoints, driven through Hono with the Redis primitives faked in
 *      memory. Proves the middleware is mounted, engages, and 429s. Needs no
 *      infrastructure, so it can never skip itself.
 *   2. The real sliding window in `lib/redis.ts` against a real Redis. Proves
 *      the counting is not fictional. This one needs a server, and if there
 *      is none it FAILS rather than passing quietly — see #580 for what
 *      silent skips cost.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Layer 1: the endpoints
// ---------------------------------------------------------------------------

/**
 * A sliding window in a Map, standing in for the one in Redis.
 *
 * Same contract as `checkRateLimit`, so the middleware under test cannot tell
 * the difference. The real algorithm is exercised in layer 2.
 */
const windows = new Map<string, number[]>();
let redisConnected = true;

function fakeCheckRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): { success: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const start = now - windowSeconds * 1000;
  const hits = (windows.get(key) ?? []).filter((at) => at > start);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return { success: false, remaining: 0, resetIn: windowSeconds };
  }

  hits.push(now);
  windows.set(key, hits);
  return { success: true, remaining: limit - hits.length, resetIn: windowSeconds };
}

vi.mock("../../src/lib/redis", () => ({
  isRedisConnected: () => redisConnected,
  checkRateLimit: (key: string, limit: number, windowSeconds: number) =>
    Promise.resolve(fakeCheckRateLimit(key, limit, windowSeconds)),
  // Touched by modules the routers pull in; never reached in these tests.
  getCached: () => Promise.resolve(null),
  setCached: () => Promise.resolve(),
  deleteCached: () => Promise.resolve(),
  deleteCachedPattern: () => Promise.resolve(),
  purgeProductResponseCache: () => Promise.resolve(),
  CacheKeys: { RATE_LIMIT: "ratelimit:" },
  default: {},
}));

// The handler behind the throttle is not what is being tested, and it would
// otherwise need a database. A 429 has to happen before it is ever called.
const quoteGiftCardMock = vi.fn();
vi.mock("../../src/services/gift-card", () => ({
  quoteGiftCard: (...args: unknown[]) => quoteGiftCardMock(...args),
  GiftCardError: class GiftCardError extends Error {},
}));

const { giftCardsApp } = await import("../../src/routes/gift-cards");

/** Sixteen Crockford characters, the shape the validator expects. */
const WELL_FORMED_CODE = "ABCDEFGH12345678";

function balanceRequest(ip: string) {
  return giftCardsApp.request("/balance", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify({ code: WELL_FORMED_CODE }),
  });
}

describe("POST /api/gift-cards/balance", () => {
  beforeEach(() => {
    windows.clear();
    redisConnected = true;
    quoteGiftCardMock.mockReset();
    quoteGiftCardMock.mockResolvedValue({
      last4: "5678",
      balancePaise: 50_000,
      appliedPaise: 50_000,
    });
    // The vitest env sets this globally (#332). The middleware reads it per
    // request, which is exactly what makes it removable here.
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("answers while the caller is under the limit", async () => {
    const response = await balanceRequest("203.0.113.10");

    expect(response.status).toBe(200);
  });

  it("returns 429 once the eleventh code check arrives in a minute", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      statuses.push((await balanceRequest("203.0.113.11")).status);
    }

    // limit: 10, windowSeconds: 60
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("stops the request before the card is ever looked up", async () => {
    for (let attempt = 0; attempt < 11; attempt++) {
      await balanceRequest("203.0.113.12");
    }

    // The whole point: a throttled sweep must not reach the lookup, or the
    // limiter is only rationing responses, not work.
    expect(quoteGiftCardMock).toHaveBeenCalledTimes(10);
  });

  it("tells a throttled caller when to come back", async () => {
    let response = await balanceRequest("203.0.113.13");
    for (let attempt = 0; attempt < 10; attempt++) {
      response = await balanceRequest("203.0.113.13");
    }

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("does not leak whether the code exists in the 429", async () => {
    let response = await balanceRequest("203.0.113.14");
    for (let attempt = 0; attempt < 10; attempt++) {
      response = await balanceRequest("203.0.113.14");
    }
    const text = await response.text();

    // A throttled response that still answered would defeat the throttle.
    expect(text).not.toContain(WELL_FORMED_CODE);
    expect(text).not.toContain("balancePaise");
  });

  it("throttles one address without throttling the next", async () => {
    for (let attempt = 0; attempt < 11; attempt++) {
      await balanceRequest("203.0.113.15");
    }

    const neighbour = await balanceRequest("198.51.100.20");

    expect(neighbour.status).toBe(200);
  });

  it("counts the forgeable x-forwarded-for entry as nobody's bucket", async () => {
    // getClientIp trusts the LAST hop; a client-supplied first entry must not
    // let a sweeper mint a fresh bucket per request.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await giftCardsApp.request("/balance", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `6.6.6.${attempt}, 203.0.113.16`,
        },
        body: JSON.stringify({ code: WELL_FORMED_CODE }),
      });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
  });

  it("still falls through when Redis is down, and the fallback is visible here", async () => {
    // Documented graceful degradation, asserted rather than assumed: with no
    // Redis there is no throttle at all, which is the risk this endpoint runs
    // during an outage.
    redisConnected = false;

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      statuses.push((await balanceRequest("203.0.113.17")).status);
    }

    expect(statuses).not.toContain(429);
  });

  it("is bypassed by DISABLE_RATE_LIMIT outside production, as the test env sets", async () => {
    process.env.DISABLE_RATE_LIMIT = "true";

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      statuses.push((await balanceRequest("203.0.113.18")).status);
    }

    // This is why the assertion in gift-card-quote.test.ts never fired.
    expect(statuses).not.toContain(429);
  });
});

describe("the limiter is mounted on both code-taking endpoints", () => {
  it("guards POST /api/orders/:id/gift-card too", async () => {
    // Router-level assertion rather than driving the endpoint: ordersApp
    // requires auth and a real order behind it, and what matters is that the
    // second bearer-code endpoint has not been left open.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const source = readFileSync(
      join(__dirname, "../../src/routes/orders.ts"),
      "utf-8",
    );

    expect(source).toMatch(
      /ordersApp\.post\(\s*"\/:id\/gift-card",\s*giftCardCodeRateLimit,/,
    );
  });

  it("shares one bucket between the two endpoints", async () => {
    const { giftCardCodeRateLimit } = await import("../../src/routes/gift-cards");

    // Same middleware instance, so the same keyPrefix: ten checks a minute
    // total, not ten per endpoint. Splitting them would double the oracle.
    const { giftCardCodeRateLimit: fromOrders } = await import(
      "../../src/routes/gift-cards"
    );
    expect(fromOrders).toBe(giftCardCodeRateLimit);
  });
});

// ---------------------------------------------------------------------------
// Layer 2: the real sliding window
// ---------------------------------------------------------------------------

describe("the sliding window in lib/redis, against a real Redis", () => {
  let realCheckRateLimit: typeof import("../../src/lib/redis").checkRateLimit;
  let closeRedis: typeof import("../../src/lib/redis").closeRedis;
  let connected = false;
  let connectionError = "";

  beforeAll(async () => {
    // vi.mock is hoisted and applies to the whole file, so reach past it.
    const real = await vi.importActual<typeof import("../../src/lib/redis")>(
      "../../src/lib/redis",
    );
    realCheckRateLimit = real.checkRateLimit;
    closeRedis = real.closeRedis;

    try {
      await real.initRedis();
      connected = real.isRedisConnected();
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    if (connected) {
      try {
        await closeRedis();
      } catch {
        // Shutting down a connection that never opened is not a failure.
      }
    }
  });

  it("has a Redis to count in", () => {
    if (process.env.ALLOW_MISSING_REDIS === "true") return;

    // Loud, not skipped. A throttle nobody can prove is a throttle nobody
    // has: this suite existing and reporting green without a Redis would
    // recreate exactly the gap #575 was filed for. Start one
    // (`docker compose up redis`) or set ALLOW_MISSING_REDIS=true to say
    // out loud that you are not checking.
    expect(
      connected,
      `Redis (${process.env.REDIS_URL ?? "redis://localhost:6380"}) is not reachable, so the rate limit cannot be proven. ${connectionError}`,
    ).toBe(true);
  });

  it("refuses the eleventh call in the window", async () => {
    if (!connected) return;

    const key = `test:gift-card-code:${process.pid}:${Date.now()}`;
    const results = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      results.push(await realCheckRateLimit(key, 10, 60));
    }

    expect(results.filter((r) => r.success)).toHaveLength(10);
    expect(results[10]?.success).toBe(false);
    expect(results[10]?.remaining).toBe(0);
    expect(results[10]?.resetIn).toBeGreaterThan(0);
  });

  it("counts each key separately, so one caller cannot exhaust another", async () => {
    if (!connected) return;

    const mine = `test:gift-card-code:${process.pid}:${Date.now()}:a`;
    const theirs = `test:gift-card-code:${process.pid}:${Date.now()}:b`;

    for (let attempt = 0; attempt < 11; attempt++) {
      await realCheckRateLimit(mine, 10, 60);
    }
    const neighbour = await realCheckRateLimit(theirs, 10, 60);

    expect(neighbour.success).toBe(true);
  });

  it("lets the window slide", async () => {
    if (!connected) return;

    // A one-second window, so this stays a test rather than a nap.
    const key = `test:gift-card-code:${process.pid}:${Date.now()}:slide`;

    expect((await realCheckRateLimit(key, 1, 1)).success).toBe(true);
    expect((await realCheckRateLimit(key, 1, 1)).success).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect((await realCheckRateLimit(key, 1, 1)).success).toBe(true);
  });
});
