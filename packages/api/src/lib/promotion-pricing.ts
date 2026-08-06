/**
 * Sale pricing, expressed once.
 *
 * Every surface that shows a price — product list, product detail, cart,
 * order creation, /sale — calls this module. None of them computes a
 * discount, so there is exactly one place where the maths can be wrong.
 *
 * Active state is derived from the row rather than stored, so a sale ends on
 * its own: no job to run, no status column to fall out of sync.
 *
 * Promotions never stack. Overlap resolves to exactly one row.
 */

import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "../database";
import { promotions } from "../database/schema/promotions";

export type Promotion = typeof promotions.$inferSelect;

/** Enabled, started, not yet ended. `endsAt` null runs open-ended. */
export function isPromotionActive(promotion: Promotion, now: Date): boolean {
  if (!promotion.isEnabled) return false;
  if (promotion.startsAt > now) return false;
  if (promotion.endsAt && promotion.endsAt <= now) return false;
  return true;
}

/** Highest priority wins; ties go to the deeper discount. Never stacks. */
export function selectPromotion(candidates: Promotion[]): Promotion | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => {
    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best;
    }
    return candidate.discountValue > best.discountValue ? candidate : best;
  });
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: Promotion[] } | null = null;

/** Tiny table, read on every product request. 60s of staleness is acceptable. */
export async function getActivePromotions(
  now: Date = new Date()
): Promise<Promotion[]> {
  if (cache && now.getTime() - cache.at < CACHE_TTL_MS) return cache.rows;

  const rows = await db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.isEnabled, true),
        lte(promotions.startsAt, now),
        or(isNull(promotions.endsAt), gt(promotions.endsAt, now))
      )
    );

  cache = { at: now.getTime(), rows };
  return rows;
}

/** Admin writes call this so an enable takes effect without a 60s wait. */
export function invalidateActivePromotions(): void {
  cache = null;
}
