/**
 * CustomerReviewsSection — mesonart's home section 10, a score band over a
 * horizontally scrollable rail of reviews with a View All pill to /reviews.
 *
 * ## It is allowed to render nothing, and usually should
 *
 * The whole section — band, heading, rail, pill — returns null below
 * MIN_REVIEWS_FOR_HOME_STRIP approved reviews, and when `averageRating` is
 * null however many there are. Not a placeholder, not a zero.
 *
 * That is not defensiveness, it is the only honest option. Nine reviews
 * averaging 4.8 is nine people, not a 4.8-star catalogue, and rounding a thin
 * sample into a home-page marketing number is exactly the lie the rule exists
 * to prevent. `averageRating: null` is what the API returns when there is
 * nothing to average; coalescing it to 0 prints "0.0", which reads as "rated
 * badly" where absent reads as "not yet rated" — the truth. Seed data holds
 * twelve approved reviews today, so the live margin is two.
 *
 * The threshold is deliberately the same number the /reviews aggregate uses
 * (`MIN_REVIEWS_FOR_AGGREGATE`). It is restated here rather than imported so a
 * home-page chunk does not drag in a route module, and the test pins the two
 * together — two surfaces disagreeing about when a rating becomes printable is
 * two designs, not one system.
 *
 * ## The rail is CSS, not a dependency
 *
 * `overflow-x-auto snap-x snap-mandatory` with two arrow buttons, the same
 * shape as DiscoverChips on the collection pages. The arrows read the rail's
 * own scroll geometry and disable at each end, so they never promise travel
 * that is not there.
 *
 * ## Reads client-side
 *
 * The home route's loader is SSR'd for SEO; the aggregate and the feed
 * describe the catalogue rather than this URL, and a review landing is not
 * worth a slower first byte on the home page. Same reasoning as /reviews and
 * as the promo tile on /posters.
 *
 * `productsApi.catalogueReviewStats` rather than a relative fetch: there is no
 * Vite proxy for `/api`, so a relative request from the dev server never
 * reaches the API at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { StarRating } from '~/components/reviews/StarRating'
import { buttonVariants } from '~/components/ui/Button'
import { useReviewFeed } from '~/hooks/useReviews'
import { productsApi, type ReviewFeedItem } from '~/lib/api'
import { cn } from '~/lib/utils'

/**
 * How many approved reviews the catalogue needs before the strip says
 * anything. Must equal MIN_REVIEWS_FOR_AGGREGATE in app/routes/reviews.tsx —
 * see the module comment, and the test that enforces it.
 */
export const MIN_REVIEWS_FOR_HOME_STRIP = 10

/** How many reviews the rail asks for. One screenful of scrolling, no more. */
const RAIL_SIZE = 12

/** Fraction of the visible rail one arrow press travels. Matches DiscoverChips. */
const SCROLL_STEP = 0.8

/** Slop, in px, for "is this at the end" — subpixel scroll positions are normal. */
const EDGE_EPSILON = 1

// ============================================================================
// Card
// ============================================================================

export interface HomeReviewCardProps {
  review: ReviewFeedItem
}

/**
 * One review, sized for the rail.
 *
 * The body is clamped with CSS rather than sliced in JS: the full text stays
 * in the DOM for assistive tech and for copy-paste, and no review acquires a
 * fake "…" it did not end with.
 */
export function HomeReviewCard({ review }: HomeReviewCardProps) {
  return (
    <article
      data-testid="home-review-card"
      data-rating={review.rating}
      className="flex h-full flex-col rounded-sm border border-border bg-card p-6"
    >
      <StarRating rating={review.rating} size="sm" showHalfStars={false} />

      {review.title && (
        <h3 className="mt-4 text-base text-foreground">{review.title}</h3>
      )}

      <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-muted-foreground">
        {review.content}
      </p>

      <p className="mt-auto pt-6 text-xs text-muted-foreground">
        {/* `author` is nullable — the review outlives a deleted account. */}
        <span>{review.author?.name ?? 'Verified customer'}</span>
        <span aria-hidden="true"> · </span>
        {/* A review shown away from its detail page needs the poster it is
            about. Plain anchor, like every other link on the home page. */}
        <a
          href={`/posters/${review.product.slug}`}
          className="text-foreground underline-offset-4 hover:underline"
        >
          {review.product.title}
        </a>
      </p>
    </article>
  )
}

