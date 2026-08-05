/**
 * The collections the storefront ships with.
 *
 * WHY THESE FOURTEEN
 *
 * The Discover rail stops reading `STYLE_OPTIONS` in #469 and starts reading
 * the `collections` table. Without a seed, every chip vanishes the moment that
 * lands — so the twelve style collections exist to make the storefront change
 * not also a content change. They reproduce today's rail exactly, in link form.
 *
 * The other two are the reason the feature exists at all. Measured on mesonart
 * 2026-08-05, their rail carries `Latest Work` -> `/collections/new` and
 * `Bestseller` -> `/collections/best-selling`. Those are a date window and a
 * sort. No facet vocabulary can name them, which is precisely why a collection
 * had to stop being a facet id.
 *
 * DERIVED, NOT RETYPED. The twelve come from the vocabulary in
 * `@chobii/shared`. A hardcoded copy here restarts the drift #395 ended, and
 * `seed-facets.ts` carries the same warning for the same reason.
 *
 * IDEMPOTENT ON SLUG. Re-running must not duplicate rows, and must not undo an
 * admin's edits — once somebody has retitled a collection or given it an image,
 * the seed is no longer the authority on that row.
 */

import { sql } from "drizzle-orm";
import { STYLE_OPTIONS } from "@chobii/shared";
import { db } from "./index";
import { collections, type NewCollection } from "./schema/collections";

/**
 * Rows the seed would insert, as data.
 *
 * Split out from the insert so it can be asserted without a database — the
 * same split `seed-facets.ts` uses, and what lets the rule validity test run
 * in CI.
 */
export function buildSeedCollections(): NewCollection[] {
  const styleCollections: NewCollection[] = STYLE_OPTIONS.map(
    (style, index) => ({
      slug: style.id,
      title: style.label,
      description: `${style.label} on museum-grade paper and framed canvas, printed to order.`,
      kind: "rule" as const,
      rule: { styles: [style.id] },
      isActive: true,
      showInDiscover: true,
      discoverOrder: index,
      sortOrder: index,
    })
  );

  /**
   * The sort-only pair, placed after the styles rather than interleaved.
   *
   * Their rules carry NO facets. That is not an omission — an empty facet set
   * with a sort is exactly what "everything, newest first" means, and it is
   * the shape a facet id cannot hold.
   */
  const merchandising: NewCollection[] = [
    {
      slug: "new",
      title: "Latest Work",
      subtitle: "Just added",
      description: "The newest additions to the catalogue.",
      kind: "rule" as const,
      rule: { sortBy: "createdAt", sortOrder: "desc" },
      isActive: true,
      showInDiscover: true,
      discoverOrder: STYLE_OPTIONS.length,
      sortOrder: STYLE_OPTIONS.length,
    },
    {
      slug: "best-selling",
      title: "Best Sellers",
      subtitle: "What collectors are buying",
      description:
        "Ranked by units actually sold on settled orders, not by editorial pick.",
      kind: "rule" as const,
      rule: { sortBy: "salesCount", sortOrder: "desc" },
      isActive: true,
      showInDiscover: true,
      discoverOrder: STYLE_OPTIONS.length + 1,
      sortOrder: STYLE_OPTIONS.length + 1,
    },
  ];

  return [...styleCollections, ...merchandising];
}

/**
 * Insert the seed collections, leaving any that already exist untouched.
 *
 * `DO NOTHING` rather than `DO UPDATE`: an admin who retitles a collection or
 * gives it an image owns that row from then on, and a reseed that overwrote
 * their work would be a data-loss bug wearing a maintenance script's clothes.
 * The consequence is that changing a title in THIS file will not move an
 * existing database — change it in the admin, or delete the row first.
 */
export async function seedCollections(): Promise<number> {
  const rows = buildSeedCollections();

  const inserted = await db
    .insert(collections)
    .values(rows)
    .onConflictDoNothing({ target: collections.slug })
    .returning({ slug: collections.slug });

  console.log(
    `Collections seeded. ${inserted.length} inserted, ${
      rows.length - inserted.length
    } already present.`
  );

  return inserted.length;
}

/** Row count, for the seed script's summary. */
export async function countCollections(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(collections);
  return row?.count ?? 0;
}
