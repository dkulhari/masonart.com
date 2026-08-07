/**
 * CustomerReviewsSection — mesonart's home Customer Reviews band.
 *
 * The reference is docs/design/mesonart/mesonart-home-reviews-band.png. Theirs
 * is a Loox app block, and its own configuration is the spec:
 *
 *   corner-radius="40" items-per-view="2" items-per-view-mobile="3"
 *   max-characters="180" autoplay-delay="5"
 *   main-color="#ae8868" stars-color="#ff8d00" quote-marks-icon="style-1"
 *
 * ## Every slide is one thing or the other
 *
 * Their rail ALTERNATES: a blush quote card, then a media-only tile, then a
 * quote card again. A slide never carries both — the photo tiles have no
 * words on them at all and the quote cards show no photo. So a review that
 * carries media becomes a tile, a review that does not becomes a card, and
 * `buildReviewSlides` interleaves the two lists rather than concatenating
 * them: grouped, every quote card would sit off the right-hand edge on first
 * paint and the band would read as a photo strip.
 *
 * The media has always been in the payload — `GET /api/reviews` returns
 * `media[]` and `verified` (#495). This band simply never looked at it.
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
 * ## The score is ours, not theirs
 *
 * mesonart's band prints "9000+ Score 4.9/ 5.0" and the star widget beside it
 * carries `<title>4.9 rating (7000 reviews)</title>`. The label is hardcoded
 * and disagrees with the thing it labels. We copy the layout and not the
 * number: this prints whatever the catalogue actually holds.
 *
 * ## The rail is CSS, not a dependency
 *
 * `overflow-x-auto snap-x snap-mandatory`, two arrows over the edges, a dot
 * per page, and a five-second timer. No carousel library.
 *
 * The timer is the part that has to be got right, because an auto-advancing
 * carousel nobody can hold still is an accessibility failure and not a parity
 * win. It never starts under `prefers-reduced-motion`, and it stops for as
 * long as a pointer is over the rail or the keyboard is inside it. Those
 * listeners are native rather than React's synthetic `onMouseEnter`/`onFocus`
 * so that `mouseenter` means the rail and not every child it bubbles through.
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
import { CheckCircle2, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { StarRating } from '~/components/reviews/StarRating'
import { reviewMediaThumbnail } from '~/components/reviews/ReviewGridCard'
import { buttonVariants } from '~/components/ui/Button'
import { useReviewFeed } from '~/hooks/useReviews'
import { productsApi, type ReviewFeedItem, type ReviewMediaItem } from '~/lib/api'
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

/** Loox `max-characters="180"`. A quote card is a pull quote, not the review. */
export const MAX_BODY_CHARACTERS = 180

/** Loox `autoplay-delay="5"`, in ms. */
export const AUTOPLAY_DELAY_MS = 5000

/** Loox `corner-radius="40"`, on both kinds of slide. */
const SLIDE_RADIUS = 'rounded-[40px]'

/**
 * Loox `main-color="#ae8868"` — the quote glyph and the verified check.
 *
 * Literal rather than a token: it belongs to this one ported widget, and
 * promoting it to :root would invite the rest of the storefront to reach for
 * a colour that has no meaning outside this band.
 */
const QUOTE_INK = 'text-[#ae8868]'

/** Loox `stars-color="#ff8d00"` — a warmer orange than the page's amber. */
const LOOX_STARS = 'fill-[#ff8d00] text-[#ff8d00]'

/** The blush plate a quote card sits on. Measured off the reference. */
const QUOTE_PLATE = 'bg-[#f6ebe6]'

// ============================================================================
// Slides
// ============================================================================

/** One slide in the rail. A slide is media OR words, never both. */
export type HomeReviewSlide =
  | { kind: 'text'; key: string; review: ReviewFeedItem }
  | { kind: 'media'; key: string; review: ReviewFeedItem; media: ReviewMediaItem }

/**
 * Turn a page of the review feed into the rail's alternating slide list.
 *
 * A review with attachments contributes its first one as a tile and nothing
 * else — its words are not repeated in a card, exactly as on the reference.
 * A review without attachments contributes a quote card.
 *
 * The two lists are then zipped rather than concatenated. Ordering matters
 * visually: mesonart's rail reads card, tile, card, tile, and a feed sorted
 * newest-first would otherwise hand over every photo in one clump.
 */
