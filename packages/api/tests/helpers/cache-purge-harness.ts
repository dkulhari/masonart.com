/**
 * Shared scaffolding for the admin cache-purge suites (#527, #525).
 *
 * Both suites replace `ioredis` with the same in-memory fake so the real
 * `setCached` / `deleteCachedPattern` / `purgeProductResponseCache` run for
 * real over it, then assert on the **cache contents** rather than on whether a
 * delete was called — a spy passed the whole time the original bug was live.
 *
 * `createFakeRedis()` is called from inside `vi.hoisted` so the class exists
 * before the `vi.mock("ioredis", ...)` factory runs:
 *
 * ```ts
 * const { redisStore, redisCalls, resetFakeRedis, FakeRedis } =
 *   await vi.hoisted(async () =>
 *     (await import("../../helpers/cache-purge-harness")).createFakeRedis()
 *   );
 *
 * vi.mock("ioredis", () => ({ default: FakeRedis, Redis: FakeRedis }));
 * ```
 *
 * @see packages/api/tests/routes/admin/product-cache-purge.test.ts
 * @see packages/api/tests/routes/admin/promotion-cache-purge.test.ts
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

/** How many times each Redis command the purge could use was reached for. */
export interface FakeRedisCalls {
  keys: number;
  scan: number;
  del: number;
}

export interface FakeRedisHarness {
  /** The keyspace itself — assert on `.has(key)`, not on a delete spy. */
  redisStore: Map<string, string>;
  redisCalls: FakeRedisCalls;
  /** Clears the keyspace and zeroes the counters. Call from `beforeEach`. */
  resetFakeRedis: () => void;
  /** Hand this to `vi.mock("ioredis", ...)` as both `default` and `Redis`. */
  FakeRedis: new (url?: string, options?: unknown) => unknown;
}

/**
 * An in-memory Redis with just the commands a cache purge can reach for.
 *
 * `keys` is implemented deliberately: a KEYS-based purge would still pass every
 * behavioural assertion, so the blocking-command regression is caught by the
 * call counter rather than by a missing method.
 */
export function createFakeRedis(): FakeRedisHarness {
  const store = new Map<string, string>();
  const calls: FakeRedisCalls = { keys: 0, scan: 0, del: 0 };

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
}

/**
 * The Hono app both suites build: one admin router mounted at its real path,
 * with `HTTPException` passed through so a 403 stays a 403 instead of becoming
 * an unhandled 500.
 */
export function buildCachePurgeApp(
  basePath: string,
  routeApp: Parameters<Hono["route"]>[1]
): Hono {
  const app = new Hono();
  app.route(basePath, routeApp);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err.message }, 500);
  });
  return app;
}

/** Identity of the admin caller each suite seeds and authenticates as. */
export interface CachePurgeCaller {
  id: string;
  name: string;
  email: string;
  sessionId: string;
  sessionToken: string;
}

/** The better-auth session shape `auth.api.getSession` is mocked to return. */
export function cachePurgeSessionFor(caller: CachePurgeCaller, role: string) {
  const now = new Date();
  return {
    user: {
      id: caller.id,
      name: caller.name,
      email: caller.email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: "active",
    },
    session: {
      id: caller.sessionId,
      token: caller.sessionToken,
      userId: caller.id,
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  };
}
