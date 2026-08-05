/**
 * ReviewMediaWall - customer photos and videos for one product
 *
 * Sits above the written reviews on the PDP, the way mesonart's Loox wall
 * does: the pictures first, the prose after. Tiles open into a lightbox that
 * plays the clip inline and shows the review the media came from.
 *
 * Two rules this component exists to hold:
 *
 *  - A tile costs one image. `preload="none"` and a poster frame, never
 *    `autoPlay` — a dozen clips that preload themselves is tens of megabytes
 *    on a phone before anyone has asked for a single one.
 *  - Nothing renders when there is no media. No heading, no empty grid, no
 *    reserved space. An orphan "Customer photos" over blank pixels reads as a
 *    broken page.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  useReviewMediaFeed,
  useReviews,
  type ReviewFilters,
} from '~/hooks/useReviews'
import { ReviewMediaLightbox } from '~/components/reviews/ReviewMediaLightbox'
import type { ReviewMediaFeedItem } from '~/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface ReviewMediaWallProps {
  /** Product whose customer media to show. */
  productId: string
  className?: string
}

/** Just enough of a review to caption a tile. */
interface ReviewCaption {
  id: string
  rating: number
  title?: string | null
  content: string
  author?: { name?: string | null } | null
  createdAt: string | Date
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Deliberately identical to the filters `ProductReviews` mounts with, so the
 * two components share one cache entry rather than firing two requests for the
 * same rows. Paired with `enabled` below, the lightbox's captions cost nothing
 * on a page that already lists the reviews.
 */
const CAPTION_FILTERS: ReviewFilters = {
  sortBy: 'newest',
  page: 1,
  limit: 10,
}

// ============================================================================
// Helpers
// ============================================================================

/** `12` -> `0:12`. Null when the transcode never reported a duration. */
function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * What a tile shows before anything is fetched: the poster for a clip, the
 * thumbnail for a photo. Falls back to the full asset so a row that predates
 * the thumbnail worker still renders something.
 */
function tileSource(item: ReviewMediaFeedItem): string | undefined {
  if (item.mediaType === 'video') {
    return item.posterUrl ?? item.thumbnailUrl ?? undefined
  }
  return item.thumbnailUrl ?? item.url
}

// ============================================================================
// Component
// ============================================================================

export function ReviewMediaWall({ productId, className }: ReviewMediaWallProps) {
  const { data } = useReviewMediaFeed(productId)
  const items = useMemo(() => data ?? [], [data])

  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])
  /** The tile that opened the lightbox — focus goes back to it on close. */
  const triggerIndex = useRef<number | null>(null)

  // Only worth fetching once someone opens a tile. On the PDP the rows are
  // already in cache by then (see CAPTION_FILTERS), so this is usually free.
  const { data: reviewsData } = useReviews(productId, CAPTION_FILTERS, {
    enabled: openIndex !== null,
  })

  const captions = useMemo(() => {
    const byId = new Map<string, ReviewCaption>()
    for (const review of (reviewsData?.reviews ?? []) as ReviewCaption[]) {
      byId.set(review.id, review)
    }
    return byId
  }, [reviewsData])

  const open = useCallback((index: number) => {
    triggerIndex.current = index
    setOpenIndex(index)
  }, [])

  const close = useCallback(() => {
    setOpenIndex(null)
    const trigger = triggerIndex.current
    triggerIndex.current = null
    if (trigger !== null) tileRefs.current[trigger]?.focus()
  }, [])

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((current) => {
        if (current === null || items.length === 0) return current
        return (current + delta + items.length) % items.length
      })
    },
    [items.length]
  )

  // An empty wall is no wall. Same for the loading pass: a skeleton that
  // resolves to nothing on most products is a layout shift for no information.
  if (items.length === 0) return null

  return (
    <section
      data-testid="review-media-wall"
      className={cn('border-t border-border bg-background', className)}
    >
      <div className="container-wide py-10">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl text-foreground">Customer photos &amp; videos</h2>
          <span className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'post' : 'posts'}
          </span>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item, index) => (
            <li key={item.id}>
              <MediaTile
                item={item}
                onOpen={() => open(index)}
                ref={(element) => {
                  tileRefs.current[index] = element
                }}
              />
            </li>
          ))}
        </ul>
      </div>

      {openIndex !== null && items[openIndex] ? (
        <ReviewMediaLightbox
          item={items[openIndex]}
          rating={items[openIndex].rating}
          caption={captions.get(items[openIndex].reviewId) ?? null}
          fallbackDate={items[openIndex].reviewCreatedAt}
          position={openIndex + 1}
          total={items.length}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={close}
        />
      ) : null}
    </section>
  )
}

// ============================================================================
// Tile
// ============================================================================

interface MediaTileProps {
  item: ReviewMediaFeedItem
  onOpen: () => void
  ref?: (element: HTMLButtonElement | null) => void
}

function MediaTile({ item, onOpen, ref }: MediaTileProps) {
  const duration = formatDuration(item.durationSeconds)
  const source = tileSource(item)
  const isVideo = item.mediaType === 'video'

  return (
    <button
      ref={ref}
      type="button"
      data-testid="review-media-tile"
      onClick={onOpen}
      aria-label={`Open ${isVideo ? 'video' : 'photo'} from a ${item.rating}-star review`}
      className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {isVideo ? (
        <video
          data-testid="review-media-video"
          src={item.url}
          poster={source}
          // Non-negotiable: no autoPlay, no metadata fetch. The poster is the
          // whole tile until a click asks for the bytes.
          preload="none"
          muted
          playsInline
          controls={false}
          tabIndex={-1}
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      ) : (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}

      {isVideo ? (
        <>
          <span
            data-testid="review-media-play-badge"
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">
              <Play className="h-4 w-4 translate-x-[1px] fill-current" />
            </span>
          </span>
          {duration ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {duration}
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  )
}

export default ReviewMediaWall
