/**
 * Which artwork stands in for a collection that has no image of its own.
 *
 * #410 established the rule: a chip borrows the main image of a representative
 * product rather than waiting on curated photography that does not exist. #406
 * established the mechanism, and the constraint that makes it non-trivial —
 * **each product may stand for at most one chip.**
 *
 * Without that constraint the rail shows the same picture two or three times,
 * because a product carries several facet values and every collection it
 * qualifies for picks its best candidate independently.
 *
 * The assignment is pure and separate from the query, so it can be asserted
 * without a database. It is also where a plausible implementation goes subtly
 * wrong: greedy assignment in arrival order starves whichever collection has
 * the least to choose from.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../database";
import { products } from "../database/schema/products";
import { collectionProducts, type Collection } from "../database/schema/collections";
import {
  IMPOSSIBLE,
  buildProductConditions,
  mergeCollectionFilters,
  type CollectionRuleShape,
} from "./collection-resolver";

/**
 * How deep a shortlist each collection gets.
 *
 * Depth has to scale with the number of collections competing, not sit at a
 * constant. A collection can lose at most `cohort - 1` candidates to the ones
 * that pick before it, so a shortlist of `cohort` guarantees a free pick to
 * any collection that has that many products at all.
 *
 * A fixed 5 — inherited from #406, where twelve style chips drew on ~40
 * products — produced the failure this function exists to prevent: `new` and
 * `best-selling` both resolve to the entire catalogue, so their shortlists
 * were identical to each other AND overlapped every style collection's. Both
 * ran out and fell back to a product `bohemian-art` had already taken, and the
 * live rail served three chips with one picture.
 *
 * The floor keeps the query sane for a rail of one or two.
 */
export const MIN_CANDIDATES_PER_COLLECTION = 5;

export function candidateDepth(cohortSize: number): number {
  return Math.max(MIN_CANDIDATES_PER_COLLECTION, cohortSize);
}

/**
 * Orientations in the order a collection should borrow them, best first.
 *
 * Every surface that borrows one of these images crops it: the Discover chips
 * cut a circle out of it, the home page's Shop By Popular tiles cut a 7:4
 * rectangle. Both windows are at least as wide as they are tall, and product
 * artwork is matted at a fixed fraction of its LONGEST side — so how much of
 * the picture survives the crop is decided almost entirely by its proportion.
 *
 * Measured on the dev catalogue, cropping a 7:4 tile out of the 1500px master:
 * a landscape piece keeps a 1148px-wide window of the artwork, a square one
 * 1148, a panoramic one 1030, and a portrait one as little as 599 — below the
 * tile's own 636 device pixels, so it is the only class that has to be
 * enlarged rather than reduced, and it is the only class that looks soft.
 * Circles rank the same way for the same reason, minus panoramic.
 *
 * `set-of-2-3` is last and it is not about proportion: those photographs show
 * two panels with wall between them. Any centred crop either straddles the
 * gutter — one tile reading as two half-pictures butted together, which is
 * what lost #531's first blind A/B — or lands in the wall. A picture that
 * stands for a whole collection has to be ONE picture.
 *
 * This orders the shortlist only. It never overrides a curator: manual
 * collections keep their authored `position` order, and `featuredOrder` still
 * decides between two candidates of the same shape.
 */
export const REPRESENTATIVE_ORIENTATION_ORDER = [
  "landscape",
  "square",
  "panoramic",
  "portrait",
] as const;

/** Lower sorts first. Anything unranked — `round`, `set-of-2-3` — sorts last. */
export function representativeOrientationRank(
  orientation: string | null | undefined
): number {
  const index = REPRESENTATIVE_ORIENTATION_ORDER.indexOf(
    orientation as (typeof REPRESENTATIVE_ORIENTATION_ORDER)[number]
  );
  return index === -1 ? REPRESENTATIVE_ORIENTATION_ORDER.length : index;
}

/** The same ranking as a SQL `case`, built from the one list above. */
const orientationRankSql = sql<number>`case ${products.orientation}::text ${sql.join(
  REPRESENTATIVE_ORIENTATION_ORDER.map(
    (orientation, rank) => sql`when ${orientation} then ${rank}`
  ),
  sql` `
)} else ${REPRESENTATIVE_ORIENTATION_ORDER.length} end`;

export interface Representative {
  productId: string;
  image: string | null;
  /**
   * The orientation of the product the image came from, carried alongside it
   * so the two can never describe different products.
   *
   * The chip needs it: `main` images are matted at a fixed fraction of the
   * LONGEST side, so how much mat sits along the short side depends entirely
   * on the aspect. A panoramic representative needs a far deeper crop than a
   * square one to keep white out of the circle.
   */
  orientation: string | null;
}

