/**
 * CartSheet Component
 *
 * Slide-out cart panel that shows a summary of items in the cart.
 * Accessible overlay with keyboard navigation and focus trapping.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useCallback, useRef } from 'react'
import { X, ShoppingCart, ArrowRight, ShoppingBag } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import {
  useCartItems,
  useCartSubtotal,
  useCartItemCount,
  useCartActions,
} from '~/stores/cart'
import { CartItem } from './CartItem'

// ============================================================================
// Types
// ============================================================================

export interface CartSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean
  /** Callback to close the sheet */
  onClose: () => void
  /** Optional className for the sheet panel */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * CartSheet - Slide-out cart panel
 *
 * @example
 * const [isCartOpen, setIsCartOpen] = useState(false);
 *
 * <button onClick={() => setIsCartOpen(true)}>
 *   <ShoppingCart />
 * </button>
 *
 * <CartSheet
 *   isOpen={isCartOpen}
 *   onClose={() => setIsCartOpen(false)}
 * />
 */
export function CartSheet({ isOpen, onClose, className }: CartSheetProps) {
  const items = useCartItems()
  const subtotal = useCartSubtotal()
  const itemCount = useCartItemCount()
  const { updateQuantity, removeItem } = useCartActions()

  const sheetRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  // Handle click outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  // Focus management and scroll lock
  useEffect(() => {
    if (isOpen) {
      // Focus the close button when opening
      closeButtonRef.current?.focus()

      // Lock scroll
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      // Add escape key listener
      document.addEventListener('keydown', handleKeyDown)

      return () => {
        document.body.style.overflow = originalOverflow
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isOpen, handleKeyDown])

  // Don't render if closed (for animation purposes, we still render but hide)
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Sheet Panel */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-sheet-title"
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-full max-w-md bg-background shadow-2xl',
          'flex flex-col',
          'animate-in slide-in-from-right duration-300',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h2 id="cart-sheet-title" className="text-lg font-semibold">
              Your Cart
            </h2>
            {itemCount > 0 && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cart Content */}
        {items.length === 0 ? (
          <EmptyCartState onClose={onClose} />
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
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                  onClick={onClose}
                >
                  Checkout
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/cart"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={onClose}
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
        className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        onClick={onClose}
      >
        Browse Posters
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}

// ============================================================================
// Cart Trigger Button
// ============================================================================

export interface CartTriggerProps {
  /** Callback when clicked */
  onClick: () => void
  /** Optional className */
  className?: string
}

/**
 * CartTrigger - Button to open the cart sheet
 * Shows a badge with item count when cart is not empty
 */
export function CartTrigger({ onClick, className }: CartTriggerProps) {
  const itemCount = useCartItemCount()

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className
      )}
      aria-label={`Shopping cart${itemCount > 0 ? `, ${itemCount} items` : ''}`}
    >
      <ShoppingCart className="h-5 w-5" />
      {itemCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-medium text-white">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}

export default CartSheet
