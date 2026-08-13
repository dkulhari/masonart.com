/**
 * ProductRail / BestSellersRail / NewInRail tests — tickets #530 and #534.
 *
 * The pins here are the things a later refactor would quietly undo:
 *   - the rail reuses `product/ProductCard` rather than growing its own card,
 *     because that card is shared with /posters and the collection page
 *   - the Featured badge is off inside a rail (mesonart puts no badge here,
 *     and "Featured" labels nothing on a band that is entirely best sellers)
 *   - each band's View All pill carries that band's OWN sort into /posters —
 *     swapping them silently sends "New In" at the best-seller grid
 *   - Best Seller reads `salesCount` and New In reads `createdAt` from the
 *     LIST endpoint, never `/featured`: the featured projection carries no
 *     review aggregate, which is the entire reason the home cards had no
 *     stars (#530)
 *   - arrows disable at the ends rather than dead-clicking, and the track is
 *     a real keyboard target
 *
 * jsdom hard-codes scrollWidth/clientWidth to 0 — no layout engine — so tests
 * that need a specific scroll state define those on the track directly and
 * fire a native 'scroll' event, mirroring ProductCarousel.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { ProductCardData } from '~/components/product/ProductCard'

// The rail renders ProductCard -> ChooseOptions, whose add-to-cart reads
// useCartActions, which calls useQueryClient unconditionally.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/** Captures `search` as a data attribute so the pill's destination is assertable. */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, search, ...rest }: any) => (
    <a
      href={typeof to === 'string' ? to : '#'}
      data-search={search ? JSON.stringify(search) : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
}))

const listMock = vi.fn()
vi.mock('~/lib/api', () => ({
  productsApi: {
    list: (...args: unknown[]) => listMock(...args),
    // ChooseOptions reaches for this on open; never called in these tests.
    getBySlug: vi.fn(),
  },
}))

const { ProductRail } = await import('~/components/home/ProductRail')
const { BestSellersRail, fetchBestSellerProducts } = await import(
  '~/components/home/BestSellersRail'
)
const { NewInRail, fetchNewInProducts } = await import('~/components/home/NewInRail')

const product = (i: number, extra: Partial<ProductCardData> = {}): ProductCardData => ({
  id: `p${i}`,
  sku: `ABS-00${i}`,
  title: `Product ${i}`,
  slug: `product-${i}`,
  basePrice: '1999.00',
  images: [
    {
      id: `i${i}`,
      url: `/i${i}.webp`,
      altText: `a${i}`,
      type: 'main',
      sortOrder: 0,
      width: 1500,
      height: 1500,
      originalKey: `o${i}`,
    },
  ],
  orientation: 'square',
  ...extra,
})

const PRODUCTS = [1, 2, 3, 4, 5, 6].map((i) => product(i))

const SEARCH = { sortBy: 'salesCount', sortOrder: 'desc' } as const

function makeScrollable(
  track: HTMLElement,
  {
    scrollLeft,
    scrollWidth = 1000,
    clientWidth = 300,
  }: { scrollLeft: number; scrollWidth?: number; clientWidth?: number }
) {
  Object.defineProperty(track, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: clientWidth })
  Object.defineProperty(track, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: scrollLeft,
  })
}

function getArrows() {
  return {
    left: screen.getByRole('button', { name: /previous/i }),
    right: screen.getByRole('button', { name: /next/i }),
  }
}

beforeEach(() => {
  listMock.mockReset()
})

