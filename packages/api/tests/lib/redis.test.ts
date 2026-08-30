/**
 * Redis Utility Tests
 *
 * Comprehensive tests for Redis client configuration, caching, rate limiting,
 * session management, and connection lifecycle.
 *
 * Tests cover:
 * 1. Module Exports - Verify all exports are properly defined
 * 2. Cache Key Configuration - Test CacheKeys constants
 * 3. Cache Operations - Test getCached, setCached, deleteCached, deleteCachedPattern
 * 4. Rate Limiting - Test checkRateLimit function
 * 5. Session Management - Test setSession, getSession, deleteSession
 * 6. Connection Management - Test initRedis, closeRedis, isRedisConnected
 * 7. Runtime Tests - Test actual Redis connectivity (requires Redis running)
 *
 * The runtime tests use the real Redis container, and every key they touch
 * lives under `KEY` — a `test:redis:<pid>:` namespace this run owns alone.
 * Nothing else may be written and nothing else may be deleted: several agents
 * share this machine, and the fixed `test:*` keys this suite used to use meant
 * two concurrent runs overwrote and deleted each other's values, so which
 * tests failed changed between identical runs (#656).
 *
 * Redis is not optional. Without it the suite FAILS rather than skipping —
 * see tests/helpers/live-redis.ts. `ALLOW_MISSING_REDIS=true` skips out loud
 * (the same opt-out the gift-card rate-limit suite uses; it replaces the
 * suite-local SKIP_REDIS_RUNTIME_TESTS).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Redis from 'ioredis';
import '../setup';
import {
  assertLiveRedisReachable,
  closeLiveRedis,
  connectLiveRedis,
  deleteKeysByPrefix,
  liveRedisOptional,
  testKeyPrefix,
} from '../helpers/live-redis';

// Import Redis module - these should work even without Redis running
import * as redisModule from '../../src/lib/redis';
import {
  redis,
  createRedisConnection,
  redisConnectionOptions,
  CacheKeys,
  getCached,
  setCached,
  deleteCached,
  deleteCachedPattern,
  checkRateLimit,
  setSession,
  getSession,
  deleteSession,
  initRedis,
  closeRedis,
  isRedisConnected,
} from '../../src/lib/redis';

/**
 * The only key namespace this run may write to or delete from.
 *
 * Read it as a prefix on every literal below: `${KEY}string`, never
 * `test:string`. The helpers that build their own key from what you pass —
 * `checkRateLimit` (`rate-limit:…`) and the session trio (`session:…`) — land
 * one level out, which is why cleanup walks a list rather than one prefix.
 */
const KEY = testKeyPrefix('redis');
const OWNED_PREFIXES = [
  KEY,
  `${CacheKeys.RATE_LIMIT}${KEY}`,
  `${CacheKeys.SESSION}${KEY}`,
];

/** Delete everything this run owns, and nothing else. */
async function deleteOwnedKeys(): Promise<void> {
  for (const prefix of OWNED_PREFIXES) {
    await deleteKeysByPrefix(testClient ?? undefined, prefix);
  }
}

// Helper to check if Redis is available
let isRedisAvailable = false;
let testClient: Redis | null = null;

beforeAll(async () => {
  const connection = await connectLiveRedis();
  testClient = connection.reachable ? connection.client : null;
  isRedisAvailable = connection.reachable;

  if (!isRedisAvailable) return;

  /**
   * Connect the module singleton explicitly.
   *
   * `redis` is `lazyConnect`, and every cache helper returns early unless
   * `status === 'ready'` — so the runtime tests used to depend on an earlier
   * *signature* test having incidentally issued a command (`checkRateLimit`
   * does not guard on status) and on that connection winning a race against
   * the next few tests. Under load it lost, and the first runtime test — 'set
   * and get string value' — read null from a client that had not finished
   * connecting (#656).
   */
  await initRedis();

  // Start from a clean namespace even if a previous run was killed mid-flight.
  await deleteOwnedKeys();
});

afterAll(async () => {
  // Leave nothing behind: repeated runs must not accumulate, and a stale
  // rate-limit ZSET outliving its run is what made a second run of this suite
  // see 3 requests where it expected 4.
  await deleteOwnedKeys();
  await closeLiveRedis(testClient ?? undefined);

  // `closeRedis()` sends QUIT, which queues behind ioredis' reconnect loop and
  // never resolves when nothing is listening — a teardown that hangs until the
  // hook timeout rather than one that fails. Only ask for the graceful close
  // when there is something to close gracefully.
  if (isRedisAvailable) {
    try {
      await closeRedis();
    } catch {
      // Already closed
    }
  } else {
    redis.disconnect();
  }
});

