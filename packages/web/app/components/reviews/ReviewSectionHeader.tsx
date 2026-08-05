/**
 * The Loox header row — one row, both review surfaces.
 *
 * mesonart puts the same compact row above the masonry on /reviews and on the
 * product page: a star row, "<N> Reviews" with a chevron, and a "Write a
 * review" pill pushed to the far edge
 * (docs/design/mesonart/mesonart-reviews-page-loox.png and
 * mesonart-pdp-reviews-loox.png). The only thing that differs between the two
 * is what the disclosed average is an average *of*, which is `scopeLabel`.
 *
 * It lives in `components/` rather than in `routes/reviews.tsx`, where it was
 * written, because the PDP renders it too and one route importing another
 * route's module couples two code-split entry points for no reason.
 *
 * Three decisions worth keeping:
 *
 *  - The count segment is ABSENT rather than zeroed while the aggregate is
 *    unknown. A row that flashes "0 Reviews" before the real number arrives
 *    reads as a thing nobody has reviewed.
 *  - The chevron discloses one line, not a second score band. The big
 *    aggregate treatment belongs to the home strip.
 *  - The CTA is a link to the orders list, not a form. A review needs a
 *    purchase behind it — the API creates one against an order item — so a
 *    form opened from here could not be submitted.
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { StarRating } from './StarRating'
import { cn } from '~/lib/utils'

// ============================================================================
// Constants
// ============================================================================

/** The thin outline pill every control on these two surfaces wears. */
export const REVIEW_PILL =
  'inline-flex items-center gap-2 rounded-full border border-border px-6 py-2 ' +
  'text-sm text-foreground transition-colors hover:bg-muted'

// ============================================================================
// Types
// ============================================================================

export interface ReviewSectionHeaderProps {
  /** Null when there is nothing to average. NOT to be coalesced to 0. */
  averageRating: number | null
  /** Null while the aggregate is still unknown — not the same as zero. */
  reviewCount: number | null
  /**
   * What the disclosed average covers: 'across the catalogue' on /reviews,
   * 'for this poster' on a PDP. Only ever read behind the chevron.
   */
  scopeLabel?: string
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function ReviewSectionHeader({
  averageRating,
  reviewCount,
  scopeLabel = 'across the catalogue',
  className,
}: ReviewSectionHeaderProps) {
  const [showAverage, setShowAverage] = useState(false)

  const hasCount = reviewCount !== null && reviewCount > 0

  return (
    <div
      data-testid="reviews-header"
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {averageRating !== null && (
          <StarRating rating={averageRating} size="sm" showHalfStars />
        )}

        {hasCount && (
          <button
            type="button"
            data-testid="reviews-count-toggle"
            aria-expanded={showAverage}
            onClick={() => setShowAverage((open) => !open)}
            className="inline-flex items-center gap-1 text-sm text-foreground"
          >
            {/* en-IN grouping: this is an Indian store and the count is read
                by Indian customers. */}
            {reviewCount.toLocaleString('en-IN')} Reviews
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 transition-transform duration-300',
                showAverage && 'rotate-180'
              )}
            />
          </button>
        )}

        {/* The chevron discloses the figure the stars only approximate. It is
            deliberately not a second score band — one line, on request. */}
        {showAverage && averageRating !== null && (
          <span
            data-testid="reviews-average"
            className="text-sm text-muted-foreground"
          >
            {averageRating.toFixed(1)} out of 5 {scopeLabel}
          </span>
        )}
      </div>

      <Link to="/account/orders" data-testid="reviews-write" className={REVIEW_PILL}>
        Write a review
      </Link>
    </div>
  )
}

export default ReviewSectionHeader
