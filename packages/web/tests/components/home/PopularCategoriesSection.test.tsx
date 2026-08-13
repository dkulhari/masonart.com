/**
 * The home page's "Shop By Popular" band (#531).
 *
 * Three things are load-bearing here, and only one of them is layout:
 *
 *   1. A TILE ONLY SHOWS IF THE CATALOGUE CAN FILL IT. This is the #452 rule
 *      carried over from `visibleCategories` — a tile that leads to an empty
 *      collection is worse than no tile. The source moved from facet counts to
 *      the collections endpoint; the guarantee did not move with it by
 *      accident, so it is pinned.
 *
 *   2. NO IMAGE, NO TILE, AND NO SUBSTITUTE FOR ONE. The band this replaces
 *      painted a CSS gradient where the photograph should have been. A tile
 *      without real artwork is dropped instead.
 *
 *   3. THE ORDER IS THE ADMIN'S, NOT THE CATALOGUE'S. `discoverOrder` as the
 *      API returns it, never re-sorted by `count`. A row that reshuffles
 *      itself as stock moves makes the home page restless.
 *
 * Plus the two things a critic would notice and a refactor would quietly
 * undo: the label sits BELOW the tile rather than over it, and matted product
 * artwork is scaled past its mat while an admin's own photograph is not.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import {
  PopularCategoriesBand,
  popularCategoryTiles,
  POPULAR_TILE_COUNT,
  TILE_ASPECT,
  tileArtScale,
  VIEW_ALL_HREF,
} from '~/components/home/PopularCategoriesSection'
import type { DiscoverCollection } from '~/components/product/DiscoverChips'

afterEach(cleanup)

// ============================================================================
// Fixtures
// ============================================================================

let seq = 0

function collection(
  overrides: Partial<DiscoverCollection> = {}
): DiscoverCollection {
  seq += 1
  return {
    id: `id-${seq}`,
    slug: `slug-${seq}`,
    title: `Collection ${seq}`,
    subtitle: null,
    count: 6,
    image: `https://cdn.example/art-${seq}.webp`,
    imageIsMatted: true,
    orientation: 'square',
    ...overrides,
  }
}

const tiles = () => screen.getAllByTestId('popular-category-tile')

// ============================================================================
// Selection
// ============================================================================

describe('popularCategoryTiles', () => {
  it('drops a collection the catalogue cannot fill', () => {
    const empty = collection({ slug: 'empty', count: 0 })
    const stocked = collection({ slug: 'stocked', count: 3 })

    expect(popularCategoryTiles([empty, stocked]).map((c) => c.slug)).toEqual([
      'stocked',
    ])
  })

  it('drops a collection with no artwork behind it', () => {
    const blank = collection({ slug: 'blank', image: null })
    const pictured = collection({ slug: 'pictured' })

    expect(popularCategoryTiles([blank, pictured]).map((c) => c.slug)).toEqual([
      'pictured',
    ])
  })

  it('keeps the order the API returned rather than sorting by count', () => {
    const small = collection({ slug: 'first', count: 2 })
    const large = collection({ slug: 'second', count: 400 })

    expect(popularCategoryTiles([small, large]).map((c) => c.slug)).toEqual([
      'first',
      'second',
    ])
  })

  it('never opens a third row', () => {
    const many = Array.from({ length: POPULAR_TILE_COUNT + 4 }, () =>
      collection()
    )

    expect(popularCategoryTiles(many)).toHaveLength(POPULAR_TILE_COUNT)
  })

  it('treats an absent response as no categories', () => {
    // The collections call failed. Guessing here is the dead tile the rule
    // exists to prevent.
    expect(popularCategoryTiles(undefined)).toEqual([])
  })
})

// ============================================================================
// Crop
// ============================================================================

describe('tileArtScale', () => {
  /**
   * Artwork sits at 0.88 of its LONGEST side on the mat, so the fractions of
   * the canvas it covers follow from its aspect. Recomputed here rather than
   * imported, so the test fails if the component's own model drifts.
   */
  const covers = (aspect: number, scale: number): boolean => {
    const inset = 0.88
    const width = aspect >= 1 ? inset : inset * aspect
    const height = aspect >= 1 ? inset / aspect : inset

    return width * scale >= 1 && height * scale >= 1 / TILE_ASPECT
  }

  it.each([
    ['panoramic', 1.96],
    ['landscape', 1.15],
    ['square', 0.87],
    ['portrait', 0.52],
  ])('leaves no mat inside a %s tile', (orientation, narrowest) => {
    expect(covers(narrowest, tileArtScale(orientation))).toBe(true)
  })

  it('crops a wide piece far more gently than a tall one', () => {
    // The whole point: a landscape piece keeps ~1150 source pixels of artwork
    // across a 664px tile, a portrait one barely 610. Cropping both to the
    // portrait depth is what made half the row look soft.
    expect(tileArtScale('landscape')).toBeLessThan(tileArtScale('portrait'))
    expect(tileArtScale('landscape')).toBeLessThan(tileArtScale('panoramic'))
  })

  it('never enlarges a 1500px master past the tile it fills', () => {
    // 332 CSS px is the widest this tile gets (1440 viewport), 664 device px
    // at 2x. Below that the crop is an upscale and the artwork goes soft.
    for (const orientation of ['panoramic', 'landscape', 'square']) {
      expect(1500 / tileArtScale(orientation)).toBeGreaterThan(664)
    }
  })

  it('falls back to the deepest crop for an orientation it does not know', () => {
    // Including `set-of-2-3`. Mat inside the tile is the loud failure; a
    // deeper crop is only a softer one.
    expect(tileArtScale('set-of-2-3')).toBe(tileArtScale('portrait'))
    expect(tileArtScale('hexagonal')).toBe(tileArtScale('portrait'))
    expect(tileArtScale(null)).toBe(tileArtScale('portrait'))
    expect(tileArtScale(undefined)).toBe(tileArtScale('portrait'))
  })
})

