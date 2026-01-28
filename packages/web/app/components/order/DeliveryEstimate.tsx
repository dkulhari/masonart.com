/**
 * DeliveryEstimate Component
 *
 * Displays estimated or actual delivery date with appropriate styling.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Calendar, CheckCircle, Clock } from 'lucide-react'
import { cn, formatDate } from '~/lib/utils'
import type { ShipmentStatus } from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface DeliveryEstimateProps {
  /** Estimated delivery date (ISO string) */
  estimatedDeliveryAt: string | null
  /** Actual delivery date (ISO string) */
  deliveredAt: string | null
  /** Current shipment status */
  status: ShipmentStatus
  /** Optional className */
  className?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format delivery date for display
 */
function formatDeliveryDate(dateString: string): string {
  const date = new Date(dateString)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Check if it's today
  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }

  // Check if it's tomorrow
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow'
  }

  // Otherwise format with day of week
  return formatDate(dateString, { weekday: 'short' })
}

/**
 * Calculate days until delivery
 */
function getDaysUntilDelivery(dateString: string): number {
  const date = new Date(dateString)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  const diffTime = date.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// ============================================================================
// Component
// ============================================================================

/**
 * DeliveryEstimate - Shows estimated or actual delivery date
 *
 * @example
 * <DeliveryEstimate
 *   estimatedDeliveryAt="2024-02-15T00:00:00Z"
 *   deliveredAt={null}
 *   status="in_transit"
 * />
 */
export function DeliveryEstimate({
  estimatedDeliveryAt,
  deliveredAt,
  status,
  className,
}: DeliveryEstimateProps) {
  // If delivered, show delivery date
  if (status === 'delivered' && deliveredAt) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-4 w-4 text-green-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-green-700">Delivered</p>
          <p className="text-xs text-muted-foreground">
            {formatDeliveryDate(deliveredAt)}
          </p>
        </div>
      </div>
    )
  }

  // If cancelled or returned, don't show estimate
  if (status === 'cancelled' || status === 'returned') {
    return null
  }

  // If no estimate available
  if (!estimatedDeliveryAt) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Estimated Delivery</p>
          <p className="text-xs text-muted-foreground">Calculating...</p>
        </div>
      </div>
    )
  }

  // Show estimated delivery
  const daysUntil = getDaysUntilDelivery(estimatedDeliveryAt)
  const isUrgent = daysUntil <= 1
  const isSoon = daysUntil <= 3

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full',
          isUrgent ? 'bg-amber-100' : isSoon ? 'bg-blue-100' : 'bg-muted'
        )}
      >
        <Calendar
          className={cn(
            'h-4 w-4',
            isUrgent
              ? 'text-amber-600'
              : isSoon
                ? 'text-blue-600'
                : 'text-muted-foreground'
          )}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {isUrgent
            ? 'Arriving Soon!'
            : isSoon
              ? 'Arriving in a few days'
              : 'Estimated Delivery'}
        </p>
        <p
          className={cn(
            'text-xs',
            isUrgent
              ? 'font-medium text-amber-600'
              : isSoon
                ? 'text-blue-600'
                : 'text-muted-foreground'
          )}
        >
          {formatDeliveryDate(estimatedDeliveryAt)}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export default DeliveryEstimate
