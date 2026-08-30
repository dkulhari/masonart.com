/**
 * Live-Redis suites (#656)
 *
 * `tests/lib/redis.test.ts` and `tests/queues/ai.test.ts` talk to the real
 * `poster-app-redis` container rather than a mock, and that is deliberate: the
 * properties under test are a sliding-window ZSET, SCAN-based prefix deletion,
 * and BullMQ's own job state machine. A mocked client can only assert that the
 * calls were made, not that the semantics hold.
 *
 * What was not deliberate is that they ran in the *shared* keyspace:
 *
 *   1. Every key was a fixed literal (`test:string`, `test:rate:user1`) and the
 *      queue used the default `bull` prefix, so two runs of the same suite —
 *      one agent's and another's, on the one machine this repo is developed on
 *      — read and deleted each other's keys. Which tests failed changed between
 *      identical runs, which is the signature of shared state, not of a defect.
 *   2. Cleanup ran `KEYS test:*` / `DEL bull:ai-generation:*`, which is not
 *      cleanup but a blast radius: it also deleted the gift-card rate-limit
 *      suite's `test:gift-card-code:*` keys and any concurrent run's jobs.
 *   3. They skipped **silently** when Redis was unreachable — every runtime
 *      `it` opened with `if (!isRedisAvailable) return`, so a run with no Redis
 *      at all reported green while asserting nothing. That is the same disease
 *      `tests/helpers/live-db.ts` was written to cure (#580).
 *
 * So: give each run its own corner of the keyspace, delete only that corner,
 * and when Redis is unreachable FAIL rather than skip.
 *
 * To say out loud that you are running without Redis — and are therefore not
 * checking any of this — set `ALLOW_MISSING_REDIS=true`.
 */

import Redis from 'ioredis';

/** How many keys one SCAN iteration asks for. A hint, not a limit. */
const SCAN_BATCH = 200;

/**
 * The Redis these suites connect to.
 *
 * Same default as `tests/setup.ts`, which is the `poster-app-redis` container
 * published on 6380 — not the 6379 that `src/lib/redis.ts` falls back to.
 */
export function liveRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6380';
}

/** Whether an unreachable Redis is allowed to pass silently. */
export function liveRedisOptional(): boolean {
  return process.env.ALLOW_MISSING_REDIS === 'true';
}

/** Credentials never belong in a test report. */
export function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '';
    parsed.username = parsed.username ? '***' : '';
    return parsed.toString();
  } catch {
    return 'the configured Redis';
  }
}

/** What to print when there is nothing to connect to. */
export function liveRedisMissingMessage(): string {
  return `Could not reach ${redactRedisUrl(liveRedisUrl())}. These tests assert real cache, rate-limit and BullMQ behaviour — properties a mock cannot have — so they fail rather than pass without Redis. Start it (docker start poster-app-redis), or set ALLOW_MISSING_REDIS=true to skip them out loud. See tests/helpers/live-redis.ts (#656).`;
}

/**
 * The assertion each live-Redis suite makes once, up front.
 *
 * Called from a real `it(...)` so the failure is a failing test with an
 * explanation, not a line in scrollback that everyone stops seeing.
 */
export function assertLiveRedisReachable(reachable: boolean): void {
  if (liveRedisOptional()) return;
  if (reachable) return;

  throw new Error(liveRedisMissingMessage());
}

/**
 * The key namespace one run of one suite owns.
 *
 * `process.pid` is the same isolation token the live-database suites use for
 * rows (`test-user-...-${process.pid}` in the gift-card suites), and vitest
 * gives each test file's worker its own process, so two concurrent runs — and
 * two suites inside one run — cannot collide. Everything a suite writes must
 * start with this, because it is also the only thing cleanup is allowed to
 * delete.
 */
export function testKeyPrefix(label: string): string {
  return `test:${label}:${process.pid}:`;
}

export interface LiveRedisConnection {
  client: Redis;
  reachable: boolean;
}

/**
 * Connect to the live Redis, reporting reachability rather than throwing.
 *
 * The shape mirrors `connectLiveDb`: `reachable` stays a plain boolean because
 * a connection failure is not itself a test failure, it is a fact one real
 * `it(...)` then asserts on — so the run fails with an explanation instead of
 * skipping in silence.
 *
 * The `error` listener is not optional. Without one, ioredis' `error` event on
 * an unreachable host is an unhandled emitter error that kills the worker
 * before the reachability assertion can produce its message.
 */
export async function connectLiveRedis(): Promise<LiveRedisConnection> {
  let client: Redis | null = null;

  try {
    client = new Redis(liveRedisUrl(), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
      connectTimeout: 3000,
      retryStrategy: () => null, // Don't retry for tests
    });
    client.on('error', () => {
      // Reported through `reachable`, not through an unhandled event.
    });

    await client.ping();
    return { client, reachable: true };
  } catch {
    if (client) {
      try {
        await client.quit();
      } catch {
        // Ignore cleanup errors
      }
    }
    return {
      // Cast: callers only touch the client behind `reachable`, or via
      // closeLiveRedis' own guard.
      client: undefined as unknown as Redis,
      reachable: false,
    };
  }
}

/**
 * Delete every key under a prefix.
 *
 * SCAN rather than KEYS, for the reason `deleteCachedPattern` gives in
 * src/lib/redis.ts: this Redis is shared with other projects and other agents,
 * and KEYS blocks all of them for the length of the whole keyspace walk.
 */
export async function deleteKeysByPrefix(
  client: Redis | undefined,
  prefix: string
): Promise<number> {
  if (!client) return 0;

  let deleted = 0;
  let cursor = '0';

  do {
    const [next, keys] = await client.scan(
      cursor,
      'MATCH',
      `${prefix}*`,
      'COUNT',
      SCAN_BATCH
    );
    cursor = next;
    if (keys.length > 0) {
      deleted += await client.del(...keys);
    }
  } while (cursor !== '0');

  return deleted;
}

/**
 * Release the connection in `afterAll`.
 *
 * Tolerates an undefined client so teardown is safe on the run where the
 * connection never opened — which is exactly the run where a suite is most
 * likely to tear down twice.
 */
export async function closeLiveRedis(client: Redis | undefined): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // Ignore cleanup errors
  }
}
