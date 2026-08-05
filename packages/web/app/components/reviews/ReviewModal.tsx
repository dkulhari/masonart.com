/**
 * ReviewModal Component
 *
 * Modal dialog for writing/editing reviews from order pages.
 * Wraps ReviewForm with product info header and handles API calls
 * for both create and edit modes.
 */

import { useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ReviewForm, type ReviewFormData } from './ReviewForm'

// ============================================================================
// Types
// ============================================================================

export interface ReviewModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Order ID for creating a new review */
  orderId: string
  /** Order item ID for creating a new review */
  orderItemId: string
  /** Product ID being reviewed */
  productId: string
  /** Product name to display in header */
  productName: string
  /** Optional product thumbnail URL */
  productThumbnail?: string
  /** Existing review data for edit mode */
  existingReview?: {
    id: string
    rating: number
    title?: string
    content: string
  }
  /** Callback after successful submission */
  onSuccess?: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewModal - Modal dialog for writing/editing reviews
 *
 * @example
 * // Create mode
 * <ReviewModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   orderId="order-123"
 *   orderItemId="item-456"
 *   productId="product-789"
 *   productName="Classic Black Frame"
 *   productThumbnail="/images/frame.jpg"
 *   onSuccess={handleSuccess}
 * />
 *
 * @example
 * // Edit mode
 * <ReviewModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   orderId="order-123"
 *   orderItemId="item-456"
 *   productId="product-789"
 *   productName="Classic Black Frame"
 *   existingReview={{
 *     id: "review-123",
 *     rating: 4,
 *     title: "Great frame",
 *     content: "Really happy with this purchase!"
 *   }}
 *   onSuccess={handleSuccess}
 * />
 */
export function ReviewModal({
  isOpen,
  onClose,
  orderId,
  orderItemId,
  productId,
  productName,
  productThumbnail,
  existingReview,
  onSuccess,
}: ReviewModalProps) {
  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle form submission - routes to appropriate API endpoint
  const handleSubmit = useCallback(
    async (data: ReviewFormData) => {
      const url = existingReview
        ? `/api/reviews/${existingReview.id}`
        : `/api/orders/${orderId}/items/${orderItemId}/review`

      const method = existingReview ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to submit review')
      }

      // Hand the review id back so ReviewForm can attach photos and videos to
      // it. Editing already knows the id; creating has to read it off the
      // response. Returning nothing would leave the picker with no target.
      if (existingReview) {
        return { id: existingReview.id }
      }

      const body = await response.json().catch(() => null)
      const createdId = body?.review?.id
      return typeof createdId === 'string' ? { id: createdId } : undefined
    },
    [orderId, orderItemId, existingReview]
  )

  // Handle successful submission - call callback and close modal
  const handleSuccess = useCallback(() => {
    onSuccess?.()
    // Delay close slightly to show success state
    setTimeout(() => onClose(), 1500)
  }, [onSuccess, onClose])

  // Don't render if not open
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg mx-4',
          'bg-card rounded-xl shadow-xl',
          'max-h-[90vh] overflow-y-auto'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-4 rounded-t-xl">
          <div className="flex items-center gap-3">
            {productThumbnail && (
              <img
                src={productThumbnail}
                alt={productName}
                className="h-10 w-10 rounded-lg object-cover"
              />
            )}
            <div>
              <h2 id="review-modal-title" className="text-lg font-semibold text-foreground">
                {existingReview ? 'Edit Review' : 'Write a Review'}
              </h2>
              <p className="text-sm text-muted-foreground line-clamp-1">{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6">
          <ReviewForm
            productId={productId}
            isAuthenticated={true}
            initialData={
              existingReview
                ? {
                    rating: existingReview.rating,
                    title: existingReview.title || '',
                    content: existingReview.content,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            onSuccess={handleSuccess}
            onCancel={onClose}
            variant="inline"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Default Export
// ============================================================================

export default ReviewModal
