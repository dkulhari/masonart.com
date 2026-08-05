/**
 * Reviews & Ratings — the site-wide review destination.
 *
 * mesonart surfaces this page from the header nav, the footer and the sitemap,
 * and it is the only place a visitor can read the catalogue's reviews without
 * first picking a poster. Every row therefore carries its product: a review
 * shown away from its detail page is unreadable without one.
 *
 * Two things here are load-bearing and easy to break:
 *
 * 1. `validateSearch` COERCES. `app/routes/router.tsx` overrides TanStack's
 *    search serialisation, so every param arrives as a string — `?page=2` is
 *    the string '2'. A bare `z.number()` throws inside validateSearch and the
 *    route error-boundaries to a blank page. `.catch(1)` covers the rest: a
 *    stale or hand-edited URL must land on page 1, not on an error.
 *
 * 2. The aggregate strip stays silent below MIN_REVIEWS_FOR_AGGREGATE, and
 *    honours `averageRating: null` rather than coalescing it to 0. Nine people
 *    are not a rating, and "0.0" reads as "rated badly" where absent reads as
 *    "not yet rated" — which is the truth.
 *
 * Client-fetched rather than loader-fetched: the aggregate and the feed
 * describe the catalogue, not this URL, and the same reasoning already governs
 * the promo tile on /posters.
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { StarRating } from '~/components/reviews/StarRating'
import { useReviewFeed } from '~/hooks/useReviews'
import { productsApi, type ReviewFeedItem } from '~/lib/api'
import { cn, formatDate } from '~/lib/utils'

/**
 * How many approved reviews the catalogue needs before the aggregate is worth
 * printing. Below this the average is a sample of strangers, not a rating.
 */
export const MIN_REVIEWS_FOR_AGGREGATE = 10

const PAGE_SIZE = 20

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

// ============================================================================
// Aggregate strip
// ============================================================================

export interface ReviewsAggregateProps {
  /** Null when there is nothing to average. NOT to be coalesced to 0. */
  averageRating: number | null
  reviewCount: number
}

/**
 * Score, stars and count — or nothing at all.
 *
 * Returns null on a thin sample rather than rendering a placeholder: an empty
 * band is quieter than a band announcing it has nothing to say.
 */
export function ReviewsAggregate({
  averageRating,
  reviewCount,
}: ReviewsAggregateProps) {
  if (averageRating === null || reviewCount < MIN_REVIEWS_FOR_AGGREGATE) {
    return null
  }

  return (
    <div
      data-testid="reviews-aggregate"
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
  )
}

// ============================================================================
// Feed
// ============================================================================

export interface ReviewFeedRowProps {
  review: ReviewFeedItem
  className?: string
}

/** One review, with the product it is about. */
export function ReviewFeedRow({ review, className }: ReviewFeedRowProps) {
  const { product, media } = review

  return (
    <article
      data-testid="review-feed-row"
      data-rating={review.rating}
      className={cn(
        'flex flex-col gap-4 border-b border-border py-8 sm:flex-row sm:gap-8',
        className
      )}
    >
      <div className="sm:w-56 sm:shrink-0">
        <Link
          to="/posters/$slug"
          params={{ slug: product.slug }}
          className="group flex items-center gap-3"
        >
          {product.imageUrl && (
            <img
              src={product.imageUrl}
              alt=""
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-sm object-cover"
            />
          )}
          <span className="text-sm text-foreground underline-offset-4 group-hover:underline">
            {product.title}
          </span>
        </Link>
      </div>

      <div className="min-w-0 flex-1">
        <StarRating rating={review.rating} size="sm" showHalfStars={false} />

        {review.title && (
          <h3 className="mt-3 text-base text-foreground">{review.title}</h3>
        )}

        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {review.content}
        </p>

        {media.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {media.map((item) => (
              <li key={item.id}>
                <img
                  src={item.thumbnailUrl ?? item.posterUrl ?? item.url}
                  alt=""
                  loading="lazy"
                  className="h-20 w-20 rounded-sm object-cover"
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          {/* `author` is nullable — the review outlives a deleted account. */}
          <span>{review.author?.name ?? 'Verified customer'}</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
        </p>
      </div>
    </article>
  )
}

export interface ReviewFeedListProps {
  reviews: ReviewFeedItem[]
}

/** The list, or the empty state. Kept separate so both are testable alone. */
export function ReviewFeedList({ reviews }: ReviewFeedListProps) {
  if (reviews.length === 0) {
    return (
      <p data-testid="reviews-empty" className="py-16 text-muted-foreground">
        No reviews yet. Once customers start writing about their posters, their
        words land here.
      </p>
    )
  }

  return (
    <div data-testid="review-feed">
      {reviews.map((review) => (
        <ReviewFeedRow key={review.id} review={review} />
      ))}
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

function ReviewsPage() {
  const { page } = Route.useSearch()

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

  const { data: feed, isLoading, isError } = useReviewFeed(page, PAGE_SIZE)

  const reviews = feed?.items ?? []

  return (
    <>
      <SectionBand tone="beige" className="py-10 sm:py-14">
        <DisplayHeading className="text-foreground">
          Reviews &amp; Ratings
        </DisplayHeading>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every approved review across the catalogue, newest first — each one
          linked back to the poster it is about.
        </p>
        <ReviewsAggregate
          averageRating={stats?.averageRating ?? null}
          reviewCount={stats?.reviewCount ?? 0}
        />
      </SectionBand>

      <div className="container-wide py-8 lg:py-12">
        {isLoading ? (
          <p className="py-16 text-muted-foreground">Loading reviews…</p>
        ) : isError ? (
          <p className="py-16 text-muted-foreground">
            Reviews could not be loaded right now. Please try again shortly.
          </p>
        ) : (
          <>
            <ReviewFeedList reviews={reviews} />

            {feed && (feed.hasPreviousPage || feed.hasNextPage) && (
              <nav
                aria-label="Reviews pages"
                data-testid="reviews-pagination"
                className="flex items-center justify-between gap-4 pt-10"
              >
                {/* Real links, not buttons: the page is shareable and a
                    crawler needs somewhere to go past page 1. */}
                {feed.hasPreviousPage ? (
                  <Link
                    to="/reviews"
                    search={{ page: page - 1 }}
                    className="text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}

                <span className="text-sm text-muted-foreground">
                  Page {feed.page} of {feed.totalPages}
                </span>

                {feed.hasNextPage ? (
                  <Link
                    to="/reviews"
                    search={{ page: page + 1 }}
                    className="text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  )
}
