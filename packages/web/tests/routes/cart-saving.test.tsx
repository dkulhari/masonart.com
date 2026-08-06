/**
 * The cart saving row (#436) — the sale's single point of contact with a
 * customer who is about to pay.
 *
 * Three things are under test, each of them a way this row goes wrong:
 *
 * 1. **Every figure is the server's.** `GET /api/cart` (#429) resolves the sale
 *    on every read and hands back `items[].pricing = { base, sale, locked, … }`
 *    plus a cart-level `savingTotal`. A discount re-derived on the client from
 *    `percentOff` would be a second pricing authority, and the first time it
 *    disagreed with the resolver the cart would advertise a saving the checkout
 *    does not give. So the fixtures below deliberately include a line whose
 *    `sale` is NOT `percentOff` off its `base`: the row has to follow
 *    `base − sale`, and a component doing its own arithmetic fails there.
 *
 * 2. **Locked is shown, not hidden.** A guest under a members-only promotion
 *    gets `locked: true` on every line and `savingTotal: '0.00'` — because a
 *    locked line is charged base, and the server is telling the truth about what
 *    it will charge. The row still has to show the number, as the money the
 *    viewer is not getting yet, with the way to get it. An absent row is the
 *    failure mode this ticket exists to prevent.
 *
 * 3. **The totals reconcile.** Line savings sum to the cart saving, in both the
 *    unlocked and the locked presentation. If they ever drift, one of the two is
 *    being computed somewhere other than the payload.
 *
 * The Zustand store is what the page renders lines from (the cart is a local
 * cart); pricing is matched onto those lines by product/variant/frame, which is
 * the natural key a cart row has on both sides.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

// ============================================================================
// Mocks
// ============================================================================

/** The route module calls `createFileRoute`; nothing here mounts a router. */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

/** The priced cart, as `GET /api/cart` answers it. */
const serverCart = vi.hoisted(() => ({
  data: undefined as unknown,
  refetch: vi.fn(),
}))

vi.mock('~/hooks/useCart', () => ({
  useServerCart: () => serverCart,
}))

/** Membership is #443's hook; only `isMember` matters to this surface. */
const membership = vi.hoisted(() => ({
  isMember: false,
  isLoading: false,
  join: vi.fn(),
}))

vi.mock('~/hooks/useGalleryMembership', () => ({
  useGalleryMembership: () => membership,
}))

/** #444's dialog, stubbed: what matters here is that the row opens it. */
vi.mock('~/components/promo/JoinGalleryModal', () => ({
  JoinGalleryModal: ({ open, source }: { open: boolean; source: string }) =>
    open ? <div data-testid="join-modal" data-source={source} /> : null,
}))

import { CartContent } from '~/routes/cart/index'
import { useCartStore, type CartItem } from '~/stores/cart'

// CartContent reads updateQuantity/removeItem/clearCart from useCartActions
// (#511), which calls useQueryClient unconditionally. Every render needs a
// client.
function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

// ============================================================================
// Fixtures
// ============================================================================

