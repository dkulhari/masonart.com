/**
 * Rate Limiting Middleware
 *
 * Applies sliding window rate limiting using Redis.
 * Used to protect sensitive endpoints (auth, OTP) from brute force attacks.
 */

import type { Context, Next } from "hono";
import { checkRateLimit, isRedisConnected } from "../lib/redis";
import { logger } from "../lib/logger";

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key prefix for namespacing different rate limits */
  keyPrefix: string;
}

/**
 * Extract client IP from request headers (supports proxies)
 */
function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

/**
 * Creates a rate limiting middleware for Hono routes.
 *
 * Returns 429 Too Many Requests when limit is exceeded,
 * with Retry-After header indicating when to retry.
 *
 * Falls through silently if Redis is not connected (graceful degradation).
 */
export function rateLimit(options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    // Skip rate limiting if Redis is not available
    if (!isRedisConnected()) {
      return next();
    }

    const ip = getClientIp(c);
    const key = `${options.keyPrefix}:${ip}`;

    const result = await checkRateLimit(
      key,
      options.limit,
      options.windowSeconds
    );

    // Set rate limit headers on all responses
    c.header("X-RateLimit-Limit", String(options.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(result.resetIn));

    if (!result.success) {
      c.header("Retry-After", String(result.resetIn));
      logger.warn(
        `Rate limit exceeded: ${options.keyPrefix} from ${ip}`
      );
      return c.json(
        {
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: result.resetIn,
        },
        429
      );
    }

    return next();
  };
}

/**
 * Pre-configured rate limiters for common endpoints
 */
export const authRateLimit = rateLimit({
  limit: 5,
  windowSeconds: 60,
  keyPrefix: "auth",
});

export const signUpRateLimit = rateLimit({
  limit: 3,
  windowSeconds: 60,
  keyPrefix: "signup",
});

export const otpRateLimit = rateLimit({
  limit: 5,
  windowSeconds: 60,
  keyPrefix: "otp",
});

export const forgotPasswordRateLimit = rateLimit({
  limit: 3,
  windowSeconds: 60,
  keyPrefix: "forgot-password",
});
