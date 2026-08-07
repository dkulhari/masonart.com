/**
 * The cart's free-shipping promise, and the one constant behind it.
 *
 * Settled by owner decision, 2026-08-07 (design §5). Two things are pinned
 * here, and they are the two halves of the same bug:
 *
 * 1. **The threshold reads the NET, post-discount figure.** A ₹1,600 cart under
 *    a 40% sale is ₹960: it clears ₹999 gross and does not clear it net. The
 *    server charges shipping on that cart (`calculateShippingCost`), so the cart
 *    page has to say so. A page reading the gross figure would promise free
 *    shipping the checkout then charges for, and the customer would only find
 *    out at the card screen.
 *
 * 2. **There is exactly one threshold.** The page used to hardcode
 *    `const shippingThreshold = 999` beside copy that repeated the figure by
 *    hand, while the API charged by ₹2000 of its own. Everything now reads
 *    `@chobii/shared`. These tests derive their fixtures FROM the constant
 *    rather than restating it, so they follow the number wherever it goes —
 *    and the API's own boundary tests
 *    (`packages/api/tests/routes/order-promotion-pricing.test.ts`) import the
 *    same module, which is what makes the two sides provably agree.
 *
 * A gift card never appears here: it is tender, applied at the payment
 * endpoint after tax, and the cart has no concept of it. That exclusion is
 * pinned server-side, where a gift card actually exists.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import {
  FREE_SHIPPING_THRESHOLD,
  FREE_SHIPPING_THRESHOLD_LABEL,
  freeShippingThresholdLabel,
} from '@chobii/shared'
import { FreeShippingThresholdProvider } from '~/lib/free-shipping'

// ============================================================================
// Mocks
// ============================================================================

/** The route module calls `createFileRoute`; nothing here mounts a router. */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

const serverCart = vi.hoisted(() => ({
  data: undefined as unknown,
  refetch: vi.fn(),
}))

vi.mock('~/hooks/useCart', () => ({
  useServerCart: () => serverCart,
}))

const membership = vi.hoisted(() => ({
  isMember: true,
  isLoading: false,
  join: vi.fn(),
}))

vi.mock('~/hooks/useGalleryMembership', () => ({
  useGalleryMembership: () => membership,
}))

vi.mock('~/components/promo/JoinGalleryModal', () => ({
  JoinGalleryModal: () => null,
}))

import { CartContent } from '~/routes/cart/index'
import { useCartStore, type CartItem } from '~/stores/cart'

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/** The same page, with an admin-configured threshold in force (#570). */
function renderAt(threshold: number, ui: ReactElement) {
  return render(
    <FreeShippingThresholdProvider value={threshold}>
      {ui}
    </FreeShippingThresholdProvider>
  )
}

// ============================================================================
// Fixtures
// ============================================================================

/** One local line. `unitPrice` is rupees — what the store keeps. */
function localLine(unitPrice: number): CartItem {
  return {
    id: 'cart_1',
    productId: 'p1',
    variantId: 'v1',
    frameId: null,
    quantity: 1,
    productTitle: 'Golden Dunes',
    productSlug: 'golden-dunes',
    thumbnailUrl: '/img.jpg',
    sizeLabel: 'A2',
    widthInches: 18,
    heightInches: 24,
    unitPrice,
    framePrice: 0,
    isAiGenerated: false,
    addedAt: '2026-08-05T00:00:00.000Z',
  }
}

/**
 * A cart of one line, priced by the server.
 *
 * `gross` and `net` are rupees; the payload carries the same two figures as
 * the strings `GET /api/cart` returns, so the page's saving is the server's
 * subtraction and not this test's.
 */
function givenCart({ gross, net }: { gross: number; net: number }) {
  useCartStore.setState({ items: [localLine(gross)], isDrawerOpen: false })

  serverCart.data = {
    items: [
      {
        id: 'srv_cart_1',
        productId: 'p1',
        variantId: 'v1',
        frameId: null,
        quantity: 1,
        pricing: {
          base: gross.toFixed(2),
          sale: net < gross ? net.toFixed(2) : null,
          locked: false,
          headline: net < gross ? 'SUMMER SALE — 40% OFF EVERYTHING' : null,
          percentOff: net < gross ? 40 : null,
        },
      },
    ],
    savedForLater: [],
    savingTotal: (gross - net).toFixed(2),
  }
}

/** The first rupee figure in an element, as a number. */
function money(testId: string): number {
  const text = screen.getByTestId(testId).textContent ?? ''
  const figure = text.match(/₹\s?[\d,]+(?:\.\d{2})?/)
  return figure ? Number(figure[0].replace(/[^0-9.]/g, '')) : NaN
}

function shippingRow(): string {
  return screen.getByTestId('cart-shipping').textContent ?? ''
}

// ============================================================================
// Tests
// ============================================================================

