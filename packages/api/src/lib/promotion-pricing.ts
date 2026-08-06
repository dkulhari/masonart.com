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
import { and, eq, gt, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../database";
import { products } from "../database/schema/products";
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
 * How long a response priced by these promotions may be cached.
 *
 * A promotion *write* can purge the caches it invalidates. A promotion
 * *ending* cannot. Active state is derived from the clock rather than written
 * (see `isPromotionActive`), which is what lets a sale stop on its own with no
 * job to run — and also means that at the instant it stops, nothing runs, so
 * there is no hook to purge from. A product body cached for its full 600s one
 * minute before the deadline goes on quoting the discount for nine minutes
 * after it.
 *
 * Clamping the entry to the soonest `endsAt` closes that by construction: the
 * cache cannot outlive the thing that made it right. It costs nothing while a
 * sale is far off and shortens TTLs only as one winds down, which is exactly
 * when short TTLs are worth paying for.
 *
 * Two edges:
 *
 * - A promotion with no `endsAt` runs open-ended and clamps nothing.
 * - The floor of one second covers the window where `getActivePromotions`
 *   still reports a promotion whose end has already passed — its own 60s memo
 *   can be that far behind. `setex` rejects a non-positive TTL, and one second
 *   of a body that is already wrong beats ten minutes of it.
 *
 * This does not cover a promotion that has not *started* yet: the resolver only
 * ever sees active rows, so a body cached now can still outlive a sale
 * scheduled to begin in a minute. Enabling that sale is an admin write and gets
 * purged; a start time reached on the clock does not.
 */
export function saleCacheTtl(
  activePromotions: Promotion[],
  ttlSeconds: number,
  now: Date = new Date()
): number {
  let ttl = ttlSeconds;

  for (const promotion of activePromotions) {
    if (!promotion.endsAt) continue;
    // Rounded down: an entry that expires a fraction early is invisible, one
    // that expires a fraction late is a wrong price.
    const remaining = Math.floor(
      (promotion.endsAt.getTime() - now.getTime()) / 1000
    );
    if (remaining < ttl) ttl = remaining;
  }

  return Math.max(1, ttl);
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

// ============================================================================
// The same rule, as SQL
// ============================================================================

/**
 * `matchesScope` and the exclusion rule, expressed against the products table.
 *
 * One caller needs it: `GET /api/products?onSale=true`, which feeds /sale.
 * That page is not pricing rows it already has — it is asking *which* rows the
 * running promotion applies to, and it pages.
 *
 * ## Why SQL rather than filtering the page after the fact
 *
 * The list query is `... limit pageSize offset n`. Dropping the off-sale rows
 * from the result afterwards returns short pages, an infinite scroll that
 * stops early, and a `total` counting products the sale never touched. The
 * predicate has to be inside the same `where` the count runs against.
 *
 * ## This function and `matchesScope` must agree
 *
 * They are two spellings of one rule, and the failure mode when they drift is
 * quiet: /sale lists a product whose card then prints the base price, or omits
 * one that is genuinely discounted. Every branch below mirrors a branch up
 * there deliberately, including the two that look like mistakes:
 *
 * - a `filter` scope with **no keys at all** matches nothing (that is what
 *   scopeType `all` is for), while one whose keys are all empty arrays matches
 *   everything — because `missesAxis` returns false for an empty wanted-list
 *   and the final `Object.keys(filter).length > 0` then passes it;
 * - `includedIds` is flat across the active promotions, exactly as the
 *   resolver reads it, so a product pinned to any of them satisfies a
 *   `products` scope.
 *
 * Change one, change both.
 */
export function promotionScopeCondition(
  activePromotions: Promotion[],
  sets: { includedIds: Set<string>; excludedIds: Set<string> }
): SQL {
  /** Nothing is on sale. Not "everything" — an absent sale sells nothing. */
  const NOTHING = sql`false`;

  if (activePromotions.length === 0) return NOTHING;

  const overlap = (
    column:
      | typeof products.styles
      | typeof products.subjects
      | typeof products.rooms,
    values: string[] | undefined
  ): SQL | null => {
    if (!values?.length) return null;
    /**
     * Each element binds as its own parameter. Passing the JS array as one
     * bind and casting it does NOT work — postgres.js sends it as a scalar
     * and the server answers "malformed array literal".
     */
    const elements = sql.join(
      values.map((value) => sql`${value}`),
      sql`, `
    );
    return sql`${column} && ARRAY[${elements}]::text[]`;
  };

  const scopeClauses: SQL[] = [];

  for (const promotion of activePromotions) {
    if (promotion.scopeType === "all") {
      scopeClauses.push(sql`true`);
      continue;
    }

    if (promotion.scopeType === "products") {
      const ids = [...sets.includedIds];
      // An empty pin list is a promotion that names no products, which is
      // `ctx.includedIds?.has(...)` answering false for every row.
      if (ids.length > 0) scopeClauses.push(sql`${inArray(products.id, ids)}`);
      continue;
    }

    const filter = (promotion.scopeFilter ?? {}) as PromotionScopeFilter;
    // See the note above: an empty filter is not the whole catalogue.
    if (Object.keys(filter).length === 0) continue;

    const axes: SQL[] = [];
    for (const clause of [
      overlap(products.styles, filter.styles),
      overlap(products.subjects, filter.subjects),
      overlap(products.rooms, filter.rooms),
    ]) {
      if (clause) axes.push(clause);
    }
    if (filter.isFeatured !== undefined) {
      // `Boolean(product.isFeatured)` on the resolver side — a null column is
      // false there, so coalesce rather than let NULL swallow the row.
      axes.push(
        sql`coalesce(${products.isFeatured}, false) = ${filter.isFeatured}`
      );
    }

    scopeClauses.push(
      axes.length > 0 ? sql`(${sql.join(axes, sql` and `)})` : sql`true`
    );
  }

  if (scopeClauses.length === 0) return NOTHING;

  const inScope = sql`(${sql.join(scopeClauses, sql` or `)})`;

  const excluded = [...sets.excludedIds];
  if (excluded.length === 0) return inScope;

  // An exclusion always wins, whatever the scope said.
  return sql`${inScope} and not (${inArray(products.id, excluded)})`;
}
