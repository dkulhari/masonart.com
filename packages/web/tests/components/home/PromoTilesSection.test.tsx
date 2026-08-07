/**
 * The home page's three promo tiles (#533).
 *
 * Four things here are load-bearing, and none of them is "three boxes render":
 *
 *   1. WHERE THE TILES GO. mesonart's row reads On Sale / Quick Ship / Custom
 *      Art. We have no delivery-speed promise anywhere on the site, so "Quick
 *      Ship" would be a claim invented by a component; the middle tile applies
 *      the real `availability=in-stock` facet and is labelled with that
 *      vocabulary's own caption. Both facet tiles are projections of
 *      `@chobii/shared` rather than literals — a home tile naming a value the
 *      API's zod enum would 400 on is the drift #452 ended.
 *
 *   2. THE SALE TILE IS ABSENT, NOT DISABLED. It appears only while a
 *      promotion is running — the rule `SaleNavLink` already enforces for the
 *      red Sale link — and the slot becomes Limited Edition otherwise, so the
 *      row never opens a door onto /sale's empty state. Nothing renders at all
 *      until the lookup has answered, because painting one label and swapping
 *      it a beat later is the flash that rule exists to prevent.
 *
 *   3. THE PICTURES ARE PHOTOGRAPHS, AND THEY ALL COME FROM ONE CONSTANT.
 *      Every tile carries an `<img>` — no gradient plate stands in for a room —
 *      and every path is `PROMO_TILE_IMAGES`, so replacing mesonart's borrowed
 *      photography with our own (#544, which blocks go-live) is three lines in
 *      one place and not a hunt through JSX.
 *
 *   4. THE MEASURED LAYOUT. 4:3 at every width, and the lead tile taking both
 *      mobile columns before all three share a desktop row.
 *
 * Links are stubbed as anchors with `search` folded into the href, the same way
 * the orientation-chip test does it: where a tile goes is the whole assertion,
 * so a stub that dropped `search` would leave it untestable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AVAILABILITY_OPTIONS, UNIQUENESS_OPTIONS } from '@chobii/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: Record<string, unknown>) => {
    const entries = Object.entries((search ?? {}) as Record<string, unknown>)
    const qs = new URLSearchParams(
      entries.map(([key, value]) => [key, String(value)])
    ).toString()
    return (
      <a href={qs ? `${to}?${qs}` : String(to)} {...(props as object)}>
        {children as React.ReactNode}
      </a>
    )
  },
}))

const useActivePromotion = vi.fn()

vi.mock('~/hooks/useActivePromotion', () => ({
  useActivePromotion: (...args: unknown[]) => useActivePromotion(...args),
}))

import {
  PromoTilesSection,
  PromoTilesRow,
  PROMO_TILE_IMAGES,
  SALE_DESTINATION,
  LIMITED_EDITION_DESTINATION,
  IN_STOCK_DESTINATION,
  CUSTOM_ART_DESTINATION,
} from '~/components/home/PromoTilesSection'

const src = readFileSync(
  join(process.cwd(), 'app/components/home/PromoTilesSection.tsx'),
  'utf8'
)

const tiles = () => screen.queryAllByTestId('home-promo-tile')
const hrefs = () => tiles().map((tile) => tile.getAttribute('href'))

beforeEach(() => {
  useActivePromotion.mockReturnValue({ promotion: null, isResolved: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ============================================================================
// Where the tiles go
// ============================================================================

describe('destinations', () => {
  it('sends the middle tile at the in-stock facet, not an invented Quick Ship', () => {
    // The label is the availability vocabulary's own caption and the link
    // applies exactly the facet it names. mesonart's "Quick Ship" would be a
    // dispatch promise nothing on this storefront backs.
    const option = AVAILABILITY_OPTIONS.find((o) => o.id === 'in-stock')

    expect(IN_STOCK_DESTINATION.label).toBe(option?.label)
    expect(IN_STOCK_DESTINATION.to).toBe('/posters')
    expect(IN_STOCK_DESTINATION.search).toEqual({ availability: option?.id })
    expect(src).not.toMatch(/Quick Ship'/)

    render(<PromoTilesSection />)

    expect(hrefs()).toContain('/posters?availability=in-stock')
  })

  it('takes the lead tile from the uniqueness vocabulary', () => {
    const option = UNIQUENESS_OPTIONS.find((o) => o.id === 'limited-edition')

    expect(LIMITED_EDITION_DESTINATION.label).toBe(option?.label)
    expect(LIMITED_EDITION_DESTINATION.search).toEqual({
      uniqueness: option?.id,
    })
  })

  it('sends the last tile at the generator', () => {
    expect(CUSTOM_ART_DESTINATION.label).toBe('Custom Art')

    render(<PromoTilesSection />)

    expect(hrefs()).toContain('/create')
  })

  it('labels every tile', () => {
    render(<PromoTilesSection />)

    expect(screen.getByText('Limited Edition')).toBeTruthy()
    expect(screen.getByText('In Stock')).toBeTruthy()
    expect(screen.getByText('Custom Art')).toBeTruthy()
  })
})

// ============================================================================
// The sale tile
// ============================================================================

describe('the lead tile follows the promotion', () => {
  it('opens /sale while a promotion is running', () => {
    useActivePromotion.mockReturnValue({
      promotion: { headline: 'Monsoon Sale', deadline: null },
      isResolved: true,
    })

    render(<PromoTilesSection />)

    expect(screen.getByText(SALE_DESTINATION.label)).toBeTruthy()
    expect(hrefs()[0]).toBe('/sale')
    expect(screen.queryByText(LIMITED_EDITION_DESTINATION.label)).toBeNull()
  })

  it('never opens /sale when none is', () => {
    render(<PromoTilesSection />)

    expect(screen.queryByText(SALE_DESTINATION.label)).toBeNull()
    expect(hrefs()).not.toContain('/sale')
    expect(hrefs()[0]).toBe('/posters?uniqueness=limited-edition')
  })

  it('renders nothing at all until the lookup has answered', () => {
    useActivePromotion.mockReturnValue({
      promotion: undefined,
      isResolved: false,
    })

    render(<PromoTilesSection />)

    expect(screen.queryByTestId('home-promo-tiles')).toBeNull()
  })

  it('keeps the row three wide either way', () => {
    render(<PromoTilesSection />)
    expect(tiles()).toHaveLength(3)

    cleanup()
    useActivePromotion.mockReturnValue({
      promotion: { headline: 'Monsoon Sale', deadline: null },
      isResolved: true,
    })
    render(<PromoTilesSection />)
    expect(tiles()).toHaveLength(3)
  })
})

// ============================================================================
// The photographs
// ============================================================================

describe('photographs', () => {
  it('gives every tile a real photograph', () => {
    render(<PromoTilesSection />)

    const images = document.querySelectorAll(
      '[data-testid="home-promo-tile"] img'
    )
    expect(images).toHaveLength(3)
    for (const image of images) {
      expect(image.getAttribute('src')).toBeTruthy()
    }
  })

  it('routes every path through the one constant', () => {
    // #544 replaces mesonart's borrowed photography with ours. That has to be
    // three lines in PROMO_TILE_IMAGES, so no other line in the file may name
    // an image path.
    const paths = src.match(/'\/dev-reference\/[^']+'/g) ?? []
    expect(paths).toHaveLength(Object.keys(PROMO_TILE_IMAGES).length)

    for (const destination of [
      SALE_DESTINATION,
      LIMITED_EDITION_DESTINATION,
      IN_STOCK_DESTINATION,
      CUSTOM_ART_DESTINATION,
    ]) {
      expect(Object.values(PROMO_TILE_IMAGES)).toContain(destination.image)
    }
  })

  it('gives the two lead labels the same picture', () => {
    // One slot, one photograph — the label swaps with the promotion, the
    // photograph does not.
    expect(SALE_DESTINATION.image).toBe(LIMITED_EDITION_DESTINATION.image)
  })

  it('leaves the photograph out of the accessible name', () => {
    // The link already says where it goes. An alt text describing the room
    // would only make the tile read as "sofa under a framed print In Stock".
    render(<PromoTilesSection />)

    for (const image of document.querySelectorAll(
      '[data-testid="home-promo-tile"] img'
    )) {
      expect(image.getAttribute('alt')).toBe('')
    }
  })
})

// ============================================================================
// Layout
// ============================================================================

describe('layout', () => {
  it('gives the lead tile both mobile columns and a third of the desktop row', () => {
    render(<PromoTilesSection />)

    const cells = document.querySelectorAll(
      '[data-testid="home-promo-tiles"] li'
    )
    expect(cells[0]?.className).toContain('col-span-2')
    expect(cells[0]?.className).toContain('lg:col-span-1')
    expect(cells[1]?.className ?? '').not.toContain('col-span-2')
  })

  it('keeps every tile on the measured 4:3', () => {
    render(<PromoTilesRow tiles={[IN_STOCK_DESTINATION]} />)

    expect(tiles()[0]?.className).toContain('aspect-[4/3]')
  })

  it('renders no band when handed no tiles', () => {
    render(<PromoTilesRow tiles={[]} />)

    expect(screen.queryByTestId('home-promo-tiles')).toBeNull()
  })
})
