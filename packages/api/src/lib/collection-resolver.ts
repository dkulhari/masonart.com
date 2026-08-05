/**
 * Turning a collection into the product query behind it.
 *
 * Everything downstream — the detail endpoint, the chip counts, the sitemap —
 * asks this module rather than branching on `kind` itself. One place that
 * knows the difference between a rule and a hand-picked list is the whole
 * point; two places is how they drift.
 *
 * ## The intersection rule
 *
 * Facets on a collection page **refine the collection**. They are not a fresh
 * query against the catalogue. So every group the rule and the shopper both
 * name is intersected, never unioned:
 *
 *   rule    styles = [pop-art]
 *   shopper styles = [ukiyo-e-art]
 *   result  IMPOSSIBLE — not [pop-art, ukiyo-e-art]
 *
 * Getting this wrong in the union direction is not a subtle bug: a shopper on
 * a Pop Art collection ticks a second style and is shown work the collection
 * does not contain, under the collection's own heading.
 *
 * ## Why IMPOSSIBLE is a value and not an error
 *
 * A shopper CAN legitimately narrow a collection down to nothing, and the
 * honest answer is an empty grid. Returning "no filters" instead would show
 * the whole catalogue — the failure mode where a shopper believes they are
 * looking at a filtered list and is not (#452 was the same shape: a category
 * tile linking at a value nothing carried, landing on an unfiltered grid).
 *
 * Callers check for the sentinel and short-circuit to an empty page rather
 * than issuing a query whose answer is known.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../database";
import {
  collections,
  collectionProducts,
  type Collection,
} from "../database/schema/collections";
import { products } from "../database/schema/products";

// ============================================================================
// Types
// ============================================================================

/** Multi-valued facet groups — `text[]` columns, intersected element-wise. */
const MULTI_FACETS = [
  "styles",
  "subjects",
  "colors",
  "rooms",
  "vibe",
  "aesthetic",
  "medium",
] as const;

/** Single-valued facets — scalar columns. Two different values cannot both hold. */
const SCALAR_FACETS = ["orientation", "uniqueness", "availability"] as const;

/** Boolean flags. Same logic as the scalars; separated only for readability. */
const FLAG_FACETS = ["isAiGenerated", "isFeatured"] as const;

export type MultiFacet = (typeof MULTI_FACETS)[number];
export type ScalarFacet = (typeof SCALAR_FACETS)[number];
export type FlagFacet = (typeof FLAG_FACETS)[number];

export interface CollectionFilters {
  styles?: string[];
  subjects?: string[];
  colors?: string[];
  rooms?: string[];
  vibe?: string[];
  aesthetic?: string[];
  medium?: string[];
  orientation?: string;
  uniqueness?: string;
  availability?: string;
  isAiGenerated?: boolean;
  isFeatured?: boolean;
  priceMin?: number;
  priceMax?: number;
}

