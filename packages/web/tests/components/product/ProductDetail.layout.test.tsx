/**
 * The PDP buy panel and gallery after the parity rebuild (#512–#514, #518).
 *
 * Geometry is NOT asserted here. jsdom applies no stylesheet, so a test that
 * read a column width would be reading zeros and a test that read class
 * strings would only be restating the source. The measured 728/48/485 grid,
 * the 42px H1 and the 343x60 button are verified against a real engine by
 * `scripts/pdp-shot.mjs --probe`, which is where numbers belong.
 *
 * What is worth pinning down here is the behaviour the redesign introduced,
 * and the two things it deliberately did NOT introduce:
 *
 *   - the CTA now names a price, so it can now disagree with the price above
 *     it — including in the one case where it is supposed to;
 *   - the reference's social-proof counters are absent on purpose, and the
 *     cheapest way for them to come back is somebody hardcoding them;
 *   - the arrows are invisible until hover, and the whole point of doing that
 *     with opacity was that they stay in the accessibility tree.
 *
 * `@tanstack/react-router` is mocked for the same reason ProductDetail.sale
 * mocks it: the panel reads membership off the root route context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ProductImage } from '@chobii/shared'

const routeContext: { session: { user?: { id: string; galleryMember: boolean } } | null } =
  { session: null }

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => routeContext,
  Link: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
}))

const { ProductDetail } = await import('~/components/product/ProductDetail')
const { resetGalleryMembershipSignal } = await import('~/hooks/useGalleryMembership')

const image = (n: number): ProductImage => ({
  id: `i${n}`,
  url: `/img${n}.webp`,
  altText: `alt ${n}`,
  type: n === 0 ? 'main' : 'lifestyle',
  sortOrder: n,
  width: 1500,
  height: 1500,
  originalKey: `o${n}`,
})

const SALE = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'Monsoon Sale — 40% off',
  percentOff: 40,
  basePrice: '2000.00',
  salePrice: '1200.00',
  locked: false,
}

const product = {
  id: 'p1',
  sku: 'ABS-001',
  title: 'Dream Big',
  slug: 'dream-big',
  description: 'A poster',
  images: [image(0), image(1), image(2)],
  variants: [
    {
      id: 'v1',
      sizeId: 's1',
      sizeLabel: '12x16',
      widthInches: 12,
      heightInches: 16,
      price: '2000.00',
      stockQuantity: 10,
      isAvailable: true,
    },
  ],
  orientation: 'portrait' as const,
  rating: { averageRating: 4.5, reviewCount: 12 },
}

const addToCart = () =>
  screen.getByRole('button', { name: /add to cart/i })

// ProductDetail reads addItem from useCartActions (#511), which calls
// useQueryClient — every render needs a provider, not just the ones that
// exercise a write.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  routeContext.session = null
  resetGalleryMembershipSignal()
})

describe('the buy panel header', () => {
  it('carries the SKU inside the title rather than on a line of its own', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('Dream Big')
    expect(h1.textContent).toContain('#ABS-001')
  })

  it('keeps the way down to the reviews wall', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    const link = screen.getByTestId('buybox-reviews-link')
    expect(link.getAttribute('href')).toBe('#reviews')
    expect(link.textContent).toContain('12 reviews')
  })

  /**
   * The reference prints `89 saves`, `In 7 carts now` and `3 sold in last 84
   * hours`. We hold no such counters. Rendering plausible-looking numbers
   * would be manufacturing evidence about other people's behaviour, which is
   * a different kind of wrong from a layout being off by 40px — so the lines
   * are absent, and this is the test that notices if they come back without
   * a data source behind them.
   */
  it('invents no social-proof counters', () => {
    const { container } = render(<ProductDetail product={product} promotion={null} />, { wrapper })
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/\bsaves\b/i)
    expect(text).not.toMatch(/carts now/i)
    expect(text).not.toMatch(/sold in last/i)
  })
})

describe('the add-to-cart label', () => {
  it('names the price the panel is showing', () => {
    render(<ProductDetail product={{ ...product, sale: null }} promotion={null} />, { wrapper })

    expect(addToCart().textContent).toContain('2,000.00')
    expect(screen.getByTestId('price-current').textContent).toContain('2,000.00')
  })

  it('follows the sale down when the sale is the viewer’s', () => {
    render(<ProductDetail product={{ ...product, sale: SALE }} promotion={null} />, { wrapper })

    expect(addToCart().textContent).toContain('1,200.00')
  })

  /**
   * The one deliberate disagreement. A locked price is still SHOWN — tagged
   * `Members`, because the tag is the offer — but it is not what this visitor
   * is charged, and a button is a promise about the charge.
   */
  it('quotes what a non-member actually pays, not the price they cannot have', () => {
    render(
      <ProductDetail
        product={{ ...product, sale: { ...SALE, locked: true } }}
        promotion={null}
      />,
      { wrapper }
    )

    expect(screen.getByTestId('sale-members-tag')).toBeTruthy()
    expect(addToCart().textContent).toContain('2,000.00')
    expect(addToCart().textContent).not.toContain('1,200.00')
  })

  it('follows a mid-session join, like the price does', () => {
    routeContext.session = { user: { id: 'u1', galleryMember: true } }

    render(
      <ProductDetail
        product={{ ...product, sale: { ...SALE, locked: true } }}
        promotion={null}
      />,
      { wrapper }
    )

    expect(addToCart().textContent).toContain('1,200.00')
  })
})

describe('the gallery', () => {
  /**
   * The arrows are faded out rather than removed, because the reference paints
   * none over the artwork. Fading is only acceptable while they remain real,
   * labelled, focusable buttons — `hidden` would have looked identical in a
   * screenshot and taken the keyboard route away.
   */
  it('keeps prev/next in the accessibility tree', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    expect(screen.getByRole('button', { name: 'Previous image' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next image' })).toBeTruthy()
  })

  it('offers every thumbnail as a named button', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    for (let i = 1; i <= product.images.length; i++) {
      expect(
        screen.getByRole('button', { name: `Show image ${i} of 3` })
      ).toBeTruthy()
    }
  })

  /**
   * At 390 the rail stops being a rail and becomes a horizontal scroll strip
   * under the artwork (#523), which means the ring marking the current
   * thumbnail can be scrolled off the edge of its own strip. `aria-current` is
   * the half of that state which does not depend on being able to see it, so
   * it is the half worth pinning — and pinned on the selection CHANGING, not
   * merely on first paint, since a mark that never moves is indistinguishable
   * from a hardcoded one.
   */
  it('marks exactly one thumbnail as current, and moves the mark on selection', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    const marked = () =>
      screen
        .getAllByTestId('pdp-thumbnail')
        .filter((el) => el.getAttribute('aria-current') === 'true')

    expect(marked()).toHaveLength(1)
    expect(marked()[0]).toBe(screen.getByRole('button', { name: 'Show image 1 of 3' }))

    fireEvent.click(screen.getByRole('button', { name: 'Show image 3 of 3' }))

    expect(marked()).toHaveLength(1)
    expect(marked()[0]).toBe(screen.getByRole('button', { name: 'Show image 3 of 3' }))
  })

  it('gives the expand affordance a name', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })
    expect(screen.getByRole('button', { name: 'Expand image' })).toBeTruthy()
  })

  it('still labels the quantity stepper, which now shows only arrows', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeTruthy()
    expect(screen.getByText('Quantity')).toBeTruthy()
  })
})
