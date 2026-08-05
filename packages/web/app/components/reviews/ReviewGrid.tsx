/**
 * ReviewGrid — the masonry wall of review cards.
 *
 * ONE grid holds every review. mesonart runs the same Loox grid twice: six
 * columns unfiltered on /reviews, five product-filtered on the PDP
 * (docs/design/mesonart/mesonart-reviews-page-loox.png and
 * mesonart-pdp-reviews-loox.png). `productId` is the only difference between
 * the two — there is no media-only wall above a written list, and a review
 * without a photo is the same card with its media slot omitted.
 *
 * Three decisions worth keeping:
 *
 *  - The masonry is CSS `columns`, not a JS measuring pass. No layout
 *    dependency, no ResizeObserver, no reflow storm — the cost is that
 *    reading order runs down each column rather than across, which is what
 *    Loox itself does and what a review wall can afford.
 *  - Every card reserves its media aspect ratio before decode (see
 *    ReviewGridCard). Without that, CSS columns re-balance as each photo
 *    lands and the page jumps under the reader.
 *  - The lightbox lives HERE, not in the card, and walks a flat list of every
 *    attachment in the grid. A lightbox per card would trap prev/next inside
 *    one review.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '~/lib/utils'
import { useReviewCards } from '~/hooks/useReviews'
import { ReviewGridCard, type ReviewCardData } from './ReviewGridCard'
import { ReviewMediaLightbox } from './ReviewMediaLightbox'
import type { ReviewMediaItem } from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface ReviewGridProps {
  /**
   * Filter to one product. The PDP passes it; /reviews does not. Everything
   * else about the grid is identical between the two.
   */
  productId?: string
  /** Reviews per fetch. Also the size of each "Show more reviews" step. */
  pageSize?: number
  className?: string
}

/** One attachment, paired with the review it belongs to. */
interface FlatMedia {
  media: ReviewMediaItem
  review: ReviewCardData
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 24

/**
 * Column counts, straight off the reference screenshots: six unfiltered, five
 * on a product page. Both narrow to two on a phone — a six-column masonry at
 * 390px is a column of thumbnails, not a wall of reviews.
 */
const COLUMNS_UNFILTERED = 'columns-2 sm:columns-3 lg:columns-4 xl:columns-6'
const COLUMNS_PRODUCT = 'columns-2 sm:columns-3 lg:columns-4 xl:columns-5'

// ============================================================================
// Helpers
// ============================================================================

/** Same reviews in the same order — used to keep a refetch from re-rendering. */
function sameReviews(a: ReviewCardData[], b: ReviewCardData[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((review, index) => review.id === b[index]?.id)
}

// ============================================================================
// Component
// ============================================================================

export function ReviewGrid({
  productId,
  pageSize = DEFAULT_PAGE_SIZE,
  className,
}: ReviewGridProps) {
  const [page, setPage] = useState(1)
  /**
   * Pages accumulate rather than replace: "Show more reviews" extends the
   * wall, it does not page through it. Keyed by id because a review written
   * between two fetches shifts every later row down by one and would
   * otherwise arrive twice.
   */
  const [collected, setCollected] = useState<ReviewCardData[]>([])

  const { data, isLoading, isError } = useReviewCards(productId, page, pageSize)

  // A different product is a different wall.
  useEffect(() => {
    setPage(1)
    setCollected([])
  }, [productId])

  useEffect(() => {
    const items = data?.items as ReviewCardData[] | undefined
    if (!items) return

    setCollected((previous) => {
      if (page === 1) {
        // Identity, not equality: a refetch that returns the same rows must
        // NOT hand back a fresh array, or the state update re-renders, the
        // effect runs again and the wall loops.
        return sameReviews(previous, items) ? previous : items
      }

      const seen = new Set(previous.map((review) => review.id))
      const fresh = items.filter((review) => !seen.has(review.id))
      return fresh.length === 0 ? previous : [...previous, ...fresh]
    })
  }, [data, page])

  const reviews = collected

  /**
   * Every attachment in the grid, in card order — what the lightbox arrows
   * walk. Built once per render of the wall rather than per card.
   */
  const flatMedia = useMemo<FlatMedia[]>(() => {
    const flat: FlatMedia[] = []
    for (const review of reviews) {
      for (const media of review.media ?? []) {
        flat.push({ media, review })
      }
    }
    return flat
  }, [reviews])

  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const openMedia = useCallback(
    (review: ReviewCardData, index: number) => {
      const target = (review.media ?? [])[index]
      if (!target) return
      const flatIndex = flatMedia.findIndex(
        (entry) => entry.media.id === target.id
      )
      if (flatIndex >= 0) setOpenIndex(flatIndex)
    },
    [flatMedia]
  )

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null || flatMedia.length === 0) return current
        return (current + delta + flatMedia.length) % flatMedia.length
      })
    },
    [flatMedia.length]
  )

  const close = useCallback(() => setOpenIndex(null), [])

  const open = openIndex !== null ? flatMedia[openIndex] : undefined

  if (isLoading && reviews.length === 0) {
    return (
      <p data-testid="review-grid-loading" className="py-16 text-muted-foreground">
        Loading reviews…
      </p>
    )
  }

  if (isError && reviews.length === 0) {
    return (
      <p data-testid="review-grid-error" className="py-16 text-muted-foreground">
        Reviews could not be loaded right now. Please try again shortly.
      </p>
    )
  }

  // An empty grid is not a grid. No columns, no "Show more", no reserved
  // space — a wall announcing it has nothing on it reads as a broken page.
  if (reviews.length === 0) {
    return (
      <p data-testid="review-grid-empty" className="py-16 text-muted-foreground">
        No reviews yet. Once customers start writing about their posters, their
        words land here.
      </p>
    )
  }

  return (
    <>
      <div
        data-testid="review-grid"
        // `gap` on a multi-column container is the column gap; the row gap
        // between stacked cards is the wrapper's own margin below.
        className={cn(
          'gap-4',
          productId ? COLUMNS_PRODUCT : COLUMNS_UNFILTERED,
          className
        )}
      >
        {reviews.map((review) => (
          <div
            key={review.id}
            data-testid="review-grid-item"
            // `break-inside-avoid` is what makes CSS columns a masonry rather
            // than a shredder: without it a card is split across two columns.
            className="mb-4 block break-inside-avoid"
          >
            <ReviewGridCard review={review} onOpenMedia={openMedia} />
          </div>
        ))}
      </div>

      {data?.hasNextPage ? (
        <div className="flex justify-center pt-8">
          <button
            type="button"
            data-testid="review-grid-more"
            onClick={() => setPage((current) => current + 1)}
            disabled={isLoading}
            className="rounded-full border border-border px-6 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {isLoading ? 'Loading…' : 'Show more reviews'}
          </button>
        </div>
      ) : null}

      {open ? (
        <ReviewMediaLightbox
          item={open.media}
          rating={open.review.rating}
          caption={open.review}
          fallbackDate={open.review.createdAt}
          position={(openIndex ?? 0) + 1}
          total={flatMedia.length}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={close}
        />
      ) : null}
    </>
  )
}

export default ReviewGrid
