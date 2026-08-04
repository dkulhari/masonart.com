/**
 * ProductRating — star row plus review count, for the product card.
 *
 * mesonart puts this below the image, left, with the wishlist heart opposite
 * (analysis §1.3.6).
 *
 * THE IMPORTANT BEHAVIOUR IS THE ABSENCE. A product with no approved reviews
 * renders NOTHING — not five empty stars, not "0.0". Both of those read as
 * "rated badly" rather than "not yet rated", and inventing a score is the
 * fabricated-social-proof pattern the parity analysis explicitly rules out.
 * The API cooperates by returning a null average rather than a coalesced zero.
 */

import { Star } from 'lucide-react'
import { cn } from '~/lib/utils'

const STARS = [1, 2, 3, 4, 5]

export interface ProductRatingProps {
  /** Null when the product has no approved reviews. */
  averageRating: number | null
  reviewCount: number
  className?: string
}

export function ProductRating({
  averageRating,
  reviewCount,
  className,
}: ProductRatingProps) {
  if (!reviewCount || averageRating === null) return null

  const rounded = Math.round(averageRating)

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      // The stars are decorative shapes; this is the actual information.
      aria-label={`Rated ${averageRating} out of 5 from ${reviewCount} review${
        reviewCount === 1 ? '' : 's'
      }`}
    >
      <span className="flex" aria-hidden="true">
        {STARS.map((star) => (
          <Star
            key={star}
            className={cn(
              'h-3.5 w-3.5 text-rating',
              // Five are always rendered so the row keeps its width as the
              // rating changes between cards.
              star <= rounded && 'fill-rating'
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground" aria-hidden="true">
        ({reviewCount})
      </span>
    </div>
  )
}

export default ProductRating
