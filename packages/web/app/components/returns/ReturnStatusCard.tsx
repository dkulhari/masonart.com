/**
 * ReturnStatusCard Component
 *
 * Displays the status and timeline of a return request.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Package,
  CreditCard,
  Ban,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn, formatDate, formatPrice } from '~/lib/utils'
import type { ReturnRequest, ReturnStatus } from '~/lib/api'
import { useState } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface ReturnStatusCardProps {
  /** Return request data */
  returnRequest: ReturnRequest
  /** Optional order number for display */
  orderNumber?: string
  /** Show expanded details by default */
  defaultExpanded?: boolean
  /** Callback when cancel is requested */
  onCancel?: () => void
  /** Whether cancellation is in progress */
  isCancelling?: boolean
  /** Optional className */
  className?: string
}

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  label: string
  icon: typeof Clock
  color: string
  bgColor: string
  borderColor: string
}

const STATUS_CONFIG: Record<ReturnStatus, StatusConfig> = {
  pending: {
    label: 'Pending Review',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  shipped_back: {
    label: 'Item Shipped Back',
    icon: Truck,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  received: {
    label: 'Item Received',
    icon: Package,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
  },
  processing: {
    label: 'Processing Refund',
    icon: CreditCard,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  refunded: {
    label: 'Refunded',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  closed: {
    label: 'Closed',
    icon: Ban,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
}

// Timeline steps in order
const TIMELINE_STEPS: { status: ReturnStatus; label: string }[] = [
  { status: 'pending', label: 'Request Submitted' },
  { status: 'approved', label: 'Approved' },
  { status: 'shipped_back', label: 'Item Shipped Back' },
  { status: 'received', label: 'Item Received' },
  { status: 'processing', label: 'Processing' },
  { status: 'refunded', label: 'Refunded' },
]

// Status order for timeline calculation
const STATUS_ORDER: Record<ReturnStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: -1, // Rejected is a terminal state
  shipped_back: 2,
  received: 3,
  processing: 4,
  refunded: 5,
  closed: -1, // Closed is a terminal state
}

// ============================================================================
// Reason Labels
// ============================================================================

const REASON_LABELS: Record<string, string> = {
  defective: 'Defective Product',
  wrong_item: 'Wrong Item Received',
  not_as_described: 'Not as Described',
  changed_mind: 'Changed Mind',
  damaged_in_transit: 'Damaged in Transit',
  late_delivery: 'Late Delivery',
  other: 'Other',
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReturnStatusCard - Displays return request status and timeline
 *
 * @example
 * <ReturnStatusCard returnRequest={returnData} />
 */
export function ReturnStatusCard({
  returnRequest,
  orderNumber,
  defaultExpanded = false,
  onCancel,
  isCancelling = false,
  className,
}: ReturnStatusCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const statusConfig = STATUS_CONFIG[returnRequest.status] || STATUS_CONFIG.pending
  const StatusIcon = statusConfig.icon
  const currentStatusOrder = STATUS_ORDER[returnRequest.status]
  const canCancel = returnRequest.status === 'pending'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border',
        statusConfig.borderColor,
        className
      )}
    >
      {/* Header (clickable) */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex w-full items-center justify-between p-4 text-left transition-colors',
          statusConfig.bgColor,
          'hover:opacity-90'
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-white')}>
            <StatusIcon className={cn('h-5 w-5', statusConfig.color)} />
          </div>
          <div>
            <p className={cn('font-medium', statusConfig.color)}>{statusConfig.label}</p>
            <p className="text-sm text-muted-foreground">
              {orderNumber ? `Order ${orderNumber}` : `Return ID: ${returnRequest.id.slice(0, 8)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {returnRequest.refundAmount && returnRequest.status === 'refunded' && (
            <div className="hidden text-right sm:block">
              <p className="text-sm text-muted-foreground">Refund Amount</p>
              <p className="font-semibold text-green-600">
                {formatPrice(parseFloat(returnRequest.refundAmount))}
              </p>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border bg-card p-4">
          {/* Refund amount for mobile */}
          {returnRequest.refundAmount && returnRequest.status === 'refunded' && (
            <div className="mb-4 rounded-lg bg-green-50 p-3 sm:hidden">
              <p className="text-sm text-muted-foreground">Refund Amount</p>
              <p className="text-lg font-semibold text-green-600">
                {formatPrice(parseFloat(returnRequest.refundAmount))}
              </p>
            </div>
          )}

          {/* Reason */}
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Return Reason</p>
            <p className="font-medium text-foreground">
              {REASON_LABELS[returnRequest.reason] || returnRequest.reason}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{returnRequest.reasonDetails}</p>
          </div>

          {/* Timeline (only for non-terminal states or refunded) */}
          {(currentStatusOrder >= 0 || returnRequest.status === 'refunded') && (
            <div className="mb-4">
              <p className="mb-3 text-sm font-medium text-foreground">Progress</p>
              <div className="space-y-0">
                {TIMELINE_STEPS.map((step, index) => {
                  const stepOrder = STATUS_ORDER[step.status]
                  const isCompleted = stepOrder <= currentStatusOrder
                  const isCurrent = step.status === returnRequest.status
                  const isLast = index === TIMELINE_STEPS.length - 1

                  // Get timestamp for this step
                  let timestamp: string | null = null
                  if (step.status === 'pending') timestamp = returnRequest.requestedAt
                  if (step.status === 'approved') timestamp = returnRequest.approvedAt
                  if (step.status === 'refunded') timestamp = returnRequest.processedAt

                  return (
                    <div key={step.status} className="relative flex pb-4 last:pb-0">
                      {/* Connector line */}
                      {!isLast && (
                        <div
                          className={cn(
                            'absolute left-[11px] top-6 h-full w-0.5',
                            isCompleted && stepOrder < currentStatusOrder
                              ? 'bg-primary'
                              : 'bg-border'
                          )}
                        />
                      )}

                      {/* Step indicator */}
                      <div
                        className={cn(
                          'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                          isCompleted
                            ? 'border-primary bg-primary text-primary-foreground'
                            : isCurrent
                              ? 'border-primary bg-white text-foreground'
                              : 'border-border bg-background text-muted-foreground'
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-current" />
                        )}
                      </div>

                      {/* Step label */}
                      <div className="ml-3">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {step.label}
                        </p>
                        {timestamp && (
                          <p className="text-xs text-muted-foreground">{formatDate(timestamp)}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Rejected message */}
          {returnRequest.status === 'rejected' && returnRequest.adminNotes && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">Rejection Reason</p>
              <p className="mt-1 text-sm text-red-700">{returnRequest.adminNotes}</p>
            </div>
          )}

          {/* Request date */}
          <div className="border-t border-border pt-4 text-sm text-muted-foreground">
            Requested on {formatDate(returnRequest.requestedAt)}
          </div>

          {/* Cancel button for pending requests */}
          {canCancel && onCancel && (
            <div className="mt-4 border-t border-border pt-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <Clock className="h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Cancel Request
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export { STATUS_CONFIG, REASON_LABELS }
export default ReturnStatusCard