export function buildReviewSlides(
  reviews: ReviewFeedItem[]
): HomeReviewSlide[] {
  const text: HomeReviewSlide[] = []
  const media: HomeReviewSlide[] = []

  for (const review of reviews) {
    const cover = review.media?.[0]
    if (cover) {
      media.push({ kind: 'media', key: `${review.id}-media`, review, media: cover })
    } else {
      text.push({ kind: 'text', key: `${review.id}-text`, review })
    }
  }

  const slides: HomeReviewSlide[] = []
  for (let i = 0; i < Math.max(text.length, media.length); i += 1) {
    const quote = text[i]
    const tile = media[i]
    if (quote) slides.push(quote)
    if (tile) slides.push(tile)
  }

  return slides
}

/**
 * The pull quote, cut to the widget's character cap.
 *
 * Cut in JS rather than clamped in CSS because the cap is a Loox setting and
 * not a line count: a two-line clamp says something different on a 320px
 * phone and a 1600px desktop, and the reference's cards are plainly the same
 * length of text at every width. The cut lands on a word boundary — "the
 * colours are amazing and vibr…" reads as a bug where a whole-word cut reads
 * as an excerpt.
 */
export function truncateBody(
  content: string,
  max = MAX_BODY_CHARACTERS
): string {
  const text = content.trim()
  if (text.length <= max) return text

  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  // Only honour the boundary if it leaves most of the allowance intact — a
  // 180-character run with no spaces in it should still get cut somewhere.
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut

  return `${kept.trimEnd()}…`
}

/**
 * "Daniel N." — the sign-off shape the reference prints.
 *
 * A surname on a public marketing band is more of the customer than the
 * customer agreed to publish, and it is the initial mesonart shows. The
 * fallback is the same one the grid card uses: `author` is nullable because
 * the review outlives a deleted account.
 */
export function formatAuthorName(name: string | null | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) return 'Verified customer'

  const parts = trimmed.split(/\s+/)
  const last = parts.pop() ?? trimmed
  if (parts.length === 0) return last

  const initial = last.slice(0, 1).toUpperCase()
  return initial ? `${parts.join(' ')} ${initial}.` : parts.join(' ')
}

// ============================================================================
// Slide bodies
// ============================================================================

export interface HomeReviewQuoteCardProps {
  review: ReviewFeedItem
}

/** A text-only slide: quote mark, stars, the cut body, and the sign-off. */
export function HomeReviewQuoteCard({ review }: HomeReviewQuoteCardProps) {
  return (
    <article
      data-testid="home-review-card"
      data-rating={review.rating}
      className={cn(
        'flex h-full flex-col overflow-hidden p-8 sm:p-10',
        QUOTE_PLATE,
        SLIDE_RADIUS
      )}
    >
      {/* `quote-marks-icon="style-1"`. Decorative — a screen reader announcing
          a stray double-quote before every card is noise. */}
      <span
        data-testid="home-review-quote-mark"
        aria-hidden="true"
        className={cn(
          'font-heading text-6xl leading-[0.6] tracking-tight',
          QUOTE_INK
        )}
      >
        &ldquo;
      </span>

      <div data-testid="home-review-stars" className="mt-8">
        <StarRating
          rating={review.rating}
          size="sm"
          showHalfStars={false}
          starClassName={LOOX_STARS}
        />
      </div>

      <p
        data-testid="home-review-body"
        className="mt-4 text-lg leading-relaxed text-foreground"
      >
        {truncateBody(review.content)}
      </p>

      {/* Bottom-right, under the words — the reference's own placement. */}
      <p
        data-testid="home-review-author"
        className="mt-auto flex items-center justify-end gap-1.5 pt-8 text-sm text-foreground"
      >
        {review.verified ? (
          <span data-testid="home-review-verified" className={QUOTE_INK}>
            <CheckCircle2
              aria-label="Verified purchase"
              className="h-4 w-4 fill-current text-[#f6ebe6]"
            />
          </span>
        ) : null}
        {formatAuthorName(review.author?.name)}
      </p>
    </article>
  )
}

export interface HomeReviewMediaTileProps {
  review: ReviewFeedItem
  media: ReviewMediaItem
}

