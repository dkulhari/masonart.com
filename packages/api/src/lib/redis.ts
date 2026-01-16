/**
 * Redis Utility Library
 *
 * Provides Redis client configuration and utility functions for:
 * - Caching
 * - Session management
 * - Rate limiting
 * - Queue support
 *
 * Uses ioredis for Redis client with connection pooling and error handling.
 */

import Redis, { type RedisOptions } from 'ioredis';

/**
 * Get Redis URL from environment variable with fallback
 */
export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6380';
}

/**
 * Parse Redis URL into connection options
 */
export function parseRedisUrl(url: string): RedisOptions {
  const urlObj = new URL(url);

  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 6379,
    password: urlObj.password || undefined,
    db: urlObj.pathname ? parseInt(urlObj.pathname.slice(1)) || 0 : 0,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/**
 * Create Redis client instance
 */
export function createRedisClient(url?: string): Redis {
  const redisUrl = url || getRedisUrl();
  const options = parseRedisUrl(redisUrl);

  const client = new Redis(options);

  client.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  client.on('connect', () => {
    console.log('Redis client connected');
  });

  return client;
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(client: Redis): Promise<boolean> {
  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis connection test failed:', error);
    return false;
  }
}

/**
 * Get Redis server info
 */
export async function getRedisInfo(client: Redis): Promise<Record<string, string>> {
  const info = await client.info();
  const lines = info.split('\r\n');
  const result: Record<string, string> = {};

  for (const line of lines) {
    if (line && !line.startsWith('#') && line.includes(':')) {
      const [key, value] = line.split(':');
      result[key] = value;
    }
  }

  return result;
}

/**
 * Cache utility functions
 */
export class RedisCache {
  constructor(private client: Redis, private prefix: string = 'cache:') {}

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(this.prefix + key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  /**
   * Set value in cache with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttl) {
      await this.client.setex(this.prefix + key, ttl, serialized);
    } else {
      await this.client.set(this.prefix + key, serialized);
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.prefix + key);
    return result === 1;
  }

  /**
   * Get TTL for a key (in seconds)
   */
  async ttl(key: string): Promise<number> {
    return await this.client.ttl(this.prefix + key);
  }

  /**
   * Clear all keys with this prefix
   */
  async clear(): Promise<void> {
    const keys = await this.client.keys(this.prefix + '*');
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

/**
 * Rate limiter using Redis
 */
export class RedisRateLimiter {
  constructor(
    private client: Redis,
    private prefix: string = 'ratelimit:',
    private maxRequests: number = 100,
    private windowSeconds: number = 60
  ) {}

  /**
   * Check if request is allowed and increment counter
   * Returns remaining requests or -1 if limit exceeded
   */
  async checkLimit(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = this.prefix + identifier;
    const current = await this.client.incr(key);

    if (current === 1) {
      await this.client.expire(key, this.windowSeconds);
    }

    const allowed = current <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - current);

    return { allowed, remaining };
  }

  /**
   * Get current count for identifier
   */
  async getCount(identifier: string): Promise<number> {
    const key = this.prefix + identifier;
    const count = await this.client.get(key);
    return count ? parseInt(count) : 0;
  }

  /**
   * Reset limit for identifier
   */
  async reset(identifier: string): Promise<void> {
    await this.client.del(this.prefix + identifier);
  }
}

// Create default Redis client instance (singleton)
let defaultClient: Redis | null = null;

export function getDefaultRedisClient(): Redis {
  if (!defaultClient) {
    defaultClient = createRedisClient();
  }
  return defaultClient;
}

export async function closeDefaultRedisClient(): Promise<void> {
  if (defaultClient) {
    await defaultClient.quit();
    defaultClient = null;
  }
}
