/**
 * ReturnPolicyDisplay Component
 *
 * Displays return policy summary with key details.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useEffect } from 'react'
import { FileText, Clock, CreditCard, Package, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '~/lib/utils'
import { returnsApi, type ReturnPolicy } from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface ReturnPolicyDisplayProps {
  /** Optional policy to display (if already fetched) */
  policy?: ReturnPolicy
  /** Show compact version */
  compact?: boolean
  /** Optional className */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReturnPolicyDisplay - Shows return policy summary
 *
 * @example
 * <ReturnPolicyDisplay />
 * <ReturnPolicyDisplay policy={policyData} compact />
 */
export function ReturnPolicyDisplay({
  policy: propPolicy,
  compact = false,
  className,
}: ReturnPolicyDisplayProps) {
  const [policy, setPolicy] = useState<ReturnPolicy | null>(propPolicy || null)
  const [isLoading, setIsLoading] = useState(!propPolicy)
  const [error, setError] = useState<string | null>(null)

  // Fetch policy if not provided
  useEffect(() => {
    if (propPolicy) return

    async function fetchPolicy() {
      try {
        const response = await returnsApi.getPolicies()
        if (response.policies.length > 0) {
          const firstPolicy = response.policies[0]
          if (firstPolicy) {
            setPolicy(firstPolicy)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load policy')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPolicy()
  }, [propPolicy])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-foreground" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700',
          className
        )}
      >
        <AlertCircle className="h-4 w-4" />
        <span>Unable to load return policy</span>
      </div>
    )
  }

  // No policy state
  if (!policy) {
    return null
  }

  // Compact version
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-3 text-sm',
          className
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{policy.daysAllowed} days</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          <span>
            {policy.refundPercentage === 100
              ? 'Full refund'
              : `${policy.refundPercentage}% refund`}
          </span>
        </div>
        <a
          href="/return-policy"
          className="ml-auto text-foreground hover:text-foreground/60 hover:underline"
        >
          View full policy
        </a>
      </div>
    )
  }

  // Full version
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-4">
        <FileText className="h-5 w-5 text-foreground" />
        <h3 className="font-semibold text-foreground">{policy.name}</h3>
      </div>

      {/* Content */}
      <div className="p-4">
        {policy.description && (
          <p className="mb-4 text-sm text-muted-foreground">{policy.description}</p>
        )}

        <div className="space-y-3">
          {/* Return Window */}
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Return Window</p>
              <p className="text-sm text-muted-foreground">
                {policy.daysAllowed} days from delivery
              </p>
            </div>
          </div>

          {/* Refund Type */}
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50">
              <CreditCard className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Refund Amount</p>
              <p className="text-sm text-muted-foreground">
                {policy.refundPercentage === 100
                  ? 'Full refund to original payment method'
                  : `${policy.refundPercentage}% refund via ${policy.refundType}`}
              </p>
            </div>
          </div>

          {/* Condition */}
          {policy.conditionRequired && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <Package className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Condition Required</p>
                <p className="text-sm text-muted-foreground">{policy.conditionRequired}</p>
              </div>
            </div>
          )}
        </div>

        {/* Link to full policy */}
        <div className="mt-4 border-t border-border pt-4">
          <a
            href="/return-policy"
            className="text-sm font-medium text-foreground hover:text-foreground/60 hover:underline"
          >
            View full return policy →
          </a>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export default ReturnPolicyDisplay
