/**
 * ProductReviews Component
 *
 * Integrates review components into product pages with data fetching,
 * filtering, and form display.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { MessageSquare, PenLine } from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  useReviews,
  useReviewStats,
  useCreateReview,
  toReviewStats,
  type ReviewFilters,
} from '~/hooks/useReviews'
import {
  ReviewList,
  ReviewSummary,
  ReviewSummarySkeleton,
  ReviewForm,
} from '~/components/reviews'

// ============================================================================
// Types
// ============================================================================

export interface ProductReviewsProps {
  /** Product ID to show reviews for */
  productId: string
  /** Whether user is authenticated */
  isAuthenticated?: boolean
  /** Custom className */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * ProductReviews - Complete reviews section for product pages
 *
 * @example
 * <ProductReviews
 *   productId="123"
 *   productName="Dream Big Poster"
 *   isAuthenticated={user != null}
 * />
 */
export function ProductReviews({
  productId,
  isAuthenticated = false,
  className,
}: ProductReviewsProps) {
  const [showForm, setShowForm] = useState(false)
  const [filters] = useState<ReviewFilters>({
    sortBy: 'newest',
    page: 1,
    limit: 10,
  })

  // Fetch reviews and stats
  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useReviews(productId, filters)

  const {
    data: statsData,
    isLoading: statsLoading,
  } = useReviewStats(productId)

  const createReview = useCreateReview(productId)

  // Handle form success
  const handleFormSuccess = useCallback(() => {
    setShowForm(false)
  }, [])

  // Handle write review button
  const handleWriteReview = useCallback(() => {
    setShowForm(true)
  }, [])

  // Handle form cancel
  const handleFormCancel = useCallback(() => {
    setShowForm(false)
  }, [])

  // Handle form submit
  const handleFormSubmit = useCallback(
    async (data: { rating: number; title: string; content: string }) => {
      await createReview.mutateAsync(data)
    },
    [createReview]
  )

  // Convert stats data for ReviewSummary
  const stats = statsData ? toReviewStats(statsData) : null

  return (
    <section
      id="reviews"
      className={cn('border-t border-border bg-background', className)}
    >
      <div className="container-wide py-12">
        {/* Section Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">
              Customer Reviews
            </h2>
          </div>

          {/* Write Review Button */}
          {!showForm && (
            <button
              type="button"
              onClick={handleWriteReview}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PenLine className="h-4 w-4" />
              Write a Review
            </button>
          )}
        </div>

        {/* Review Form (when visible) */}
        {showForm && (
          <div className="mb-8">
            <ReviewForm
              productId={productId}
              isAuthenticated={isAuthenticated}
              onSuccess={handleFormSuccess}
              onCancel={handleFormCancel}
              onSubmit={handleFormSubmit}
            />
          </div>
        )}

        {/* Stats Section */}
        <div className="mb-8">
          {statsLoading ? (
            <ReviewSummarySkeleton />
          ) : stats && stats.totalReviews > 0 ? (
            <ReviewSummary stats={stats} />
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center">
              <p className="text-muted-foreground">
                No reviews yet. Be the first to share your experience!
              </p>
            </div>
          )}
        </div>

        {/* Reviews List */}
        {reviewsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-red-700">
              Unable to load reviews. Please try again later.
            </p>
          </div>
        ) : (
          <ReviewList
            reviews={reviewsData?.reviews || []}
            totalCount={reviewsData?.total || 0}
            isLoading={reviewsLoading}
            showSummary={false}
            showFilters
            enablePagination
            pageSize={10}
            showActions
            onReport={(reviewId) => {
              // TODO: Implement report functionality
              console.log('Report review:', reviewId)
            }}
          />
        )}
      </div>
    </section>
  )
}

// ============================================================================
// Skeleton Component
// ============================================================================

export function ProductReviewsSkeleton({ className }: { className?: string }) {
  return (
    <section className={cn('border-t border-border bg-background', className)}>
      <div className="container-wide py-12">
        {/* Header skeleton */}
        <div className="mb-8 flex animate-pulse items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-muted" />
            <div className="h-7 w-40 rounded bg-muted" />
          </div>
          <div className="h-10 w-36 rounded-lg bg-muted" />
        </div>

        {/* Stats skeleton */}
        <div className="mb-8">
          <ReviewSummarySkeleton />
        </div>

        {/* List skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// Default Export
// ============================================================================

export default ProductReviews