describe('ProductRail — structure', () => {
  it('renders the heading it is given', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    expect(screen.getByRole('heading', { name: 'Best Seller' })).toBeTruthy()
  })

  it('reuses ProductCard for every product rather than a bespoke card', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    expect(screen.getAllByTestId('product-card')).toHaveLength(PRODUCTS.length)
  })

  it('suppresses the Featured badge inside a rail', () => {
    render(
      <ProductRail
        heading="Best Seller"
        products={[product(1, { isFeatured: true })]}
        viewAllSearch={SEARCH}
      />
    )
    expect(screen.queryByText('Featured')).toBeNull()
  })

  it('renders nothing at all when the catalogue comes back empty', () => {
    const { container } = render(
      <ProductRail heading="Best Seller" products={[]} viewAllSearch={SEARCH} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('keeps the star row and the review count on a rated card', () => {
    render(
      <ProductRail
        heading="Best Seller"
        products={[product(1, { averageRating: 4.5, reviewCount: 12 })]}
        viewAllSearch={SEARCH}
      />
    )
    expect(screen.getByText('(12)')).toBeTruthy()
    expect(screen.getByLabelText(/rated 4.5 out of 5 from 12 reviews/i)).toBeTruthy()
  })

  it('shows no star row on an unrated card rather than an invented score', () => {
    render(
      <ProductRail
        heading="New In"
        products={[product(1, { averageRating: null, reviewCount: 0 })]}
        viewAllSearch={SEARCH}
      />
    )
    expect(screen.queryByText('(0)')).toBeNull()
  })
})

describe('ProductRail — LCP', () => {
  /**
   * The Best Seller rail is the first band under the hero, so its first card's
   * artwork is the LCP candidate. `loading="lazy"` on that one image costs the
   * measurement a round trip the preload scanner would otherwise have started.
   * Only that one: making the whole track eager trades one good number for four
   * unnecessary downloads and a worse one.
   */
  it('leaves every card lazy by default', () => {
    const { container } = render(
      <ProductRail heading="New In" products={PRODUCTS} viewAllSearch={SEARCH} />
    )
    container.querySelectorAll('img').forEach((el) => {
      expect(el.getAttribute('loading')).toBe('lazy')
    })
  })

  it('loads only the first card eagerly when it holds the LCP candidate', () => {
    const { container } = render(
      <ProductRail
        heading="Best Seller"
        products={PRODUCTS}
        viewAllSearch={SEARCH}
        priority
      />
    )
    const cards = [...container.querySelectorAll('[data-testid="product-card"]')]
    const primaryOf = (card: Element) => card.querySelector('img:not(.absolute)')!

    expect(primaryOf(cards[0]!).getAttribute('loading')).toBe('eager')
    expect(primaryOf(cards[0]!).getAttribute('fetchpriority')).toBe('high')
    cards.slice(1).forEach((card) => {
      expect(primaryOf(card).getAttribute('loading')).toBe('lazy')
    })
  })
})

describe('ProductRail — band rhythm', () => {
  /**
   * #530: SectionBand's default `py-16 sm:py-24` left the View All pill 48px
   * under the card text and 96px above the band's edge — floating high in its
   * own pocket — and made the band 84px taller than a band with the same
   * contents. The bar's own pill sits 46.5 above and 63.5 below.
   *
   * Both breakpoints have to be named: twMerge only resolves a conflict within
   * one variant, so `py-6` alone leaves `sm:py-24` standing and the desktop
   * padding never changes.
   *
   * #541 took the phone figure down again, from 48 to 24. Measured at 390 the
   * bar's Best Seller band is 643px and ours was 733 for the same heading,
   * chip row, rail and pill; 24px is what it opens with, and its rail ends on
   * the next band's seam rather than 48px above it.
   */
  it('overrides the band padding at BOTH breakpoints', () => {
    render(
      <ProductRail
        heading="Best Seller"
        products={PRODUCTS}
        viewAllSearch={SEARCH}
        testId="rhythm-rail"
      />
    )
    const band = screen.getByTestId('rhythm-rail')
    expect(band.className).toContain('py-6')
    expect(band.className).toContain('sm:py-14')
    expect(band.className).not.toContain('py-16')
    expect(band.className).not.toContain('py-12')
    expect(band.className).not.toContain('sm:py-24')
  })

  /**
   * The pill and the heading are the other two places the phone band was
   * paying desktop money: 40px above the pill and 24 under the heading, on a
   * band whose whole content stack is 600px. Both keep their `sm:` figures.
   */
  it('keeps the phone pocket around the heading and the pill tight', () => {
    const { container } = render(
      <ProductRail
        heading="Best Seller"
        products={PRODUCTS}
        viewAllSearch={SEARCH}
        testId="pocket-rail"
      />
    )

    const headingRow = screen
      .getByRole('heading', { level: 2, name: 'Best Seller' })
      .closest('div')
    expect(headingRow?.className).toContain('mb-4')
    expect(headingRow?.className).toContain('sm:mb-7')

    const pillRow = screen.getByTestId('rail-view-all').parentElement
    expect(pillRow?.className).toContain('mt-6')
    expect(pillRow?.className).toContain('sm:mt-12')

    // and nothing reintroduced the old figures on the way past
    expect(container.innerHTML).not.toContain('mt-10 flex justify-center')
  })
})

describe('ProductRail — View All pill', () => {
  it('is one centred link to the collection page, not a text link in the heading', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    const pill = screen.getByTestId('rail-view-all')
    expect(pill.getAttribute('href')).toBe('/posters')
    expect(pill.textContent).toContain('View All')
  })

  it('carries the band’s own sort into the collection page', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    expect(
      JSON.parse(screen.getByTestId('rail-view-all').getAttribute('data-search') ?? '{}')
    ).toEqual({ sortBy: 'salesCount', sortOrder: 'desc' })
  })
})

