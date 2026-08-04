/**
 * Discover chips — the collection rail mesonart runs above the grid (§1.3.2).
 *
 * Presentational on purpose: it receives collections and reports a selection
 * upward. Fetching lives in the route, or the rail refires a request on every
 * filter change.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  DiscoverChips,
  chipArtScale,
} from '~/components/product/DiscoverChips'

const collections = [
  {
    id: 'wabi-sabi-art',
    label: 'Wabi-Sabi Art',
    count: 9,
    image: 'https://cdn.test/a.webp',
    orientation: 'square',
  },
  { id: 'ukiyo-e-art', label: 'Ukiyo-e Art', count: 12, image: null, orientation: 'portrait' },
]

const defaults = {
  collections,
  activeStyle: undefined,
  onSelect: () => {},
}

describe('rendering', () => {
  it('renders a chip per collection', () => {
    render(<DiscoverChips {...defaults} />)
    expect(screen.getByRole('button', { name: /Wabi-Sabi Art/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Ukiyo-e Art/ })).toBeTruthy()
  })

  it('shows each collection count', () => {
    render(<DiscoverChips {...defaults} />)
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('renders the representative image when there is one', () => {
    // Queried by tag, not by role: the image is decorative (`alt=""`) because
    // the chip's own label already names the collection. Giving it alt text
    // would make a screen reader announce the name twice.
    const { container } = render(<DiscoverChips {...defaults} />)
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('src')).toContain('a.webp')
  })

  it('crops into the artwork rather than shrinking it to fit', () => {
    // `main` images are matted — artwork at 0.88 inset on a #fafafa square.
    // Rendered 1:1 the chip shows a shrunken picture floating on white. The
    // circle has to be a window INSIDE the picture, so the image is enlarged
    // and the round parent clips it.
    const { container } = render(<DiscoverChips {...defaults} />)
    const image = container.querySelector('img')

    expect(image?.style.transform).toBe(`scale(${chipArtScale('square')})`)
    expect(image?.className).toContain('object-cover')
    expect(image?.className).toContain('object-center')
  })

  it('clips the enlarged image at the circle', () => {
    const { container } = render(<DiscoverChips {...defaults} />)
    const frame = container.querySelector('img')?.parentElement

    expect(frame?.className).toContain('overflow-hidden')
    expect(frame?.className).toContain('rounded-full')
  })

  it('falls back to an initial rather than a broken image', () => {
    // A collection with no product imagery still leads somewhere populated.
    // Dropping it would hide part of the catalogue; an empty <img> renders as
    // the browser's broken-file icon.
    const { container } = render(<DiscoverChips {...defaults} />)
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(screen.getByText('U')).toBeTruthy()
  })

  it('renders nothing at all when there are no collections', () => {
    const { container } = render(<DiscoverChips {...defaults} collections={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('selection', () => {
  it('reports the chosen collection', () => {
    const onSelect = vi.fn()
    render(<DiscoverChips {...defaults} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Wabi-Sabi Art/ }))

    expect(onSelect).toHaveBeenCalledWith('wabi-sabi-art')
  })

  it('marks the active collection', () => {
    render(<DiscoverChips {...defaults} activeStyle="wabi-sabi-art" />)
    expect(
      screen.getByRole('button', { name: /Wabi-Sabi Art/ }).getAttribute('aria-pressed')
    ).toBe('true')
  })

  it('clears the filter when the active chip is clicked again', () => {
    const onSelect = vi.fn()
    render(<DiscoverChips {...defaults} activeStyle="wabi-sabi-art" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Wabi-Sabi Art/ }))

    expect(onSelect).toHaveBeenCalledWith(undefined)
  })

  it('leaves the other chips unpressed', () => {
    render(<DiscoverChips {...defaults} activeStyle="wabi-sabi-art" />)
    expect(
      screen.getByRole('button', { name: /Ukiyo-e Art/ }).getAttribute('aria-pressed')
    ).toBe('false')
  })
})

describe('crop depth per orientation', () => {
  it('always clears the mat inset', () => {
    // Below 1/0.88 the mat is still inside the circle, which is the bug this
    // whole mechanism exists to fix.
    for (const orientation of ['square', 'portrait', 'landscape', 'panoramic']) {
      expect(chipArtScale(orientation)).toBeGreaterThan(1 / 0.88)
    }
  })

  it('crops a panoramic far deeper than a square', () => {
    // The inset applies to the LONGEST side, so a 3:1 strip has far more mat
    // along its short edge. wabi-sabi-art and plaster-and-texture-art both
    // have panoramic representatives — a single shared scale left white arcs
    // on exactly those two chips.
    expect(chipArtScale('panoramic')).toBeGreaterThan(chipArtScale('square') * 2)
  })

  it('treats portrait and landscape alike — the aspect is the same, just rotated', () => {
    expect(chipArtScale('portrait')).toBe(chipArtScale('landscape'))
  })

  it('falls back to the square depth for a missing or unknown orientation', () => {
    // Never crop harder than necessary on a guess: a too-deep crop destroys
    // the picture, a too-shallow one shows a sliver of mat.
    expect(chipArtScale(null)).toBe(chipArtScale('square'))
    expect(chipArtScale(undefined)).toBe(chipArtScale('square'))
    expect(chipArtScale('hexagonal')).toBe(chipArtScale('square'))
  })
})

describe('the rail itself', () => {
  it('is a labelled list, so a screen reader can skip it', () => {
    render(<DiscoverChips {...defaults} />)
    expect(screen.getByRole('list', { name: /discover/i })).toBeTruthy()
  })

  it('offers scroll buttons that are real buttons', () => {
    // Arrow affordances must be reachable by keyboard. A div with an onClick
    // is not.
    render(<DiscoverChips {...defaults} />)
    expect(screen.getByRole('button', { name: /scroll left/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /scroll right/i })).toBeTruthy()
  })
})