function localLine(overrides: Partial<CartItem> = {}): CartItem {
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
    unitPrice: 25300,
    framePrice: 0,
    isAiGenerated: false,
    addedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

const LINE_A = localLine()
const LINE_B = localLine({
  id: 'cart_2',
  productId: 'p2',
  variantId: 'v2',
  productTitle: 'Kyoto Rain',
  productSlug: 'kyoto-rain',
  unitPrice: 4000,
})

interface PricingFixture {
  base: string
  sale: string | null
  locked?: boolean
  percentOff?: number | null
}

function pricedLine(
  line: CartItem,
  pricing: PricingFixture
): Record<string, unknown> {
  return {
    id: `srv_${line.id}`,
    productId: line.productId,
    variantId: line.variantId,
    frameId: line.frameId,
    quantity: line.quantity,
    pricing: {
      base: pricing.base,
      sale: pricing.sale,
      locked: pricing.locked ?? false,
      headline: pricing.sale ? 'SUMMER SALE — 40% OFF EVERYTHING' : null,
      percentOff: pricing.sale ? (pricing.percentOff ?? 40) : null,
    },
  }
}

/** 40% off both lines: 10120.00 + 1600.00. */
const DISCOUNTED = [
  pricedLine(LINE_A, { base: '25300.00', sale: '15180.00' }),
  pricedLine(LINE_B, { base: '4000.00', sale: '2400.00' }),
]

const LOCKED = [
  pricedLine(LINE_A, { base: '25300.00', sale: '15180.00', locked: true }),
  pricedLine(LINE_B, { base: '4000.00', sale: '2400.00', locked: true }),
]

function givenPricedCart(
  items: Record<string, unknown>[],
  savingTotal: string
) {
  serverCart.data = { items, savedForLater: [], savingTotal }
}

// ============================================================================
// Helpers
// ============================================================================

/** The first rupee figure a rendered element carries, as a number. */
function money(text: string): number {
  const figure = text.match(/₹\s?[\d,]+(?:\.\d{2})?/)
  return figure ? Number(figure[0].replace(/[^0-9.]/g, '')) : NaN
}

function lineSavings(): number[] {
  return screen
    .queryAllByTestId('cart-line-saving')
    .map((el) => money(el.textContent ?? ''))
}

function cartSaving(testId: string): number {
  return money(screen.getByTestId(testId).textContent ?? '')
}

// ============================================================================
// Tests
// ============================================================================

describe('cart saving row', () => {
  beforeEach(() => {
    membership.isMember = false
    serverCart.data = undefined
    serverCart.refetch = vi.fn()
    useCartStore.setState({ items: [LINE_A, LINE_B], isDrawerOpen: false })
  })

  afterEach(() => {
    cleanup()
    useCartStore.setState({ items: [], isDrawerOpen: false })
  })

  it('renders no saving row at all when nothing on the cart is discounted', () => {
    givenPricedCart(
      [
        pricedLine(LINE_A, { base: '25300.00', sale: null }),
        pricedLine(LINE_B, { base: '4000.00', sale: null }),
      ],
      '0.00'
    )

    render(<CartContent />)

    expect(screen.queryByTestId('cart-saving')).toBeNull()
    expect(screen.queryByTestId('cart-saving-locked')).toBeNull()
    expect(screen.queryAllByTestId('cart-line-saving')).toHaveLength(0)
    expect(screen.queryByText(/join the gallery/i)).toBeNull()
  })

  it('renders no saving row before the priced cart has loaded', () => {
    serverCart.data = undefined

    render(<CartContent />)

    expect(screen.queryByTestId('cart-saving')).toBeNull()
    expect(screen.queryByTestId('cart-saving-locked')).toBeNull()
    expect(screen.queryAllByTestId('cart-line-saving')).toHaveLength(0)
  })

  it('shows a member what each discounted line saves', () => {
    membership.isMember = true
    givenPricedCart(DISCOUNTED, '11720.00')

    render(<CartContent />)

    expect(lineSavings()).toEqual([10120, 1600])
    for (const el of screen.getAllByTestId('cart-line-saving')) {
      expect(el.dataset.locked).toBe('false')
    }
  })

  it('shows the cart-level saving exactly as the server reported it', () => {
    membership.isMember = true
    // Not the sum of anything this component could reach on its own: it is the
    // figure `savingTotal` carries, and it is the figure that must be shown.
    givenPricedCart(DISCOUNTED, '11720.00')

    render(<CartContent />)

    expect(screen.getByTestId('cart-saving')).toHaveTextContent('11,720.00')
    expect(screen.queryByTestId('cart-saving-locked')).toBeNull()
  })

  it('reconciles: the line savings sum to the cart saving', () => {
    membership.isMember = true
    givenPricedCart(DISCOUNTED, '11720.00')

    render(<CartContent />)

    const sum = lineSavings().reduce((total, amount) => total + amount, 0)
    expect(sum).toBe(cartSaving('cart-saving'))
  })

  it('takes each figure off base − sale, never off percentOff', () => {
    // A promotion whose resolved sale price is not what a client-side "40% of
    // base" would produce — a rounding rule, a per-line floor, a fixed-amount
    // discount quoted as a percentage. The server's arithmetic wins.
    membership.isMember = true
    givenPricedCart(
      [
        pricedLine(LINE_A, {
          base: '25300.00',
          sale: '20000.00',
          percentOff: 40,
        }),
      ],
      '5300.00'
    )
    useCartStore.setState({ items: [LINE_A] })

    render(<CartContent />)

    expect(lineSavings()).toEqual([5300])
    expect(screen.getByTestId('cart-saving')).toHaveTextContent('5,300.00')
    // 40% of 25300 — what re-deriving the discount would have shown.
    expect(screen.queryByText(/10,120/)).toBeNull()
  })

  it('reads a locked cart as a locked saving with a join affordance', () => {
    // The server charges base on a locked line, so `savingTotal` is 0.00 —
    // truthfully. The row still shows the money, because the whole point of the
    // gate is that the customer sees what they are not getting yet.
    givenPricedCart(LOCKED, '0.00')

    render(<CartContent />)

    const locked = screen.getByTestId('cart-saving-locked')
    expect(money(locked.textContent ?? '')).toBe(11720)
    expect(locked).toHaveTextContent(/join the gallery/i)
    // Not presented as money already taken off.
    expect(screen.queryByTestId('cart-saving')).toBeNull()
  })

  it('marks every locked line as locked and still reconciles', () => {
    givenPricedCart(LOCKED, '0.00')

    render(<CartContent />)

    const lines = screen.getAllByTestId('cart-line-saving')
    expect(lines).toHaveLength(2)
    for (const el of lines) expect(el.dataset.locked).toBe('true')

    const sum = lineSavings().reduce((total, amount) => total + amount, 0)
    expect(sum).toBe(cartSaving('cart-saving-locked'))
  })

  it('shows a guest the same number a member is shown', () => {
    membership.isMember = true
    givenPricedCart(DISCOUNTED, '11720.00')
    const { unmount } = render(<CartContent />)
    const asMember = cartSaving('cart-saving')
    unmount()

    membership.isMember = false
    givenPricedCart(LOCKED, '0.00')
    render(<CartContent />)

    expect(cartSaving('cart-saving-locked')).toBe(asMember)
  })

  it('opens the join dialog from the locked row, sourced to the cart', () => {
    givenPricedCart(LOCKED, '0.00')

    render(<CartContent />)
    expect(screen.queryByTestId('join-modal')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /join the gallery/i }))

    const modal = screen.getByTestId('join-modal')
    expect(modal.dataset.source).toBe('cart')
  })

  it('leaves a line the promotion never reached without a saving', () => {
    membership.isMember = true
    givenPricedCart(
      [
        pricedLine(LINE_A, { base: '25300.00', sale: '15180.00' }),
        pricedLine(LINE_B, { base: '4000.00', sale: null }),
      ],
      '10120.00'
    )

    render(<CartContent />)

    expect(lineSavings()).toEqual([10120])
    expect(cartSaving('cart-saving')).toBe(10120)
  })

  /**
   * #510 — the page draws its lines from the local store and its money from the
   * server, and nothing keeps the two in step. A line bought while logged out,
   * added on another device, or dropped by a `localStorage` clear leaves the
   * server holding a basket the customer is not looking at — and `savingTotal`
   * is summed over *that* basket.
   *
   * The invariant these lock down: a figure on this page may only ever describe
   * a line the page is rendering. Where the two carts agree — the ordinary
   * case, and the one every test above exercises — nothing changes at all, and
   * `savingTotal` is still passed through untouched.
   */
  describe('when the two cart sources disagree', () => {
    it('never quotes a cart-level saving for a line it is not rendering', () => {
      membership.isMember = true
      // The server prices two lines and totals both. The customer sees one.
      givenPricedCart(DISCOUNTED, '11720.00')
      useCartStore.setState({ items: [LINE_A] })

      render(<CartContent />)

      expect(lineSavings()).toEqual([10120])
      // 11,720 would be quoting Kyoto Rain's 1,600 against a basket that does
      // not contain it.
      expect(cartSaving('cart-saving')).toBe(10120)
      expect(screen.queryByText(/11,720/)).toBeNull()
    })

    it('never quotes a locked saving for a line it is not rendering', () => {
      givenPricedCart(LOCKED, '0.00')
      useCartStore.setState({ items: [LINE_A] })

      render(<CartContent />)

      expect(lineSavings()).toEqual([10120])
      expect(cartSaving('cart-saving-locked')).toBe(10120)
      expect(screen.queryByText(/11,720/)).toBeNull()
    })

    it('still reconciles: the rendered lines sum to the rendered total', () => {
      membership.isMember = true
      givenPricedCart(DISCOUNTED, '11720.00')
      useCartStore.setState({ items: [LINE_A] })

      render(<CartContent />)

      const sum = lineSavings().reduce((total, amount) => total + amount, 0)
      expect(sum).toBe(cartSaving('cart-saving'))
    })

    it('shows nothing when the carts disagree but no promotion is running', () => {
      // The no-promotion cart is the one that must not move. Divergent sources,
      // nothing discounted: the page looks exactly as it does with no sale at
      // all — no rows, no gate, no arithmetic.
      membership.isMember = false
      givenPricedCart(
        [
          pricedLine(LINE_A, { base: '25300.00', sale: null }),
          pricedLine(LINE_B, { base: '4000.00', sale: null }),
        ],
        '0.00'
      )
      useCartStore.setState({ items: [LINE_A] })

      render(<CartContent />)

      expect(screen.queryByTestId('cart-saving')).toBeNull()
      expect(screen.queryByTestId('cart-saving-locked')).toBeNull()
      expect(screen.queryAllByTestId('cart-line-saving')).toHaveLength(0)
      expect(screen.queryByText(/join the gallery/i)).toBeNull()
    })

    it('leaves a line the server has never seen without a saving', () => {
      // The other direction: the store is ahead of the server. The line the
      // server does know about keeps its saving; the unknown one simply has
      // none, which is what an unpriced line has always had.
      membership.isMember = true
      givenPricedCart(
        [pricedLine(LINE_A, { base: '25300.00', sale: '15180.00' })],
        '10120.00'
      )
      useCartStore.setState({ items: [LINE_A, LINE_B] })

      render(<CartContent />)

      expect(lineSavings()).toEqual([10120])
      expect(cartSaving('cart-saving')).toBe(10120)
    })

    it('passes the server total through untouched when both carts agree', () => {
      // The guard against over-correcting. When every priced line is on screen
      // the total is still the server's own figure, quoted verbatim — even
      // where it does not match what summing the lines would give. Reconciling
      // the display must not become a licence to compute the discount here.
      membership.isMember = true
      givenPricedCart(DISCOUNTED, '11000.00')
      useCartStore.setState({ items: [LINE_A, LINE_B] })

      render(<CartContent />)

      expect(cartSaving('cart-saving')).toBe(11000)
    })
  })

  it('re-reads the cart when the viewer is a member but the payload is locked', () => {
    // Joining from the banner on the previous page leaves a locked payload in
    // the query cache. The fix is another read, never a locally invented
    // unlocked figure — and never a Join button shown to a member.
    membership.isMember = true
    givenPricedCart(LOCKED, '0.00')

    render(<CartContent />)

    expect(serverCart.refetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('cart-saving-locked')).toBeNull()
  })
})
