/**
 * ReturnEligibilityCheck Component
 *
 * Displays whether an order is eligible for return and the time remaining.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ReturnEligibilityCheckProps {
  /** Whether the order is eligible for return */
  isEligible: boolean
  /** Message explaining eligibility status */
  message?: string
  /** Days remaining in return window */
  daysRemaining?: number
  /** Whether currently loading */
  isLoading?: boolean
  /** Optional className */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReturnEligibilityCheck - Shows return eligibility status
 *
 * @example
 * <ReturnEligibilityCheck
 *   isEligible={true}
 *   daysRemaining={12}
 * />
 */
export function ReturnEligibilityCheck({
  isEligible,
  message,
  daysRemaining,
  isLoading = false,
  className,
}: ReturnEligibilityCheckProps) {
  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4',
          className
        )}
      >
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <div className="flex-1">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-3 w-48 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  // Eligible state
  if (isEligible) {
    const isUrgent = daysRemaining !== undefined && daysRemaining <= 3

    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border p-4',
          isUrgent
            ? 'border-amber-200 bg-amber-50'
            : 'border-green-200 bg-green-50',
          className
        )}
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isUrgent ? 'bg-amber-100' : 'bg-green-100'
          )}
        >
          {isUrgent ? (
            <Clock className="h-5 w-5 text-amber-600" />
          ) : (
            <CheckCircle className="h-5 w-5 text-green-600" />
          )}
        </div>
        <div className="flex-1">
          <p
            className={cn(
              'font-medium',
              isUrgent ? 'text-amber-800' : 'text-green-800'
            )}
          >
            {isUrgent ? 'Return Window Closing Soon!' : 'Eligible for Return'}
          </p>
          <p
            className={cn(
              'mt-0.5 text-sm',
              isUrgent ? 'text-amber-700' : 'text-green-700'
            )}
          >
            {daysRemaining !== undefined ? (
              <>
                {daysRemaining === 0
                  ? 'Last day to request a return'
                  : daysRemaining === 1
                    ? '1 day remaining in return window'
                    : `${daysRemaining} days remaining in return window`}
              </>
            ) : (
              'You can request a return for this order.'
            )}
          </p>
        </div>
      </div>
    )
  }

  // Not eligible state
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4',
        className
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
        <XCircle className="h-5 w-5 text-red-600" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-red-800">Not Eligible for Return</p>
        <p className="mt-0.5 text-sm text-red-700">
          {message || 'This order is not eligible for a return request.'}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export default ReturnEligibilityCheck