/** The rule as stored, which is the filter set plus a default sort. */
export interface CollectionRuleShape extends CollectionFilters {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CollectionSort {
  sortBy: string;
  sortOrder: "asc" | "desc";
}

/**
 * No product can satisfy both the collection and the shopper.
 *
 * A distinct sentinel object rather than `null`, so `merged === IMPOSSIBLE`
 * cannot be confused with "nothing to merge" at a call site.
 */
export const IMPOSSIBLE = Symbol("collection-filters-impossible");
export type ImpossibleFilters = typeof IMPOSSIBLE;

/** The platform default, matching `listProductsQuerySchema` in routes/products.ts. */
export const DEFAULT_SORT: CollectionSort = {
  sortBy: "createdAt",
  sortOrder: "desc",
};

// ============================================================================
// Merge
// ============================================================================

/**
 * Intersect a collection's stored rule with the shopper's facets.
 *
 * Returns the merged filter set, or `IMPOSSIBLE` when the two cannot both be
 * satisfied. Sort is NOT part of the result — a sort constrains nothing, and
 * folding it in here would let a sort-only collection (Latest Work, Best
 * Sellers) look like it carried a facet. Use `resolveCollectionSort`.
 */
export function mergeCollectionFilters(
  rule: CollectionRuleShape | null | undefined,
  shopper: CollectionFilters | null | undefined
): CollectionFilters | ImpossibleFilters {
  const base = rule ?? {};
  const asked = shopper ?? {};
  const merged: CollectionFilters = {};

  for (const facet of MULTI_FACETS) {
    const fromRule = base[facet];
    const fromShopper = asked[facet];

    if (!fromRule?.length) {
      if (fromShopper?.length) merged[facet] = [...fromShopper];
      continue;
    }
    if (!fromShopper?.length) {
      merged[facet] = [...fromRule];
      continue;
    }

    // Both constrain this group. Order follows the shopper's list, so the
    // chips they ticked read back in the order they ticked them.
    const overlap = fromShopper.filter((value) => fromRule.includes(value));
    if (overlap.length === 0) return IMPOSSIBLE;
    merged[facet] = overlap;
  }

  for (const facet of SCALAR_FACETS) {
    const fromRule = base[facet];
    const fromShopper = asked[facet];
    if (fromRule !== undefined && fromShopper !== undefined) {
      if (fromRule !== fromShopper) return IMPOSSIBLE;
      merged[facet] = fromRule;
    } else if (fromRule !== undefined) {
      merged[facet] = fromRule;
    } else if (fromShopper !== undefined) {
      merged[facet] = fromShopper;
    }
  }

  for (const facet of FLAG_FACETS) {
    const fromRule = base[facet];
    const fromShopper = asked[facet];
    if (fromRule !== undefined && fromShopper !== undefined) {
      if (fromRule !== fromShopper) return IMPOSSIBLE;
      merged[facet] = fromRule;
    } else if (fromRule !== undefined) {
      merged[facet] = fromRule;
    } else if (fromShopper !== undefined) {
      merged[facet] = fromShopper;
    }
  }

  // Price: the tighter bound from each side wins, and an inverted range is
  // the same empty answer as a disjoint facet set.
  const priceMin = maxDefined(base.priceMin, asked.priceMin);
  const priceMax = minDefined(base.priceMax, asked.priceMax);
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    return IMPOSSIBLE;
  }
  if (priceMin !== undefined) merged.priceMin = priceMin;
  if (priceMax !== undefined) merged.priceMax = priceMax;

  return merged;
}

const maxDefined = (a?: number, b?: number) =>
  a === undefined ? b : b === undefined ? a : Math.max(a, b);

const minDefined = (a?: number, b?: number) =>
  a === undefined ? b : b === undefined ? a : Math.min(a, b);

/**
 * Which sort applies: the shopper's if they chose one, else the collection's,
 * else the platform default.
 *
 * The middle case is what makes Best Sellers work at all — the collection IS
 * a sort, so arriving there has to apply it without anyone touching the
 * dropdown.
 */
export function resolveCollectionSort(
  rule: CollectionRuleShape | null | undefined,
  shopper: Partial<CollectionSort> | null | undefined
): CollectionSort {
  return {
    sortBy: shopper?.sortBy ?? rule?.sortBy ?? DEFAULT_SORT.sortBy,
    sortOrder: shopper?.sortOrder ?? rule?.sortOrder ?? DEFAULT_SORT.sortOrder,
  };
}

// ============================================================================
// Manual membership
// ============================================================================

/**
 * A manual collection's product ids, in the order the admin put them.
 *
 * Position, not id, is the ordering — see the column comment on
 * `collection_products`.
 */
export async function resolveManualMembers(
  collectionId: string
): Promise<string[]> {
  const rows = await db
    .select({ productId: collectionProducts.productId })
    .from(collectionProducts)
    .where(eq(collectionProducts.collectionId, collectionId))
    .orderBy(asc(collectionProducts.position));

  return rows.map((row) => row.productId);
}

