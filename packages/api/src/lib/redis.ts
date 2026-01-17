/**
 * Redis Client Module
 *
 * Provides Redis connection for caching, sessions, and BullMQ job queues.
 * Uses ioredis for full Redis functionality and BullMQ compatibility.
 */

import Redis from 'ioredis';

// Redis connection URL from environment
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Redis client singleton for general-purpose caching
 */
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ compatibility
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    // In development, don't retry if Redis is not available
    if (process.env.NODE_ENV === 'development' && times > 3) {
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000);
  },
});

// Suppress Redis connection errors in development
redis.on('error', (err) => {
  if (process.env.NODE_ENV === 'development') {
    // Silently ignore connection errors in development
    return;
  }
  console.error('Redis connection error:', err);
});

/**
 * Create a new Redis connection for BullMQ workers
 * Each worker should have its own connection
 */
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/**
 * Redis connection options for BullMQ queues and workers
 */
export const redisConnectionOptions = {
  connection: redis,
};

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Default cache TTL (1 hour)
 */
const DEFAULT_TTL = 3600;

/**
 * Cache key prefixes for different data types
 */
export const CacheKeys = {
  PRODUCT: 'product:',
  PRODUCT_LIST: 'product-list:',
  CART: 'cart:',
  SESSION: 'session:',
  USER: 'user:',
  AI_GENERATION: 'ai-gen:',
  RATE_LIMIT: 'rate-limit:',
} as const;

/**
 * Get a cached value
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    if (redis.status !== 'ready') return null;
    const value = await redis.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  } catch {
    // Redis not available - return null to skip cache
    return null;
  }
}

/**
 * Set a cached value with optional TTL
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await redis.setex(key, ttlSeconds, serialized);
  } catch {
    // Redis not available - skip caching silently
  }
}

/**
 * Delete a cached value
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    await redis.del(key);
  } catch {
    // Redis not available - skip silently
  }
}

/**
 * Delete all cached values matching a pattern
 */
export async function deleteCachedPattern(pattern: string): Promise<void> {
  try {
    if (redis.status !== 'ready') return;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Redis not available - skip silently
  }
}

// ============================================================================
// Rate Limiting Utilities
// ============================================================================

/**
 * Rate limit result
 */
export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number; // seconds
}

/**
 * Check and increment rate limit for a key
 * Uses sliding window algorithm
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const rateLimitKey = `${CacheKeys.RATE_LIMIT}${key}`;

  // Remove old entries outside the window
  await redis.zremrangebyscore(rateLimitKey, 0, windowStart);

  // Count current entries
  const count = await redis.zcard(rateLimitKey);

  if (count >= limit) {
    // Get the oldest entry to calculate reset time
    const oldest = await redis.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
    const oldestTimestamp = oldest[1];
    const resetIn = oldest.length >= 2 && oldestTimestamp !== undefined
      ? Math.ceil((parseInt(oldestTimestamp) + windowSeconds * 1000 - now) / 1000)
      : windowSeconds;

    return {
      success: false,
      remaining: 0,
      resetIn,
    };
  }

  // Add new entry
  await redis.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
  await redis.expire(rateLimitKey, windowSeconds);

  return {
    success: true,
    remaining: limit - count - 1,
    resetIn: windowSeconds,
  };
}

// ============================================================================
// Session Utilities
// ============================================================================

/**
 * Store session data in Redis
 */
export async function setSession(
  sessionId: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 7 * 24 * 60 * 60 // 7 days default
): Promise<void> {
  const key = `${CacheKeys.SESSION}${sessionId}`;
  await setCached(key, data, ttlSeconds);
}

/**
 * Get session data from Redis
 */
export async function getSession(
  sessionId: string
): Promise<Record<string, unknown> | null> {
  const key = `${CacheKeys.SESSION}${sessionId}`;
  return getCached(key);
}

/**
 * Delete session from Redis
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const key = `${CacheKeys.SESSION}${sessionId}`;
  await deleteCached(key);
}

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Initialize Redis connection
 * Call this on server startup
 */
export async function initRedis(): Promise<void> {
  if (redis.status === 'ready') return;

  try {
    await redis.connect();
  } catch (error) {
    // Connection failed, but ioredis will auto-reconnect
    // This is fine for development when Redis might not be running
    if (process.env.NODE_ENV === 'development') {
      console.warn('Redis connection failed, will retry automatically:', error);
    } else {
      throw error;
    }
  }
}

/**
 * Close Redis connections gracefully
 * Call this on server shutdown
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redis.status === 'ready';
}

// Export default redis instance
export default redis;
