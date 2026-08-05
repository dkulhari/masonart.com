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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Play, Star, X } from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  useReviewMediaFeed,
  useReviews,
  type ReviewFilters,
} from '~/hooks/useReviews'
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

/** Tab stops inside the trap. Anything parked at `-1` is skipped on purpose. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input',
  'select',
  'textarea',
  '[tabindex]',
]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(', ')

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

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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
          caption={captions.get(items[openIndex].reviewId) ?? null}
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

// ============================================================================
// Lightbox
// ============================================================================

interface ReviewMediaLightboxProps {
  item: ReviewMediaFeedItem
  caption: ReviewCaption | null
  position: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

/**
 * A portal, not a `<dialog>`: `showModal` puts the page in the top layer and
 * blocks the automation harness the e2e suite drives, so every modal here is
 * one we own — focus trap, Escape and arrows included.
 */
function ReviewMediaLightbox({
  item,
  caption,
  position,
  total,
  onPrev,
  onNext,
  onClose,
}: ReviewMediaLightboxProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus lands inside on open; without it Escape and Tab go to the page
  // behind the overlay.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Document-level so the keys work wherever focus sits inside the overlay,
  // including on the video's own controls.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onNext()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrev()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNext, onPrev])

  const trapTab = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const container = containerRef.current
    if (!container) return

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE)
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    const active = document.activeElement

    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  const body = (
    <div
      ref={containerRef}
      data-testid="review-media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Customer photo and video viewer"
      onKeyDown={trapTab}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      {/* Click-outside-to-close. A div rather than a button so it never
          becomes a tab stop — the labelled close button is the keyboard path. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 h-full w-full"
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-background shadow-xl md:flex-row">
        <div className="flex flex-1 items-center justify-center bg-black">
          {item.mediaType === 'video' ? (
            <video
              key={item.id}
              data-testid="review-media-video"
              src={item.url}
              poster={item.posterUrl ?? item.thumbnailUrl ?? undefined}
              // Still `none`: opening the lightbox is not the same as pressing
              // play, and arrowing through a wall would otherwise fetch every
              // clip it passed.
              preload="none"
              controls
              playsInline
              className="max-h-[60vh] w-full object-contain md:max-h-[80vh]"
            />
          ) : (
            <img
              data-testid="review-media-full"
              src={item.url}
              alt=""
              className="max-h-[60vh] w-full object-contain md:max-h-[80vh]"
            />
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto p-5 md:w-80">
          <div className="flex items-center gap-1" aria-label={`${item.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                aria-hidden="true"
                className={cn(
                  'h-4 w-4',
                  i < item.rating
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground/40'
                )}
              />
            ))}
          </div>

          {caption?.title ? (
            <h3 className="mt-3 text-base font-medium text-foreground">
              {caption.title}
            </h3>
          ) : null}

          {caption?.content ? (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {caption.content}
            </p>
          ) : null}

          <p className="mt-4 text-xs text-muted-foreground">
            {caption?.author?.name ? `${caption.author.name} · ` : ''}
            {formatDate(caption?.createdAt ?? item.reviewCreatedAt)}
          </p>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous"
                onClick={onPrev}
                className="rounded-full border border-border p-2 text-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={onNext}
                className="rounded-full border border-border p-2 text-foreground hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {position} / {total}
            </span>
          </div>
        </aside>

        <button
          ref={closeRef}
          type="button"
          aria-label="Close viewer"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )

  // Guard for the SSR pass — there is no document to portal into.
  if (typeof document === 'undefined') return null

  return createPortal(body, document.body)
}

export default ReviewMediaWall