// ============================================================================
// Counting
// ============================================================================

/**
 * SQL conditions for a merged filter set, over active products only.
 *
 * Mirrors the condition building in `routes/products.ts`. The array facets use
 * the same parameterised `&& ARRAY[...]` form documented there: passing the JS
 * array as one bind and casting it does NOT work, because postgres.js sends it
 * as a scalar and the server answers "malformed array literal".
 */
export function buildProductConditions(filters: CollectionFilters) {
  const conditions = [eq(products.status, "active")];

  const overlap = (
    column:
      | typeof products.styles
      | typeof products.subjects
      | typeof products.colors
      | typeof products.rooms
      | typeof products.vibe
      | typeof products.aesthetic
      | typeof products.medium,
    values: string[] | undefined
  ) => {
    if (!values?.length) return;
    const elements = sql.join(
      values.map((value) => sql`${value}`),
      sql`, `
    );
    conditions.push(sql`${column} && ARRAY[${elements}]::text[]` as never);
  };

  overlap(products.styles, filters.styles);
  overlap(products.subjects, filters.subjects);
  overlap(products.colors, filters.colors);
  overlap(products.rooms, filters.rooms);
  overlap(products.vibe, filters.vibe);
  overlap(products.aesthetic, filters.aesthetic);
  overlap(products.medium, filters.medium);

  if (filters.orientation) {
    conditions.push(
      eq(
        products.orientation,
        filters.orientation as typeof products.orientation.enumValues[number]
      )
    );
  }
  if (filters.uniqueness) {
    conditions.push(eq(products.uniqueness, filters.uniqueness) as never);
  }
  if (filters.availability) {
    conditions.push(eq(products.availability, filters.availability) as never);
  }
  if (filters.isFeatured !== undefined) {
    conditions.push(eq(products.isFeatured, filters.isFeatured) as never);
  }
  if (filters.isAiGenerated !== undefined) {
    conditions.push(eq(products.isAiGenerated, filters.isAiGenerated) as never);
  }
  if (filters.priceMin !== undefined) {
    conditions.push(
      sql`${products.basePrice}::numeric >= ${filters.priceMin}` as never
    );
  }
  if (filters.priceMax !== undefined) {
    conditions.push(
      sql`${products.basePrice}::numeric <= ${filters.priceMax}` as never
    );
  }

  return conditions;
}

/**
 * How many products a collection currently resolves to.
 *
 * Counts active products only, the same way the list endpoint does, so a chip's
 * number and the grid below it agree. A manual collection counts its members
 * that are still active — a member archived after curation is not a product the
 * shopper can buy, and counting it would promise a row that never renders.
 */
export async function countCollection(collection: Collection): Promise<number> {
  if (collection.kind === "manual") {
    const memberIds = await resolveManualMembers(collection.id);
    if (memberIds.length === 0) return 0;

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(and(eq(products.status, "active"), inArray(products.id, memberIds)));

    return row?.total ?? 0;
  }

  const filters = mergeCollectionFilters(
    collection.rule as CollectionRuleShape | null,
    {}
  );
  if (filters === IMPOSSIBLE) return 0;

  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...buildProductConditions(filters)));

  return row?.total ?? 0;
}

// ============================================================================
// Lookup
// ============================================================================

/** An active collection by slug, or null. Inactive slugs are not reachable. */
export async function findActiveCollectionBySlug(
  slug: string
): Promise<Collection | null> {
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.isActive, true)))
    .limit(1);

  return row ?? null;
}

/** Collections in the Discover rail, in the order the admin chose. */
export async function listDiscoverCollections(): Promise<Collection[]> {
  return db
    .select()
    .from(collections)
    .where(
      and(eq(collections.isActive, true), eq(collections.showInDiscover, true))
    )
    .orderBy(asc(collections.discoverOrder), asc(collections.sortOrder));
}
