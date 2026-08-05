/**
 * Active filters — chips and badge, derived from one place (#453).
 *
 * The bug this replaces: `activeFilterCount` was a hand-written sum of eight
 * fields, and the rail had grown to ten facet groups. Filter by Vibe,
 * Aesthetic, Medium, Uniqueness, Availability or Featured and the count stayed
 * zero — which gated the entire chip row and the mobile badge, so the grid
 * narrowed with nothing on screen saying why.
 *
 * The fix is not "add the six missing fields". It is to derive both the chips
 * and the count from FACET_GROUPS, so the eleventh facet cannot fall out of a
 * list someone forgot to extend. These tests are written against the
 * vocabulary rather than against a fixed set of keys for the same reason: add
 * a group to @chobii/shared and the coverage follows it.
 */

import { describe, it, expect } from 'vitest'
import { FACET_GROUPS } from '@chobii/shared'
import {
  buildActiveFilterTags,
  countActiveFilters,
} from '~/lib/activeFilters'
import type { FilterState } from '~/components/product/ProductFilters'

const empty: FilterState = {
  styles: [],
  subjects: [],
  colors: [],
  rooms: [],
  vibe: [],
  aesthetic: [],
  medium: [],
}

/** A value that group would actually carry. */
const sampleFor = (key: string) => {
  const group = FACET_GROUPS.find((g) => g.key === key)
  if (!group) throw new Error(`no facet group ${key}`)
  const first = group.options[0]
  if (!first) throw new Error(`facet group ${key} has no options`)
  return { id: first.id, multi: group.multi }
}

/** Set one facet, whatever its arity. */
const withFacet = (key: string): FilterState => {
  const { id, multi } = sampleFor(key)
  return { ...empty, [key]: multi ? [id] : id }
}

describe('every facet group counts', () => {
  // Parametrised over the vocabulary itself, so a new group is covered the
  // day it is added rather than the day someone remembers this file.
  for (const group of FACET_GROUPS) {
    it(`counts ${group.key} and gives it a chip`, () => {
      const filters = withFacet(group.key)

      expect(countActiveFilters(filters)).toBe(1)

      const tags = buildActiveFilterTags(filters)
      expect(tags).toHaveLength(1)
      expect(tags[0]?.key).toBe(group.key)
      expect(tags[0]?.value).toBe(sampleFor(group.key).id)
    })
  }

  it('agrees with itself — the count IS the number of chips', () => {
    const filters: FilterState = {
      ...empty,
      styles: ['minimalist-art', 'pop-art'],
      vibe: [FACET_GROUPS.find((g) => g.key === 'vibe')!.options[0]!.id],
      orientation: 'portrait',
      isFeatured: true,
    }

    expect(countActiveFilters(filters)).toBe(
      buildActiveFilterTags(filters).length
    )
    expect(countActiveFilters(filters)).toBe(5)
  })
})

describe('the two booleans', () => {
  it('chips and counts isFeatured — the one that used to vanish', () => {
    const tags = buildActiveFilterTags({ ...empty, isFeatured: true })

    expect(countActiveFilters({ ...empty, isFeatured: true })).toBe(1)
    expect(tags).toHaveLength(1)
    expect(tags[0]?.key).toBe('isFeatured')
    expect(tags[0]?.label).toBe('Featured')
  })

  it('chips and counts isAiGenerated', () => {
    const tags = buildActiveFilterTags({ ...empty, isAiGenerated: true })

    expect(tags).toHaveLength(1)
    expect(tags[0]?.label).toBe('AI Generated')
  })

  it('ignores an explicit false rather than chipping "not featured"', () => {
    // Nothing in the UI sets false, but the URL can, and a chip reading
    // "Featured" for isFeatured=false would be a lie.
    expect(countActiveFilters({ ...empty, isFeatured: false })).toBe(0)
    expect(buildActiveFilterTags({ ...empty, isAiGenerated: false })).toEqual([])
  })
})

describe('price', () => {
  it('is one filter, not two, however many bounds it has', () => {
    // The old sum counted priceMin and priceMax separately, so a range read
    // as two active filters in the badge.
    expect(countActiveFilters({ ...empty, priceMin: 500, priceMax: 2000 })).toBe(
      1
    )
    expect(countActiveFilters({ ...empty, priceMin: 500 })).toBe(1)
  })

  it('names both bounds when it has them', () => {
    const [tag] = buildActiveFilterTags({
      ...empty,
      priceMin: 500,
      priceMax: 2000,
    })

    expect(tag?.key).toBe('price')
    expect(tag?.label).toContain('500')
    expect(tag?.label).toContain('2,000')
  })

  it('says which end is open when only one bound is set', () => {
    expect(
      buildActiveFilterTags({ ...empty, priceMin: 500 })[0]?.label
    ).toMatch(/Over|Above|From/i)
    expect(
      buildActiveFilterTags({ ...empty, priceMax: 2000 })[0]?.label
    ).toMatch(/Under|Below|Up to/i)
  })
})

describe('nothing active', () => {
  it('counts zero and builds no chips', () => {
    expect(countActiveFilters(empty)).toBe(0)
    expect(buildActiveFilterTags(empty)).toEqual([])
  })

  it('does not count sort — it narrows nothing', () => {
    const sorted: FilterState = {
      ...empty,
      sortBy: 'basePrice',
      sortOrder: 'asc',
    }

    expect(countActiveFilters(sorted)).toBe(0)
    expect(buildActiveFilterTags(sorted)).toEqual([])
  })
})

describe('chip labels', () => {
  it('spaces the hyphens out of an id', () => {
    const [tag] = buildActiveFilterTags({ ...empty, styles: ['minimalist-art'] })
    expect(tag?.label).toBe('minimalist art')
  })
})