describe('cart free-shipping threshold', () => {
  beforeEach(() => {
    membership.isMember = true
    serverCart.data = undefined
    serverCart.refetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
    useCartStore.setState({ items: [], isDrawerOpen: false })
  })

  it('charges shipping on a cart that clears the threshold gross but not net', () => {
    // ₹1,600 at 40% off is ₹960 — over ₹999 before the sale, under it after.
    givenCart({ gross: 1600, net: 960 })

    render(<CartContent />)

    expect(shippingRow()).toContain('₹99')
    expect(shippingRow()).not.toContain('FREE')
    // The progress nudge measures the shortfall from the net figure too.
    expect(screen.getByText(/more\s+for free shipping/)).toBeTruthy()
    // 960 + 99: the total is built on the same net figure.
    expect(money('cart-total')).toBe(1059)
  })

  it('ships free when the cart clears the threshold after the discount too', () => {
    givenCart({ gross: 2000, net: 1200 })

    render(<CartContent />)

    expect(shippingRow()).toContain('FREE')
    expect(money('cart-total')).toBe(1200)
  })

  it('ships free exactly at the shared threshold', () => {
    givenCart({ gross: FREE_SHIPPING_THRESHOLD, net: FREE_SHIPPING_THRESHOLD })

    render(<CartContent />)

    expect(shippingRow()).toContain('FREE')
  })

  it('charges shipping a rupee below the shared threshold', () => {
    givenCart({
      gross: FREE_SHIPPING_THRESHOLD - 1,
      net: FREE_SHIPPING_THRESHOLD - 1,
    })

    render(<CartContent />)

    expect(shippingRow()).toContain('₹99')
  })

  it('takes the threshold in its copy from the same constant it charges by', () => {
    givenCart({ gross: 2000, net: 1200 })

    render(<CartContent />)

    // Not a hardcoded "₹999": the promise and the arithmetic move together.
    expect(screen.getByTestId('cart-free-shipping-copy').textContent).toBe(
      `Free shipping on orders over ${FREE_SHIPPING_THRESHOLD_LABEL}`
    )
  })

  it('does not spend a locked saving on the threshold', () => {
    // A members-only sale the viewer has not joined: the server charges base,
    // and totals the saving as zero. The page must price shipping on what is
    // actually charged, not on the teaser.
    membership.isMember = false
    useCartStore.setState({
      items: [localLine(1600)],
      isDrawerOpen: false,
    })
    serverCart.data = {
      items: [
        {
          id: 'srv_cart_1',
          productId: 'p1',
          variantId: 'v1',
          frameId: null,
          quantity: 1,
          pricing: {
            base: '1600.00',
            sale: '960.00',
            locked: true,
            headline: 'MEMBERS ONLY — 40% OFF',
            percentOff: 40,
          },
        },
      ],
      savedForLater: [],
      savingTotal: '0.00',
    }

    render(<CartContent />)

    // ₹1,600 is what this cart costs, and ₹1,600 clears the threshold.
    expect(shippingRow()).toContain('FREE')
    expect(money('cart-total')).toBe(1600)
  })
})

/**
 * The admin setting, and the three things that must move with it (#570).
 *
 * #569 made the threshold editable. That is only safe if the figure the page
 * PROMISES, the bar measuring PROGRESS toward it, and the shipping the page
 * CHARGES are one number — an admin raising the threshold while the copy still
 * says ₹999 is the false-advertising gap `70bfa9dd` closed, rebuilt.
 */
describe('cart free-shipping threshold, once an admin has moved it', () => {
  /** Not 999, and it formats with a comma, so a hand-built string shows up. */
  const CONFIGURED = 1499

  beforeEach(() => {
    membership.isMember = true
    serverCart.data = undefined
    serverCart.refetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
    useCartStore.setState({ items: [], isDrawerOpen: false })
  })

  it('charges shipping on a cart that cleared the old threshold but not the new one', () => {
    // ₹1,200 shipped free at ₹999. At ₹1,499 it does not.
    givenCart({ gross: 1200, net: 1200 })

    renderAt(CONFIGURED, <CartContent />)

    expect(shippingRow()).toContain('₹99')
    expect(shippingRow()).not.toContain('FREE')
    expect(money('cart-total')).toBe(1299)
  })

  it('measures the shortfall against the configured threshold', () => {
    givenCart({ gross: 1200, net: 1200 })

    renderAt(CONFIGURED, <CartContent />)

    // 1499 - 1200. Against the bundled ₹999 this cart has no shortfall at all.
    expect(screen.getByText('₹299.00')).toBeTruthy()
  })

  it('states the configured threshold in the copy, not the bundled default', () => {
    givenCart({ gross: 2000, net: 2000 })

    renderAt(CONFIGURED, <CartContent />)

    expect(screen.getByTestId('cart-free-shipping-copy').textContent).toBe(
      `Free shipping on orders over ${freeShippingThresholdLabel(CONFIGURED)}`
    )
    expect(
      screen.getByTestId('cart-free-shipping-copy').textContent
    ).not.toContain(FREE_SHIPPING_THRESHOLD_LABEL)
  })

  it('ships free exactly at the configured threshold', () => {
    givenCart({ gross: CONFIGURED, net: CONFIGURED })

    renderAt(CONFIGURED, <CartContent />)

    expect(shippingRow()).toContain('FREE')
  })
})
