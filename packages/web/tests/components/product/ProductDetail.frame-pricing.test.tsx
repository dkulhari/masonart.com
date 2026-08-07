/**
 * The PDP buy panel prices a frame the way the server charges for it (#566).
 *
 * A frame row carries two price columns — `priceModifier` (1.40 meaning "the
 * piece plus 40%") and a flat `priceAddition` on top. `frameAddition` in
 * `@chobii/shared` combines them, and that is the formula `POST /api/cart/items`
 * stores and `POST /api/orders` charges.
 *
 * The buy panel used to re-derive the number from a percentage the route had
 * pre-computed, with no channel for the flat column at all: a frame carrying
 * both would be quoted low on the button and charged correctly at checkout.
 * Every seeded frame has `priceAddition` at "0.00" today, so the drop was
 * invisible — these cases are what make it visible.
 *
 * Scoped to the price the panel quotes and the price it sends to the cart.
 * The gallery, the tabs and the review section are covered elsewhere.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ProductImage } from '@chobii/shared'

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ session: null }),
  Link: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
}))

const addItem = vi.fn()
vi.mock('~/hooks/useCartActions', () => ({
  useCartActions: () => ({ addItem }),
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

/**
 * 40% of the piece plus a flat ₹150 — the combination no seeded row has yet
 * and the one an admin write path makes possible.
 */
const GILT = {
  id: 'f-gilt',
  type: 'gold',
  name: 'Hand-Gilt Frame',
  description: 'Hand-applied gold leaf',
  pricing: { priceModifier: '1.40', priceAddition: '150.00' },
  isAvailable: true,
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
  frames: [GILT],
  orientation: 'portrait' as const,
  sale: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  addItem.mockClear()
  resetGalleryMembershipSignal()
})

// fireEvent rather than a bare .click(): the panel holds the chosen frame in
// React state, and only an act-wrapped event flushes the re-render the price
// assertions read.
const selectGilt = () =>
  fireEvent.click(screen.getByRole('button', { name: /Hand-Gilt Frame/ }))

const addToCart = () =>
  fireEvent.click(screen.getByRole('button', { name: /Add to cart/ }))

describe('ProductDetail buy panel — frame pricing', () => {
  it('quotes size plus proportional markup plus the flat addition on the CTA', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })
    selectGilt()

    // 2000 + 800 + 150. The old panel quoted 2,800.00 and the cart charged 2,950.
    expect(
      screen.getByRole('button', { name: /Add to cart/ }).textContent
    ).toContain('2,950.00')
  })

  it('repeats that same figure in the configuration summary', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })
    selectGilt()

    expect(
      screen.getByTestId('buybox-config-summary').textContent
    ).toContain('2,950.00')
  })

  it('sends the combined frame price to the cart, not the percentage alone', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })
    selectGilt()
    addToCart()

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ frameId: 'f-gilt', unitPrice: 2000, framePrice: 950 })
    )
  })

  it('leaves an unframed configuration at the size price', () => {
    render(<ProductDetail product={product} promotion={null} />, { wrapper })

    expect(
      screen.getByRole('button', { name: /Add to cart/ }).textContent
    ).toContain('2,000.00')
  })
})
