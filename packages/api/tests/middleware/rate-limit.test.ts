/**
 * Rate Limit Middleware — client IP extraction
 *
 * Behind the Cloudflare tunnel every socket peer is cloudflared, and
 * Cloudflare APPENDS the real client IP to x-forwarded-for. The first XFF
 * entry is attacker-controlled, so trusting it makes per-IP rate limits
 * spoofable (go-live ticket #291, cc #95).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "hono";
import { getClientIp, rateLimit } from "../../src/middleware/rate-limit";

vi.mock("../../src/lib/redis", () => ({
  isRedisConnected: () => true,
  checkRateLimit: vi.fn().mockResolvedValue({
    success: false,
    remaining: 0,
    resetIn: 60,
  }),
}));

function contextWithHeaders(headers: Record<string, string>): Context {
  const lookup = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    req: { header: (name: string) => lookup[name.toLowerCase()] },
  } as unknown as Context;
}

describe("getClientIp", () => {
  it("prefers cf-connecting-ip over everything else", () => {
    const c = contextWithHeaders({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "6.6.6.6, 203.0.113.7",
      "x-real-ip": "10.0.0.1",
    });
    expect(getClientIp(c)).toBe("203.0.113.7");
  });

  it("ignores the attacker-controlled first x-forwarded-for entry", () => {
    // Client sent "X-Forwarded-For: 6.6.6.6"; Cloudflare appended the real IP.
    const c = contextWithHeaders({
      "x-forwarded-for": "6.6.6.6, 198.51.100.24",
    });
    expect(getClientIp(c)).toBe("198.51.100.24");
  });

  it("uses the sole x-forwarded-for entry when there is only one hop", () => {
    const c = contextWithHeaders({ "x-forwarded-for": "198.51.100.24" });
    expect(getClientIp(c)).toBe("198.51.100.24");
  });

  it("falls back to x-real-ip when no cf/XFF headers exist", () => {
    const c = contextWithHeaders({ "x-real-ip": "192.0.2.10" });
    expect(getClientIp(c)).toBe("192.0.2.10");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    expect(getClientIp(contextWithHeaders({}))).toBe("unknown");
  });

  it("trims whitespace from header values", () => {
    const c = contextWithHeaders({
      "x-forwarded-for": " 6.6.6.6 , 198.51.100.24 ",
    });
    expect(getClientIp(c)).toBe("198.51.100.24");
  });
});

describe("DISABLE_RATE_LIMIT bypass (#332)", () => {
  // The E2E auth setup performs more auth POSTs per run than the sliding
  // window allows, and all dev traffic shares one "unknown" IP bucket —
  // test environments need a way to switch limiting off. The bypass must
  // be inert in production no matter what the env says.

  function limiterContext(): { c: Context; nextCalled: () => boolean } {
    let called = false;
    const c = {
      req: { header: () => undefined },
      header: () => {},
      json: (body: unknown, status?: number) => ({ body, status }),
    } as unknown as Context;
    return {
      c,
      nextCalled: () => called,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (async () => {
        called = true;
      }) as any,
    } as any;
  }

  afterEach(() => {
    delete process.env.DISABLE_RATE_LIMIT;
    vi.unstubAllEnvs();
  });

  it("skips limiting when DISABLE_RATE_LIMIT=true outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DISABLE_RATE_LIMIT", "true");
    const middleware = rateLimit({ limit: 1, windowSeconds: 60, keyPrefix: "t" });
    const { c, nextCalled, next } = limiterContext() as any;

    // checkRateLimit is mocked to always report "limit exceeded" — reaching
    // next() therefore proves the limiter was bypassed, not merely passed.
    const result = await middleware(c, next);
    expect(nextCalled()).toBe(true);
    expect(result).toBeUndefined();
  });

  it("still limits in production even when DISABLE_RATE_LIMIT=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_RATE_LIMIT", "true");
    const middleware = rateLimit({ limit: 1, windowSeconds: 60, keyPrefix: "t" });
    const { c, nextCalled, next } = limiterContext() as any;

    const result = (await middleware(c, next)) as { status?: number };
    expect(nextCalled()).toBe(false);
    expect(result?.status).toBe(429);
  });

  it("limits normally when DISABLE_RATE_LIMIT is not exactly 'true'", async () => {
    vi.stubEnv("NODE_ENV", "test");
    // vitest.config sets DISABLE_RATE_LIMIT=true globally for unit tests —
    // pin it to a non-'true' value to prove only the exact string bypasses
    vi.stubEnv("DISABLE_RATE_LIMIT", "false");
    const middleware = rateLimit({ limit: 1, windowSeconds: 60, keyPrefix: "t" });
    const { c, nextCalled, next } = limiterContext() as any;

    const result = (await middleware(c, next)) as { status?: number };
    expect(nextCalled()).toBe(false);
    expect(result?.status).toBe(429);
  });
});
