/**
 * Home category tiles (#452).
 *
 * The tiles used to carry their own slugs — `abstract`, `nature`,
 * `minimalist`, `typography` — and link them as `?styles=<slug>`. None of
 * those is a style id since the facet rework: styles are `minimalist-art`,
 * `pop-art`, …, `abstract` is a SUBJECT, and `nature` and `typography` were
 * not anywhere at all. Four of the busiest links on the site landed on a
 * collection that could not filter by what the tile promised.
 *
 * Two rules come out of that, and both are asserted here:
 *
 *  1. a tile may only name a value the shared vocabulary knows, so a tile
 *     that cannot filter is a failing test rather than a dead link;
 *  2. a tile only appears if some artwork actually carries its value. The
 *     definitions stay either way — they are what a new piece of art gets
 *     tagged with — but a category nothing is filed under is not a door
 *     worth opening.
 */

import { describe, it, expect } from 'vitest'
import { STYLE_OPTIONS, SUBJECT_OPTIONS } from '@chobii/shared'
import {
  CATEGORY_TILES,
  categoryHref,
  visibleCategories,
  type FacetCounts,
} from '~/lib/homeCategories'

const idsOf = (options: readonly { id: string }[]) => options.map((o) => o.id)

describe('every tile names a value the vocabulary knows', () => {
  for (const tile of CATEGORY_TILES) {
    it(`${tile.name} filters by a real ${tile.group} value`, () => {
      const vocabulary =
        tile.group === 'styles' ? idsOf(STYLE_OPTIONS) : idsOf(SUBJECT_OPTIONS)

      expect(vocabulary).toContain(tile.id)
    })
  }

  it('keeps all four categories defined, whether or not they are shown', () => {
    // They are the vocabulary for tagging new art; hiding one is a display
    // decision, not a reason to delete it.
    expect(CATEGORY_TILES.map((tile) => tile.name)).toEqual([
      'Abstract',
      'Nature',
      'Minimalist',
      'Typography',
    ])
  })
})

describe('categoryHref', () => {
  it('filters by the group the value actually belongs to', () => {
    const abstract = CATEGORY_TILES.find((tile) => tile.name === 'Abstract')!
    const minimalist = CATEGORY_TILES.find((tile) => tile.name === 'Minimalist')!

    // `abstract` is a subject; sending it as ?styles= is the original bug.
    expect(categoryHref(abstract)).toBe('/posters?subjects=abstract')
    expect(categoryHref(minimalist)).toBe('/posters?styles=minimalist-art')
  })
})

describe('visibleCategories', () => {
  const counts = (
    styles: Array<[string, number]>,
    subjects: Array<[string, number]>
  ): FacetCounts => ({
    styles: styles.map(([value, count]) => ({ value, count })),
    subjects: subjects.map(([value, count]) => ({ value, count })),
  })

  it('shows a category some artwork carries', () => {
    const visible = visibleCategories(
      counts([['minimalist-art', 3]], [['abstract', 7]])
    )

    expect(visible.map((tile) => tile.name)).toEqual(['Abstract', 'Minimalist'])
  })

  it('hides a category no artwork carries', () => {
    // Typography is the live example: in the vocabulary so new art can be
    // filed under it, on nothing so far.
    const visible = visibleCategories(counts([], [['abstract', 7]]))

    expect(visible.map((tile) => tile.name)).toEqual(['Abstract'])
  })

  it('treats an explicit zero as nothing', () => {
    const visible = visibleCategories(counts([], [['abstract', 0]]))

    expect(visible).toEqual([])
  })

  it('shows nothing when the counts are missing entirely', () => {
    // The facets call failed. Rendering every tile would be guessing, and a
    // tile that leads to an empty grid is the failure this ticket is about.
    expect(visibleCategories(undefined)).toEqual([])
    expect(visibleCategories({ styles: [], subjects: [] })).toEqual([])
  })

  it('keeps the defined order rather than sorting by popularity', () => {
    const visible = visibleCategories(
      counts(
        [['minimalist-art', 99]],
        [
          ['abstract', 1],
          ['landscape', 5],
        ]
      )
    )

    expect(visible.map((tile) => tile.name)).toEqual([
      'Abstract',
      'Nature',
      'Minimalist',
    ])
  })
})
