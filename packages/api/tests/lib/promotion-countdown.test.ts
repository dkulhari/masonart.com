/**
 * The countdown a visitor sees.
 *
 * Four behaviours are worth a test each: a fresh visitor gets a window, the
 * jitter makes that window per-visitor, a live window survives a reload, and a
 * spent window re-mints. The fifth is the honest one — the displayed deadline is
 * clamped to `endsAt`, so the timer can never claim more time than the sale
 * actually has left.
 *
 * `now` and the random source are injected rather than read from the ambient
 * clock, so none of this needs fake timers and none of it goes stale in 2027.
 */

import { describe, it, expect } from "vitest";
import { resolveCountdownDeadline } from "../../src/lib/promotion-countdown";

const NOW = new Date("2026-08-10T12:00:00.000Z");

const promo = {
  id: "p",
  countdownMode: "rolling" as const,
  rollingWindowMinutes: 720,
  rollingJitterMinutes: 90,
  endsAt: null as Date | null,
};

describe("resolveCountdownDeadline", () => {
  it("mints a window for a fresh visitor", () => {
    const { deadline, shouldSetCookie } = resolveCountdownDeadline(
      promo,
      null,
      NOW,
      () => 0
    );
    expect(shouldSetCookie).toBe(true);
    expect(deadline.getTime()).toBe(NOW.getTime() + 720 * 60_000);
  });

  it("applies jitter so visitors do not share one deadline", () => {
    const { deadline } = resolveCountdownDeadline(promo, null, NOW, () => 1);
    expect(deadline.getTime()).toBe(NOW.getTime() + (720 - 90) * 60_000);
  });

  it("keeps a live cookie deadline", () => {
    const existing = new Date(NOW.getTime() + 60_000);
    const { deadline, shouldSetCookie } = resolveCountdownDeadline(
      promo,
      existing,
      NOW,
      () => 0
    );
    expect(deadline).toEqual(existing);
    expect(shouldSetCookie).toBe(false);
  });

  it("re-mints once the previous window has run out", () => {
    const expired = new Date(NOW.getTime() - 1000);
    const { shouldSetCookie } = resolveCountdownDeadline(
      promo,
      expired,
      NOW,
      () => 0
    );
    expect(shouldSetCookie).toBe(true);
  });

  it("clamps to the real end — never shows more time than remains", () => {
    const ending = { ...promo, endsAt: new Date(NOW.getTime() + 30 * 60_000) };
    const { deadline } = resolveCountdownDeadline(ending, null, NOW, () => 0);
    expect(deadline).toEqual(ending.endsAt);
  });

  it("clamps a still-live cookie deadline to the real end too", () => {
    const ending = { ...promo, endsAt: new Date(NOW.getTime() + 30 * 60_000) };
    const cookie = new Date(NOW.getTime() + 10 * 60 * 60_000);
    const { deadline } = resolveCountdownDeadline(
      ending,
      cookie,
      NOW,
      () => 0
    );
    expect(deadline).toEqual(ending.endsAt);
  });

  it("uses endsAt directly in 'real' mode and ignores the cookie", () => {
    const real = {
      ...promo,
      countdownMode: "real" as const,
      endsAt: new Date("2026-08-31T00:00:00.000Z"),
    };
    const cookie = new Date(NOW.getTime() + 60_000);
    const { deadline, shouldSetCookie } = resolveCountdownDeadline(
      real,
      cookie,
      NOW,
      () => 0
    );
    expect(deadline).toEqual(real.endsAt);
    expect(shouldSetCookie).toBe(false);
  });

  it("never mints a deadline in the past, however wide the jitter", () => {
    const silly = {
      ...promo,
      rollingWindowMinutes: 60,
      rollingJitterMinutes: 600,
    };
    const { deadline } = resolveCountdownDeadline(silly, null, NOW, () => 1);
    expect(deadline.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("countdown cookie naming", () => {
  it("namespaces the cookie per promotion", async () => {
    const { countdownCookieName } = await import(
      "../../src/lib/promotion-countdown"
    );
    expect(countdownCookieName("abc")).toBe("promo_deadline_abc");
  });
});
