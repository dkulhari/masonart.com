/**
 * ReviewSummary Component
 *
 * Displays aggregated review statistics including average rating,
 * total review count, and rating distribution bar chart.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { cn } from '~/lib/utils'
import { StarRating } from './StarRating'

// ============================================================================
// Types
// ============================================================================

export interface RatingDistribution {
  rating: number
  count: number
  percentage: number
}

export interface ReviewStats {
  averageRating: number
  totalReviews: number
  distribution: RatingDistribution[]
}

export interface ReviewSummaryProps {
  /** Review statistics data */
  stats: ReviewStats
  /** Show distribution chart */
  showDistribution?: boolean
  /** Custom className */
  className?: string
  /** Compact layout for smaller spaces */
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewSummary - Displays aggregated review statistics
 *
 * @example
 * <ReviewSummary
 *   stats={{
 *     averageRating: 4.2,
 *     totalReviews: 128,
 *     distribution: [
 *       { rating: 5, count: 80, percentage: 62.5 },
 *       { rating: 4, count: 30, percentage: 23.4 },
 *       { rating: 3, count: 10, percentage: 7.8 },
 *       { rating: 2, count: 5, percentage: 3.9 },
 *       { rating: 1, count: 3, percentage: 2.4 },
 *     ],
 *   }}
 * />
 */
export function ReviewSummary({
  stats,
  showDistribution = true,
  className,
  compact = false,
}: ReviewSummaryProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {compact ? (
        // Compact layout: inline rating and count
        <div className="flex items-center gap-2">
          <StarRating
            rating={stats.averageRating}
            size="sm"
            showValue
          />
          <span className="text-sm text-muted-foreground">
            ({stats.totalReviews.toLocaleString()} review{stats.totalReviews !== 1 ? 's' : ''})
          </span>
        </div>
      ) : (
        // Full layout: large rating with distribution
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
          {/* Average Rating */}
          <div className="flex flex-col items-center sm:items-start">
            <div className="text-5xl font-bold text-foreground">
              {stats.averageRating.toFixed(1)}
            </div>
            <StarRating
              rating={stats.averageRating}
              size="md"
              className="mt-2"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Based on {stats.totalReviews.toLocaleString()} review{stats.totalReviews !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Rating Distribution */}
          {showDistribution && stats.distribution.length > 0 && (
            <div className="flex-1">
              <div className="space-y-2">
                {stats.distribution
                  .sort((a, b) => b.rating - a.rating)
                  .map((item) => (
                    <RatingBar key={item.rating} {...item} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Rating Bar Component
// ============================================================================

interface RatingBarProps {
  rating: number
  count: number
  percentage: number
}

function RatingBar({ rating, count, percentage }: RatingBarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Star count label */}
      <span className="w-16 text-sm text-muted-foreground">
        {rating} star{rating !== 1 ? 's' : ''}
      </span>

      {/* Progress bar */}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all duration-300"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Count */}
      <span className="w-12 text-right text-sm text-muted-foreground">
        {count.toLocaleString()}
      </span>
    </div>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

/**
 * ReviewSummarySkeleton - Loading skeleton for review summary
 */
export function ReviewSummarySkeleton({
  showDistribution = true,
  compact = false,
  className,
}: {
  showDistribution?: boolean
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <div className={cn('flex animate-pulse items-center gap-2', className)}>
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-4 w-4 rounded bg-muted" />
          ))}
        </div>
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
    )
  }

  return (
    <div className={cn('flex animate-pulse flex-col gap-4 sm:flex-row sm:gap-8', className)}>
      {/* Average Rating Skeleton */}
      <div className="flex flex-col items-center sm:items-start">
        <div className="h-12 w-16 rounded bg-muted" />
        <div className="mt-2 flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-5 w-5 rounded bg-muted" />
          ))}
        </div>
        <div className="mt-2 h-4 w-32 rounded bg-muted" />
      </div>

      {/* Distribution Skeleton */}
      {showDistribution && (
        <div className="flex-1 space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-2 flex-1 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate rating distribution from a list of reviews
 */
export function calculateDistribution(
  reviews: { rating: number }[]
): RatingDistribution[] {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

  reviews.forEach((review) => {
    if (review.rating >= 1 && review.rating <= 5) {
      counts[Math.round(review.rating)]++
    }
  })

  const total = reviews.length || 1

  return [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: counts[rating],
    percentage: (counts[rating] / total) * 100,
  }))
}

/**
 * Calculate average rating from a list of reviews
 */
export function calculateAverageRating(reviews: { rating: number }[]): number {
  if (reviews.length === 0) return 0
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
  return sum / reviews.length
}

export default ReviewSummary
