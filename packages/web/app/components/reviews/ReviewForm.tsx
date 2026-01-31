/**
 * ReviewForm Component
 *
 * Form for submitting product reviews with star rating selector,
 * title, and content fields. Following AddressForm patterns.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { MessageSquare, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react'
import { cn } from '~/lib/utils'
import { StarRating } from './StarRating'

// ============================================================================
// Types
// ============================================================================

export interface ReviewFormData {
  rating: number
  title: string
  content: string
}

export interface ReviewFormErrors {
  rating?: string
  title?: string
  content?: string
}

export interface ReviewFormProps {
  /** Product ID to review */
  productId: string
  /** Callback when form is submitted successfully */
  onSuccess?: (data: ReviewFormData) => void
  /** Callback when form is cancelled */
  onCancel?: () => void
  /** Custom submit handler (for testing/overriding default) */
  onSubmit?: (data: ReviewFormData) => Promise<void>
  /** Whether user is authenticated */
  isAuthenticated?: boolean
  /** Custom className */
  className?: string
  /** Initial form data (for editing) */
  initialData?: Partial<ReviewFormData>
  /** Whether to show as modal or inline */
  variant?: 'modal' | 'inline'
}

// ============================================================================
// Constants
// ============================================================================

const TITLE_MAX_LENGTH = 255
const CONTENT_MIN_LENGTH = 10
const CONTENT_MAX_LENGTH = 5000

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewForm - Form for submitting product reviews
 *
 * @example
 * <ReviewForm
 *   productId="123"
 *   isAuthenticated={true}
 *   onSuccess={handleSuccess}
 * />
 */
