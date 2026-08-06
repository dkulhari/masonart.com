/**
 * SizeSelector Component
 *
 * A single native `<select>` for choosing a product's size variant (#515).
 *
 * mesonart's control is one dropdown, not a stacked list of bordered price
 * cards: 52px tall, 6px radius, a barely-there `rgba(23,23,23,0.024)` fill,
 * `0 26px` padding, and options that read `24"H x 20"W/ 61H x 51W CM` — both
 * units folded into one string, no price. A native `<select>` gets keyboard
 * navigation and screen-reader semantics for free, so this reaches for one
 * rather than building a custom listbox.
 *
 * There used to be an inches/cm toggle here with a no-op `onClick`. It is
 * gone rather than wired up: the option label now always carries both units,
 * so there is nothing left for a toggle to switch between.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import type { ChangeEvent } from 'react'
import { cn } from '~/lib/utils'

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
  /** Whether to show out of stock variants (disabled, not omitted) */
  showOutOfStock?: boolean
  /** Optional className for styling */
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

const isOutOfStock = (variant: SizeVariant): boolean =>
  !variant.isAvailable || variant.stockQuantity === 0

/**
 * `24"H x 20"W/ 61H x 51W CM` — mesonart's option label. Height first on
 * both sides of the slash, inches then centimetres, no price.
 */
function sizeOptionLabel(variant: SizeVariant): string {
  const heightCm = Math.round(variant.heightInches * 2.54)
  const widthCm = Math.round(variant.widthInches * 2.54)
  return `${variant.heightInches}"H x ${variant.widthInches}"W/ ${heightCm}H x ${widthCm}W CM`
}

// ============================================================================
// Component
// ============================================================================

/**
 * SizeSelector - a single dropdown listing the product's size variants.
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
  showOutOfStock = true,
  className,
}: SizeSelectorProps) {
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

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = displayedVariants.find((v) => v.id === event.target.value)
    if (next) onVariantSelect(next)
  }

  return (
    <select
      aria-label="Size"
      value={selectedVariantId ?? ''}
      onChange={handleChange}
      className={cn(
        'h-[52px] w-full rounded-md border-none bg-foreground/[0.024] px-[26px]',
        'font-sans text-base font-light text-foreground outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <option value="" disabled>
        Select a Size
      </option>
      {displayedVariants.map((variant) => {
        const outOfStock = isOutOfStock(variant)
        return (
          <option key={variant.id} value={variant.id} disabled={outOfStock}>
            {sizeOptionLabel(variant)}
            {outOfStock ? ' — Out of stock' : ''}
          </option>
        )
      })}
    </select>
  )
}

/**
 * Compact size selector for smaller spaces
 */
export function SizeSelectorCompact({
  variants,
  selectedVariantId,
  onVariantSelect,
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
              aria-pressed={isSelected}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-all',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:border-foreground/30'
              )}
            >
              {variant.widthInches}&quot; x {variant.heightInches}&quot;
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Size selector skeleton for loading states
 *
 * Shaped like the real control now: one 52px bar, not three stacked cards.
 */
export function SizeSelectorSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-[52px] w-full animate-pulse rounded-md bg-muted',
        className
      )}
    />
  )
}

export default SizeSelector
