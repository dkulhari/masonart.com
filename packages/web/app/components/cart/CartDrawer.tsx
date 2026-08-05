/**
 * CartDrawer Component
 *
 * Slide-out cart panel anchored to the RIGHT edge, matching mesonart.com (#460).
 * The header cart control opens it; `/cart` stays routable for deep links.
 *
 * Measured off their `cart-drawer` element: the panel is `drawer--end` (right;
 * their menu drawer is the `drawer--start` one), flush against the edge, and
 * moves on `transform 0.6s cubic-bezier(.7, 0, .2, 1)` — twice the length of a
 * default Tailwind slide, which is what stops a full-height panel from
 * snapping. That curve is `--ease-drawer`.
 *
 * Open state lives on the cart store rather than in props, so the header, the
 * PDP and the quickview can all open the cart without prop-drilling through
 * __root. Backdrop/panel layering and the Escape + scroll-lock effect mirror
 * SearchDrawer.
 */

import { useEffect, useCallback, useRef } from 'react'
import { X, ShoppingCart, ArrowRight } from 'lucide-react'
import { Button, buttonVariants } from '~/components/ui/Button'
import { cn, formatPrice } from '~/lib/utils'
import {
  useCartItems,
  useCartSubtotal,
  useCartItemCount,
  useCartActions,
  useIsCartDrawerOpen,
} from '~/stores/cart'
import { CartItem } from './CartItem'

// ============================================================================
// Types
// ============================================================================

export interface CartDrawerProps {
  /** Optional className for the drawer panel */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * CartDrawer - Left slide-out cart panel
 *
 * @example
 * // Mounted once, beside the Header:
 * <CartDrawer />
 *
 * // Opened from anywhere:
 * const openDrawer = useCartStore((state) => state.openDrawer)
 */
export function CartDrawer({ className }: CartDrawerProps) {
  const isOpen = useIsCartDrawerOpen()
  const items = useCartItems()
  const subtotal = useCartSubtotal()
  const itemCount = useCartItemCount()
  const { updateQuantity, removeItem, closeDrawer } = useCartActions()

  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer()
      }
    },
    [closeDrawer]
  )

  // Focus management and scroll lock
  useEffect(() => {
    if (!isOpen) return

    // Focus the close button when opening
    closeButtonRef.current?.focus()

    // Lock scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="cart-drawer-backdrop"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-drawer-backdrop-in"
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-2xl',
          'flex flex-col',
          // Rounded on the page-facing edge only, square where it meets the
          // viewport — their `34px 0 0 34px`. overflow-hidden so the items
          // list cannot square the corners off as it scrolls under them.
          'overflow-hidden rounded-l-[var(--drawer-radius)]',
          'animate-drawer-in-right',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h2 id="cart-drawer-title" className="text-lg font-semibold">
              Your Cart
            </h2>
            {itemCount > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-foreground">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          {/*
            The Quickview's close button, exactly (#420): the outline pill's
            wipe on a 48px circle. Two modal surfaces closing with two
            different buttons is how a design system starts to drift.
          */}
          <Button
            ref={closeButtonRef}
            variant="outline"
            onClick={closeDrawer}
            className="h-12 w-12 shrink-0 rounded-full p-0"
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Cart Content */}
        {items.length === 0 ? (
          <EmptyCartState onClose={closeDrawer} />
        ) : (
          <>
            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {items.map((item) => (
                  <CartItem
                    key={item.id}
                    item={item}
                    onUpdateQuantity={updateQuantity}
                    onRemove={removeItem}
                    compact
                  />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-background p-4">
              {/* Subtotal */}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-lg font-semibold text-foreground">
                  {formatPrice(subtotal)}
                </span>
              </div>

              <p className="mb-4 text-xs text-muted-foreground">
                Shipping and taxes calculated at checkout
              </p>

              {/* Action Buttons */}
              <div className="space-y-2">
                {/* Anchors cannot be <Button>, so they take its classes. */}
                <a
                  href="/checkout"
                  className={cn(buttonVariants({ size: 'pill' }), 'w-full')}
                  onClick={closeDrawer}
                >
                  Checkout
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/cart"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'pill' }),
                    'w-full'
                  )}
                  onClick={closeDrawer}
                >
                  View Cart
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ============================================================================
// Empty State
// ============================================================================

/**
 * Where an empty cart sends you.
 *
 * Theirs offers collections rather than one Browse button, which is the better
 * answer to "my cart is empty": a single CTA back to the full catalogue is
 * where the user already was. Ours are the two sorts the header nav already
 * names, so nothing here invents a destination — `salesCount-desc` and
 * `createdAt-desc` are `SORT_OPTIONS` ids the collection route validates.
 */
const EMPTY_CART_COLLECTIONS = [
  { label: 'Best Sellers', href: '/posters?sortBy=salesCount&sortOrder=desc' },
  { label: 'New In', href: '/posters?sortBy=createdAt&sortOrder=desc' },
  { label: 'All Art', href: '/posters' },
]

function EmptyCartState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      {/*
        Their copy and their type: "Your cart is currently empty." set in
        Urbanist 300 at 32px. The old line was a 18px semibold sentence over a
        grey shopping-bag circle — an icon theirs does not have, in a weight
        the storefront retired.
      */}
      <h3 className="font-heading text-[2rem] font-light leading-tight text-foreground">
        Your cart is currently empty.
      </h3>
      <p className="text-base text-foreground">
        Not sure where to start?
        <br />
        Try these collections:
      </p>
      <ul className="grid w-full max-w-[280px] gap-3">
        {EMPTY_CART_COLLECTIONS.map((collection) => (
          <li key={collection.href}>
            <a
              href={collection.href}
              onClick={onClose}
              // Their chip: 12px radius, 12/20 padding, and the same 2.4%
              // near-black tint the Quickview's inputs use.
              className="block rounded-xl bg-foreground/[0.024] px-5 py-3 text-base text-foreground transition-colors hover:bg-foreground/[0.06]"
            >
              {collection.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CartDrawer
