/**
 * GET /api/promotions/active — the one promotion the storefront may render.
 *
 * The property this file exists to protect is negative: `endsAt` is private and
 * must not reach the browser. The payload is therefore built field by field
 * rather than spread from the row, and the tests below assert against the raw
 * response body — not a parsed object — so a stray field cannot slip through a
 * shape assertion that only checks the keys it happens to name.
 *
 * The real resolver runs here; only `db` and the active-promotion query are
 * mocked. Clamping and minting are the behaviour under test, and mocking the
 * resolver would test the mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import "../setup";

const getActivePromotionsMock = vi.fn();

vi.mock("../../src/database", () => ({ db: {} }));

vi.mock("../../src/lib/promotion-pricing", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/promotion-pricing")>();
  return {
    ...actual,
    getActivePromotions: (...args: unknown[]) =>
      getActivePromotionsMock(...args),
  };
});

import { promotionsApp } from "../../src/routes/promotions";
import { readJson } from '../helpers/json';

const app = new Hono();
app.route("/api/promotions", promotionsApp);

const PROMO_ID = "0b6c2f7e-6f0e-4a9b-9a52-2a6d3f9c1e11";
/** Deliberately distinctive, so a leak is unmistakable in the raw body. */
const REAL_END = new Date("2026-12-31T03:04:05.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: PROMO_ID,
    name: "Summer Sale 2026",
    headline: "SUMMER SALE — 40% OFF EVERYTHING",
    discountType: "percentage",
    discountValue: 40,
    scopeType: "all",
    scopeFilter: null,
    membersOnly: true,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: REAL_END,
    isEnabled: true,
    priority: 0,
    perCustomerOrderLimit: null,
    countdownMode: "rolling",
    rollingWindowMinutes: 720,
    rollingJitterMinutes: 90,
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function get(headers: Record<string, string> = {}) {
  return app.request("/api/promotions/active", { headers });
}

beforeEach(() => {
  getActivePromotionsMock.mockReset();
  getActivePromotionsMock.mockResolvedValue([]);
});

describe("GET /api/promotions/active", () => {
  it("returns null when no promotion is running", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await readJson(res)).toBeNull();
  });

  it("returns the winning promotion with a resolved deadline", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);

    const res = await get();
    const body = await readJson(res);

    expect(body).toMatchObject({
      promotionId: PROMO_ID,
      headline: "SUMMER SALE — 40% OFF EVERYTHING",
      percentOff: 40,
      membersOnly: true,
    });
    expect(new Date(body.deadline).getTime()).toBeGreaterThan(Date.now());
  });

  it("serializes exactly the five public fields and nothing else", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);

    const body = await readJson(await get());

    expect(Object.keys(body).sort()).toEqual([
      "deadline",
      "headline",
      "membersOnly",
      "percentOff",
      "promotionId",
    ]);
  });

  it("never leaks endsAt, by name or by value", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);

    const res = await get();
    const raw = await res.text();

    expect(raw).not.toContain("endsAt");
    expect(raw).not.toContain("ends_at");
    expect(raw).not.toContain(REAL_END.toISOString());
    expect(raw).not.toContain(String(REAL_END.getTime()));
    expect(raw).not.toContain("2026-12-31");
    expect(JSON.stringify(JSON.parse(raw))).not.toContain("endsAt");
  });

  it("mints a per-visitor window and sets the cookie", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);

    const res = await get();
    const cookie = res.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(`promo_deadline_${PROMO_ID}=`);
    expect(cookie).toContain("HttpOnly");
  });

  it("reuses a live cookie deadline instead of minting a fresh one", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);
    const existing = new Date(Date.now() + 90 * 60_000);

    const res = await get({
      Cookie: `promo_deadline_${PROMO_ID}=${existing.getTime()}`,
    });
    const body = await readJson(res);

    expect(res.headers.get("set-cookie")).toBeNull();
    expect(new Date(body.deadline).getTime()).toBe(existing.getTime());
  });

  it("re-mints once the visitor's previous window has run out", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);
    const spent = new Date(Date.now() - 60_000);

    const res = await get({
      Cookie: `promo_deadline_${PROMO_ID}=${spent.getTime()}`,
    });
    const body = await readJson(res);

    expect(res.headers.get("set-cookie")).toContain(
      `promo_deadline_${PROMO_ID}=`
    );
    expect(new Date(body.deadline).getTime()).toBeGreaterThan(Date.now());
  });

  it("shows no more time than actually remains when the sale is ending", async () => {
    const endsAt = new Date(Date.now() + 30 * 60_000);
    getActivePromotionsMock.mockResolvedValue([row({ endsAt })]);

    const body = await readJson(await get());
    const deadline = new Date(body.deadline).getTime();

    // The rolling window is 12h; the sale has 30 minutes left. The clamp wins.
    expect(deadline).toBeLessThanOrEqual(endsAt.getTime());
    expect(deadline).toBeGreaterThan(Date.now());
    expect(deadline).toBeLessThan(Date.now() + 60 * 60_000);
  });

  it("clamps a still-live cookie deadline to the real end too", async () => {
    const endsAt = new Date(Date.now() + 10 * 60_000);
    getActivePromotionsMock.mockResolvedValue([row({ endsAt })]);
    const roomy = new Date(Date.now() + 8 * 60 * 60_000);

    const body = await readJson(
      await get({ Cookie: `promo_deadline_${PROMO_ID}=${roomy.getTime()}` })
    );

    expect(new Date(body.deadline).getTime()).toBeLessThanOrEqual(
      endsAt.getTime()
    );
  });

  it("shows the real end and sets no cookie in 'real' mode", async () => {
    const endsAt = new Date(Date.now() + 3 * 60 * 60_000);
    getActivePromotionsMock.mockResolvedValue([
      row({ countdownMode: "real", endsAt }),
    ]);

    const res = await get();
    const body = await readJson(res);

    expect(res.headers.get("set-cookie")).toBeNull();
    expect(new Date(body.deadline).getTime()).toBe(endsAt.getTime());
  });

  it("picks one promotion when several overlap — they never stack", async () => {
    getActivePromotionsMock.mockResolvedValue([
      row({ priority: 0, headline: "LOW", discountValue: 10 }),
      row({ priority: 5, headline: "HIGH", discountValue: 40 }),
    ]);

    const body = await readJson(await get());

    expect(body.headline).toBe("HIGH");
    expect(body.percentOff).toBe(40);
  });

  it("reports no percentage for a fixed-amount promotion", async () => {
    getActivePromotionsMock.mockResolvedValue([
      row({ discountType: "fixed", discountValue: 50000 }),
    ]);

    const body = await readJson(await get());

    expect(body.percentOff).toBeNull();
  });

  it("is never cached by a shared cache — the deadline is per-visitor", async () => {
    getActivePromotionsMock.mockResolvedValue([row()]);

    const res = await get();

    expect(res.headers.get("cache-control")).toContain("private");
  });

  it("stays quiet when the promotion lookup fails", async () => {
    getActivePromotionsMock.mockRejectedValue(new Error("db down"));

    const res = await get();

    expect(res.status).toBe(200);
    expect(await readJson(res)).toBeNull();
  });
});
