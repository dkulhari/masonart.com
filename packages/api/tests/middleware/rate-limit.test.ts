/**
 * Rate Limit Middleware — client IP extraction
 *
 * Behind the Cloudflare tunnel every socket peer is cloudflared, and
 * Cloudflare APPENDS the real client IP to x-forwarded-for. The first XFF
 * entry is attacker-controlled, so trusting it makes per-IP rate limits
 * spoofable (go-live ticket #291, cc #95).
 */

import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { getClientIp } from "../../src/middleware/rate-limit";

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