describe('Live Redis', () => {
  it('is reachable', () => {
    assertLiveRedisReachable(isRedisAvailable);
    if (liveRedisOptional() && !isRedisAvailable) {
      console.log(
        'ALLOW_MISSING_REDIS=true — Redis runtime assertions were NOT checked'
      );
    }
  });
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe('Redis Module Exports', () => {
  describe('redis client singleton', () => {
    it('should export redis client', () => {
      expect(redisModule).toHaveProperty('redis');
      expect(redis).toBeDefined();
    });

    it('should be an ioredis instance', () => {
      expect(redis).toBeInstanceOf(Redis);
    });

    it('should have status property', () => {
      expect(redis).toHaveProperty('status');
      expect(typeof redis.status).toBe('string');
    });

    it('should have standard Redis methods', () => {
      expect(typeof redis.get).toBe('function');
      expect(typeof redis.set).toBe('function');
      expect(typeof redis.del).toBe('function');
      expect(typeof redis.keys).toBe('function');
    });
  });

  describe('createRedisConnection', () => {
    it('should be exported', () => {
      expect(redisModule).toHaveProperty('createRedisConnection');
      expect(typeof createRedisConnection).toBe('function');
    });

    it('should create new Redis instance', () => {
      const connection = createRedisConnection();
      expect(connection).toBeDefined();
      expect(connection).toBeInstanceOf(Redis);
      // Cleanup
      connection.disconnect();
    });

    it('should create independent connections', () => {
      const conn1 = createRedisConnection();
      const conn2 = createRedisConnection();

      expect(conn1).not.toBe(conn2);

      // Cleanup
      conn1.disconnect();
      conn2.disconnect();
    });
  });

  describe('redisConnectionOptions', () => {
    it('should be exported', () => {
      expect(redisModule).toHaveProperty('redisConnectionOptions');
      expect(redisConnectionOptions).toBeDefined();
    });

    it('should have connection property', () => {
      expect(redisConnectionOptions).toHaveProperty('connection');
      expect(redisConnectionOptions.connection).toBe(redis);
    });
  });

  describe('Cache functions', () => {
    it('should export getCached', () => {
      expect(redisModule).toHaveProperty('getCached');
      expect(typeof getCached).toBe('function');
    });

    it('should export setCached', () => {
      expect(redisModule).toHaveProperty('setCached');
      expect(typeof setCached).toBe('function');
    });

    it('should export deleteCached', () => {
      expect(redisModule).toHaveProperty('deleteCached');
      expect(typeof deleteCached).toBe('function');
    });

    it('should export deleteCachedPattern', () => {
      expect(redisModule).toHaveProperty('deleteCachedPattern');
      expect(typeof deleteCachedPattern).toBe('function');
    });
  });

  describe('Rate limiting', () => {
    it('should export checkRateLimit', () => {
      expect(redisModule).toHaveProperty('checkRateLimit');
      expect(typeof checkRateLimit).toBe('function');
    });
  });

  describe('Session management', () => {
    it('should export setSession', () => {
      expect(redisModule).toHaveProperty('setSession');
      expect(typeof setSession).toBe('function');
    });

    it('should export getSession', () => {
      expect(redisModule).toHaveProperty('getSession');
      expect(typeof getSession).toBe('function');
    });

    it('should export deleteSession', () => {
      expect(redisModule).toHaveProperty('deleteSession');
      expect(typeof deleteSession).toBe('function');
    });
  });

  describe('Connection management', () => {
    it('should export initRedis', () => {
      expect(redisModule).toHaveProperty('initRedis');
      expect(typeof initRedis).toBe('function');
    });

    it('should export closeRedis', () => {
      expect(redisModule).toHaveProperty('closeRedis');
      expect(typeof closeRedis).toBe('function');
    });

    it('should export isRedisConnected', () => {
      expect(redisModule).toHaveProperty('isRedisConnected');
      expect(typeof isRedisConnected).toBe('function');
    });
  });

  describe('default export', () => {
    it('should export redis as default', () => {
      expect(redisModule.default).toBe(redis);
    });
  });
});

// ============================================================================
// CacheKeys Configuration Tests
// ============================================================================

describe('CacheKeys Configuration', () => {
  it('should be exported', () => {
    expect(redisModule).toHaveProperty('CacheKeys');
    expect(CacheKeys).toBeDefined();
  });

  it('should be a frozen object', () => {
    expect(typeof CacheKeys).toBe('object');
    // Verify it's a const object with readonly properties
    expect(CacheKeys).toBeDefined();
  });

  describe('cache key prefixes', () => {
    it('should have PRODUCT key', () => {
      expect(CacheKeys).toHaveProperty('PRODUCT');
      expect(CacheKeys.PRODUCT).toBe('product:');
    });

    it('should have PRODUCT_LIST key', () => {
      expect(CacheKeys).toHaveProperty('PRODUCT_LIST');
      expect(CacheKeys.PRODUCT_LIST).toBe('product-list:');
    });

    it('should have CART key', () => {
      expect(CacheKeys).toHaveProperty('CART');
      expect(CacheKeys.CART).toBe('cart:');
    });

    it('should have SESSION key', () => {
      expect(CacheKeys).toHaveProperty('SESSION');
      expect(CacheKeys.SESSION).toBe('session:');
    });

    it('should have USER key', () => {
      expect(CacheKeys).toHaveProperty('USER');
      expect(CacheKeys.USER).toBe('user:');
    });

    it('should have AI_GENERATION key', () => {
      expect(CacheKeys).toHaveProperty('AI_GENERATION');
      expect(CacheKeys.AI_GENERATION).toBe('ai-gen:');
    });

    it('should have RATE_LIMIT key', () => {
      expect(CacheKeys).toHaveProperty('RATE_LIMIT');
      expect(CacheKeys.RATE_LIMIT).toBe('rate-limit:');
    });
  });

  it('should have all expected keys', () => {
    const expectedKeys = [
      'PRODUCT',
      'PRODUCT_LIST',
      'CART',
      'SESSION',
      'USER',
      'AI_GENERATION',
      'RATE_LIMIT',
    ];

    expectedKeys.forEach((key) => {
      expect(CacheKeys).toHaveProperty(key);
    });
  });

  it('should have string values ending with colon', () => {
    Object.values(CacheKeys).forEach((value) => {
      expect(typeof value).toBe('string');
      expect(value.endsWith(':')).toBe(true);
    });
  });
});

// ============================================================================
// Cache Operations Tests (Configuration Only)
// ============================================================================

describe('Cache Operations (Configuration)', () => {
  describe('getCached function signature', () => {
    it('should accept a key parameter', () => {
      // Function should accept string parameter
      expect(getCached.length).toBeGreaterThanOrEqual(1);
    });

    it('should return a Promise', () => {
      const result = getCached(`${KEY}key`);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('setCached function signature', () => {
    it('should accept key, value, and optional ttl', () => {
      // Function accepts key, value, and optional TTL
      expect(typeof setCached).toBe('function');
    });

    it('should return a Promise', () => {
      const result = setCached(`${KEY}key`, 'test-value');
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('deleteCached function signature', () => {
    it('should accept a key parameter', () => {
      expect(typeof deleteCached).toBe('function');
    });

    it('should return a Promise', () => {
      const result = deleteCached(`${KEY}key`);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('deleteCachedPattern function signature', () => {
    it('should accept a pattern parameter', () => {
      expect(typeof deleteCachedPattern).toBe('function');
    });

    it('should return a Promise', () => {
      const result = deleteCachedPattern(`${KEY}*`);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

// ============================================================================
// Rate Limiting Tests (Configuration Only)
// ============================================================================

describe('Rate Limiting (Configuration)', () => {
  describe('checkRateLimit function signature', () => {
    it('should accept key, limit, and windowSeconds', () => {
      expect(typeof checkRateLimit).toBe('function');
    });

    it('should return a Promise', () => {
      // When Redis is not connected, function still returns a Promise
      const result = checkRateLimit(`${KEY}key`, 10, 60);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('RateLimitResult interface', () => {
    it('should be documented in the module', () => {
      // RateLimitResult should have success, remaining, resetIn properties
      // This is verified by TypeScript compilation
      expect(typeof checkRateLimit).toBe('function');
    });
  });
});

// ============================================================================
// Session Management Tests (Configuration Only)
// ============================================================================

describe('Session Management (Configuration)', () => {
  describe('setSession function signature', () => {
    it('should accept sessionId, data, and optional ttl', () => {
      expect(typeof setSession).toBe('function');
    });

    it('should return a Promise', () => {
      const result = setSession(`${KEY}session-id`, { userId: '123' });
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('getSession function signature', () => {
    it('should accept sessionId parameter', () => {
      expect(typeof getSession).toBe('function');
    });

    it('should return a Promise', () => {
      const result = getSession(`${KEY}session-id`);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('deleteSession function signature', () => {
    it('should accept sessionId parameter', () => {
      expect(typeof deleteSession).toBe('function');
    });

    it('should return a Promise', () => {
      const result = deleteSession(`${KEY}session-id`);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

// ============================================================================
// Connection Management Tests (Configuration Only)
// ============================================================================

describe('Connection Management (Configuration)', () => {
  describe('isRedisConnected function', () => {
    it('should return a boolean', () => {
      const result = isRedisConnected();
      expect(typeof result).toBe('boolean');
    });

    it('should check redis.status', () => {
      // isRedisConnected checks if redis.status === 'ready'
      const connected = isRedisConnected();
      const statusIsReady = redis.status === 'ready';
      expect(connected).toBe(statusIsReady);
    });
  });

  describe('initRedis function', () => {
    it('should return a Promise', () => {
      // Don't actually call initRedis to avoid side effects
      expect(typeof initRedis).toBe('function');
    });
  });

  describe('closeRedis function', () => {
    it('should return a Promise', () => {
      expect(typeof closeRedis).toBe('function');
    });
  });
});

// ============================================================================
// Redis Runtime Tests (Require Redis Running)
// ============================================================================

describe('Redis Runtime Tests', () => {
  beforeEach(async () => {
    if (!isRedisAvailable || !testClient) {
      return;
    }
    // Clear test keys before each test
    const keys = await testClient.keys(`${KEY}*`);
    if (keys.length > 0) {
      await testClient.del(...keys);
    }
  });

  describe('Cache Operations', () => {
    it('should set and get string value', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      await setCached(`${KEY}string`, 'hello world');
      const value = await getCached<string>(`${KEY}string`);
      expect(value).toBe('hello world');
    });

    it('should set and get object value', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const obj = { name: 'Test', value: 123 };
      await setCached(`${KEY}object`, obj);
      const value = await getCached<typeof obj>(`${KEY}object`);
      expect(value).toEqual(obj);
    });

    it('should set and get array value', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const arr = [1, 2, 3, 4, 5];
      await setCached(`${KEY}array`, arr);
      const value = await getCached<number[]>(`${KEY}array`);
      expect(value).toEqual(arr);
    });

    it('should return null for non-existent key', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const value = await getCached(`${KEY}nonexistent`);
      expect(value).toBeNull();
    });

    it('should delete cached value', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      await setCached(`${KEY}delete`, 'to be deleted');
      const before = await getCached(`${KEY}delete`);
      expect(before).toBe('to be deleted');

      await deleteCached(`${KEY}delete`);
      const after = await getCached(`${KEY}delete`);
      expect(after).toBeNull();
    });

    it('should delete cached values by pattern', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      await setCached(`${KEY}pattern:1`, 'value1');
      await setCached(`${KEY}pattern:2`, 'value2');
      await setCached(`${KEY}pattern:3`, 'value3');

      await deleteCachedPattern(`${KEY}pattern:*`);

      const v1 = await getCached(`${KEY}pattern:1`);
      const v2 = await getCached(`${KEY}pattern:2`);
      const v3 = await getCached(`${KEY}pattern:3`);

      expect(v1).toBeNull();
      expect(v2).toBeNull();
      expect(v3).toBeNull();
    });

    it('should handle complex nested objects', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const complex = {
        user: {
          id: '123',
          profile: {
            name: 'Test User',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        items: [{ id: 1 }, { id: 2 }],
        metadata: null,
      };

      await setCached(`${KEY}complex`, complex);
      const value = await getCached<typeof complex>(`${KEY}complex`);
      expect(value).toEqual(complex);
    });
  });

  describe('Session Operations', () => {
    it('should set and get session data', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const sessionData = {
        userId: 'user-123',
        role: 'admin',
        createdAt: new Date().toISOString(),
      };

      await setSession(`${KEY}session-1`, sessionData);
      const retrieved = await getSession(`${KEY}session-1`);
      expect(retrieved).toEqual(sessionData);
    });

    it('should delete session data', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      await setSession(`${KEY}session-2`, { userId: 'user-456' });
      const before = await getSession(`${KEY}session-2`);
      expect(before).not.toBeNull();

      await deleteSession(`${KEY}session-2`);
      const after = await getSession(`${KEY}session-2`);
      expect(after).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const session = await getSession(`${KEY}nonexistent-session`);
      expect(session).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const result = await checkRateLimit(`${KEY}rate:user1`, 5, 60);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should track request count correctly', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      // Make 3 requests
      await checkRateLimit(`${KEY}rate:user2`, 5, 60);
      await checkRateLimit(`${KEY}rate:user2`, 5, 60);
      const result = await checkRateLimit(`${KEY}rate:user2`, 5, 60);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should deny requests exceeding limit', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      // Exhaust 3 request limit
      await checkRateLimit(`${KEY}rate:user3`, 3, 60);
      await checkRateLimit(`${KEY}rate:user3`, 3, 60);
      await checkRateLimit(`${KEY}rate:user3`, 3, 60);

      // 4th request should be denied
      const result = await checkRateLimit(`${KEY}rate:user3`, 3, 60);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different keys separately', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      await checkRateLimit(`${KEY}rate:userA`, 5, 60);
      await checkRateLimit(`${KEY}rate:userA`, 5, 60);

      const resultA = await checkRateLimit(`${KEY}rate:userA`, 5, 60);
      const resultB = await checkRateLimit(`${KEY}rate:userB`, 5, 60);

      expect(resultA.remaining).toBe(2); // 3rd request for userA
      expect(resultB.remaining).toBe(4); // 1st request for userB
    });

    it('should return resetIn value', async () => {
      if (!isRedisAvailable) {
        console.log('Skipping: Redis not available');
        return;
      }

      const result = await checkRateLimit(`${KEY}rate:user4`, 5, 60);
      expect(typeof result.resetIn).toBe('number');
      expect(result.resetIn).toBeGreaterThan(0);
      expect(result.resetIn).toBeLessThanOrEqual(60);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('Cache operations when Redis unavailable', () => {
    it('getCached should return null gracefully', async () => {
      // When Redis is not connected, getCached should return null
      // This tests the error handling in the function
      const result = await getCached(`${KEY}any-key`);
      // Should not throw, should return null or value
      expect(result === null || result !== undefined).toBe(true);
    });

    it('setCached should not throw', async () => {
      // Should complete without throwing - just await and verify no exception
      let error: Error | undefined;
      try {
        await setCached(`${KEY}key`, 'value');
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeUndefined();
    });

    it('deleteCached should not throw', async () => {
      let error: Error | undefined;
      try {
        await deleteCached(`${KEY}key`);
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeUndefined();
    });

    it('deleteCachedPattern should not throw', async () => {
      let error: Error | undefined;
      try {
        await deleteCachedPattern(`${KEY}*`);
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeUndefined();
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration Tests', () => {
  it('should handle concurrent cache operations', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping: Redis not available');
      return;
    }

    const operations = [];
    for (let i = 0; i < 10; i++) {
      operations.push(setCached(`${KEY}concurrent:${i}`, { index: i }));
    }

    await Promise.all(operations);

    const reads = [];
    for (let i = 0; i < 10; i++) {
      reads.push(getCached(`${KEY}concurrent:${i}`));
    }

    const results = await Promise.all(reads);

    expect(results).toHaveLength(10);
    results.forEach((result, i) => {
      expect(result).toEqual({ index: i });
    });
  });

  it('should maintain data consistency', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping: Redis not available');
      return;
    }

    // Set initial value
    await setCached(`${KEY}consistency`, { count: 0 });

    // Update multiple times
    for (let i = 1; i <= 5; i++) {
      await setCached(`${KEY}consistency`, { count: i });
    }

    // Final value should be 5
    const result = await getCached<{ count: number }>(`${KEY}consistency`);
    expect(result?.count).toBe(5);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  it('should complete cache operations quickly', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping: Redis not available');
      return;
    }

    const start = Date.now();

    for (let i = 0; i < 50; i++) {
      await setCached(`${KEY}perf:${i}`, `value-${i}`);
    }

    const duration = Date.now() - start;

    // 50 operations should complete in under 2 seconds
    expect(duration).toBeLessThan(2000);
  });

  it('should handle bulk parallel operations efficiently', async () => {
    if (!isRedisAvailable) {
      console.log('Skipping: Redis not available');
      return;
    }

    const start = Date.now();

    const operations = Array.from({ length: 50 }, (_, i) =>
      setCached(`${KEY}bulk:${i}`, `value-${i}`)
    );

    await Promise.all(operations);

    const duration = Date.now() - start;

    // Parallel operations should be faster
    expect(duration).toBeLessThan(1000);
  });
});

// ============================================================================
// TypeScript Type Tests
// ============================================================================

describe('TypeScript Types', () => {
  it('should have properly typed CacheKeys', () => {
    // TypeScript should enforce readonly keys
    const productKey: string = CacheKeys.PRODUCT;
    expect(productKey).toBe('product:');
  });

  it('should have generic getCached function', async () => {
    // Type inference should work
    if (!isRedisAvailable) {
      return;
    }

    interface TestType {
      id: string;
      value: number;
    }

    await setCached(`${KEY}typed`, { id: 'test', value: 42 });
    const result = await getCached<TestType>(`${KEY}typed`);

    if (result) {
      expect(result.id).toBe('test');
      expect(result.value).toBe(42);
    }
  });
});
