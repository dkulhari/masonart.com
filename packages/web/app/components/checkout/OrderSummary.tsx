/**
 * Checkout Order Summary Component - MasonArt E-commerce Platform
 *
 * Displays order summary during checkout with itemized list, pricing breakdown,
 * and coupon code functionality.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import {
  Package,
  Tag,
  Truck,
  Shield,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import type { CartItem } from '~/stores/cart'

// ============================================================================
// Types
// ============================================================================

interface OrderSummaryProps {
  /** Cart items to display */
  items: CartItem[]
  /** Subtotal before discounts and shipping */
  subtotal: number
  /** Discount amount (from coupon) */
  discountAmount?: number
  /** Applied coupon code */
  appliedCouponCode?: string
  /** Shipping cost */
  shippingCost: number
  /** Tax amount */
  taxAmount?: number
  /** Whether to show detailed item list */
  showItems?: boolean
  /** Callback when coupon is applied */
  onApplyCoupon?: (code: string) => Promise<{ success: boolean; discount?: number; error?: string }>
  /** Callback when coupon is removed */
  onRemoveCoupon?: () => void
  /** Whether checkout button is enabled */
  canProceed?: boolean
  /** Checkout button text */
  checkoutButtonText?: string
  /** Callback for checkout button */
  onCheckout?: () => void
  /** Whether checkout is in progress */
  isCheckingOut?: boolean
  /** Class name for styling */
  className?: string
}

// ============================================================================
// Main Component
// ============================================================================

