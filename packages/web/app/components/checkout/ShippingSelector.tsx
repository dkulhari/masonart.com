/**
 * ShippingSelector Component
 *
 * Radio button list of shipping options fetched from the API.
 * Shows name, carrier, estimated delivery, and cost.
 * Highlights fastest/cheapest options and updates cart total when selected.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useEffect, useMemo } from 'react'
import { Truck, Zap, Clock, Check, AlertCircle, Loader2 } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { api } from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface ShippingOptionData {
  id: string
  name: string
  carrier: string
  baseCost: string
  finalCost: number
  estimatedDaysMin: number
  estimatedDaysMax: number
  isFree: boolean
}

export interface ShippingSelectorProps {
  /** Cart subtotal for calculating shipping */
  cartTotal: number
  /** Currently selected shipping option ID */
  selectedOptionId: string | null
  /** Callback when shipping option is selected */
  onSelect: (option: ShippingOptionData) => void
  /** Optional postal code for region-specific rates */
  postalCode?: string
  /** Additional class names */
  className?: string
}

// ============================================================================
// Carrier Icons
// ============================================================================

const CARRIER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  default: Truck,
  express: Zap,
  standard: Truck,
}

function getCarrierIcon(carrier: string, name: string): React.ComponentType<{ className?: string }> {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('express') || lowerName.includes('priority')) {
    return Zap
  }
  return CARRIER_ICONS[carrier.toLowerCase()] ?? CARRIER_ICONS.default ?? Truck
}

// ============================================================================
// ShippingOptionCard Component
// ============================================================================

interface ShippingOptionCardProps {
  option: ShippingOptionData
  isSelected: boolean
  isFastest: boolean
  isCheapest: boolean
  onSelect: () => void
}

function ShippingOptionCard({
  option,
  isSelected,
  isFastest,
  isCheapest,
  onSelect,
}: ShippingOptionCardProps) {
  const CarrierIcon = getCarrierIcon(option.carrier, option.name)
  const estimatedDelivery = formatEstimatedDelivery(option.estimatedDaysMin, option.estimatedDaysMax)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-4 text-left transition-all duration-200',
        isSelected
          ? 'border-primary bg-accent ring-1 ring-primary'
          : 'border-border bg-background hover:border-foreground/30 hover:shadow-sm'
      )}
      aria-pressed={isSelected}
    >
      <div className="flex items-start gap-4">
        {/* Carrier Icon */}
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
            isSelected ? 'bg-accent text-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <CarrierIcon className="h-5 w-5" />
        </div>

        {/* Option Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{option.name}</span>

            {/* Badges */}
            {option.isFree && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Free
              </span>
            )}
            {isFastest && !option.isFree && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Fastest
              </span>
            )}
            {isCheapest && !option.isFree && !isFastest && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Best Value
              </span>
            )}
          </div>

          {/* Carrier */}
          <p className="mt-0.5 text-sm text-muted-foreground">{option.carrier}</p>

          {/* Estimated Delivery */}
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Arrives {estimatedDelivery}</span>
          </div>
        </div>

        {/* Price and Selection */}
        <div className="flex items-center gap-3">
          <span className={cn('text-right font-semibold', option.isFree ? 'text-green-600' : 'text-foreground')}>
            {option.isFree ? 'FREE' : formatPrice(option.finalCost)}
          </span>

          {/* Radio Button */}
          <div
            className={cn(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30 bg-transparent'
            )}
          >
            {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
          </div>
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format estimated delivery date range
 */
function formatEstimatedDelivery(minDays: number, maxDays: number): string {
  const today = new Date()

  // Calculate delivery dates
  const minDate = addBusinessDays(today, minDays)
  const maxDate = addBusinessDays(today, maxDays)

  // Format dates
  const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

  if (minDays === maxDays) {
    return minDate.toLocaleDateString('en-IN', formatOptions)
  }

  // Check if same month
  if (minDate.getMonth() === maxDate.getMonth()) {
    return `${minDate.getDate()}-${maxDate.toLocaleDateString('en-IN', formatOptions)}`
  }

  return `${minDate.toLocaleDateString('en-IN', formatOptions)} - ${maxDate.toLocaleDateString('en-IN', formatOptions)}`
}

/**
 * Add business days to a date (excludes weekends)
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const dayOfWeek = result.getDay()
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--
    }
  }

  return result
}

// ============================================================================
// Main Component
// ============================================================================

export function ShippingSelector({
  cartTotal,
  selectedOptionId,
  onSelect,
  postalCode,
  className,
}: ShippingSelectorProps) {
  const [options, setOptions] = useState<ShippingOptionData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(1000)
  const [qualifiesForFreeShipping, setQualifiesForFreeShipping] = useState(false)

  // Fetch shipping options
  useEffect(() => {
    async function fetchShippingOptions() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await api.shipping.getEstimate({
          cartTotal,
          zipCode: postalCode,
        })

        setOptions(response.options)
        setFreeShippingThreshold(response.freeShippingThreshold)
        setQualifiesForFreeShipping(response.qualifiesForFreeShipping)

        // Auto-select first option if none selected
        const firstOption = response.options[0]
        if (!selectedOptionId && firstOption) {
          onSelect(firstOption)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shipping options')
      } finally {
        setIsLoading(false)
      }
    }

    fetchShippingOptions()
  }, [cartTotal, postalCode])

  // Determine fastest and cheapest options
  const { fastestId, cheapestId } = useMemo(() => {
    if (options.length === 0) return { fastestId: null, cheapestId: null }

    const sorted = [...options]

    // Fastest = lowest max days
    const fastest = sorted.reduce((min, opt) =>
      opt.estimatedDaysMax < min.estimatedDaysMax ? opt : min
    )

    // Cheapest = lowest non-free cost (or first free)
    const cheapest = sorted.reduce((min, opt) => {
      if (opt.isFree) return opt
      if (min.isFree) return min
      return opt.finalCost < min.finalCost ? opt : min
    })

    return {
      fastestId: fastest.id,
      cheapestId: cheapest.id !== fastest.id ? cheapest.id : null,
    }
  }, [options])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading shipping options...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-lg border border-red-200 bg-red-50 p-4', className)}>
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">Failed to load shipping options</span>
        </div>
        <p className="mt-1 text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 text-sm font-medium text-red-700 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    )
  }

  // No options available
  if (options.length === 0) {
    return (
      <div className={cn('rounded-lg border border-amber-200 bg-amber-50 p-4', className)}>
        <div className="flex items-center gap-2 text-amber-700">
          <AlertCircle className="h-5 w-5" />
          <span className="font-medium">No shipping options available</span>
        </div>
        <p className="mt-1 text-sm text-amber-600">
          Please check your delivery address or contact support.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Shipping Options List */}
      {options.map((option) => (
        <ShippingOptionCard
          key={option.id}
          option={option}
          isSelected={selectedOptionId === option.id}
          isFastest={option.id === fastestId}
          isCheapest={option.id === cheapestId}
          onSelect={() => onSelect(option)}
        />
      ))}

      {/* Free Shipping Notice */}
      {qualifiesForFreeShipping && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>
            You qualify for free shipping on orders over {formatPrice(freeShippingThreshold)}!
          </span>
        </div>
      )}

      {/* Progress to Free Shipping */}
      {!qualifiesForFreeShipping && (
        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Add {formatPrice(freeShippingThreshold - cartTotal)} more for free shipping
            </span>
            <span className="font-medium text-foreground">
              {Math.round((cartTotal / freeShippingThreshold) * 100)}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min((cartTotal / freeShippingThreshold) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Export types for use in checkout
export type { ShippingOptionData as SelectedShippingOption }
