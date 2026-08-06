/**
 * ProductCarousel tests
 *
 * Ticket #522 — related products become a horizontal carousel. Pins:
 *   - the card row reuses ProductCard (no bespoke card markup)
 *   - the heading is a prop, so the same component serves "Visually Similar
 *     Artworks" and "More to Love"
 *   - arrows are real, named buttons that disable at the scroll ends rather
 *     than dead-clicking
 *   - the track is a real keyboard target: focusable, and the arrow keys
 *     actually move it (jsdom does no layout/scrolling of its own, so this is
 *     the only way "keyboard scrollable" is verifiable here)
 *   - prefers-reduced-motion swaps the scroll behaviour from smooth to auto
 *
 * jsdom hard-codes scrollWidth/clientWidth/offsetWidth to 0 — there is no
 * layout engine underneath it — so every test that needs a specific
 * scrollable/at-end state defines those properties on the track element
 * directly, then fires a native 'scroll' event to make the component read
 * them (mirroring a real scroll or resize).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import type { ProductCardData } from '~/components/product/ProductCard'

// ProductCarousel renders ProductCard, which renders ChooseOptions, whose
// add-to-cart button now reads useCartActions (#511) — which calls
// useQueryClient unconditionally. Every render needs a client.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: any) => (
    <a href={typeof to === 'string' ? to : '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { ProductCarousel } = await import('~/components/product/ProductCarousel')

const product = (i: number): ProductCardData => ({
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
})

const PRODUCTS = [1, 2, 3, 4, 5, 6, 7].map(product)

/** Makes the track report as scrollable, sitting at the given position. */
function makeScrollable(
  track: HTMLElement,
  { scrollLeft, scrollWidth = 1000, clientWidth = 300 }: {
    scrollLeft: number
    scrollWidth?: number
    clientWidth?: number
  }
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProductCarousel — rendering', () => {
  it('renders the heading passed in, not a hardcoded one', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    expect(screen.getByRole('heading', { name: 'Visually Similar Artworks' })).toBeTruthy()
  })

  it('serves a second call site with a different heading unchanged otherwise', () => {
    render(<ProductCarousel heading="More to Love" products={PRODUCTS} />)
    expect(screen.getByRole('heading', { name: 'More to Love' })).toBeTruthy()
  })

  it('reuses ProductCard for every product — one card per product, no bespoke markup', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    expect(screen.getAllByTestId('product-card')).toHaveLength(PRODUCTS.length)
  })

  it('renders nothing when there are no related products', () => {
    const { container } = render(
      <ProductCarousel heading="Visually Similar Artworks" products={[]} />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('ProductCarousel — arrows', () => {
  it('exposes prev/next as real, accessibly-named buttons', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const { left, right } = getArrows()
    expect(left.tagName).toBe('BUTTON')
    expect(right.tagName).toBe('BUTTON')
  })

  it('names each arrow after the section it belongs to, so two carousels on one page stay distinguishable', () => {
    render(<ProductCarousel heading="More to Love" products={PRODUCTS} />)
    const { left, right } = getArrows()
    expect(left.getAttribute('aria-label')).toContain('More to Love')
    expect(right.getAttribute('aria-label')).toContain('More to Love')
  })

  it('disables the left arrow at the start of the track', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const { left, right } = getArrows()
    expect(left.hasAttribute('disabled')).toBe(true)
    expect(right.hasAttribute('disabled')).toBe(false)
  })

  it('disables the right arrow once scrolled to the end', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })

    makeScrollable(track, { scrollLeft: 700, scrollWidth: 1000, clientWidth: 300 })
    fireEvent.scroll(track)

    const { left, right } = getArrows()
    expect(right.hasAttribute('disabled')).toBe(true)
    expect(left.hasAttribute('disabled')).toBe(false)
  })

  it('re-enables the left arrow once scrolled away from the start', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })

    makeScrollable(track, { scrollLeft: 200, scrollWidth: 1000, clientWidth: 300 })
    fireEvent.scroll(track)

    const { left, right } = getArrows()
    expect(left.hasAttribute('disabled')).toBe(false)
    expect(right.hasAttribute('disabled')).toBe(false)
  })

  it('disables both arrows when the track is not scrollable at all', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })

    makeScrollable(track, { scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })
    fireEvent.scroll(track)

    const { left, right } = getArrows()
    expect(left.hasAttribute('disabled')).toBe(true)
    expect(right.hasAttribute('disabled')).toBe(true)
  })

  it('clicking the right arrow scrolls the track forward, not backward', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 })
    track.scrollBy = vi.fn()

    fireEvent.click(getArrows().right)

    expect(track.scrollBy).toHaveBeenCalledTimes(1)
    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.left).toBeGreaterThan(0)
  })

  it('clicking the left arrow scrolls the track backward', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 400, scrollWidth: 1000, clientWidth: 300 })
    fireEvent.scroll(track)
    track.scrollBy = vi.fn()

    fireEvent.click(getArrows().left)

    expect(track.scrollBy).toHaveBeenCalledTimes(1)
    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.left).toBeLessThan(0)
  })
})

describe('ProductCarousel — keyboard access', () => {
  it('the track itself is a keyboard tab stop', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    expect(track.getAttribute('tabindex')).toBe('0')
  })

  it('ArrowRight on the focused track scrolls it forward', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 })
    track.scrollBy = vi.fn()

    track.focus()
    fireEvent.keyDown(track, { key: 'ArrowRight' })

    expect(track.scrollBy).toHaveBeenCalledTimes(1)
    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.left).toBeGreaterThan(0)
  })

  it('ArrowLeft on the focused track scrolls it backward', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 400, scrollWidth: 1000, clientWidth: 300 })
    fireEvent.scroll(track)
    track.scrollBy = vi.fn()

    track.focus()
    fireEvent.keyDown(track, { key: 'ArrowLeft' })

    expect(track.scrollBy).toHaveBeenCalledTimes(1)
    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.left).toBeLessThan(0)
  })

  it('leaves unrelated keys alone', () => {
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    track.scrollBy = vi.fn()

    track.focus()
    fireEvent.keyDown(track, { key: 'Tab' })

    expect(track.scrollBy).not.toHaveBeenCalled()
  })
})

describe('ProductCarousel — prefers-reduced-motion', () => {
  function stubMatchMedia(matches: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
  }

  it('scrolls smoothly when the user has no motion preference set', () => {
    stubMatchMedia(false)
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 })
    track.scrollBy = vi.fn()

    fireEvent.click(getArrows().right)

    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.behavior).toBe('smooth')
  })

  it('jumps instantly when the user asks for reduced motion', () => {
    stubMatchMedia(true)
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 })
    track.scrollBy = vi.fn()

    fireEvent.click(getArrows().right)

    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.behavior).toBe('auto')
  })

  it('carries the same reduced-motion preference into keyboard scrolling', () => {
    stubMatchMedia(true)
    render(<ProductCarousel heading="Visually Similar Artworks" products={PRODUCTS} />)
    const track = screen.getByLabelText('Visually Similar Artworks', { selector: 'ul' })
    makeScrollable(track, { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 })
    track.scrollBy = vi.fn()

    track.focus()
    fireEvent.keyDown(track, { key: 'ArrowRight' })

    const call = (track.scrollBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.behavior).toBe('auto')
  })
})
