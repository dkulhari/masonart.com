/**
 * PromoTile — the occasional promo cell mesonart drops into its grid
 * (analysis §1.3.6). We had no such component anywhere.
 *
 * Theirs reads "Rated 4.9/5 by 9,000+ Users". Ours reads the catalogue's
 * approved-review aggregate, or it renders nothing.
 *
 * ## The threshold is the point
 *
 * Below MIN_PROMO_REVIEWS this component returns null. A five-star average
 * over three reviews is arithmetically true and rhetorically a lie — it
 * invites a shopper to read a sample as a reputation. Showing nothing is the
 * honest state of a catalogue nobody has reviewed yet, and it is the state
 * this component was in until orders and reviews were seeded (#414).
 *
 * The average is printed as measured. Rounding 4.5 up to 5 is the small lie
 * that makes every other number on the page unreliable.
 *
 * ## One cell
 *
 * It occupies exactly one grid cell, which is why ProductGrid still omits
 * `grid-flow-row-dense` — see that file's header. It renders an `<li>`
 * because the grid is a `<ul>`.
 */

import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { buttonVariants } from '~/components/ui/Button'
import { cn } from '~/lib/utils'

/**
 * Fewer approved reviews than this and the tile stays away.
 *
 * Ten is not a magic number, but it is past the point where one enthusiastic
 * buyer sets the average.
 */
export const MIN_PROMO_REVIEWS = 10

export interface PromoTileProps {
  /** Null when nothing is approved — never 0, which reads as "rated badly". */
  averageRating: number | null
  reviewCount: number
  className?: string
}

export function PromoTile({
  averageRating,
  reviewCount,
  className,
}: PromoTileProps) {
  if (averageRating === null || reviewCount < MIN_PROMO_REVIEWS) return null

  return (
    <li
      data-testid="promo-tile"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[--card-radius] bg-band p-6 text-center',
        className
      )}
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <Star
            key={index}
            className={cn(
              'h-4 w-4',
              index < Math.round(averageRating)
                ? 'fill-rating text-rating'
                : 'text-muted-foreground/40'
            )}
          />
        ))}
      </span>

      <p className="text-lg leading-snug">
        Rated {averageRating}/5 by {reviewCount.toLocaleString('en-IN')}{' '}
        {reviewCount === 1 ? 'reviewer' : 'reviewers'}
      </p>

      <p className="text-sm text-muted-foreground">
        Every review here comes from a verified purchase.
      </p>

      <Link
        to="/posters"
        search={{ sortBy: 'salesCount', sortOrder: 'desc' } as never}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        See what sells
      </Link>
    </li>
  )
}

export default PromoTile
