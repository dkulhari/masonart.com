/**
 * ReviewCard Component
 *
 * Displays an individual product review with author info, rating,
 * title, content, and verification badge. Supports content truncation
 * with "Read more" expansion.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { CheckCircle2, MoreVertical, Flag, Trash2 } from 'lucide-react'
import { cn, formatRelativeTime, formatDate, getInitials } from '~/lib/utils'
import { StarRating } from './StarRating'

// ============================================================================
// Types
// ============================================================================

export interface ReviewAuthor {
  id: string
  name: string
  image?: string | null
}

export interface ReviewData {
  id: string
  rating: number
  title?: string | null
  content: string
  author: ReviewAuthor
  createdAt: string | Date
  isVerifiedPurchase?: boolean
  helpfulCount?: number
  status?: 'pending' | 'approved' | 'rejected'
}

export interface ReviewCardProps {
  /** Review data to display */
  review: ReviewData
  /** Maximum content length before truncation */
  maxContentLength?: number
  /** Show action menu (for admin or owner) */
  showActions?: boolean
  /** Callback when report is clicked */
  onReport?: (reviewId: string) => void
  /** Callback when delete is clicked (admin only) */
  onDelete?: (reviewId: string) => void
  /** Custom className */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * ReviewCard - Displays an individual review
 *
 * @example
 * <ReviewCard
 *   review={{
 *     id: '123',
 *     rating: 4,
 *     title: 'Great quality!',
 *     content: 'Amazing poster, exactly as described...',
 *     author: { id: '1', name: 'John Doe' },
 *     createdAt: new Date(),
 *     isVerifiedPurchase: true,
 *   }}
 * />
 */
export function ReviewCard({
  review,
  maxContentLength = 300,
  showActions = false,
  onReport,
  onDelete,
  className,
}: ReviewCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const toggleMenu = useCallback(() => {
    setShowMenu((prev) => !prev)
  }, [])

  // Check if content needs truncation
  const needsTruncation = review.content.length > maxContentLength
  const displayContent =
    needsTruncation && !isExpanded
      ? review.content.slice(0, maxContentLength) + '...'
      : review.content

  // Format date
  const createdAt =
    typeof review.createdAt === 'string'
      ? new Date(review.createdAt)
      : review.createdAt
  const relativeTime = formatRelativeTime(createdAt)
  const fullDate = formatDate(createdAt)

  return (
    <article
      className={cn(
        'rounded-lg border border-border bg-card p-4 sm:p-5',
        className
      )}
      aria-label={`Review by ${review.author.name}`}
    >
      {/* Header: Author info and rating */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {review.author.image ? (
            <img
              src={review.author.image}
              alt={review.author.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
              {getInitials(review.author.name)}
            </div>
          )}

          {/* Author name and date */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {review.author.name}
              </span>
              {review.isVerifiedPurchase && (
                <span
                  className="flex items-center gap-1 text-xs font-medium text-emerald-600"
                  title="Verified Purchase"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Verified Purchase</span>
                </span>
              )}
            </div>
            <time
              dateTime={createdAt.toISOString()}
              title={fullDate}
              className="text-xs text-muted-foreground"
            >
              {relativeTime}
            </time>
          </div>
        </div>

        {/* Actions menu */}
        {showActions && (
          <div className="relative">
            <button
              type="button"
              onClick={toggleMenu}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Review actions"
              aria-expanded={showMenu}
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {showMenu && (
              <>
                {/* Backdrop to close menu */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                {/* Menu dropdown */}
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-md border border-border bg-popover py-1 shadow-lg">
                  {onReport && (
                    <button
                      type="button"
                      onClick={() => {
                        onReport(review.id)
                        setShowMenu(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                    >
                      <Flag className="h-4 w-4" />
                      Report
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(review.id)
                        setShowMenu(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Rating */}
      <div className="mt-3">
        <StarRating rating={review.rating} size="sm" />
      </div>

      {/* Title */}
      {review.title && (
        <h4 className="mt-2 font-medium text-foreground">{review.title}</h4>
      )}

      {/* Content */}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {displayContent}
      </p>

      {/* Read more/less button */}
      {needsTruncation && (
        <button
          type="button"
          onClick={toggleExpand}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {/* Status badge for admin view */}
      {review.status && review.status !== 'approved' && (
        <div className="mt-3">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              review.status === 'pending' &&
                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
              review.status === 'rejected' &&
                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            )}
          >
            {review.status === 'pending' ? 'Pending Review' : 'Rejected'}
          </span>
        </div>
      )}
    </article>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

/**
 * ReviewCardSkeleton - Loading skeleton for review card
 */
export function ReviewCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg border border-border bg-card p-4 sm:p-5',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      </div>

      {/* Rating */}
      <div className="mt-3 flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-4 w-4 rounded bg-muted" />
        ))}
      </div>

      {/* Title */}
      <div className="mt-3 h-5 w-3/4 rounded bg-muted" />

      {/* Content */}
      <div className="mt-3 space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
      </div>
    </div>
  )
}

export default ReviewCard
