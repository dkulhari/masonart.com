/**
 * SizeSelector Component
 *
 * Allows users to select a product size variant with visual feedback.
 * Displays dimensions, prices, and availability status for each size option.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Check } from 'lucide-react'
import { cn, formatPrice, formatDimension } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface SizeVariant {
  /** Variant ID */
  id: string
  /** Size ID */
  sizeId: string
  /** Size label (e.g., "24x24 inches") */
  sizeLabel: string
  /** Width in inches */
  widthInches: number
  /** Height in inches */
  heightInches: number
  /** Price for this variant */
  price: string | number
  /** Stock quantity (-1 for unlimited) */
  stockQuantity: number
  /** Whether this variant is available */
  isAvailable: boolean
  /** SKU for this variant */
  sku?: string
}

export interface SizeSelectorProps {
  /** Available size variants */
  variants: SizeVariant[]
  /** Currently selected variant ID */
  selectedVariantId: string | null
  /** Callback when a variant is selected */
  onVariantSelect: (variant: SizeVariant) => void
  /** Display unit preference */
  displayUnit?: 'inches' | 'cm'
  /** Whether to show out of stock variants */
  showOutOfStock?: boolean
  /** Optional className for styling */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * SizeSelector - Displays available sizes for product selection
 *
 * @example
 * <SizeSelector
 *   variants={productVariants}
 *   selectedVariantId={selectedVariant?.id}
 *   onVariantSelect={(variant) => setSelectedVariant(variant)}
 * />
 */
export function SizeSelector({
  variants,
  selectedVariantId,
  onVariantSelect,
  displayUnit = 'inches',
  showOutOfStock = true,
  className,
}: SizeSelectorProps) {
  // Filter variants if not showing out of stock
  const displayedVariants = showOutOfStock
    ? variants
    : variants.filter((v) => v.isAvailable)

  if (displayedVariants.length === 0) {
    return (
      <div className={cn('text-muted-foreground', className)}>
        No sizes available
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Select Size</h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            // Toggle between inches and cm - this would typically be managed by parent
          }}
        >
          {displayUnit === 'inches' ? 'Show in cm' : 'Show in inches'}
        </button>
      </div>

      <div className="grid gap-2">
        {displayedVariants.map((variant) => {
          const isSelected = variant.id === selectedVariantId
          const isOutOfStock = !variant.isAvailable || variant.stockQuantity === 0
          const price = typeof variant.price === 'string'
            ? parseFloat(variant.price)
            : variant.price

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => !isOutOfStock && onVariantSelect(variant)}
              disabled={isOutOfStock}
              className={cn(
                'relative flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500 dark:bg-brand-950/20'
                  : 'border-border bg-card hover:border-brand-300 hover:bg-muted/50',
                isOutOfStock && 'cursor-not-allowed opacity-50'
              )}
              aria-label={`Select size ${formatDimension(variant.widthInches, variant.heightInches, displayUnit)}`}
              aria-pressed={isSelected}
            >
              {/* Size Info */}
              <div className="flex flex-col">
                <span className={cn(
                  'text-sm font-medium',
                  isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-foreground'
                )}>
                  {formatDimension(variant.widthInches, variant.heightInches, displayUnit)}
                </span>
                {variant.sizeLabel && variant.sizeLabel !== formatDimension(variant.widthInches, variant.heightInches, displayUnit) && (
                  <span className="text-xs text-muted-foreground">
                    {variant.sizeLabel}
                  </span>
                )}
                {isOutOfStock && (
                  <span className="text-xs text-destructive">Out of stock</span>
                )}
              </div>

              {/* Price */}
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-foreground'
                )}>
                  {formatPrice(price)}
                </span>
                {isSelected && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact size selector for smaller spaces
 */
export function SizeSelectorCompact({
  variants,
  selectedVariantId,
  onVariantSelect,
  displayUnit = 'inches',
  className,
}: Omit<SizeSelectorProps, 'showOutOfStock'>) {
  const availableVariants = variants.filter((v) => v.isAvailable)

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium text-foreground">Size</label>
      <div className="flex flex-wrap gap-2">
        {availableVariants.map((variant) => {
          const isSelected = variant.id === selectedVariantId

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onVariantSelect(variant)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-all',
                isSelected
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-border bg-background hover:border-brand-300'
              )}
            >
              {formatDimension(variant.widthInches, variant.heightInches, displayUnit)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Size selector skeleton for loading states
 */
export function SizeSelectorSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 animate-pulse', className)}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
      <div className="grid gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="space-y-1">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
            <div className="h-4 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default SizeSelector