// ============================================================================
// Strip (presentational)
// ============================================================================

export interface CustomerReviewsStripProps {
  /** Null when there is nothing to average. NOT to be coalesced to 0. */
  averageRating: number | null
  reviewCount: number
  reviews: ReviewFeedItem[]
}

/**
 * The band, the score, the rail and the pill — or nothing at all.
 *
 * Split from the data-connected section below so the suppression rule is
 * testable without a query client.
 */
export function CustomerReviewsStrip({
  averageRating,
  reviewCount,
  reviews,
}: CustomerReviewsStripProps) {
  const railRef = useRef<HTMLUListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const syncArrows = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const furthest = rail.scrollWidth - rail.clientWidth
    setAtStart(rail.scrollLeft <= EDGE_EPSILON)
    setAtEnd(rail.scrollLeft >= furthest - EDGE_EPSILON)
  }, [])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    syncArrows()
    rail.addEventListener('scroll', syncArrows, { passive: true })
    window.addEventListener('resize', syncArrows)

    return () => {
      rail.removeEventListener('scroll', syncArrows)
      window.removeEventListener('resize', syncArrows)
    }
  }, [syncArrows, reviews.length])

  /**
   * THE SUPPRESSION RULE. Everything below this line is unreachable on a thin
   * sample, which is the point — see the module comment. It sits after the
   * hooks because hook order may not vary between renders.
   */
  if (
    averageRating === null ||
    reviewCount < MIN_REVIEWS_FOR_HOME_STRIP ||
    reviews.length === 0
  ) {
    return null
  }

  const scrollByStep = (direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({
      left: direction * rail.clientWidth * SCROLL_STEP,
      behavior: 'smooth',
    })
  }

  return (
    <SectionBand tone="sand" data-testid="home-reviews">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <DisplayHeading as="h2" className="text-3xl sm:text-4xl">
            What Customers Say
          </DisplayHeading>

          {/* Same score / stars / count shape as the /reviews aggregate. */}
          <div
            data-testid="home-reviews-score"
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <span className="font-heading text-4xl font-light leading-none text-foreground">
              {averageRating.toFixed(1)}
            </span>
            <StarRating rating={averageRating} size="md" showHalfStars />
            <span className="text-sm text-muted-foreground">
              {reviewCount.toLocaleString('en-IN')} reviews
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Scroll left"
            disabled={atStart}
            onClick={() => scrollByStep(-1)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon' }),
              'shrink-0 disabled:pointer-events-none disabled:opacity-40'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            disabled={atEnd}
            onClick={() => scrollByStep(1)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon' }),
              'shrink-0 disabled:pointer-events-none disabled:opacity-40'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ul
        ref={railRef}
        data-testid="home-reviews-rail"
        aria-label="Customer reviews"
        className="mt-10 flex snap-x snap-mandatory list-none gap-6 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((review) => (
          <li
            key={review.id}
            className="w-[85%] shrink-0 snap-start sm:w-[22rem]"
          >
            <HomeReviewCard review={review} />
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <a href="/reviews" className={buttonVariants({ variant: 'outline' })}>
          View All
        </a>
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Section (connected)
// ============================================================================

/**
 * What the home page mounts. Fetches, then defers every rendering decision —
 * including whether to render at all — to the strip above.
 */
export function CustomerReviewsSection() {
  const { data: stats } = useQuery({
    queryKey: ['reviews', 'catalogue-stats'] as const,
    queryFn: () => productsApi.catalogueReviewStats(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: feed } = useReviewFeed(1, RAIL_SIZE)

  return (
    <CustomerReviewsStrip
      averageRating={stats?.averageRating ?? null}
      reviewCount={stats?.reviewCount ?? 0}
      reviews={feed?.items ?? []}
    />
  )
}

export default CustomerReviewsSection
