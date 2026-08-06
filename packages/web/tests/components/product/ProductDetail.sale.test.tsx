/**
 * The PDP buy panel under a running sale (#435).
 *
 * Scoped to the sale block deliberately: ProductDetail's gallery, selectors
 * and cart wiring are covered by the page's own E2E, and re-asserting them
 * here would make this file fail for reasons that have nothing to do with a
 * promotion.
 *
 * `@tanstack/react-router` is mocked because the buy panel reads membership
 * through `useGalleryMembership()`, which pulls the session off the root
 * route context. That is the one shared signal (#443) — mocking the context
 * is how we stand in for a session, not a second source of truth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProductImage } from '@chobii/shared'

const routeContext: { session: { user?: { id: string; galleryMember: boolean } } | null } =
  { session: null }

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => routeContext,
  Link: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
}))

const { ProductDetail } = await import('~/components/product/ProductDetail')
const { resetGalleryMembershipSignal } = await import('~/hooks/useGalleryMembership')

const image: ProductImage = {
  id: 'i0',
  url: '/img0.webp',
  altText: 'alt',
  type: 'main',
  sortOrder: 0,
  width: 1500,
  height: 1500,
  originalKey: 'o0',
}

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
  images: [image],
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
}

/** An hour out, so the clock has something real to print. */
const deadline = () => new Date(Date.now() + 3_600_000).toISOString()

beforeEach(() => {
  routeContext.session = null
  resetGalleryMembershipSignal()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProductDetail buy panel — sale pricing', () => {
  it('leaves the panel exactly as it was when nothing is on sale', () => {
    render(<ProductDetail product={{ ...product, sale: null }} promotion={null} />)

    expect(screen.queryByTestId('price-was')).toBeNull()
    expect(screen.queryByTestId('sale-percent-off')).toBeNull()
    expect(screen.queryByTestId('buybox-sale-countdown')).toBeNull()
  })

  it('strikes the base price and prints the sale price', () => {
    render(<ProductDetail product={{ ...product, sale: SALE }} promotion={null} />)

    expect(screen.getByTestId('price-was').textContent).toContain('2,000.00')
    expect(screen.getByTestId('price-was').className).toContain('line-through')
    expect(screen.getByTestId('price-current').textContent).toContain('1,200.00')
  })

  it('carries the percent-off marker the payload resolved', () => {
    render(<ProductDetail product={{ ...product, sale: SALE }} promotion={null} />)
    expect(screen.getByTestId('sale-percent-off').textContent).toContain('40')
  })

  it('tags a members-only price the viewer has not unlocked', () => {
    render(
      <ProductDetail
        product={{ ...product, sale: { ...SALE, locked: true } }}
        promotion={null}
      />
    )
    expect(screen.getByTestId('sale-members-tag')).toBeTruthy()
  })

  it('drops the tag once the shared membership signal says the viewer is in', () => {
    routeContext.session = { user: { id: 'u1', galleryMember: true } }

    render(
      <ProductDetail
        product={{ ...product, sale: { ...SALE, locked: true } }}
        promotion={null}
      />
    )
    expect(screen.queryByTestId('sale-members-tag')).toBeNull()
  })
})

describe('ProductDetail buy panel — the countdown echo', () => {
  it('echoes the headline and the clock the strip is already running', async () => {
    const promotion = {
      promotionId: SALE.promotionId,
      headline: SALE.headline,
      percentOff: 40,
      membersOnly: false,
      deadline: deadline(),
    }

    render(
      <ProductDetail
        product={{ ...product, sale: SALE }}
        promotion={promotion}
      />
    )

    const clock = await screen.findByTestId('buybox-sale-countdown')
    // Same HH : MM : SS shape the strip prints — one formatter, so the band at
    // the top of the page and the panel beside the artwork cannot disagree.
    expect(clock.textContent).toMatch(/\d{2} : \d{2} : \d{2}/)
    expect(clock.getAttribute('datetime')).toBe(promotion.deadline)
  })

  it('shows no clock at all once the window has run out', () => {
    // Reaching zero mid-session is ordinary: the rolling window can expire
    // while the sale is still live. The panel drops the timer, not the price.
    render(
      <ProductDetail
        product={{ ...product, sale: SALE }}
        promotion={{
          promotionId: SALE.promotionId,
          headline: SALE.headline,
          percentOff: 40,
          membersOnly: false,
          deadline: new Date(Date.now() - 1000).toISOString(),
        }}
      />
    )

    expect(screen.queryByTestId('buybox-sale-countdown')).toBeNull()
    expect(screen.getByTestId('price-current').textContent).toContain('1,200.00')
  })

  it('runs no countdown when the product itself is not on sale', () => {
    render(
      <ProductDetail
        product={{ ...product, sale: null }}
        promotion={{
          promotionId: SALE.promotionId,
          headline: SALE.headline,
          percentOff: 40,
          membersOnly: false,
          deadline: deadline(),
        }}
      />
    )

    // A promotion can be running that this poster is excluded from. Echoing
    // its clock over a full-price product advertises a discount the checkout
    // will not honour.
    expect(screen.queryByTestId('buybox-sale-countdown')).toBeNull()
  })

  it('never derives a window of its own — an absent promotion means no clock', () => {
    render(
      <ProductDetail product={{ ...product, sale: SALE }} promotion={null} />
    )
    expect(screen.queryByTestId('buybox-sale-countdown')).toBeNull()
    // The sale still shows: the price comes from the product payload, the
    // clock comes from the promotion payload, and they arrive separately.
    expect(screen.getByTestId('price-was')).toBeTruthy()
  })
})