/**
 * Hand each collection one product, and no product to two collections.
 *
 * Scarcest collection first. A collection with two eligible products has
 * almost no choice, so letting one with forty pick ahead of it is exactly how
 * the scarce one ends up with nothing left and falls back to a duplicate.
 *
 * Ties break on the collection id, so the rail is deterministic — a chip that
 * changes picture between two identical requests reads as a bug even when both
 * pictures are valid.
 */
export function assignRepresentatives(
  candidates: Map<string, Representative[]>,
  totals: Map<string, number>
): Map<string, Representative> {
  const claimed = new Set<string>();
  const chosen = new Map<string, Representative>();

  const ids = [...candidates.keys()].sort((a, b) => {
    const byScarcity = (totals.get(a) ?? 0) - (totals.get(b) ?? 0);
    return byScarcity !== 0 ? byScarcity : a.localeCompare(b);
  });

  for (const id of ids) {
    const shortlist = candidates.get(id) ?? [];
    const free = shortlist.find((row) => !claimed.has(row.productId));

    /**
     * Every candidate already taken — only possible when a collection's whole
     * shortlist is shared with collections that picked first. Reuse the top
     * candidate rather than dropping the chip: a duplicate picture is a
     * smaller failure than a collection missing from the rail.
     */
    const pick = free ?? shortlist[0];
    if (!pick) continue;

    claimed.add(pick.productId);
    chosen.set(id, pick);
  }

  return chosen;
}

/**
 * The main image url, preferring the element explicitly typed `main` and
 * falling back to element 0 — which the ProductImage contract documents as the
 * main image after sorting.
 */
const mainImageSql = sql<string | null>`coalesce(
  (
    select element ->> 'url'
    from jsonb_array_elements(${products.images}) as element
    where element ->> 'type' = 'main'
    limit 1
  ),
  ${products.images} -> 0 ->> 'url'
)`;

/**
 * A shortlist of eligible products for one collection, best first.
 *
 * "Best" is first about the SHAPE of the artwork and only then about
 * merchandising — see REPRESENTATIVE_ORIENTATION_ORDER. Curator-featured ahead
 * of everything, then newest, still decides between two candidates that crop
 * equally well, which is what it was really doing before.
 *
 * Ordering by the collection's OWN sort would be wrong here — Best Sellers
 * would then illustrate itself with whatever sold most, which is a reasonable
 * picture but makes the rail's imagery churn with the sales figures.
 *
 * A manual collection is exempt: someone put those products in that order by
 * hand, and a measured proportion does not get to overrule them.
 */
async function shortlistFor(
  collection: Collection,
  depth: number
): Promise<Representative[]> {
  if (collection.kind === "manual") {
    const rows = await db
      .select({
        productId: products.id,
        image: mainImageSql,
        orientation: products.orientation,
      })
      .from(collectionProducts)
      .innerJoin(products, eq(products.id, collectionProducts.productId))
      .where(
        and(
          eq(collectionProducts.collectionId, collection.id),
          eq(products.status, "active")
        )
      )
      .orderBy(collectionProducts.position)
      .limit(depth);

    return rows.map((row) => ({
      productId: row.productId,
      image: row.image ?? null,
      orientation: row.orientation ?? null,
    }));
  }

  const filters = mergeCollectionFilters(
    collection.rule as CollectionRuleShape | null,
    {}
  );
  if (filters === IMPOSSIBLE) return [];

  const rows = await db
    .select({
      productId: products.id,
      image: mainImageSql,
      orientation: products.orientation,
    })
    .from(products)
    .where(and(...buildProductConditions(filters)))
    .orderBy(
      orientationRankSql,
      sql`${products.featuredOrder} asc nulls last`,
      sql`${products.createdAt} desc`
    )
    .limit(depth);

  return rows.map((row) => ({
    productId: row.productId,
    image: row.image ?? null,
    orientation: row.orientation ?? null,
  }));
}

/**
 * Representative artwork for every collection that needs one.
 *
 * Collections carrying their own `imageUrl` are skipped: the admin already
 * answered the question, and querying for an answer we will not use is work
 * for nothing.
 */
export async function representativesFor(
  collections: Collection[],
  totals: Map<string, number>
): Promise<Map<string, Representative>> {
  const needing = collections.filter((collection) => !collection.imageUrl);
  if (needing.length === 0) return new Map();

  const depth = candidateDepth(needing.length);

  const candidates = new Map<string, Representative[]>();
  for (const collection of needing) {
    candidates.set(collection.id, await shortlistFor(collection, depth));
  }

  return assignRepresentatives(candidates, totals);
}

/** Exported for the detail endpoint, which needs one product's image directly. */
export async function mainImagesByProductId(
  productIds: string[]
): Promise<Map<string, string | null>> {
  if (productIds.length === 0) return new Map();

  const rows = await db
    .select({ id: products.id, image: mainImageSql })
    .from(products)
    .where(inArray(products.id, productIds));

  return new Map(rows.map((row) => [row.id, row.image ?? null]));
}
