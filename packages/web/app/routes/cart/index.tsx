/**
 * Cart Page - chobii.art E-commerce Platform
 *
 * Full cart page showing all items, order summary, and checkout options.
 * Cart data is stored in localStorage via Zustand.
 *
 * The one thing this page does NOT own is what the cart costs under a sale.
 * Lines are local; prices are the server's (#429), read through
 * `readCartSaving` below and rendered, never recomputed — see the comment
 * there for why that distinction is the whole ticket (#436).
 *
 * Because those are two different sources with nothing keeping them in step,
 * `readCartSaving` is only ever allowed to quote lines that appear in both
 * (#510). The store now writes through to the server cart on every mutation
 * (#511), but this page still renders from the store, not the server
 * response — reconciling to one server-owned cart, with the store demoted to
 * a cache in front of it, is a larger change than this page.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ShoppingBag,
  ArrowRight,
  Truck,
  Shield,
  RotateCcw,
  ChevronRight,
  Lock,
  Trash2,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import {
  useCartItems,
  useCartSubtotal,
  useCartItemCount,
  useIsCartEmpty,
  useCartHydration,
  useCartSyncError,
  type CartItem as CartItemData,
} from '~/stores/cart'
import { useCartActions } from '~/hooks/useCartActions'
import { CartItem } from '~/components/cart/CartItem'
import { JoinGalleryModal } from '~/components/promo/JoinGalleryModal'
import { useGalleryMembership } from '~/hooks/useGalleryMembership'
import { useServerCart } from '~/hooks/useCart'
import type { ServerCartPayload } from '~/lib/cart-projection'
import {
  freeShippingThresholdLabel,
  netAmountForShipping,
  qualifiesForFreeShipping,
} from '@chobii/shared'
import { useFreeShippingThreshold } from '~/lib/free-shipping'

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/cart/')({
  head: () => ({
    meta: [
      { title: 'Shopping Cart | chobii.art' },
      {
        name: 'description',
        content:
          'View and manage items in your shopping cart. Premium posters and custom frames from chobii.art.',
      },
      { name: 'robots', content: 'noindex' }, // Don't index cart pages
    ],
  }),
  component: CartPage,
})

// ============================================================================
// Sale pricing (#436)
// ============================================================================

/**
 * A cart line's natural key, on both sides of the wire.
 *
 * The displayed lines come from the local store, which mints its own ids, so
 * the server's row id is no use for matching. Product + variant + frame is what
 * makes a line distinct in either place.
 */
function lineKey(line: {
  id?: string
  lineType?: 'product' | 'gift_card'
  productId: string | null
  variantId: string | null
  frameId: string | null
}): string {
  /**
   * A gift card line has no product or variant to be keyed by, and two cards
   * of the same value going to two different people must not collide (#579).
   * Its own id is the only thing that distinguishes it — which is fine here,
   * because the store keeps the server's id for a line it did not mint.
   */
  if (line.lineType === 'gift_card' || !line.productId || !line.variantId) {
    return `gift-card:${line.id ?? 'unknown'}`
  }

  return `${line.productId}:${line.variantId}:${line.frameId ?? 'none'}`
}

