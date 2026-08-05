/**
 * The review media viewer — one lightbox, every review surface.
 *
 * Lifted out of `ReviewMediaWall` unchanged rather than written twice: the
 * masonry grid opens the same overlay from a card's media slot that the PDP
 * wall opens from a tile, and a second implementation would be a second focus
 * trap, a second Escape handler and a second place for the `preload` rule to
 * rot.
 *
 * Two rules it carries:
 *
 *  - A portal, not a `<dialog>`. `showModal` puts the page in the top layer
 *    and blocks the automation harness the e2e suite drives, so every modal
 *    here is one we own — focus trap, Escape and arrows included.
 *  - `preload="none"` even here: opening the viewer is not the same as
 *    pressing play, and arrowing through a wall would otherwise fetch every
 *    clip it passed.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Star, X } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

/**
 * Just enough of a photo or clip to display it. Structural on purpose — both
 * `ReviewMediaItem` and the flatter `ReviewMediaFeedItem` satisfy it.
 */
export interface LightboxMedia {
  id: string
  mediaType: 'image' | 'video'
  url: string
  posterUrl?: string | null
  thumbnailUrl?: string | null
}

/** Just enough of a review to caption the media it came from. */
export interface LightboxCaption {
  id?: string
  title?: string | null
  content?: string
  author?: { name?: string | null } | null
  createdAt?: string | Date | null
}

export interface ReviewMediaLightboxProps {
  item: LightboxMedia
  /**
   * Stars for the review the media belongs to. Passed in rather than read off
   * `item`: the media feed carries a rating per tile, an embedded media array
   * does not.
   */
  rating: number
  caption: LightboxCaption | null
  /** Used when the caption has not loaded, or carries no date of its own. */
  fallbackDate?: string | Date | null
  position: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

// ============================================================================
// Constants
// ============================================================================

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

export function ReviewMediaLightbox({
  item,
  rating,
  caption,
  fallbackDate,
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

  const dateSource = caption?.createdAt ?? fallbackDate ?? null

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
          <div
            className="flex items-center gap-1"
            aria-label={`${rating} out of 5 stars`}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                aria-hidden="true"
                className={cn(
                  'h-4 w-4',
                  i < rating
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
            {dateSource ? formatDate(dateSource) : ''}
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

export default ReviewMediaLightbox
