/**
 * ReturnRequestForm Component
 *
 * Form for submitting a return request with reason selection and details.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { Loader2, Send, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '~/lib/utils'
import { returnsApi, type ReturnReason, type ReturnRequest } from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface ReturnRequestFormProps {
  /** Order ID to create return for */
  orderId: string
  /** Callback when return is successfully created */
  onSuccess?: (returnRequest: ReturnRequest) => void
  /** Callback when form is cancelled */
  onCancel?: () => void
  /** Optional className */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

interface ReasonOption {
  value: ReturnReason
  label: string
  description: string
}

const RETURN_REASONS: ReasonOption[] = [
  {
    value: 'defective',
    label: 'Defective Product',
    description: 'The product has a manufacturing defect or is not working properly',
  },
  {
    value: 'wrong_item',
    label: 'Wrong Item Received',
    description: 'I received a different product than what I ordered',
  },
  {
    value: 'not_as_described',
    label: 'Not as Described',
    description: 'The product does not match the description or images shown',
  },
  {
    value: 'damaged_in_transit',
    label: 'Damaged in Transit',
    description: 'The product arrived damaged due to shipping',
  },
  {
    value: 'changed_mind',
    label: 'Changed My Mind',
    description: 'I no longer want or need this product',
  },
  {
    value: 'late_delivery',
    label: 'Late Delivery',
    description: 'The product arrived significantly later than expected',
  },
  {
    value: 'other',
    label: 'Other Reason',
    description: 'Another reason not listed above',
  },
]

const MIN_DETAILS_LENGTH = 10
const MAX_DETAILS_LENGTH = 2000

// ============================================================================
// Component
// ============================================================================

/**
 * ReturnRequestForm - Form for submitting return requests
 *
 * @example
 * <ReturnRequestForm
 *   orderId="order-123"
 *   onSuccess={(ret) => console.log('Created:', ret)}
 * />
 */
export function ReturnRequestForm({
  orderId,
  onSuccess,
  onCancel,
  className,
}: ReturnRequestFormProps) {
  const [reason, setReason] = useState<ReturnReason | ''>('')
  const [reasonDetails, setReasonDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [createdReturn, setCreatedReturn] = useState<ReturnRequest | null>(null)

  // Validation
  const detailsLength = reasonDetails.trim().length
  const isDetailsValid = detailsLength >= MIN_DETAILS_LENGTH && detailsLength <= MAX_DETAILS_LENGTH
  const canSubmit = reason !== '' && isDetailsValid && !isSubmitting

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canSubmit) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await returnsApi.createReturn(orderId, {
        reason: reason as ReturnReason,
        reasonDetails: reasonDetails.trim(),
      })

      setSuccess(true)
      setCreatedReturn(response.return)
      onSuccess?.(response.return)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit return request')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Success state
  if (success && createdReturn) {
    return (
      <div className={cn('rounded-xl border border-green-200 bg-green-50 p-6', className)}>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="mt-4 text-lg text-green-900">
            Return Request Submitted
          </h3>
          <p className="mt-2 text-sm text-green-700">
            Your return request has been submitted successfully. We&apos;ll review it and get
            back to you soon.
          </p>
          <div className="mt-4 rounded-lg border border-green-200 bg-white p-3">
            <p className="text-sm text-muted-foreground">Request ID</p>
            <p className="font-mono text-sm font-medium text-foreground">
              {createdReturn.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reason Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Reason for Return <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2">
          {RETURN_REASONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                reason === option.value
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-foreground/30 hover:bg-muted/50'
              )}
            >
              <input
                type="radio"
                name="reason"
                value={option.value}
                checked={reason === option.value}
                onChange={(e) => setReason(e.target.value as ReturnReason)}
                className="mt-0.5 h-4 w-4 border-border text-foreground focus:ring-ring"
              />
              <div className="flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    reason === option.value ? 'text-foreground' : 'text-foreground'
                  )}
                >
                  {option.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Reason Details */}
      <div>
        <label htmlFor="reasonDetails" className="mb-2 block text-sm font-medium text-foreground">
          Please describe the issue in detail <span className="text-red-500">*</span>
        </label>
        <textarea
          id="reasonDetails"
          value={reasonDetails}
          onChange={(e) => setReasonDetails(e.target.value)}
          placeholder="Please provide specific details about why you want to return this item. Include any relevant information that will help us process your request..."
          rows={4}
          maxLength={MAX_DETAILS_LENGTH}
          className={cn(
            'w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20',
            !isDetailsValid && detailsLength > 0 ? 'border-red-300' : 'border-border'
          )}
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span
            className={cn(
              detailsLength > 0 && detailsLength < MIN_DETAILS_LENGTH
                ? 'text-red-500'
                : 'text-muted-foreground'
            )}
          >
            {detailsLength < MIN_DETAILS_LENGTH
              ? `Minimum ${MIN_DETAILS_LENGTH} characters required`
              : `${detailsLength} / ${MAX_DETAILS_LENGTH}`}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-lg px-6 py-2 text-sm font-medium text-white transition-colors',
            canSubmit
              ? 'bg-primary hover:bg-primary/85'
              : 'cursor-not-allowed bg-accent'
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Return Request
            </>
          )}
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// Exports
// ============================================================================

export { RETURN_REASONS, MIN_DETAILS_LENGTH, MAX_DETAILS_LENGTH }
export default ReturnRequestForm