// ============================================================================
// Band
// ============================================================================

describe('PopularCategoriesBand', () => {
  it('renders nothing at all when nothing qualifies', () => {
    const { container } = render(<PopularCategoriesBand categories={[]} />)

    // Not an empty grid under a heading promising one.
    expect(container).toBeEmptyDOMElement()
  })

  it('draws one tile per category, linked to its collection', () => {
    render(
      <PopularCategoriesBand
        categories={[
          collection({ slug: 'graffiti-art', title: 'Graffiti Art' }),
          collection({ slug: 'ukiyo-e-art', title: 'Ukiyo-e Art' }),
        ]}
      />
    )

    expect(tiles()).toHaveLength(2)
    expect(tiles()[0]).toHaveAttribute('href', '/collections/graffiti-art')
    expect(tiles()[1]).toHaveAttribute('href', '/collections/ukiyo-e-art')
  })

  it('shows the real artwork, and puts the name below it', () => {
    render(
      <PopularCategoriesBand
        categories={[
          collection({
            title: 'Pop Art',
            image: 'https://cdn.example/pop.webp',
          }),
        ]}
      />
    )

    const tile = tiles()[0]
    const image = within(tile).getByRole('presentation', { hidden: true })
    expect(image).toHaveAttribute('src', 'https://cdn.example/pop.webp')

    // The name is a sibling of the image wrapper, not a child of it — the
    // whole point of the redraw is that the label stopped being an overlay.
    const label = within(tile).getByText('Pop Art')
    expect(label).not.toBeNull()
    expect(image.closest('span')?.contains(label)).toBe(false)
  })

  it('scales matted artwork past its mat and leaves a real photo alone', () => {
    render(
      <PopularCategoriesBand
        categories={[
          collection({ slug: 'matted', imageIsMatted: true }),
          collection({ slug: 'uploaded', imageIsMatted: false }),
        ]}
      />
    )

    const matted = tiles()[0].querySelector('img')
    const uploaded = tiles()[1].querySelector('img')

    expect(matted?.style.transform).toBe(`scale(${tileArtScale('square')})`)
    // An admin's own image is already edge-to-edge; scaling crops into it.
    expect(uploaded?.style.transform).toBe('')
  })

  it('crops each tile to its own artwork rather than to one constant', () => {
    // The band's first cut used a single scale sized for the narrowest piece
    // in the catalogue. It lost a blind A/B: the wide pieces came out at 1:1
    // with the source and read soft next to nothing, because they were being
    // cropped nearly twice as hard as they needed.
    render(
      <PopularCategoriesBand
        categories={[
          collection({ slug: 'wide', orientation: 'landscape' }),
          collection({ slug: 'tall', orientation: 'portrait' }),
        ]}
      />
    )

    const wide = tiles()[0].querySelector('img')?.style.transform
    const tall = tiles()[1].querySelector('img')?.style.transform

    expect(wide).not.toBe(tall)
    expect(wide).toBe(`scale(${tileArtScale('landscape')})`)
    expect(tall).toBe(`scale(${tileArtScale('portrait')})`)
  })

  it('carries the bar heading and one outline pill', () => {
    render(<PopularCategoriesBand categories={[collection()]} />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Shop By Popular' })
    ).toBeTruthy()

    const pill = screen.getByRole('link', { name: 'View Popular Categories' })
    expect(pill).toHaveAttribute('href', VIEW_ALL_HREF)
  })

  /**
   * #541. Eight tiles cost 910px at 390 against the bar's 736 — four 36px row
   * gaps, 32 under the heading and 40 above the pill, none of which the bar
   * spends. The label still has to belong to the tile above it, so the gap
   * above it (12) stays half the gap below (24) rather than going to nothing.
   */
  it('spends a phone-sized gap between the tile rows', () => {
    const { container } = render(
      <PopularCategoriesBand categories={[collection()]} />
    )

    const grid = container.querySelector('ul')!
    expect(grid.className).toContain('gap-y-6')
    expect(grid.className).toContain('sm:gap-y-10')
    expect(grid.className).not.toContain('gap-y-9')

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.className).toContain('mb-5')
    expect(heading.className).toContain('sm:mb-10')

    const pillRow = screen.getByRole('link', {
      name: 'View Popular Categories',
    }).parentElement
    expect(pillRow?.className).toContain('mt-6')
    expect(pillRow?.className).toContain('sm:mt-12')
  })
})
