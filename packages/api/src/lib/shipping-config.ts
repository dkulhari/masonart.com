/**
 * Shipping configuration: the free-shipping threshold, read from the database
 * instead of the bundle.
 *
 * `FREE_SHIPPING_THRESHOLD` in `@chobii/shared` used to be the whole story, so
 * changing what customers pay for shipping meant a code change and a deploy.
 * The value now lives in `shipping_config` (schema/shipping.ts), mirroring
 * `walletPricingConfig` and its reader in `services/wallet.ts`.
 *
 * ## The constant is the floor, not a legacy
 *
 * Every path that cannot produce a configured value returns
 * `FREE_SHIPPING_THRESHOLD`: an empty table, a row set with nothing effective
 * right now, and a read that throws. The two ways to get this wrong are both
 * silent — 0 gives every order free shipping, Infinity charges every order —
 * and neither surfaces until the day's revenue is counted. The constant is also
 * what the storefront bundles and what the copy says, so falling back to it is
 * the only answer that keeps the charge and the promise in agreement.
 *
 * The table therefore ships **empty**. `SHIPPING_CONFIG_DEFAULTS` is the seed
 * in the sense that matters — it is the value in force until an admin sets one
 * — which is exactly how `WALLET_CONFIG_DEFAULTS` behaves. Writing a row at
 * migration time would instead freeze ₹999 into data, so a later change to the
 * constant would move the storefront copy while the charge stayed put: the
 * false-advertising gap commit 70bfa9dd closed.
 *
 * ## Effective dating is kept, and honoured on read
 *
 * `effectiveFrom` / `effectiveTo` come from the precedent, and a threshold that
 * moves for a sale weekend is a real requirement, so they are implemented
 * rather than dropped. The window is evaluated against the caller's `now` at
 * read time — in JS, over a row set the query has only narrowed — so a value
 * scheduled for Friday takes effect on Friday with no job to run and no write
 * to purge.
 *
 * ## Which makes the cache the interesting part
 *
 * This is read on every order creation and every shipping estimate, so the
 * answer is cached. A cache in front of a clock-derived value is precisely the
 * trap #528 fell into at the other end of the same idea: an entry written at
 * 08:59:50 with a 300s TTL, against a change scheduled for 09:00:00, goes on
 * quoting the old threshold for the rest of its life. Nothing runs at 09:00:00
 * — reaching a start time is only the clock moving.
 *
 * Two defences, and both are needed:
 *
 * - the TTL is clamped to the next boundary in either direction, `min(active
 *   row's effectiveTo, next row's effectiveFrom)`, so no entry can outlive the
 *   change it predates;
 * - there is deliberately **no in-process memo** of "the row in force". That is
 *   the exact shape of the #528 memo, and it would reintroduce the staleness
 *   the TTL clamp just removed, one layer further in. Redis is the only cache
 *   here, and the row set is re-derived on every miss.
 *
 * Admin writes call `invalidateFreeShippingThreshold` so an edit is visible at
 * once rather than at the end of a TTL.
 */

import { and, asc, eq, isNull, gt, or } from "drizzle-orm";
import { FREE_SHIPPING_THRESHOLD } from "@chobii/shared";

import { db } from "../database";
import {
  shippingConfig,
  type ShippingConfig,
} from "../database/schema/shipping";
import { deleteCached, getCached, setCached } from "./redis";

// ============================================================================
// Keys and defaults
// ============================================================================

/**
 * Shipping config keys.
 *
 * These live here rather than beside the table the way `WALLET_CONFIG_KEYS`
 * does, because the default has to be `FREE_SHIPPING_THRESHOLD` itself and
 * `@chobii/shared` is ESM-only — a value import from it inside a schema file
 * breaks the CJS loader `drizzle-kit generate` runs the schema through.
 */
export const SHIPPING_CONFIG_KEYS = {
  /** Net, post-discount rupee amount at or above which standard shipping is free */
  FREE_SHIPPING_THRESHOLD: "free_shipping_threshold",
} as const;

/**
 * The value in force until an admin sets one, and the fallback when the table
 * cannot be read. Sourced from `@chobii/shared` rather than written again, so
 * the fallback and the figure the storefront prints cannot drift.
 */
export const SHIPPING_CONFIG_DEFAULTS = {
  [SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD]: FREE_SHIPPING_THRESHOLD,
} as const;

/**
 * A complete Redis key, not a prefix — so invalidation is `deleteCached`, never
 * `deleteCachedPattern`. Handing a wildcard to `deleteCached` is a no-op that
 * resolves successfully, which is how the same bug shipped three times here
 * (#525, #527, admin/shipping.ts); `tests/routes/admin/shipping-cache-purge.test.ts`
 * guards the admin routes against it repo-wide.
 */
export const FREE_SHIPPING_THRESHOLD_CACHE_KEY = `shipping-config:${SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD}`;

/** Five minutes, matching the wallet config reader. Clamped down at boundaries. */
export const SHIPPING_CONFIG_CACHE_TTL_SECONDS = 300;

// ============================================================================
// Resolution
// ============================================================================

export interface ResolvedShippingThreshold {
  /** The threshold in force, in whole rupees. */
  value: number;
  /** Whether `value` came from a row or from the bundled constant. */
  source: "config" | "default";
  /** The row in force, for the admin screen's "who changed it, and when". */
  row: ShippingConfig | null;
  /** When the answer next changes on the clock alone, if it does. */
  nextChangeAt: Date | null;
}

