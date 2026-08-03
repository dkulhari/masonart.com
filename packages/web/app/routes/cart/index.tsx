/**
 * Cart Page - chobii.art E-commerce Platform
 *
 * Full cart page showing all items, order summary, and checkout options.
 * Cart data is stored in localStorage via Zustand.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { createFileRoute } from '@tanstack/react-router'
import {
  ShoppingBag,
  ArrowRight,
  Truck,
  Shield,
  RotateCcw,
  ChevronRight,
  Trash2,
} from 'lucide-react'
import { formatPrice } from '~/lib/utils'
import {
  useCartItems,
  useCartSubtotal,
  useCartItemCount,
  useCartActions,
  useIsCartEmpty,
  useCartHydration,
} from '~/stores/cart'
import { CartItem } from '~/components/cart/CartItem'

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
function CartContent() {
  const items = useCartItems()
  const subtotal = useCartSubtotal()
  const itemCount = useCartItemCount()
  const isEmpty = useIsCartEmpty()
  const { updateQuantity, removeItem, clearCart } = useCartActions()

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
                {items.map((item) => (
                  <CartItem
                    key={item.id}
                    item={item}
                    onUpdateQuantity={updateQuantity}
                    onRemove={removeItem}
                  />
                ))}
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
              <OrderSummary subtotal={subtotal} itemCount={itemCount} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Order Summary Component
// ============================================================================

interface OrderSummaryProps {
  subtotal: number
  itemCount: number
}

function OrderSummary({ subtotal, itemCount }: OrderSummaryProps) {
  // Shipping is free over ₹999
  const shippingThreshold = 999
  const hasShippingFee = subtotal < shippingThreshold
  const shippingFee = hasShippingFee ? 99 : 0
  const total = subtotal + shippingFee
  const amountUntilFreeShipping = shippingThreshold - subtotal

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
              style={{ width: `${Math.min(100, (subtotal / shippingThreshold) * 100)}%` }}
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

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          {hasShippingFee ? (
            <span className="font-medium text-foreground">{formatPrice(shippingFee)}</span>
          ) : (
            <span className="font-medium text-green-600">FREE</span>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Tax</span>
          <span className="text-muted-foreground">Calculated at checkout</span>
        </div>
      </div>

      {/* Total */}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
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
          <span>Free shipping on orders over ₹999</span>
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
