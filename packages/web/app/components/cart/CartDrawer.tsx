/**
 * CartDrawer Component
 *
 * Slide-out cart panel anchored to the LEFT edge, matching mesonart.com (#460).
 * The header cart control opens it; `/cart` stays routable for deep links.
 *
 * Open state lives on the cart store rather than in props, so the header, the
 * PDP and the quickview can all open the cart without prop-drilling through
 * __root. Backdrop/panel layering and the Escape + scroll-lock effect mirror
 * SearchDrawer.
 */

import { useEffect, useCallback, useRef } from 'react'
import { X, ShoppingCart, ArrowRight, ShoppingBag } from 'lucide-react'
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
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
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
          'fixed left-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-2xl',
          'flex flex-col',
          'animate-in slide-in-from-left duration-300',
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
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeDrawer}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
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
                <a
                  href="/checkout"
                  className="flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
                  onClick={closeDrawer}
                >
                  Checkout
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/cart"
                  className="flex w-full items-center justify-center gap-2 rounded-pill border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
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

function EmptyCartState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        Your cart is empty
      </h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Discover our collection of premium posters and custom frames
      </p>
      <a
        href="/posters"
        className="inline-flex items-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
        onClick={onClose}
      >
        Browse Posters
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}

export default CartDrawer
