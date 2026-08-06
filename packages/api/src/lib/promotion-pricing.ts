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

import type { PromotionScopeFilter, ResolvedSalePrice } from "@chobii/shared";
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../database";
import {
  promotionExclusions,
  promotionProducts,
  promotions,
} from "../database/schema/promotions";

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

/**
 * The membership rows behind the two scope decisions, in one query each.
 *
 * Every surface that prices a page needs the same two sets, so they are loaded
 * once per request and handed to `resolveSalePrice` for each line rather than
 * re-queried per product.
 *
 * The sets are flat across the active promotions rather than keyed by promotion
 * id. Promotions never stack, so overlap is already an admin mistake; flattening
 * makes an exclusion on any active promotion suppress the product everywhere,
 * which is the safe direction to be wrong in — a product never sells at a
 * discount it was excluded from.
 */
export async function loadPromotionProductSets(
  activePromotions: Promotion[]
): Promise<{ includedIds: Set<string>; excludedIds: Set<string> }> {
  const promotionIds = activePromotions.map((promotion) => promotion.id);
  if (promotionIds.length === 0) {
    return { includedIds: new Set(), excludedIds: new Set() };
  }

  const [included, excluded] = await Promise.all([
    db
      .select({ productId: promotionProducts.productId })
      .from(promotionProducts)
      .where(inArray(promotionProducts.promotionId, promotionIds)),
    db
      .select({ productId: promotionExclusions.productId })
      .from(promotionExclusions)
      .where(inArray(promotionExclusions.promotionId, promotionIds)),
  ]);

  return {
    includedIds: new Set(included.map((row) => row.productId)),
    excludedIds: new Set(excluded.map((row) => row.productId)),
  };
}

/**
 * A product, as little of it as pricing needs.
 *
 * Both facet shapes are accepted: catalogue rows carry `styles`/`subjects`/
 * `rooms` as `text[]`, while lighter projections sometimes carry the singular
 * scalar. Reading only one shape would make the `filter` scope match nothing in
 * production while every unit test passed.
 */
type PricedProduct = {
  id: string;
  basePrice: string;
  style?: string | null;
  styles?: string[] | null;
  subject?: string | null;
  subjects?: string[] | null;
  room?: string | null;
  rooms?: string[] | null;
  isFeatured?: boolean | null;
};

type ResolveContext = {
  isMember: boolean;
  /** Product ids excluded from the promotion. An exclusion beats every scope. */
  excludedIds?: Set<string>;
  /** Product ids pinned to a scopeType='products' promotion. */
  includedIds?: Set<string>;
};

/** The values a product holds on one facet axis, whichever shape it arrived in. */
function facetValues(
  scalar: string | null | undefined,
  list: string[] | null | undefined
): string[] {
  if (list && list.length > 0) return list;
  return scalar ? [scalar] : [];
}

/** True when the filter names this axis and the product holds none of its values. */
function missesAxis(
  wanted: string[] | undefined,
  held: string[]
): boolean {
  if (!wanted || wanted.length === 0) return false;
  return !wanted.some((value) => held.includes(value));
}

function matchesScope(
  product: PricedProduct,
  promotion: Promotion,
  ctx: ResolveContext
): boolean {
  if (promotion.scopeType === "all") return true;
  if (promotion.scopeType === "products") {
    return ctx.includedIds?.has(product.id) ?? false;
  }

  const filter = (promotion.scopeFilter ?? {}) as PromotionScopeFilter;
  if (missesAxis(filter.styles, facetValues(product.style, product.styles))) {
    return false;
  }
  if (
    missesAxis(filter.subjects, facetValues(product.subject, product.subjects))
  ) {
    return false;
  }
  if (missesAxis(filter.rooms, facetValues(product.room, product.rooms))) {
    return false;
  }
  if (
    filter.isFeatured !== undefined &&
    Boolean(product.isFeatured) !== filter.isFeatured
  ) {
    return false;
  }
  // An empty filter would price the whole catalogue through a 'filter' scope.
  // That is what scopeType 'all' is for, so treat it as no match.
  return Object.keys(filter).length > 0;
}

/** Half-up to 2dp. Applied per line — rounding a cart subtotal stops the lines reconciling. */
function toMoney(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * The one place a sale price is computed.
 *
 * Returns null when the product is not on sale at all. A non-member looking at
 * a members-only sale gets a row with `locked: true`: the price is shown, and
 * base is what gets charged.
 */
export function resolveSalePrice(
  product: PricedProduct,
  activePromotions: Promotion[],
  ctx: ResolveContext
): ResolvedSalePrice | null {
  if (ctx.excludedIds?.has(product.id)) return null;

  const eligible = activePromotions.filter((promotion) =>
    matchesScope(product, promotion, ctx)
  );
  const promotion = selectPromotion(eligible);
  if (!promotion) return null;

  const base = parseFloat(product.basePrice) || 0;
  const off =
    promotion.discountType === "percentage"
      ? base * (promotion.discountValue / 100)
      : promotion.discountValue / 100;
  const salePrice = toMoney(Math.max(0, base - off));

  // A discount too small to move the line is not a sale. Bailing here also
  // keeps the percentOff division below away from a zero base price.
  if (salePrice === toMoney(base)) return null;

  return {
    promotionId: promotion.id,
    headline: promotion.headline,
    percentOff:
      promotion.discountType === "percentage"
        ? promotion.discountValue
        : Math.round((off / base) * 100),
    basePrice: toMoney(base),
    salePrice,
    // A sale price the viewer cannot have yet: shown, but base is charged.
    locked: promotion.membersOnly && !ctx.isMember,
  };
}
