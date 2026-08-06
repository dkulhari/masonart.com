/**
 * Public promotions API.
 *
 * - GET /api/promotions/active - the one running promotion, with this
 *   visitor's countdown deadline resolved. `null` when no sale is running.
 *
 * Two rules govern this file.
 *
 * **`endsAt` is private.** The payload is assembled field by field, never
 * spread from the row, so the real end date cannot reach the network tab. Only
 * the resolved deadline crosses the wire — see lib/promotion-countdown.ts and
 * design doc §6.
 *
 * **The response is per-visitor.** The deadline comes from a cookie unique to
 * this browser, so the response must never land in a shared cache; one
 * visitor's countdown showing up on everyone else's screen would be both wrong
 * and, on a re-mint, absurd.
 *
 * Nothing here is hardcoded. No discount amount, no headline, no "40% OFF"
 * string: an absent promotion means an absent strip, and the storefront falls
 * back to its ordinary chrome.
 */

import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import { logger } from "../lib/logger";
import {
  countdownCookieName,
  parseCountdownCookie,
  resolveCountdownDeadline,
  serializeCountdownCookie,
} from "../lib/promotion-countdown";
import {
  getActivePromotions,
  selectPromotion,
  type Promotion,
} from "../lib/promotion-pricing";

export const promotionsApp = new Hono();

/** Cookie outlives one rolling window so a reload does not re-mint. */
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// ============================================================================
// GET /api/promotions/active - Active promotion + this visitor's deadline
// ============================================================================

promotionsApp.get("/active", async (c) => {
  const now = new Date();

  let promotion: Promotion | null = null;
  try {
    promotion = selectPromotion(await getActivePromotions(now));
  } catch (err) {
    // A sale strip is decoration. It must never take the storefront down with
    // it, so a failed lookup reads as "no sale running".
    logger.error({ err }, "Failed to resolve the active promotion");
    promotion = null;
  }

  // Per-visitor either way: a shared cache must not serve one browser's
  // deadline — nor pin "no sale" in place the moment one is enabled.
  c.header("Cache-Control", "private, no-store");

  if (!promotion) return c.json(null);

  const cookieName = countdownCookieName(promotion.id);
  const { deadline, shouldSetCookie } = resolveCountdownDeadline(
    promotion,
    parseCountdownCookie(getCookie(c, cookieName)),
    now
  );

  if (shouldSetCookie) {
    setCookie(c, cookieName, serializeCountdownCookie(deadline), {
      maxAge: COOKIE_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
    });
  }

  // Explicit allowlist. `endsAt`, `scopeFilter`, `perCustomerOrderLimit` and
  // the rest of the row stay server-side.
  return c.json({
    promotionId: promotion.id,
    headline: promotion.headline,
    percentOff:
      promotion.discountType === "percentage" ? promotion.discountValue : null,
    membersOnly: promotion.membersOnly,
    deadline: deadline.toISOString(),
  });
});

export default promotionsApp;