/**
 * A media-only slide: the customer's photo or the poster frame of their clip,
 * filling the whole tile. No words, by design.
 *
 * A clip costs one poster frame and nothing else — `preload="none"`, a
 * `poster`, never `autoPlay`. Same rule as the grid (#488): a rail that
 * preloads its clips is tens of megabytes before anyone asks for one, and an
 * auto-playing video inside an auto-advancing carousel is two moving things
 * nobody asked for.
 */
export function HomeReviewMediaTile({
  review,
  media,
}: HomeReviewMediaTileProps) {
  const isVideo = media.mediaType === 'video'

  return (
    <article
      data-testid="home-review-media"
      data-rating={review.rating}
      // The tile carries no text, so this is the only thing announcing it.
      aria-label={`${isVideo ? 'Video' : 'Photo'} from ${formatAuthorName(
        review.author?.name
      )}, who rated ${review.product.title} ${review.rating} out of 5`}
      className={cn(
        'relative h-full w-full overflow-hidden bg-muted',
        SLIDE_RADIUS
      )}
    >
      {isVideo ? (
        <video
          data-testid="home-review-video"
          src={media.url}
          poster={reviewMediaThumbnail(media)}
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
          data-testid="home-review-photo"
          src={reviewMediaThumbnail(media)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}

      {isVideo ? (
        <span
          data-testid="home-review-play"
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white ring-2 ring-white/80">
            <Play className="h-6 w-6 translate-x-[1px] fill-current" />
          </span>
        </span>
      ) : null}
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
  const regionRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  const [pageCount, setPageCount] = useState(0)
  const [activePage, setActivePage] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const slides = buildReviewSlides(reviews)

  const syncRail = useCallback(() => {
    const rail = railRef.current
    if (!rail) return

    const { scrollLeft, clientWidth, scrollWidth } = rail
    const furthest = scrollWidth - clientWidth
    setAtStart(scrollLeft <= EDGE_EPSILON)
    setAtEnd(scrollLeft >= furthest - EDGE_EPSILON)

    // A rail that has never been laid out reports 0 for everything, and so
    // does jsdom. Zero pages means no dots rather than one meaningless dot.
    const pages = clientWidth > 0 ? Math.ceil(scrollWidth / clientWidth) : 0
    setPageCount(pages)
    setActivePage(
      pages > 0 ? Math.min(pages - 1, Math.round(scrollLeft / clientWidth)) : 0
    )
  }, [])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    syncRail()
    rail.addEventListener('scroll', syncRail, { passive: true })
    window.addEventListener('resize', syncRail)

    return () => {
      rail.removeEventListener('scroll', syncRail)
      window.removeEventListener('resize', syncRail)
    }
  }, [syncRail, slides.length])

  /**
   * Hold the rail still while it is being used.
   *
   * Native listeners on the region, not React's `onMouseEnter`/`onFocus`:
   * `mouseenter` does not bubble, which is exactly what is wanted here — the
   * region either has the pointer or it does not — and `focusin`/`focusout`
   * are what tell us the keyboard has arrived in or left the rail, arrows and
   * dots included.
   */
  useEffect(() => {
    const region = regionRef.current
    if (!region) return

    const pause = () => setPaused(true)
    const resume = () => setPaused(false)

    region.addEventListener('mouseenter', pause)
    region.addEventListener('mouseleave', resume)
    region.addEventListener('focusin', pause)
    region.addEventListener('focusout', resume)

    return () => {
      region.removeEventListener('mouseenter', pause)
      region.removeEventListener('mouseleave', resume)
      region.removeEventListener('focusin', pause)
      region.removeEventListener('focusout', resume)
    }
  }, [])

  const scrollToPage = useCallback(
    (index: number) => {
      const rail = railRef.current
      if (!rail) return
      rail.scrollTo({
        left: index * rail.clientWidth,
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    },
    [reducedMotion]
  )

  /** One page forward, wrapping at the end. What the timer and nothing else does. */
  const advance = useCallback(() => {
    const rail = railRef.current
    if (!rail) return

    const furthest = rail.scrollWidth - rail.clientWidth
    const next = rail.scrollLeft + rail.clientWidth
    rail.scrollTo({
      left: next > furthest - EDGE_EPSILON ? 0 : next,
      behavior: 'smooth',
    })
  }, [])

  /**
   * Autoplay. Off under reduced motion, off while the rail is in use, and
   * cleared on unmount — a timer that outlives its rail scrolls a detached
   * node forever.
   */
  useEffect(() => {
    if (reducedMotion || paused) return
    if (slides.length < 2) return

    const timer = window.setInterval(advance, AUTOPLAY_DELAY_MS)
    return () => window.clearInterval(timer)
  }, [reducedMotion, paused, advance, slides.length])

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
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }

  const arrowClass = cn(
    buttonVariants({ variant: 'outline', size: 'icon' }),
    'absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm backdrop-blur disabled:pointer-events-none disabled:opacity-0'
  )

  return (
    <SectionBand tone="sand" data-testid="home-reviews">
      {/* Heading and score on the left, View All on the right — one row with
          two ends, which is where the reference puts its pill. */}
      <div
        data-testid="home-reviews-header"
        className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          {/* `text-section`, not a `text-3xl sm:text-4xl` of its own (#540):
              this was the one band heading a step under the page scale, and
              the reference sets its "Customer Reviews" at the same size as
              every other band heading — see
              docs/design/mesonart/mesonart-home-reviews-band.png. */}
          <DisplayHeading as="h2" className="text-section">
            What Customers Say
          </DisplayHeading>

          {/* The REAL aggregate. Their "9000+ Score 4.9/ 5.0" is hardcoded and
              disagrees with its own star widget; see the module comment. */}
          <div
            data-testid="home-reviews-score"
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <span className="font-heading text-4xl font-light leading-none text-foreground">
              {averageRating.toFixed(1)}
            </span>
            <StarRating
              rating={averageRating}
              size="md"
              showHalfStars
              starClassName={LOOX_STARS}
            />
            <span className="text-sm text-muted-foreground">
              {reviewCount.toLocaleString('en-IN')} reviews
            </span>
          </div>
        </div>

        {/* `size: 'pill'` — the measured button, same as every other band's
            View All (#540). */}
        <a
          href="/reviews"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'pill' }),
            'shrink-0 self-start sm:self-auto'
          )}
        >
          View All
        </a>
      </div>

      <div
        ref={regionRef}
        data-testid="home-reviews-carousel"
        className="relative mt-10"
      >
        <ul
          ref={railRef}
          data-testid="home-reviews-rail"
          aria-label="Customer reviews"
          className="flex snap-x snap-mandatory list-none gap-6 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide) => (
            <li
              key={slide.key}
              data-slide={slide.kind}
              className="h-[26rem] w-[80%] shrink-0 snap-start sm:h-[30rem] sm:w-[21rem]"
            >
              {slide.kind === 'text' ? (
                <HomeReviewQuoteCard review={slide.review} />
              ) : (
                <HomeReviewMediaTile
                  review={slide.review}
                  media={slide.media}
                />
              )}
            </li>
          ))}
        </ul>

        {/* Over the rail's edges, vertically centred — the reference's arrows,
            rather than a pair parked in the header row. */}
        <button
          type="button"
          aria-label="Scroll left"
          disabled={atStart}
          onClick={() => scrollByStep(-1)}
          className={cn(arrowClass, 'left-0 -translate-x-1/2')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          disabled={atEnd}
          onClick={() => scrollByStep(1)}
          className={cn(arrowClass, 'right-0 translate-x-1/2')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {pageCount > 1 ? (
          <div
            data-testid="home-reviews-dots"
            className="mt-6 flex items-center justify-center gap-2"
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                data-testid="home-reviews-dot"
                data-active={index === activePage ? 'true' : 'false'}
                aria-label={`Go to review page ${index + 1}`}
                aria-current={index === activePage ? 'true' : undefined}
                onClick={() => scrollToPage(index)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === activePage
                    ? 'w-6 bg-foreground'
                    : 'w-1.5 bg-foreground/25 hover:bg-foreground/50'
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Reduced motion
// ============================================================================

/**
 * `(prefers-reduced-motion: reduce)`, as state rather than a call.
 *
 * State because it gates a timer set up in an effect, and a user who flips
 * the OS setting mid-visit should have the carousel stop then, not on the
 * next navigation. Guarded for SSR and for jsdom-shaped environments where
 * `matchMedia` may be missing entirely.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  return reduced
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