describe('ProductRail — controls', () => {
  it('names each arrow after its band, so two rails on one page stay distinguishable', () => {
    render(<ProductRail heading="New In" products={PRODUCTS} viewAllSearch={SEARCH} />)
    const { left, right } = getArrows()
    expect(left.getAttribute('aria-label')).toContain('New In')
    expect(right.getAttribute('aria-label')).toContain('New In')
  })

  it('greys the prev arrow at the start of the track', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    const { left, right } = getArrows()
    expect(left.hasAttribute('disabled')).toBe(true)
    expect(right.hasAttribute('disabled')).toBe(false)
  })

  it('greys the next arrow once the track is scrolled to the end', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    const track = screen.getByTestId('product-rail-track')
    makeScrollable(track, { scrollLeft: 700, scrollWidth: 1000, clientWidth: 300 })
    fireEvent.scroll(track)

    const { left, right } = getArrows()
    expect(right.hasAttribute('disabled')).toBe(true)
    expect(left.hasAttribute('disabled')).toBe(false)
  })

  it('scrolls forward on next and backward on prev', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    const track = screen.getByTestId('product-rail-track')
    makeScrollable(track, { scrollLeft: 400, scrollWidth: 1000, clientWidth: 300 })
    fireEvent.scroll(track)
    track.scrollBy = vi.fn()

    fireEvent.click(getArrows().right)
    fireEvent.click(getArrows().left)

    const calls = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0].left).toBeGreaterThan(0)
    expect(calls[1][0].left).toBeLessThan(0)
  })
})

describe('ProductRail — keyboard', () => {
  it('makes the track itself a tab stop', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    expect(screen.getByTestId('product-rail-track').getAttribute('tabindex')).toBe('0')
  })

  it('moves the track with the arrow keys', () => {
    render(<ProductRail heading="Best Seller" products={PRODUCTS} viewAllSearch={SEARCH} />)
    const track = screen.getByTestId('product-rail-track')
    makeScrollable(track, { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 })
    track.scrollBy = vi.fn()

    track.focus()
    fireEvent.keyDown(track, { key: 'ArrowRight' })

    expect((track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0].left).toBeGreaterThan(0)
  })
})

