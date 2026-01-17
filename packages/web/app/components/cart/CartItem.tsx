/**
 * CartItem Component
 *
 * Individual cart item display with image, details, quantity controls,
 * and remove functionality.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Minus, Plus, Trash2, Sparkles, Frame } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import type { CartItem as CartItemType } from '~/stores/cart'

// ============================================================================
// Types
// ============================================================================

export interface CartItemProps {
  /** Cart item data */
  item: CartItemType
  /** Callback when quantity is updated */
  onUpdateQuantity: (id: string, quantity: number) => void
  /** Callback when item is removed */
  onRemove: (id: string) => void
  /** Whether to show compact variant (for sheet) */
  compact?: boolean
  /** Optional className */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * CartItem - Displays a single item in the cart
 *
 * @example
 * <CartItem
 *   item={cartItem}
 *   onUpdateQuantity={updateQuantity}
 *   onRemove={removeItem}
 * />
 */
export function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  compact = false,
  className,
}: CartItemProps) {
  const itemTotal = (item.unitPrice + item.framePrice) * item.quantity

  return (
    <div
      className={cn(
        'flex gap-4 rounded-lg border border-border bg-card p-4',
        compact && 'p-3',
        className
      )}
    >
      {/* Product Image */}
      <a
        href={`/posters/${item.productSlug}`}
        className={cn(
          'relative shrink-0 overflow-hidden rounded-md bg-muted',
          compact ? 'h-20 w-20' : 'h-24 w-24 sm:h-28 sm:w-28'
        )}
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.productTitle}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Frame className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}

        {/* AI Badge */}
        {item.isAiGenerated && (
          <div className="absolute left-1 top-1 rounded-full bg-purple-500 p-1">
            <Sparkles className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </a>

      {/* Item Details */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title */}
        <a
          href={`/posters/${item.productSlug}`}
          className={cn(
            'font-medium text-foreground hover:text-brand-600 transition-colors line-clamp-1',
            compact ? 'text-sm' : 'text-sm sm:text-base'
          )}
        >
          {item.productTitle}
        </a>

        {/* Size */}
        <p className={cn('text-muted-foreground mt-0.5', compact ? 'text-xs' : 'text-sm')}>
          Size: {item.sizeLabel}
        </p>

        {/* Frame (if selected) */}
        {item.frameName && (
          <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
            Frame: {item.frameName}
          </p>
        )}

        {/* Price and Quantity Row */}
        <div className="mt-auto flex items-end justify-between pt-2">
          {/* Quantity Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
              className={cn(
                'flex items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
                compact ? 'h-7 w-7' : 'h-8 w-8'
              )}
              disabled={item.quantity <= 1}
              aria-label="Decrease quantity"
            >
              <Minus className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            </button>
            <span
              className={cn(
                'min-w-[2rem] text-center font-medium',
                compact ? 'text-sm' : 'text-sm'
              )}
            >
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              className={cn(
                'flex items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted',
                compact ? 'h-7 w-7' : 'h-8 w-8'
              )}
              aria-label="Increase quantity"
            >
              <Plus className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
            </button>
          </div>

          {/* Price and Remove */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-semibold text-foreground',
                compact ? 'text-sm' : 'text-base'
              )}
            >
              {formatPrice(itemTotal)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Remove item"
            >
              <Trash2 className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * CartItemSkeleton - Loading skeleton for cart items
 */
export function CartItemSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('animate-pulse flex gap-4 rounded-lg border border-border bg-card', compact ? 'p-3' : 'p-4')}>
      {/* Image skeleton */}
      <div
        className={cn(
          'shrink-0 rounded-md bg-muted',
          compact ? 'h-20 w-20' : 'h-24 w-24 sm:h-28 sm:w-28'
        )}
      />

      {/* Content skeleton */}
      <div className="flex flex-1 flex-col">
        <div className={cn('rounded bg-muted', compact ? 'h-4 w-3/4' : 'h-5 w-3/4')} />
        <div className={cn('mt-2 rounded bg-muted', compact ? 'h-3 w-1/2' : 'h-4 w-1/2')} />
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex gap-1">
            <div className={cn('rounded bg-muted', compact ? 'h-7 w-7' : 'h-8 w-8')} />
            <div className={cn('rounded bg-muted', compact ? 'h-7 w-8' : 'h-8 w-10')} />
            <div className={cn('rounded bg-muted', compact ? 'h-7 w-7' : 'h-8 w-8')} />
          </div>
          <div className={cn('rounded bg-muted', compact ? 'h-4 w-16' : 'h-5 w-20')} />
        </div>
      </div>
    </div>
  )
}

export default CartItem
