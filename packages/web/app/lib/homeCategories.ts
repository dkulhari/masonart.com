/**
 * The home page's category tiles (#452).
 *
 * These used to be four loose slugs — `abstract`, `nature`, `minimalist`,
 * `typography` — linked as `?styles=<slug>`. Not one of them was a style id
 * after the facet rework: styles are `minimalist-art`, `pop-art`, …,
 * `abstract` is a SUBJECT, and `nature`/`typography` were nowhere at all. So
 * four of the most-clicked links on the site landed on a collection that
 * could not filter by the thing the tile promised, and nothing failed.
 *
 * Two rules follow, and both are enforced by tests rather than by care:
 *
 *  1. **A tile names a value the shared vocabulary knows.** It carries the
 *     group as well as the id, because `abstract` filters as a subject and
 *     `minimalist-art` as a style — one `?styles=` for everything is what
 *     broke it.
 *  2. **A tile only shows if artwork carries its value.** The definitions
 *     stay whatever the catalogue looks like — they are what new art gets
 *     filed under — but a category nothing is filed under is not a door worth
 *     opening.
 */

export type CategoryGroup = 'styles' | 'subjects'

export interface CategoryTile {
  name: string
  /** Which facet parameter this tile filters by. */
  group: CategoryGroup
  /** A value from that group's vocabulary in @chobii/shared. */
  id: string
  description: string
  image: string
  /** Tailwind gradient classes — the tile's colour identity. */
  color: string
}

/** What `/api/products/facets` returns, narrowed to what a tile needs. */
export interface FacetCounts {
  styles: Array<{ value: string; count: number }>
  subjects: Array<{ value: string; count: number }>
}

export const CATEGORY_TILES: readonly CategoryTile[] = [
  {
    name: 'Abstract',
    // A subject, not a style — `?styles=abstract` is rejected by the API.
    group: 'subjects',
    id: 'abstract',
    description: 'Bold, expressive art pieces',
    image: '/images/categories/abstract.jpg',
    color: 'from-purple-600/70 to-pink-600/70',
  },
  {
    name: 'Nature',
    // There is no `nature` in either vocabulary. Landscape is the honest
    // mapping, and it is what the tile's own photograph shows.
    group: 'subjects',
    id: 'landscape',
    description: 'Serene landscapes & botanicals',
    image: '/images/categories/nature.jpg',
    color: 'from-green-600/70 to-teal-600/70',
  },
  {
    name: 'Minimalist',
    group: 'styles',
    id: 'minimalist-art',
    description: 'Clean lines, simple beauty',
    // Deeper than the original gray-600/slate-600: a desaturated wash over a
    // deliberately light minimalist photo left white text with almost nothing
    // to sit against (#357).
    color: 'from-slate-700/80 to-slate-900/70',
    image: '/images/categories/minimalist.jpg',
  },
  {
    name: 'Typography',
    // `typography` is a subject we added for this tile (#452). Nothing in the
    // catalogue carries it yet, so the tile stays hidden — kept here so new
    // art has something to be filed under.
    group: 'subjects',
    id: 'typography',
    description: 'Words that inspire',
    image: '/images/categories/typography.jpg',
    color: 'from-amber-600/70 to-orange-600/70',
  },
]

/** Where a tile goes — the group decides the parameter. */
export function categoryHref(tile: CategoryTile): string {
  return `/posters?${tile.group}=${tile.id}`
}

/**
 * The tiles worth showing: the ones some active product actually carries.
 *
 * No counts at all means the facets call failed. Showing everything would be
 * guessing, and a guess here is exactly the dead tile this ticket is about —
 * so the section renders nothing rather than something that may lead nowhere.
 */
export function visibleCategories(
  counts: FacetCounts | undefined
): CategoryTile[] {
  if (!counts) return []

  const has = (group: CategoryGroup, id: string) =>
    (counts[group] ?? []).some((row) => row.value === id && row.count > 0)

  // Defined order, not popularity: the row is a designed set of four, and
  // reshuffling it as the catalogue changes makes the home page restless.
  return CATEGORY_TILES.filter((tile) => has(tile.group, tile.id))
}
