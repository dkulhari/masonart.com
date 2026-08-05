/**
 * ReviewToast — the site-wide floating social-proof toast.
 *
 * A small card in the bottom-left that appears a few seconds after arrival and
 * cycles recent reviews. Mounted once in `routes/__root.tsx` so it survives
 * navigation and fetches one page for the whole visit rather than one per
 * route.
 *
 * Three things here are load-bearing rather than decorative:
 *
 * 1. **Suppression comes first.** `/checkout` and every `/admin` route bail out
 *    of `ReviewToast` BEFORE `ReviewToastCard` is rendered, which is what keeps
 *    the data hook — and therefore the request — from running at all. A
 *    social-proof popup drifting over a payment form costs conversions and
 *    reads as a dark pattern; over the admin console it is just noise. That is
 *    also why the split into two components exists: an early `return null`
 *    inside a single component could not legally skip a hook.
 *
 * 2. **It stacks UNDER the cart drawer.** `components/cart/CartDrawer.tsx` uses
 *    `z-40` for its backdrop and `z-50` for the panel, so this sits at `z-30`
 *    and lets the scrim cover it. On small screens it also rides high enough to
 *    clear a sticky add-to-cart bar on the PDP.
 *
 * 3. **Dismissal is `sessionStorage`, not `localStorage`.** "Not right now"
 *    should last the visit, not forever — a returning visitor next week gets
 *    the toast again.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { StarRating } from '~/components/reviews/StarRating'
import { useReviewFeed } from '~/hooks/useReviews'
import { cn } from '~/lib/utils'
import type { ReviewFeedItem } from '~/lib/api'

// ============================================================================
// Constants
// ============================================================================

/** Session-scoped, so "dismissed" means "for this visit", not "forever". */
export const REVIEW_TOAST_DISMISSED_KEY = 'chobii:review-toast-dismissed'

/**
 * Long enough that the toast is not competing with the hero for the first
 * impression, short enough that a visitor who scrolls once still sees it.
 */
export const REVIEW_TOAST_INITIAL_DELAY_MS = 4000

/** How long each review holds before the next one takes its place. */
export const REVIEW_TOAST_CYCLE_MS = 8000

/** One small page. The toast shows one review at a time; ten is plenty. */
export const REVIEW_TOAST_PAGE_SIZE = 10

/** Excerpts past this get an ellipsis — the card is one line of text tall. */
const EXCERPT_MAX_CHARS = 90

/**
 * Routes the toast must never appear on.
 *
 * `startsWith` rather than equality on purpose: `/checkout/success` and every
 * `/admin/*` page are covered by the same two prefixes.
 */
export function isReviewToastSuppressed(pathname: string): boolean {
  return pathname.startsWith('/checkout') || pathname.startsWith('/admin')
}

// ============================================================================
// Storage helpers
// ============================================================================

/**
 * Read the dismissal flag.
 *
 * Returns false on the server (no storage) and in Safari private mode (storage
 * access throws) — the toast showing when it should not is a far smaller
 * failure than the whole root route throwing.
 */
function readDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(REVIEW_TOAST_DISMISSED_KEY) !== null
  } catch {
    return false
  }
}

function writeDismissed(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(REVIEW_TOAST_DISMISSED_KEY, '1')
  } catch {
    // Private mode / storage disabled. The in-memory state below still hides
    // the toast for this page; that is the best available outcome.
  }
}

// ============================================================================
// Reduced motion
// ============================================================================

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the visitor asked for reduced motion.
 *
 * Read through `matchMedia` rather than left to a `motion-reduce:` Tailwind
 * variant because the slide-in is applied as a whole animation class — the
 * variant would have to override a keyframe animation mid-flight, and the
 * result is not assertable in tests. Absent `matchMedia` (SSR, jsdom) the
 * answer is "no preference".
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(REDUCED_MOTION_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setReduced(query.matches)
    onChange()
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}

// ============================================================================
// Content helpers
// ============================================================================