/** Money as whole paise, so summing lines cannot drift by a rounding tick. */
function toPaise(value: string | null | undefined): number {
  const amount = parseFloat(value ?? '')
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

interface CartSaving {
  /** Paise actually coming off, for the lines this page is rendering. */
  unlocked: number
  /** Paise behind the membership gate, summed from the locked lines. */
  locked: number
  /** What each displayed line saves, keyed by `lineKey`. */
  byLine: Map<string, { amount: number; locked: boolean }>
}

const NO_SAVING: CartSaving = { unlocked: 0, locked: 0, byLine: new Map() }

/**
 * What the payload says the sale is worth — read, never recomputed.
 *
 * Two figures, because they are two different things. `unlocked` is money the
 * checkout will take off, quoted from the single place that decides it, so the
 * cart cannot promise a discount the order will not give. `locked` is money it
 * will not take off — the server totals that as zero, correctly — so the teaser
 * is recovered per line as `base − sale`, the same subtraction the server does
 * over the same two figures. No percentage is ever applied on this side of the
 * wire: `percentOff` is copy, not arithmetic.
 *
 * ## Why this takes the displayed lines as an argument (#510)
 *
 * The lines on screen come from the local store; these figures come from the
 * server, and nothing synchronises the two. When they hold different baskets —
 * a line added while logged out, on another device, or lost to a `localStorage`
 * clear — `savingTotal` is a total over lines the customer cannot see, and
 * quoting it would describe a basket that is not the one being bought.
 *
 * So every figure here is confined to lines present in *both* sources.
 * `savingTotal` is still passed through verbatim whenever it is wholly
 * attributable to displayed lines, which is the ordinary case and the one that
 * must not change: the server's own arithmetic, untouched. Only when a
 * discounted, unlocked line is missing from the page does the total fall back
 * to the sum of the server's per-line figures for the lines that *are* shown —
 * still the server's numbers, just narrowed to the basket on screen. The
 * alternative is a page that advertises a saving against something it is not
 * displaying, which is the one thing a discount must never do.
 */
function readCartSaving(
  cart: ServerCartPayload | null | undefined,
  displayed: ReadonlySet<string>
): CartSaving {
  if (!cart?.items?.length) return NO_SAVING

  const byLine = new Map<string, { amount: number; locked: boolean }>()
  let locked = 0
  let unlockedShown = 0
  // A discounted, unlocked line the server counted into `savingTotal` but this
  // page is not rendering. Only these can make the server's total overstate
  // what is on screen: locked lines already total as zero.
  let hasUnshownSaving = false

  for (const line of cart.items) {
    if (!line.pricing?.sale) continue
    const amount = toPaise(line.pricing.base) - toPaise(line.pricing.sale)
    if (amount <= 0) continue

    const key = lineKey(line)
    if (!displayed.has(key)) {
      if (!line.pricing.locked) hasUnshownSaving = true
      continue
    }

    byLine.set(key, { amount, locked: line.pricing.locked })
    if (line.pricing.locked) locked += amount
    else unlockedShown += amount
  }

  return {
    unlocked: hasUnshownSaving ? unlockedShown : toPaise(cart.savingTotal),
    locked,
    byLine,
  }
}

// ============================================================================
// Main Component
// ============================================================================

function CartPage() {
  const isHydrated = useCartHydration()

  // Show loading skeleton until hydration is complete
  // This prevents store subscription during SSR which causes infinite loops
  if (!isHydrated) {
    return <CartSkeleton />
  }

  return <CartContent />
}

/**
 * Cart content component that subscribes to cart store.
 * Only rendered after hydration to avoid SSR issues with Zustand persist.
 */
export function CartContent() {
  const items = useCartItems()
  const subtotal = useCartSubtotal()
  const itemCount = useCartItemCount()
  const isEmpty = useIsCartEmpty()
  const { updateQuantity, removeItem, clearCart } = useCartActions()
  const syncError = useCartSyncError()

  /**
   * Every figure in the saving rows comes from here. The local store knows what
   * is in the cart; only the server knows what it costs under a promotion.
   *
   * The two can hold different baskets, so the displayed lines are handed to
   * `readCartSaving` as the set it is allowed to quote — see there for why
   * (#510).
   */
  const { data, refetch } = useServerCart()
  const displayedLines = useMemo(
    () => new Set(items.map((item) => lineKey(item))),
    [items]
  )
  const saving = useMemo(
    () => readCartSaving(data, displayedLines),
    [data, displayedLines]
  )

  const { isMember } = useGalleryMembership()
  const [isJoinOpen, setIsJoinOpen] = useState(false)

  /**
   * A viewer who joined a moment ago — from the banner, or on the page before
   * this one — still has a locked payload in the query cache. The answer is
   * another read: unlocking the figure locally would be exactly the second
   * pricing authority this feature exists to avoid. Once, guarded; if the
   * server still says locked after that, it means it.
   */
  const hasRefetchedRef = useRef(false)
  useEffect(() => {
    if (!isMember || saving.locked === 0 || hasRefetchedRef.current) return
    hasRefetchedRef.current = true
    void refetch()
  }, [isMember, saving.locked, refetch])

  // A member is never shown the gate, not even for the beat before that read
  // lands — neither in the summary nor against a line.
  const lockedSaving = isMember ? 0 : saving.locked
  const savingFor = (item: CartItemData) => {
    const line = saving.byLine.get(lineKey(item))
    if (!line || (line.locked && isMember)) return null
    return line
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl tracking-tight text-foreground sm:text-3xl">
            Shopping Cart
          </h1>
          {!isEmpty && (
            <p className="mt-1 text-muted-foreground">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
            </p>
          )}
        </div>

        {syncError && (
          <p
            role="alert"
            className="mb-6 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {syncError}
          </p>
        )}

        {isEmpty ? (
          <EmptyCartState />
        ) : (
          <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
            {/* Cart Items Column */}
            <div className="lg:col-span-2">
              {/* Clear Cart Button */}
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearCart}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Cart
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-4">
                {items.map((item) => {
                  const line = savingFor(item)
                  return (
                    <div key={item.id}>
                      <CartItem
                        item={item}
                        onUpdateQuantity={updateQuantity}
                        onRemove={removeItem}
                      />
                      {line && (
                        <LineSaving amount={line.amount} locked={line.locked} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Continue Shopping Link */}
              <div className="mt-6">
                <a
                  href="/posters"
                  className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-foreground/60"
                >
                  Continue Shopping
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Order Summary Column */}
            <div className="lg:col-span-1">
              <OrderSummary
                subtotal={subtotal}
                itemCount={itemCount}
                saving={saving.unlocked}
                lockedSaving={lockedSaving}
                onJoinGallery={() => setIsJoinOpen(true)}
              />
            </div>
          </div>
        )}
      </div>

      {/* The gate, opened from the locked saving row */}
      <JoinGalleryModal
        open={isJoinOpen}
        onClose={() => {
          setIsJoinOpen(false)
          // Joined or not, the priced cart is what decides — ask it again.
          void refetch()
        }}
        source="cart"
      />
    </div>
  )
}

// ============================================================================
// Saving Rows
// ============================================================================

/**
 * What one line is worth under the promotion.
 *
 * Locked reads as an offer rather than as money already off, because the
 * checkout charges base until the viewer joins — the copy has to survive being
 * read next to the card statement.
 */
function LineSaving({ amount, locked }: { amount: number; locked: boolean }) {
  return (
    <p
      data-testid="cart-line-saving"
      data-locked={locked ? 'true' : 'false'}
      className={cn(
        'mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-medium',
        locked ? 'text-muted-foreground' : 'text-green-600'
      )}
    >
      {locked ? (
        <>
          <Lock className="h-3 w-3" aria-hidden="true" />
          <span>Save {formatPrice(amount / 100)} with the gallery</span>
        </>
      ) : (
        <span>You save {formatPrice(amount / 100)}</span>
      )}
    </p>
  )
}

// ============================================================================
// Order Summary Component
// ============================================================================

interface OrderSummaryProps {
  subtotal: number
  itemCount: number
  /** Paise the server says are coming off this cart — its `savingTotal`. */
  saving?: number
  /** Paise the same promotion is worth, but only to a gallery member. */
  lockedSaving?: number
  /** Opens the join dialog from the locked row. */
  onJoinGallery?: () => void
}

function OrderSummary({
  subtotal,
  itemCount,
  saving = 0,
  lockedSaving = 0,
  onJoinGallery,
}: OrderSummaryProps) {
  /**
   * The threshold is read on the NET, post-discount figure, and both this page
   * and `calculateShippingCost` in the API take it from `@chobii/shared`
   * (decision, 2026-08-07 — design §5). Two copies of the number is how a cart
   * ends up promising free shipping that the checkout then charges for.
   *
   * `saving` is the server's unlocked saving in paise; `subtotal` is the local
   * store's gross in rupees. A LOCKED saving is deliberately not subtracted:
   * the checkout charges base for those lines, so they are not off the price.
   */
  /**
   * The threshold in force, delivered by the root route (#570). The charge,
   * the progress bar and the copy below all read this one value: an admin
   * moving it must move the promise and the price together, or the page is
   * back to promising free shipping the checkout charges for.
   */
  const threshold = useFreeShippingThreshold()

  const net = netAmountForShipping(subtotal, saving / 100)
  const hasShippingFee = !qualifiesForFreeShipping(net, threshold)
  const shippingFee = hasShippingFee ? 99 : 0
  const total = net + shippingFee
  const amountUntilFreeShipping = threshold - net

  return (
    <div className="sticky top-24 rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>

      {/* Free Shipping Progress */}
      {hasShippingFee && (
        <div className="mt-4 rounded-lg bg-accent p-3">
          <p className="text-sm text-foreground">
            Add <span className="font-semibold">{formatPrice(amountUntilFreeShipping)}</span> more
            for free shipping!
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, (net / threshold) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </span>
          <span className="font-medium text-foreground">{formatPrice(subtotal)}</span>
        </div>

        <div
          data-testid="cart-shipping"
          className="flex items-center justify-between text-sm"
        >
          <span className="text-muted-foreground">Shipping</span>
          {hasShippingFee ? (
            <span className="font-medium text-foreground">{formatPrice(shippingFee)}</span>
          ) : (
            <span className="font-medium text-green-600">FREE</span>
          )}
        </div>

        {saving > 0 && (
          <div
            data-testid="cart-saving"
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">Sale saving</span>
            <span className="font-medium text-green-600">
              −{formatPrice(saving / 100)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tax</span>
          <span className="text-muted-foreground">Calculated at checkout</span>
        </div>
      </div>

      {/*
        The gate, at the moment of payment. The figure is the sale the viewer is
        not getting: the server prices these lines at base until they join, and
        says so by totalling the saving as zero.
      */}
      {lockedSaving > 0 && (
        <div
          data-testid="cart-saving-locked"
          className="mt-4 rounded-lg border border-border bg-accent p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Save {formatPrice(lockedSaving / 100)} with the gallery
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This saving is for gallery members. Join free and it comes off at
            checkout.
          </p>
          <button
            type="button"
            onClick={onJoinGallery}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/85"
          >
            Join the gallery
          </button>
        </div>
      )}

      {/* Total */}
      <div className="mt-4 border-t border-border pt-4">
        <div
          data-testid="cart-total"
          className="flex items-center justify-between"
        >
          <span className="text-base font-semibold text-foreground">Estimated Total</span>
          <span className="text-xl font-medium text-foreground">{formatPrice(total)}</span>
        </div>
      </div>

      {/* Checkout Button */}
      <a
        href="/checkout"
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/85"
      >
        Proceed to Checkout
        <ArrowRight className="h-4 w-4" />
      </a>

      {/* Trust Badges */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Truck className="h-5 w-5 text-foreground" />
          <span data-testid="cart-free-shipping-copy">
            Free shipping on orders over {freeShippingThresholdLabel(threshold)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="h-5 w-5 text-foreground" />
          <span>Secure checkout with encrypted payment</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RotateCcw className="h-5 w-5 text-foreground" />
          <span>30-day hassle-free returns</span>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 text-xs text-muted-foreground">Accepted Payment Methods</p>
        <div className="flex flex-wrap gap-2">
          {['Visa', 'Mastercard', 'Razorpay', 'UPI'].map((method) => (
            <span
              key={method}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
            >
              {method}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyCartState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="h-10 w-10 text-muted-foreground" />
      </div>

      <h2 className="mb-2 text-xl font-semibold text-foreground">Your cart is empty</h2>

      <p className="mb-8 text-muted-foreground">
        Looks like you haven't added anything to your cart yet.
        Explore our collection of premium posters and find something you love.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <a
          href="/posters"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/85"
        >
          Browse Posters
          <ArrowRight className="h-4 w-4" />
        </a>
        <a
          href="/create"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Create with AI
        </a>
      </div>

      {/* Recommendations Section */}
      <div className="mt-16 border-t border-border pt-8">
        <h3 className="mb-4 text-lg font-semibold text-foreground">
          Recommended for You
        </h3>
        <p className="text-sm text-muted-foreground">
          Check out our featured collection to get inspired.
        </p>
        <a
          href="/posters?featured=true"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/60"
        >
          View Featured Collection
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function CartSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
        </div>

        <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
          {/* Cart Items Column */}
          <div className="lg:col-span-2 space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex gap-4 rounded-lg border border-border p-4"
              >
                <div className="h-24 w-24 animate-pulse rounded bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary Column */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </div>
              <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
