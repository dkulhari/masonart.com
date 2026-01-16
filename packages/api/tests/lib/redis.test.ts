/**
 * Redis Utility Tests
 *
 * Comprehensive tests for Redis client configuration, caching, and rate limiting.
 * Tests cover connection management, cache operations, rate limiting, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';
import {
  getRedisUrl,
  parseRedisUrl,
  createRedisClient,
  testRedisConnection,
  getRedisInfo,
  RedisCache,
  RedisRateLimiter,
  getDefaultRedisClient,
  closeDefaultRedisClient,
} from '../../src/lib/redis';
import '../setup';

let client: Redis;

beforeAll(async () => {
  // Create Redis client for tests
  client = createRedisClient();

  // Wait for connection
  await new Promise((resolve) => setTimeout(resolve, 100));
});

afterAll(async () => {
  // Cleanup
  await client.flushdb();
  await client.quit();
  await closeDefaultRedisClient();
});

beforeEach(async () => {
  // Clear database before each test
  await client.flushdb();
});

describe('Redis Configuration', () => {
  describe('getRedisUrl', () => {
    it('should return Redis URL from environment variable', () => {
      const url = getRedisUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('redis://');
    });

    it('should have default fallback URL', () => {
      const originalUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;

      const url = getRedisUrl();
      expect(url).toBe('redis://localhost:6380');

      process.env.REDIS_URL = originalUrl;
    });
  });

  describe('parseRedisUrl', () => {
    it('should parse Redis URL correctly', () => {
      const url = 'redis://localhost:6380';
      const options = parseRedisUrl(url);

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6380);
      expect(options.db).toBe(0);
    });

    it('should parse Redis URL with authentication', () => {
      const url = 'redis://:password123@localhost:6379';
      const options = parseRedisUrl(url);

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.password).toBe('password123');
    });

    it('should parse Redis URL with database number', () => {
      const url = 'redis://localhost:6379/2';
      const options = parseRedisUrl(url);

      expect(options.host).toBe('localhost');
      expect(options.db).toBe(2);
    });

    it('should include retry strategy', () => {
      const url = 'redis://localhost:6379';
      const options = parseRedisUrl(url);

      expect(options.retryStrategy).toBeDefined();
      expect(typeof options.retryStrategy).toBe('function');
    });

    it('should have max retries per request', () => {
      const url = 'redis://localhost:6379';
      const options = parseRedisUrl(url);

      expect(options.maxRetriesPerRequest).toBe(3);
    });

    it('should enable ready check', () => {
      const url = 'redis://localhost:6379';
      const options = parseRedisUrl(url);

      expect(options.enableReadyCheck).toBe(true);
    });
  });

  describe('createRedisClient', () => {
    it('should create Redis client instance', () => {
      const testClient = createRedisClient();
      expect(testClient).toBeDefined();
      expect(testClient).toBeInstanceOf(Redis);
      testClient.quit();
    });

    it('should create client with custom URL', () => {
      const testClient = createRedisClient('redis://localhost:6380');
      expect(testClient).toBeDefined();
      expect(testClient).toBeInstanceOf(Redis);
      testClient.quit();
    });

    it('should have event handlers configured', () => {
      const testClient = createRedisClient();
      expect(testClient.listeners('error').length).toBeGreaterThan(0);
      expect(testClient.listeners('connect').length).toBeGreaterThan(0);
      testClient.quit();
    });
  });
});

describe('Redis Connection', () => {
  describe('testRedisConnection', () => {
    it('should successfully ping Redis server', async () => {
      const isConnected = await testRedisConnection(client);
      expect(isConnected).toBe(true);
    });

    it('should return false for invalid connection', async () => {
      const badClient = new Redis({
        host: 'invalid-host',
        port: 9999,
        lazyConnect: true,
        retryStrategy: () => null, // Don't retry
      });

      const isConnected = await testRedisConnection(badClient);
      expect(isConnected).toBe(false);

      badClient.disconnect();
    });
  });

  describe('getRedisInfo', () => {
    it('should retrieve Redis server info', async () => {
      const info = await getRedisInfo(client);

      expect(info).toBeDefined();
      expect(typeof info).toBe('object');
      expect(Object.keys(info).length).toBeGreaterThan(0);
    });

    it('should include version information', async () => {
      const info = await getRedisInfo(client);
      expect(info.redis_version).toBeDefined();
    });

    it('should include server mode', async () => {
      const info = await getRedisInfo(client);
      expect(info.redis_mode).toBeDefined();
    });
  });
});

describe('RedisCache', () => {
  let cache: RedisCache;

  beforeEach(() => {
    cache = new RedisCache(client, 'test:cache:');
  });

  describe('set and get', () => {
    it('should set and get string value', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get<string>('key1');
      expect(value).toBe('value1');
    });

    it('should set and get object value', async () => {
      const obj = { name: 'John', age: 30 };
      await cache.set('user', obj);
      const value = await cache.get<typeof obj>('user');
      expect(value).toEqual(obj);
    });

    it('should set and get array value', async () => {
      const arr = [1, 2, 3, 4, 5];
      await cache.set('numbers', arr);
      const value = await cache.get<number[]>('numbers');
      expect(value).toEqual(arr);
    });

    it('should return null for non-existent key', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should set value with TTL', async () => {
      await cache.set('expiring', 'value', 1); // 1 second TTL

      const value1 = await cache.get('expiring');
      expect(value1).toBe('value');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const value2 = await cache.get('expiring');
      expect(value2).toBeNull();
    });

    it('should handle complex nested objects', async () => {
      const complex = {
        user: { name: 'John', address: { city: 'NYC', zip: '10001' } },
        items: [{ id: 1, name: 'Item 1' }],
      };

      await cache.set('complex', complex);
      const value = await cache.get<typeof complex>('complex');
      expect(value).toEqual(complex);
    });
  });

  describe('del', () => {
    it('should delete existing key', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.exists('key1')).toBe(true);

      await cache.del('key1');
      expect(await cache.exists('key1')).toBe(false);
    });

    it('should not throw error for non-existent key', async () => {
      // Deleting non-existent key should succeed without error
      await cache.del('nonexistent');
      expect(await cache.exists('nonexistent')).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      await cache.set('key1', 'value1');
      const exists = await cache.exists('key1');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await cache.exists('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('ttl', () => {
    it('should return TTL for key with expiration', async () => {
      await cache.set('key1', 'value1', 60);
      const ttl = await cache.ttl('key1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should return -1 for key without expiration', async () => {
      await cache.set('key1', 'value1');
      const ttl = await cache.ttl('key1');
      expect(ttl).toBe(-1);
    });

    it('should return -2 for non-existent key', async () => {
      const ttl = await cache.ttl('nonexistent');
      expect(ttl).toBe(-2);
    });
  });

  describe('clear', () => {
    it('should clear all keys with prefix', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      expect(await cache.exists('key1')).toBe(true);
      expect(await cache.exists('key2')).toBe(true);
      expect(await cache.exists('key3')).toBe(true);

      await cache.clear();

      expect(await cache.exists('key1')).toBe(false);
      expect(await cache.exists('key2')).toBe(false);
      expect(await cache.exists('key3')).toBe(false);
    });

    it('should only clear keys with matching prefix', async () => {
      const cache1 = new RedisCache(client, 'prefix1:');
      const cache2 = new RedisCache(client, 'prefix2:');

      await cache1.set('key1', 'value1');
      await cache2.set('key2', 'value2');

      await cache1.clear();

      expect(await cache1.exists('key1')).toBe(false);
      expect(await cache2.exists('key2')).toBe(true);
    });
  });
});

describe('RedisRateLimiter', () => {
  let rateLimiter: RedisRateLimiter;

  beforeEach(() => {
    // 5 requests per 2 seconds
    rateLimiter = new RedisRateLimiter(client, 'test:ratelimit:', 5, 2);
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', async () => {
      const result1 = await rateLimiter.checkLimit('user1');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = await rateLimiter.checkLimit('user1');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);
    });

    it('should deny requests exceeding limit', async () => {
      // Make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('user1');
      }

      // 6th request should be denied
      const result = await rateLimiter.checkLimit('user1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different identifiers separately', async () => {
      await rateLimiter.checkLimit('user1');
      await rateLimiter.checkLimit('user1');

      const result1 = await rateLimiter.checkLimit('user1');
      expect(result1.remaining).toBe(2);

      const result2 = await rateLimiter.checkLimit('user2');
      expect(result2.remaining).toBe(4); // Fresh counter for user2
    });

    it('should reset after window expires', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('user1');
      }

      const result1 = await rateLimiter.checkLimit('user1');
      expect(result1.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 2100));

      const result2 = await rateLimiter.checkLimit('user1');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(4);
    });

    it('should return remaining count correctly', async () => {
      const maxRequests = 5;

      for (let i = 1; i <= maxRequests; i++) {
        const result = await rateLimiter.checkLimit('user1');
        expect(result.remaining).toBe(maxRequests - i);
      }
    });
  });

  describe('getCount', () => {
    it('should return current count for identifier', async () => {
      await rateLimiter.checkLimit('user1');
      await rateLimiter.checkLimit('user1');
      await rateLimiter.checkLimit('user1');

      const count = await rateLimiter.getCount('user1');
      expect(count).toBe(3);
    });

    it('should return 0 for new identifier', async () => {
      const count = await rateLimiter.getCount('newuser');
      expect(count).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset counter for identifier', async () => {
      await rateLimiter.checkLimit('user1');
      await rateLimiter.checkLimit('user1');
      await rateLimiter.checkLimit('user1');

      const count1 = await rateLimiter.getCount('user1');
      expect(count1).toBe(3);

      await rateLimiter.reset('user1');

      const count2 = await rateLimiter.getCount('user1');
      expect(count2).toBe(0);
    });

    it('should allow requests after reset', async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit('user1');
      }

      const result1 = await rateLimiter.checkLimit('user1');
      expect(result1.allowed).toBe(false);

      await rateLimiter.reset('user1');

      const result2 = await rateLimiter.checkLimit('user1');
      expect(result2.allowed).toBe(true);
    });
  });
});

describe('Default Redis Client', () => {
  it('should create default Redis client', () => {
    const defaultClient = getDefaultRedisClient();
    expect(defaultClient).toBeDefined();
    expect(defaultClient).toBeInstanceOf(Redis);
  });

  it('should return same instance on multiple calls', () => {
    const client1 = getDefaultRedisClient();
    const client2 = getDefaultRedisClient();
    expect(client1).toBe(client2);
  });

  it('should close default client', async () => {
    const defaultClient = getDefaultRedisClient();
    expect(defaultClient).toBeDefined();

    await closeDefaultRedisClient();

    // After closing, getting client should create new instance
    const newClient = getDefaultRedisClient();
    expect(newClient).not.toBe(defaultClient);
  });
});

describe('Redis Integration', () => {
  it('should handle concurrent cache operations', async () => {
    const cache = new RedisCache(client, 'concurrent:');

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(cache.set(`key${i}`, `value${i}`));
    }

    await Promise.all(promises);

    const values = await Promise.all(
      Array.from({ length: 10 }, (_, i) => cache.get(`key${i}`))
    );

    expect(values).toHaveLength(10);
    values.forEach((value, i) => {
      expect(value).toBe(`value${i}`);
    });
  });

  it('should handle rapid cache operations', async () => {
    const cache = new RedisCache(client, 'rapid:');

    for (let i = 0; i < 100; i++) {
      await cache.set('counter', i);
    }

    const value = await cache.get<number>('counter');
    expect(value).toBe(99);
  });

  it('should maintain data consistency under load', async () => {
    const cache = new RedisCache(client, 'consistency:');
    const rateLimiter = new RedisRateLimiter(client, 'consistency:limit:', 1000, 60);

    const operations = [];

    // Mix of operations
    for (let i = 0; i < 50; i++) {
      operations.push(cache.set(`key${i}`, { value: i }));
      operations.push(rateLimiter.checkLimit(`user${i % 10}`));
    }

    await Promise.all(operations);

    // Verify cache
    const cacheValue = await cache.get<{ value: number }>('key0');
    expect(cacheValue).toEqual({ value: 0 });

    // Verify rate limiter
    const count = await rateLimiter.getCount('user0');
    expect(count).toBeGreaterThan(0);
  });
});

describe('Redis Error Handling', () => {
  it('should handle serialization errors gracefully', async () => {
    const cache = new RedisCache(client, 'error:');

    // Create circular reference
    const circular: any = { name: 'test' };
    circular.self = circular;

    await expect(cache.set('circular', circular)).rejects.toThrow();
  });

  it('should handle invalid TTL values', async () => {
    const cache = new RedisCache(client, 'error:');

    // Negative TTL should throw an error from Redis
    await expect(cache.set('key1', 'value', -1)).rejects.toThrow();
  });
});

describe('Redis Performance', () => {
  it('should complete cache operations quickly', async () => {
    const cache = new RedisCache(client, 'perf:');

    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      await cache.set(`key${i}`, `value${i}`);
    }

    const duration = Date.now() - start;

    // 100 operations should complete in under 1 second
    expect(duration).toBeLessThan(1000);
  });

  it('should handle bulk operations efficiently', async () => {
    const cache = new RedisCache(client, 'bulk:');

    const start = Date.now();

    const promises = Array.from({ length: 100 }, (_, i) =>
      cache.set(`key${i}`, `value${i}`)
    );

    await Promise.all(promises);

    const duration = Date.now() - start;

    // Parallel operations should be faster than sequential
    expect(duration).toBeLessThan(500);
  });
});