/** The one line of review text the card has room for. */
function excerptOf(review: ReviewFeedItem): string {
  const text = (review.title || review.content).trim()
  return text.length > EXCERPT_MAX_CHARS
    ? `${text.slice(0, EXCERPT_MAX_CHARS).trimEnd()}…`
    : text
}

/** Customer photo if there is one, else the product shot. Either may be null. */
function thumbnailOf(review: ReviewFeedItem): string | null {
  const media = review.media[0]
  return media?.thumbnailUrl ?? media?.url ?? review.product.imageUrl ?? null
}

// ============================================================================
// Component
// ============================================================================

/**
 * The toast, or nothing at all.
 *
 * Both gates live here rather than in the card so that neither a suppressed
 * route nor a dismissed session ever mounts the component that fetches.
 */
export function ReviewToast() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [dismissed, setDismissed] = useState(readDismissed)

  const handleDismiss = useCallback(() => {
    writeDismissed()
    setDismissed(true)
  }, [])

  if (isReviewToastSuppressed(pathname)) return null
  if (dismissed) return null

  return <ReviewToastCard onDismiss={handleDismiss} />
}

/**
 * The visible card. Only mounted once the route and session gates have passed,
 * so `useReviewFeed` here is also the point at which the request is made.
 */
function ReviewToastCard({ onDismiss }: { onDismiss: () => void }) {
  const { data } = useReviewFeed(1, REVIEW_TOAST_PAGE_SIZE)
  const reviews = data?.items ?? []
  const count = reviews.length

  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)
  const reducedMotion = usePrefersReducedMotion()

  // The opening delay. Keyed on `count` so it starts when the feed lands, not
  // when the component mounted with nothing to show.
  useEffect(() => {
    if (count === 0) return
    const timer = setTimeout(() => setVisible(true), REVIEW_TOAST_INITIAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [count])

  // The cycle. A single review has nothing to cycle to, so no interval runs.
  useEffect(() => {
    if (!visible || count < 2) return
    const interval = setInterval(
      () => setIndex((current) => (current + 1) % count),
      REVIEW_TOAST_CYCLE_MS
    )
    return () => clearInterval(interval)
  }, [visible, count])

  if (!visible || count === 0) return null

  // `noUncheckedIndexedAccess` is on, and the modulo alone does not convince
  // the compiler. The guard is real anyway: `index` survives a feed refetch
  // that returns fewer rows, and a stale index there would throw mid-cycle.
  const review = reviews[index % count]
  if (!review) return null

  const thumbnail = thumbnailOf(review)
  const authorName = review.author?.name || 'Verified buyer'

  return (
    <div
      data-testid="review-toast"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      role="status"
      aria-live="polite"
      className={cn(
        /**
         * z-30 — under the cart drawer's z-40 backdrop and z-50 panel. Raising
         * this above 40 puts the toast through the drawer's scrim.
         *
         * bottom-24 on mobile clears a sticky add-to-cart bar on the PDP;
         * there is room to drop back down from `sm` up.
         */
        'fixed bottom-24 left-4 z-30 sm:bottom-6',
        'w-[19rem] max-w-[calc(100vw-2rem)]',
        'rounded-md border border-border bg-background p-3 shadow-xl',
        !reducedMotion && 'animate-slide-in-from-left'
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        data-testid="review-toast-dismiss"
        aria-label="Dismiss review notifications"
        className="absolute right-1 top-1 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
      >
        <X className="h-4 w-4" />
      </button>

      <Link
        to="/posters/$slug"
        params={{ slug: review.product.slug }}
        data-testid="review-toast-link"
        className="group flex items-start gap-3 pr-5"
      >
        {thumbnail && (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-sm object-cover"
          />
        )}

        <div className="min-w-0 flex-1">
          <StarRating rating={review.rating} size="xs" showHalfStars={false} />
          <p className="mt-1 truncate text-sm text-foreground underline-offset-4 group-hover:underline">
            {excerptOf(review)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {authorName} · {review.product.title}
          </p>
        </div>
      </Link>
    </div>
  )
}

export default ReviewToast
