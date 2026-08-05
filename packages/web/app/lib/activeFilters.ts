/**
 * Which filters are on, as chips and as a number (#453).
 *
 * ONE derivation, from FACET_GROUPS. There were three hand-written versions of
 * this before — the route's badge sum, the drawer's badge sum, and the chip
 * builder — and they disagreed: the sums knew about eight fields while the
 * rail had grown to ten groups, so filtering by Vibe, Aesthetic, Medium,
 * Uniqueness, Availability or Featured left the badge at zero. The badge gates
 * the whole chip row, so the grid narrowed with nothing on screen saying why.
 *
 * Adding a facet group to @chobii/shared is now the whole change: the chips,
 * the badge and their tests follow it.
 */

import { FACET_GROUPS } from '@chobii/shared'
import type { FilterState } from '~/components/product/ProductFilters'

/** The key a chip removes — a facet group, one of the booleans, or price. */
export type ActiveFilterKey = keyof FilterState | 'price'

export interface ActiveFilterTag {
  key: ActiveFilterKey
  /** The value to drop from that key; multi-valued groups need it. */
  value: string
  label: string
}

/** `minimalist-art` reads as `minimalist art`, the way the chips always have. */
const spaced = (id: string) => id.replace(/-/g, ' ')

const money = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

function priceLabel(min?: number, max?: number): string | null {
  if (min !== undefined && max !== undefined) {
    return `${money(min)} – ${money(max)}`
  }
  if (min !== undefined) return `Over ${money(min)}`
  if (max !== undefined) return `Under ${money(max)}`
  return null
}

export function buildActiveFilterTags(filters: FilterState): ActiveFilterTag[] {
  const tags: ActiveFilterTag[] = []

  for (const group of FACET_GROUPS) {
    const raw = filters[group.key as keyof FilterState]

    if (group.multi) {
      for (const value of (raw as string[] | undefined) ?? []) {
        tags.push({ key: group.key as ActiveFilterKey, value, label: spaced(value) })
      }
      continue
    }

    if (typeof raw === 'string' && raw) {
      tags.push({ key: group.key as ActiveFilterKey, value: raw, label: spaced(raw) })
    }
  }

  // Price is not a facet group — no vocabulary, two bounds, one filter. The
  // old sum counted the bounds separately, so a range read as two.
  const price = priceLabel(filters.priceMin, filters.priceMax)
  if (price) tags.push({ key: 'price', value: 'price', label: price })

  /**
   * The booleans are URL-only since the rail was rebuilt from FACET_GROUPS
   * (#415). `=== true` rather than `!== undefined`: the URL can carry an
   * explicit false, and a chip reading "Featured" for `isFeatured=false` would
   * be a lie.
   */
  if (filters.isAiGenerated === true) {
    tags.push({ key: 'isAiGenerated', value: 'true', label: 'AI Generated' })
  }
  if (filters.isFeatured === true) {
    tags.push({ key: 'isFeatured', value: 'true', label: 'Featured' })
  }

  return tags
}

/**
 * How many filters are on — for the mobile badge, and for whatever decides
 * the chip row is worth rendering.
 *
 * Defined as the number of chips on purpose: a badge that says 3 above two
 * chips is the bug this file exists to end.
 */
export function countActiveFilters(filters: FilterState): number {
  return buildActiveFilterTags(filters).length
}