/** Whether a row's window contains `now`. */
function isEffective(row: ShippingConfig, now: Date): boolean {
  if (row.effectiveFrom > now) return false;
  if (row.effectiveTo && row.effectiveTo <= now) return false;
  return true;
}

/**
 * Every row for a key that has not ended: the one in force, and the ones still
 * to start.
 *
 * Ended rows are dropped in SQL — they can never become interesting again — but
 * nothing else is. Narrowing to "effective right now" in the WHERE clause would
 * hide the next scheduled change from the caller, and it is that change the
 * cache TTL has to be clamped against.
 */
async function loadSchedulableRows(
  key: string,
  now: Date
): Promise<ShippingConfig[]> {
  return db.query.shippingConfig.findMany({
    where: and(
      eq(shippingConfig.key, key),
      or(isNull(shippingConfig.effectiveTo), gt(shippingConfig.effectiveTo, now))
    ),
    orderBy: asc(shippingConfig.effectiveFrom),
  });
}

/**
 * Resolve the threshold live, with the audit trail and the next boundary.
 *
 * Deliberately does not consult the cache: the admin screen (#570) must be
 * shown what the table says, not what Redis last remembered, or an edit would
 * appear not to have saved.
 *
 * Throws if the read fails. `getFreeShippingThreshold` is the forgiving caller;
 * an admin screen should see the error rather than a plausible wrong number.
 */
export async function resolveFreeShippingThreshold(
  now: Date = new Date()
): Promise<ResolvedShippingThreshold> {
  const rows = await loadSchedulableRows(
    SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD,
    now
  );

  // The window is re-checked here rather than trusted to the query, so the
  // derivation happens against the caller's `now` — the same clock rule the
  // rest of this module follows. Rows arrive ordered by effectiveFrom, so the
  // last effective one is the most recently started.
  let active: ShippingConfig | null = null;
  let nextChangeAt: Date | null = null;

  for (const row of rows) {
    if (isEffective(row, now)) {
      active = row;
      continue;
    }
    if (row.effectiveFrom > now) {
      if (!nextChangeAt || row.effectiveFrom < nextChangeAt) {
        nextChangeAt = row.effectiveFrom;
      }
    }
  }

  // The active row's own expiry is a boundary too: at that instant the answer
  // reverts to whatever is underneath, which may be the constant.
  if (active?.effectiveTo && (!nextChangeAt || active.effectiveTo < nextChangeAt)) {
    nextChangeAt = active.effectiveTo;
  }

  return {
    value:
      active?.valueInt ??
      SHIPPING_CONFIG_DEFAULTS[SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD],
    source: active ? "config" : "default",
    row: active,
    nextChangeAt,
  };
}

/**
 * How long the answer may be cached: the default TTL, cut short by the next
 * boundary.
 *
 * Rounded down — an entry that expires a fraction early is invisible, one that
 * expires a fraction late is a wrong price — with a floor of one second,
 * because `setex` rejects a non-positive TTL and one second of staleness beats
 * an exception on the order-creation path.
 */
function thresholdCacheTtl(nextChangeAt: Date | null, now: Date): number {
  if (!nextChangeAt) return SHIPPING_CONFIG_CACHE_TTL_SECONDS;

  const remaining = Math.floor((nextChangeAt.getTime() - now.getTime()) / 1000);
  return Math.max(1, Math.min(SHIPPING_CONFIG_CACHE_TTL_SECONDS, remaining));
}

/**
 * The free-shipping threshold in force, in whole rupees.
 *
 * This is the reader for the request path — order creation and shipping
 * estimates — so it never throws. A failed read falls back to the shared
 * constant and is **not** cached: caching a value produced by an outage would
 * extend the outage past its end. A correct answer is cached, including the
 * ordinary "table is empty, so the constant applies" case, which would
 * otherwise query on every request.
 */
export async function getFreeShippingThreshold(
  now: Date = new Date()
): Promise<number> {
  const cached = await getCached<number>(FREE_SHIPPING_THRESHOLD_CACHE_KEY);
  // `!== null` rather than a truthiness check: 0 is a legitimate setting
  // (everything ships free) and must not read as a miss.
  if (cached !== null && cached !== undefined) return cached;

  try {
    const { value, nextChangeAt } = await resolveFreeShippingThreshold(now);

    await setCached(
      FREE_SHIPPING_THRESHOLD_CACHE_KEY,
      value,
      thresholdCacheTtl(nextChangeAt, now)
    );

    return value;
  } catch (error) {
    console.error("Failed to read free shipping threshold:", error);
    return SHIPPING_CONFIG_DEFAULTS[
      SHIPPING_CONFIG_KEYS.FREE_SHIPPING_THRESHOLD
    ];
  }
}

/**
 * Drop the cached threshold. Admin writes (#570) call this so an edit takes
 * effect immediately instead of at the end of a TTL.
 *
 * `deleteCached`, because the argument is one complete key. Reaching for
 * `deleteCachedPattern` here would work but scan the keyspace for a single
 * known key; reaching for `deleteCached` with a wildcard — the mistake this
 * repo keeps making — would silently delete nothing.
 */
export async function invalidateFreeShippingThreshold(): Promise<void> {
  await deleteCached(FREE_SHIPPING_THRESHOLD_CACHE_KEY);
}