export function ReviewForm({
  productId,
  onSuccess,
  onCancel,
  onSubmit,
  isAuthenticated = false,
  className,
  initialData,
  variant = 'inline',
}: ReviewFormProps) {
  // Form state
  const [formData, setFormData] = useState<ReviewFormData>({
    rating: initialData?.rating ?? 0,
    title: initialData?.title ?? '',
    content: initialData?.content ?? '',
  })

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<ReviewFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Validate form data
  const validateForm = useCallback((data: ReviewFormData): ReviewFormErrors => {
    const newErrors: ReviewFormErrors = {}

    if (data.rating === 0) {
      newErrors.rating = 'Please select a rating'
    }

    if (data.title && data.title.length > TITLE_MAX_LENGTH) {
      newErrors.title = `Title must be ${TITLE_MAX_LENGTH} characters or less`
    }

    if (!data.content.trim()) {
      newErrors.content = 'Review content is required'
    } else if (data.content.trim().length < CONTENT_MIN_LENGTH) {
      newErrors.content = `Review must be at least ${CONTENT_MIN_LENGTH} characters`
    } else if (data.content.length > CONTENT_MAX_LENGTH) {
      newErrors.content = `Review must be ${CONTENT_MAX_LENGTH} characters or less`
    }

    return newErrors
  }, [])

  // Check if form is valid
  const isFormValid = useCallback(() => {
    const validationErrors = validateForm(formData)
    return Object.keys(validationErrors).length === 0
  }, [formData, validateForm])

  // Handle rating change
  const handleRatingChange = useCallback((rating: number) => {
    setFormData((prev) => ({ ...prev, rating }))
    setTouched((prev) => ({ ...prev, rating: true }))
    setErrors((prev) => {
      const newErrors = { ...prev }
      if (rating > 0) {
        delete newErrors.rating
      }
      return newErrors
    })
  }, [])

  // Handle field change
  const handleChange = useCallback((field: keyof ReviewFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    // Clear submit status on change
    if (submitStatus !== 'idle') {
      setSubmitStatus('idle')
      setSubmitError(null)
    }
  }, [submitStatus])

  // Handle field blur
  const handleBlur = useCallback((field: keyof ReviewFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const newErrors = validateForm(formData)
    setErrors(newErrors)
  }, [formData, validateForm])

  // Get field error (only show if touched)
  const getFieldError = (field: keyof ReviewFormErrors) => {
    return touched[field] ? errors[field] : undefined
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Mark all fields as touched
    setTouched({ rating: true, title: true, content: true })

    // Validate
    const validationErrors = validateForm(formData)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      if (onSubmit) {
        await onSubmit(formData)
      } else {
        // Default API call
        const response = await fetch(`/api/products/${productId}/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(error.error?.message || 'Failed to submit review')
        }
      }

      setSubmitStatus('success')
      onSuccess?.(formData)

      // Reset form after success
      setTimeout(() => {
        setFormData({ rating: 0, title: '', content: '' })
        setTouched({})
        setSubmitStatus('idle')
      }, 2000)
    } catch (error) {
      setSubmitStatus('error')
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit review')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show login prompt for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className={cn('rounded-lg border border-border bg-card p-6', className)}>
        <div className="flex flex-col items-center text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            Sign in to write a review
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to be logged in to share your experience with this product.
          </p>
          <a
            href="/auth/login"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign In
          </a>
        </div>
      </div>
    )
  }

  // Success state
  if (submitStatus === 'success') {
    return (
      <div className={cn('rounded-lg border border-green-200 bg-green-50 p-6', className)}>
        <div className="flex flex-col items-center text-center">
          <CheckCircle className="h-10 w-10 text-green-500" />
          <h3 className="mt-4 text-lg font-medium text-green-900">
            Thank you for your review!
          </h3>
          <p className="mt-2 text-sm text-green-700">
            Your review has been submitted and will be visible after approval.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card',
        variant === 'modal' ? 'p-0' : 'p-6',
        className
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between',
        variant === 'modal' ? 'border-b border-border px-6 py-4' : 'mb-6'
      )}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Write a Review</h2>
        </div>
        {onCancel && variant === 'modal' && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Error Banner */}
      {submitStatus === 'error' && submitError && (
        <div className={cn(
          'flex items-center gap-3 border-b border-red-200 bg-red-50 px-6 py-3',
          variant !== 'modal' && 'mx-0 mb-4 rounded-lg border'
        )}>
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className={variant === 'modal' ? 'p-6' : ''}
      >
        <div className="space-y-5">
          {/* Star Rating */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Rating <span className="text-red-500">*</span>
            </label>
            <StarRating
              rating={formData.rating}
              interactive
              onRatingChange={handleRatingChange}
              size="lg"
            />
            {getFieldError('rating') && (
              <p className="mt-1.5 text-xs text-red-500">{getFieldError('rating')}</p>
            )}
          </div>

          {/* Title (Optional) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="review-title" className="text-sm font-medium text-foreground">
                Title <span className="text-muted-foreground">(Optional)</span>
              </label>
              <span className="text-xs text-muted-foreground">
                {formData.title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              type="text"
              id="review-title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              onBlur={() => handleBlur('title')}
              placeholder="Summarize your experience"
              maxLength={TITLE_MAX_LENGTH}
              className={cn(
                'w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                getFieldError('title')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-input hover:border-muted-foreground'
              )}
            />
            {getFieldError('title') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('title')}</p>
            )}
          </div>

          {/* Content */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="review-content" className="text-sm font-medium text-foreground">
                Review <span className="text-red-500">*</span>
              </label>
              <span
                className={cn(
                  'text-xs',
                  formData.content.length > CONTENT_MAX_LENGTH
                    ? 'text-red-500'
                    : formData.content.length < CONTENT_MIN_LENGTH && touched.content
                      ? 'text-amber-500'
                      : 'text-muted-foreground'
                )}
              >
                {formData.content.length}/{CONTENT_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="review-content"
              value={formData.content}
              onChange={(e) => handleChange('content', e.target.value)}
              onBlur={() => handleBlur('content')}
              placeholder="Share your experience with this product..."
              rows={5}
              className={cn(
                'w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                getFieldError('content')
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-input hover:border-muted-foreground'
              )}
            />
            {getFieldError('content') && (
              <p className="mt-1 text-xs text-red-500">{getFieldError('content')}</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Minimum {CONTENT_MIN_LENGTH} characters required
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className={cn(
          'flex items-center gap-3',
          variant === 'modal' ? 'mt-6 border-t border-border pt-6' : 'mt-6'
        )}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:flex-none"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid()}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors sm:flex-none',
              isSubmitting || !isFormValid()
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Review'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// Review Form Skeleton
// ============================================================================

export function ReviewFormSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg border border-border bg-card p-6', className)}>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted" />
        <div className="h-6 w-32 rounded bg-muted" />
      </div>
      <div className="space-y-5">
        {/* Rating skeleton */}
        <div>
          <div className="mb-2 h-4 w-12 rounded bg-muted" />
          <div className="flex gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-8 w-8 rounded bg-muted" />
            ))}
          </div>
        </div>
        {/* Title skeleton */}
        <div>
          <div className="mb-1.5 h-4 w-20 rounded bg-muted" />
          <div className="h-10 rounded-lg bg-muted" />
        </div>
        {/* Content skeleton */}
        <div>
          <div className="mb-1.5 h-4 w-16 rounded bg-muted" />
          <div className="h-32 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <div className="h-10 w-20 rounded-lg bg-muted" />
        <div className="h-10 w-32 rounded-lg bg-muted" />
      </div>
    </div>
  )
}

// ============================================================================
// Default Export
// ============================================================================

export default ReviewForm
