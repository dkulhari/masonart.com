/**
 * Reviews & Ratings — the site-wide review destination.
 *
 * mesonart surfaces this page from the header nav, the footer and the sitemap,
 * and it is the only place a visitor can read the catalogue's reviews without
 * first picking a poster. What it renders is Loox, almost nothing else: one
 * compact header row — star row, "<N> Reviews" with a chevron, a "Write a
 * review" pill — and then the masonry wall, ending in "Show more reviews"
 * (docs/design/mesonart/mesonart-reviews-page-loox.png).
 *
 * There is NO beige score band here. The one this file used to open with was
 * invented; the big aggregate treatment belongs to the home strip, which is a
 * different surface and stays as it is.
 *
 * Three things are load-bearing and easy to break:
 *
 * 1. `validateSearch` COERCES. `app/routes/router.tsx` overrides TanStack's
 *    search serialisation, so every param arrives as a string — `?page=2` is
 *    the string '2'. A bare `z.number()` throws inside validateSearch and the
 *    route error-boundaries to a blank page. `.catch(1)` covers the rest: a
 *    stale or hand-edited URL must land on page 1, not on an error. The grid
 *    appends rather than pages now, so `page` no longer drives anything — it
 *    stays because links shared while the numbered pager existed still have to
 *    resolve to a working page rather than to a blank one.
 *
 * 2. The grid is UNFILTERED. `productId` is the only difference between this
 *    deployment of ReviewGrid and the PDP's; passing one here would quietly
 *    turn the catalogue wall into one poster's.
 *
 * 3. Zero approved reviews is an empty state, not a header reading "0
 *    Reviews" over an empty wall.
 *
 * Client-fetched rather than loader-fetched: the aggregate and the wall
 * describe the catalogue, not this URL, and the same reasoning already governs
 * the promo tile on /posters.
 */

import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { z } from 'zod'
import { StarRating } from '~/components/reviews/StarRating'
import { ReviewGrid } from '~/components/reviews/ReviewGrid'
import { productsApi } from '~/lib/api'
import { cn } from '~/lib/utils'

/**
 * How many approved reviews the catalogue needs before an *averaged* score is
 * worth printing. Nothing on this page averages anything any more — the header
 * shows a raw count and a star row, which is honest at any sample size — but
 * the home strip's suppression rule is pinned to this constant, and its test
 * asserts the two surfaces share one number. It lives here because this is
 * where it was defined when both surfaces used it.
 */
export const MIN_REVIEWS_FOR_AGGREGATE = 10

/** Cards per fetch, and the size of each "Show more reviews" step. */
const PAGE_SIZE = 24

/**
 * `z.coerce` because the param is a string by the time it gets here, `.catch`
 * because an unparseable one must degrade to page 1 rather than throw. See the
 * file header.
 */
export const reviewsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
})

export type ReviewsSearch = z.infer<typeof reviewsSearchSchema>

export const Route = createFileRoute('/reviews')({
  validateSearch: (search: Record<string, unknown>): ReviewsSearch =>
    reviewsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Reviews & Ratings | chobii.art' },
      {
        name: 'description',
        content:
          'What customers say about chobii.art posters and frames — every approved review across the catalogue, newest first.',
      },
    ],
  }),
  component: ReviewsPage,
})

/** The thin outline pill both this page's controls wear. Matches the grid's. */
const PILL =
  'inline-flex items-center gap-2 rounded-full border border-border px-6 py-2 ' +
  'text-sm text-foreground transition-colors hover:bg-muted'

// ============================================================================
// Header row
// ============================================================================

export interface ReviewsHeaderProps {
  /** Null when there is nothing to average. NOT to be coalesced to 0. */
  averageRating: number | null
  /** Null while the aggregate is still in flight — not the same as zero. */
  reviewCount: number | null
}

/**
 * Stars, a count and a way in — one row, the whole chrome of the page.
 *
 * The count segment is absent rather than zeroed while the aggregate loads: a
 * row that flashes "0 Reviews" before the real number arrives reads as a
 * catalogue nobody has reviewed.
 */
export function ReviewsHeader({
  averageRating,
  reviewCount,
}: ReviewsHeaderProps) {
  const [showAverage, setShowAverage] = useState(false)

  const hasCount = reviewCount !== null && reviewCount > 0

  return (
    <div
      data-testid="reviews-header"
      className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4"
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
            {averageRating.toFixed(1)} out of 5 across the catalogue
          </span>
        )}
      </div>

      {/* A review needs a purchase behind it — the API creates one against an
          order item — so the CTA leads to the orders list, not to a form that
          could not be submitted from here. */}
      <Link to="/account/orders" data-testid="reviews-write" className={PILL}>
        Write a review
      </Link>
    </div>
  )
}

// ============================================================================
// Empty catalogue
// ============================================================================

/**
 * Nothing approved anywhere yet. Not "0 Reviews" over an empty wall — a count
 * of zero with a star row above it reads as a broken page rather than a young
 * one.
 */
export function ReviewsEmptyState() {
  return (
    <div data-testid="reviews-empty" className="py-20 text-center">
      <p className="font-heading text-2xl font-light text-foreground">
        No reviews yet
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Once customers start writing about their posters, their words and photos
        land here.
      </p>
      <Link to="/posters" className={cn(PILL, 'mt-8')}>
        Browse posters
      </Link>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export function ReviewsPage() {
  /**
   * The catalogue aggregate. Read through `productsApi` rather than the
   * relative-URL helpers in hooks/useReviews.ts: there is no Vite proxy for
   * `/api`, so a relative request from the dev server never reaches the API.
   */
  const { data: stats } = useQuery({
    queryKey: ['reviews', 'catalogue-stats'] as const,
    queryFn: () => productsApi.catalogueReviewStats(),
    staleTime: 5 * 60 * 1000,
  })

  // Undefined is "not known yet"; zero is a fact about the catalogue.
  const catalogueIsEmpty = stats !== undefined && stats.reviewCount === 0

  return (
    <div className="container-wide py-8 lg:py-12">
      {/* The reference page carries no visible title — the wall is the page.
          The heading stays for the crawler and the screen reader. */}
      <h1 className="sr-only">Reviews &amp; Ratings</h1>

      {catalogueIsEmpty ? (
        <ReviewsEmptyState />
      ) : (
        <>
          <ReviewsHeader
            averageRating={stats?.averageRating ?? null}
            reviewCount={stats?.reviewCount ?? null}
          />
          {/* No `productId`: this is the catalogue wall, not a poster's. */}
          <ReviewGrid pageSize={PAGE_SIZE} className="mt-6" />
        </>
      )}
    </div>
  )
}