export function OrderSummary({
  items,
  subtotal,
  discountAmount = 0,
  appliedCouponCode,
  shippingCost,
  taxAmount = 0,
  showItems = true,
  onApplyCoupon,
  onRemoveCoupon,
  canProceed = true,
  checkoutButtonText = 'Place Order',
  onCheckout,
  isCheckingOut = false,
  className,
}: OrderSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(showItems && items.length <= 3)
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState<string | null>(null)
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)

  const total = subtotal - discountAmount + shippingCost + taxAmount
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  // Handle coupon application
  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !onApplyCoupon) return

    setIsApplyingCoupon(true)
    setCouponError(null)

    try {
      const result = await onApplyCoupon(couponCode.trim().toUpperCase())
      if (result.success) {
        setCouponCode('')
      } else {
        setCouponError(result.error || 'Invalid coupon code')
      }
    } catch {
      setCouponError('Failed to apply coupon. Please try again.')
    } finally {
      setIsApplyingCoupon(false)
    }
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-sm font-medium text-brand-700">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Items List (Collapsible) */}
      {showItems && items.length > 0 && (
        <div className="border-b border-border">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {isExpanded ? 'Hide items' : 'Show items'}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {isExpanded && (
            <div className="space-y-3 px-4 pb-4">
              {items.map((item) => (
                <OrderItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pricing Breakdown */}
      <div className="space-y-3 p-4">
        {/* Subtotal */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium text-foreground">{formatPrice(subtotal)}</span>
        </div>

        {/* Discount (if applied) */}
        {discountAmount > 0 && appliedCouponCode && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-green-600">
              <Tag className="h-4 w-4" />
              Discount ({appliedCouponCode})
              {onRemoveCoupon && (
                <button
                  type="button"
                  onClick={onRemoveCoupon}
                  className="ml-1 rounded p-0.5 text-green-600 transition-colors hover:bg-green-100 hover:text-green-700"
                  title="Remove coupon"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
            <span className="font-medium text-green-600">-{formatPrice(discountAmount)}</span>
          </div>
        )}

        {/* Shipping */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          {shippingCost === 0 ? (
            <span className="font-medium text-green-600">FREE</span>
          ) : (
            <span className="font-medium text-foreground">{formatPrice(shippingCost)}</span>
          )}
        </div>

        {/* Tax */}
        {taxAmount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tax (GST)</span>
            <span className="font-medium text-foreground">{formatPrice(taxAmount)}</span>
          </div>
        )}
      </div>

      {/* Coupon Code Input */}
      {onApplyCoupon && !appliedCouponCode && (
        <div className="border-t border-border px-4 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase())
                  setCouponError(null)
                }}
                placeholder="Coupon code"
                className={cn(
                  'w-full rounded-lg border bg-background px-3 py-2 text-sm uppercase placeholder:normal-case placeholder:text-muted-foreground transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                  couponError ? 'border-red-500' : 'border-input hover:border-brand-300'
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApplyCoupon()
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={!couponCode.trim() || isApplyingCoupon}
              className={cn(
                'rounded-lg border border-brand-500 px-4 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                !couponCode.trim() || isApplyingCoupon
                  ? 'cursor-not-allowed border-muted bg-muted text-muted-foreground'
                  : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
              )}
            >
              {isApplyingCoupon ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Apply'
              )}
            </button>
          </div>
          {couponError && (
            <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              {couponError}
            </p>
          )}
        </div>
      )}

      {/* Applied Coupon Success Message */}
      {appliedCouponCode && discountAmount > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4" />
            <span>
              Coupon <strong>{appliedCouponCode}</strong> applied! You save {formatPrice(discountAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Total */}
      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-foreground">Total</span>
          <span className="text-xl font-bold text-foreground">{formatPrice(total)}</span>
        </div>
      </div>

      {/* Checkout Button */}
      {onCheckout && (
        <div className="border-t border-border p-4">
          <button
            type="button"
            onClick={onCheckout}
            disabled={!canProceed || isCheckingOut}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
              !canProceed || isCheckingOut
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-brand-500 text-white hover:bg-brand-600'
            )}
          >
            {isCheckingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              checkoutButtonText
            )}
          </button>
        </div>
      )}

      {/* Trust Badges */}
      <div className="border-t border-border p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4 text-brand-500" />
            <span>Secure checkout with encrypted payment</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Truck className="h-4 w-4 text-brand-500" />
            <span>Free shipping on orders over ₹999</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RotateCcw className="h-4 w-4 text-brand-500" />
            <span>30-day hassle-free returns</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Order Item Component
// ============================================================================

interface OrderItemProps {
  item: CartItem
}

function OrderItem({ item }: OrderItemProps) {
  const itemTotal = (item.unitPrice + item.framePrice) * item.quantity

  return (
    <div className="flex gap-3">
      {/* Thumbnail */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        <img
          src={item.thumbnailUrl}
          alt={item.productTitle}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground line-clamp-1">
            {item.productTitle}
          </h4>
          <p className="text-xs text-muted-foreground">
            {item.sizeLabel}
            {item.frameName && ` • ${item.frameName}`}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
          <span className="text-sm font-medium text-foreground">{formatPrice(itemTotal)}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Compact Order Summary (for confirmation step)
// ============================================================================

interface CompactOrderSummaryProps {
  subtotal: number
  discountAmount?: number
  shippingCost: number
  taxAmount?: number
  total: number
  className?: string
}

export function CompactOrderSummary({
  subtotal,
  discountAmount = 0,
  shippingCost,
  taxAmount = 0,
  total,
  className,
}: CompactOrderSummaryProps) {
  return (
    <div className={cn('space-y-2 text-sm', className)}>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-foreground">{formatPrice(subtotal)}</span>
      </div>

      {discountAmount > 0 && (
        <div className="flex justify-between text-green-600">
          <span>Discount</span>
          <span>-{formatPrice(discountAmount)}</span>
        </div>
      )}

      <div className="flex justify-between">
        <span className="text-muted-foreground">Shipping</span>
        <span className={shippingCost === 0 ? 'text-green-600' : 'text-foreground'}>
          {shippingCost === 0 ? 'FREE' : formatPrice(shippingCost)}
        </span>
      </div>

      {taxAmount > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="text-foreground">{formatPrice(taxAmount)}</span>
        </div>
      )}

      <div className="flex justify-between border-t border-border pt-2 font-semibold">
        <span className="text-foreground">Total</span>
        <span className="text-foreground">{formatPrice(total)}</span>
      </div>
    </div>
  )
}

export default OrderSummary