describe('BestSellersRail', () => {
  it('reads real units sold from the LIST endpoint, not the featured list', async () => {
    listMock.mockResolvedValue({ items: PRODUCTS })
    await fetchBestSellerProducts()
    expect(listMock).toHaveBeenCalledTimes(1)
    expect(listMock.mock.calls[0][0]).toMatchObject({
      sortBy: 'salesCount',
      sortOrder: 'desc',
    })
  })

  it('returns an empty rail rather than throwing when the catalogue call fails', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    await expect(fetchBestSellerProducts()).resolves.toEqual([])
  })

  it('is titled as the band reads on the bar', () => {
    render(<BestSellersRail products={PRODUCTS} />)
    expect(screen.getByRole('heading', { name: 'Best Seller' })).toBeTruthy()
  })

  it('sends View All at the best-selling grid', () => {
    render(<BestSellersRail products={PRODUCTS} />)
    expect(
      JSON.parse(screen.getByTestId('rail-view-all').getAttribute('data-search') ?? '{}')
    ).toEqual({ sortBy: 'salesCount', sortOrder: 'desc' })
  })
})

describe('BestSellersRail — category pill row', () => {
  const STYLED_PRODUCTS: ProductCardData[] = [
    product(1, { title: 'Wabi Art', styles: ['wabi-sabi-art'] }),
    product(2, { title: 'Pop Art', styles: ['pop-art'] }),
    product(3, { title: 'Minimal Art', styles: ['minimalist-art'] }),
    product(4, { title: 'Another Wabi', styles: ['wabi-sabi-art'] }),
  ]

  it('renders category pill row with All and only styles present in products', () => {
    render(<BestSellersRail products={STYLED_PRODUCTS} />)
    const categoryRow = screen.getByTestId('rail-category-pills')
    expect(categoryRow).toBeTruthy()

    // "All" + 3 styles present ("Wabi-Sabi Art", "Pop Art", "Minimalist Art")
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wabi-Sabi Art' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pop Art' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Minimalist Art' })).toBeTruthy()

    // Styles NOT present in products (e.g. "Graffiti Art") must NOT be rendered (honesty rule)
    expect(screen.queryByRole('button', { name: 'Graffiti Art' })).toBeNull()
  })

  it('filters product cards when a category pill is selected', () => {
    render(<BestSellersRail products={STYLED_PRODUCTS} />)
    expect(screen.getAllByTestId('product-card')).toHaveLength(4)

    // Click "Wabi-Sabi Art" pill
    fireEvent.click(screen.getByRole('button', { name: 'Wabi-Sabi Art' }))
    const filteredCards = screen.getAllByTestId('product-card')
    expect(filteredCards).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Wabi Art' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Another Wabi' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Pop Art' })).toBeNull()

    // Click "All" pill to restore full product list
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getAllByTestId('product-card')).toHaveLength(4)
  })

  it('gives inactive chips a visible surface and touch target, and active chip solid highlight', () => {
    render(<BestSellersRail products={STYLED_PRODUCTS} />)
    const allPill = screen.getByRole('button', { name: 'All' })
    const wabiPill = screen.getByRole('button', { name: 'Wabi-Sabi Art' })

    // Active pill (All by default) - bg-band-strong with font-semibold
    expect(allPill.className).toContain('bg-band-strong')
    expect(allPill.className).toContain('text-foreground')

    // Inactive pill (Wabi-Sabi Art) - bg-[#f5f1e6] with hover:bg-band
    expect(wabiPill.className).toContain('bg-[#f5f1e6]')
    expect(wabiPill.className).toContain('text-foreground')

    // Touch target / height (h-10 min-h-[44px] lg:h-[52px])
    expect(wabiPill.className).toMatch(/h-10|min-h-\[44px\]|h-\[52px\]/)
  })
})

describe('NewInRail', () => {
  it('sources the newest active products by creation date', async () => {
    listMock.mockResolvedValue({ items: PRODUCTS })
    await fetchNewInProducts()
    expect(listMock.mock.calls[0][0]).toMatchObject({
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
  })

  it('returns an empty rail rather than throwing when the catalogue call fails', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    await expect(fetchNewInProducts()).resolves.toEqual([])
  })

  it('sends View All at the newest-first grid, not the best-seller one', () => {
    render(<NewInRail products={PRODUCTS} />)
    expect(
      JSON.parse(screen.getByTestId('rail-view-all').getAttribute('data-search') ?? '{}')
    ).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' })
  })
})
