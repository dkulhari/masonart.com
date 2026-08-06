/**
 * The countdown a visitor sees.
 *
 * In 'rolling' mode the deadline is per-visitor and re-mints when it runs out —
 * the urgency device described in the design doc §6, including the CCPA note
 * recorded there. It is a *configured* behaviour, not a hardcoded one:
 * `countdownMode='real'` makes the timer truthful in a single admin edit, with
 * no deploy.
 *
 * The displayed deadline is always min(minted, endsAt), so it can never claim
 * more time than the sale actually has left, and it drops below the usual
 * window on the next load once the sale genuinely is ending.
 *
 * `endsAt` itself is never serialized — only the resolved deadline crosses the
 * wire, so the real end date is not sitting in the network tab.
 *
 * Resolution is a pure function of (row, cookie, now, random). `now` and the
 * random source are parameters so the tests need no fake timers, and so the
 * whole thing can run server-side during SSR: no hydration flicker, and no
 * client clock to tamper with.
 */

export type CountdownConfig = {
  id: string;
  countdownMode: "real" | "rolling";
  rollingWindowMinutes: number;
  rollingJitterMinutes: number;
  endsAt: Date | null;
};

export type ResolvedCountdown = {
  /** The only value that may be serialized to the storefront. */
  deadline: Date;
  /** True when a fresh window was minted and the caller must persist it. */
  shouldSetCookie: boolean;
};

/** Per-promotion so two overlapping sales cannot share one visitor's window. */
export const countdownCookieName = (promotionId: string) =>
  `promo_deadline_${promotionId}`;

/**
 * Parse the cookie written by a previous request. Anything unparseable — a
 * hand-edited value, a stale format — is treated as absent, which re-mints.
 */
export function parseCountdownCookie(raw: string | undefined): Date | null {
  if (!raw) return null;
  const epochMs = Number(raw);
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  return new Date(epochMs);
}

/** Cookies hold epoch milliseconds: no separators to encode, no timezone. */
export const serializeCountdownCookie = (deadline: Date) =>
  String(deadline.getTime());

export function resolveCountdownDeadline(
  promotion: CountdownConfig,
  cookieDeadline: Date | null,
  now: Date = new Date(),
  random: () => number = Math.random
): ResolvedCountdown {
  // Truthful mode: the deadline is the real end, and the cookie plays no part.
  if (promotion.countdownMode === "real") {
    return { deadline: promotion.endsAt ?? now, shouldSetCookie: false };
  }

  const live = Boolean(cookieDeadline && cookieDeadline > now);

  const minted = live
    ? (cookieDeadline as Date)
    : new Date(now.getTime() + mintedWindowMs(promotion, random));

  // Never more time than actually remains.
  const deadline =
    promotion.endsAt && promotion.endsAt < minted ? promotion.endsAt : minted;

  return { deadline, shouldSetCookie: !live };
}

/**
 * `window − rand(jitter)`, in milliseconds. The jitter stops every visitor
 * seeing an identical `12:00:00`; it is capped below the window so a
 * misconfigured row (jitter wider than the window) cannot mint a deadline that
 * has already passed and spin the visitor through a re-mint on every load.
 */
function mintedWindowMs(
  promotion: CountdownConfig,
  random: () => number
): number {
  const windowMinutes = Math.max(1, promotion.rollingWindowMinutes);
  const jitterMinutes = Math.min(
    Math.max(0, promotion.rollingJitterMinutes),
    windowMinutes - 1
  );
  const roll = Math.min(Math.max(random(), 0), 1);
  return (windowMinutes - roll * jitterMinutes) * 60_000;
}
