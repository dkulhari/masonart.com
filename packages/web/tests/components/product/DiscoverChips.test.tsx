/**
 * Discover chips — links to collections, not filter toggles.
 *
 * The behaviour change this feature exists for. Measured on mesonart
 * 2026-08-05, their chips are `<a href="/collections/...">`: destinations, not
 * facets on the current grid. Ours toggled `styles`, and a payload typed to a
 * style id structurally cannot carry `Bestseller` or `Set of 2/3` — which is
 * why the rail had to stop being a projection of the style vocabulary.
 *
 * Presentational still: it receives collections and renders links. Fetching
 * lives in the route, or the rail refires on every filter change.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  createMemoryHistory,
} from '@tanstack/react-router'
import {
  DiscoverChips,
  chipArtScale,
  type DiscoverCollection,
} from '~/components/product/DiscoverChips'

const collections: DiscoverCollection[] = [
  {
    id: 'id-wabi',
    slug: 'wabi-sabi-art',
    title: 'Wabi-Sabi Art',
    subtitle: null,
    count: 9,
    image: 'https://cdn.test/a.webp',
    imageIsMatted: true,
    orientation: 'square',
  },
  {
    id: 'id-ukiyo',
    slug: 'ukiyo-e-art',
    title: 'Ukiyo-e Art',
    subtitle: null,
    count: 12,
    image: null,
    imageIsMatted: false,
    orientation: null,
  },
]

/** Chips render <Link>, so they need a router around them. */
function renderChips(
  props: { collections?: DiscoverCollection[]; activeSlug?: string } = {}
) {
  const rootRoute = createRootRoute({
    component: () => (
      <DiscoverChips
        collections={props.collections ?? collections}
        activeSlug={props.activeSlug}
      />
    ),
  })
  const collectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/collections/$slug',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([collectionRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('chips are links', () => {
  it('points each chip at its collection page', async () => {
    renderChips()

    const wabi = await screen.findByRole('link', { name: /Wabi-Sabi Art/ })
    const ukiyo = await screen.findByRole('link', { name: /Ukiyo-e Art/ })

    expect(wabi.getAttribute('href')).toBe('/collections/wabi-sabi-art')
    expect(ukiyo.getAttribute('href')).toBe('/collections/ukiyo-e-art')
  })

  it('carries a collection no facet could express', async () => {
    // Best Sellers is a sort with no facets at all. This is precisely the case
    // the old style-id payload made impossible, so it is asserted by name.
    renderChips({
      collections: [
        {
          id: 'id-best',
          slug: 'best-selling',
          title: 'Best Sellers',
          subtitle: null,
          count: 41,
          image: null,
          imageIsMatted: false,
          orientation: null,
        },
      ],
    })

    const link = await screen.findByRole('link', { name: /Best Sellers/ })
    expect(link.getAttribute('href')).toBe('/collections/best-selling')
  })

  it('shows each collection count', async () => {
    renderChips()
    expect(await screen.findByText('9')).toBeTruthy()
    expect(await screen.findByText('12')).toBeTruthy()
  })

  it('renders nothing at all when there are no collections', () => {
    const { container } = renderChips({ collections: [] })
    expect(container.querySelector('ul')).toBeNull()
  })
})

describe('the current collection', () => {
  it('is marked aria-current, not aria-pressed', async () => {
    // aria-pressed described a toggle. These navigate, so the truthful
    // attribute is aria-current="page".
    renderChips({ activeSlug: 'wabi-sabi-art' })

    const link = await screen.findByRole('link', { name: /Wabi-Sabi Art/ })
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(link.hasAttribute('aria-pressed')).toBe(false)
  })

  it('leaves the other chips unmarked', async () => {
    renderChips({ activeSlug: 'wabi-sabi-art' })
    const other = await screen.findByRole('link', { name: /Ukiyo-e Art/ })
    expect(other.hasAttribute('aria-current')).toBe(false)
  })
})

describe('imagery', () => {
  it('renders the representative image when there is one', async () => {
    // Queried by tag, not by role: the image is decorative (`alt=""`) because
    // the chip's own label already names the collection.
    const { container } = renderChips()
    await screen.findByRole('link', { name: /Wabi-Sabi Art/ })

    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('src')).toContain('a.webp')
  })

  it('scales a matted product image past the mat', async () => {
    const { container } = renderChips()
    await screen.findByRole('link', { name: /Wabi-Sabi Art/ })

    const image = container.querySelector('img')
    expect(image?.style.transform).toBe(`scale(${chipArtScale('square')})`)
    expect(image?.className).toContain('object-cover')
  })

  it('does NOT scale an image the admin uploaded', async () => {
    // An admin upload has no mat. Applying the mat-compensation factor to it
    // crops into the picture — which is why the API reports imageIsMatted
    // rather than letting the client guess.
    const { container } = renderChips({
      collections: [
        {
          ...collections[0],
          image: 'https://cdn.test/curated.jpg',
          imageIsMatted: false,
          orientation: null,
        },
      ],
    })
    await screen.findByRole('link', { name: /Wabi-Sabi Art/ })

    const image = container.querySelector('img')
    expect(image?.style.transform).toBe('')
  })

  it('clips the enlarged image at the circle', async () => {
    const { container } = renderChips()
    await screen.findByRole('link', { name: /Wabi-Sabi Art/ })

    const frame = container.querySelector('img')?.parentElement
    expect(frame?.className).toContain('overflow-hidden')
    expect(frame?.className).toContain('rounded-full')
  })

  it('falls back to an initial rather than a broken image', async () => {
    const { container } = renderChips()
    expect(await screen.findByText('U')).toBeTruthy()
    expect(container.querySelectorAll('img')).toHaveLength(1)
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
    // along its short edge.
    expect(chipArtScale('panoramic')).toBeGreaterThan(chipArtScale('square') * 2)
  })

  it('treats portrait and landscape alike — the aspect is the same, just rotated', () => {
    expect(chipArtScale('portrait')).toBe(chipArtScale('landscape'))
  })

  it('falls back to the square depth for a missing or unknown orientation', () => {
    expect(chipArtScale(null)).toBe(chipArtScale('square'))
    expect(chipArtScale(undefined)).toBe(chipArtScale('square'))
    expect(chipArtScale('hexagonal')).toBe(chipArtScale('square'))
  })
})

describe('the rail itself', () => {
  it('is a labelled list, so a screen reader can skip it', async () => {
    renderChips()
    expect(await screen.findByRole('list', { name: /discover/i })).toBeTruthy()
  })

  it('offers scroll buttons that are real buttons', async () => {
    // Arrow affordances must be reachable by keyboard. A div with an onClick
    // is not.
    renderChips()
    expect(await screen.findByRole('button', { name: /scroll left/i })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /scroll right/i })).toBeTruthy()
  })
})
