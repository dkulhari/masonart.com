/**
 * CustomerReviewsSection — mesonart's home Customer Reviews band.
 *
 * The bar is the live widget, not the screenshot:
 * `docs/design/mesonart/home-reviews-band-measured-spec.md` records every
 * number below, read off `loox-dynamic-carousel-widget`'s open shadow root on
 * mesonart.com. Where that file and ticket #581's description table disagree,
 * the measurement wins — #581 was written from a still, and got the structure
 * wrong.
 *
 * ## It is two carousels, not one rail
 *
 * The still makes the band look like a single strip whose slides alternate
 * blush quote card, photo, quote card. It is not. The widget is a two-column
 * grid holding two independently-tracked swipers over the same review list:
 *
 *   grid-template-columns: 384px 1128px;  gap: 16px;  grid-template-rows: 424px
 *
 * The left column is a FIXED blush plate that quote cards translate through —
 * the plate never moves and never leaves the screen. The right column is a
 * strip of 560x424 media tiles, two fully visible at a time
 * (`items-per-view="2"`), 8px apart. One index drives both, so the words and
 * the photographs advance in lockstep.
 *
 * Lockstep only means anything if the two tracks hold the SAME reviews in the
 * same order, which is why a review with no photograph is not quoted here at
 * all — see `buildReviewsRail`. Loox gets that for free (theirs is a photo
 * review widget); ours filters for it.
 *
 * That distinction is the whole design. Interleaving the two kinds into one
 * scrolling rail — what shipped — puts the quote card off-screen every other
 * step and turns a two-part composition into a photo strip with captions in it.
 *
 * ## The index, and why nothing here scrolls
 *
 * Both tracks are `translateX` off one `index`, not `scrollLeft`. A pair of
 * scroll containers that must stay in step is two sources of truth and a
 * feedback loop between them; one integer is neither. It also means the step
 * is exact — a scroll-snap rail lands wherever momentum leaves it.
 *
 * The offsets are pure CSS. Each track is exactly as wide as its own viewport,
 * so a percentage inside `translateX` resolves against that viewport: the text
 * track steps `100%`, and the media track steps `50% + 4px` — half a viewport
 * plus half the 8px gap, which is one tile. No measurement, no ResizeObserver,
 * and it behaves identically in jsdom, where every width is 0.
 *
 * ## It is allowed to render nothing, and usually should
 *
 * The whole section returns null below MIN_REVIEWS_FOR_HOME_STRIP approved
 * reviews, and when `averageRating` is null however many there are. Not a
 * placeholder, not a zero.
 *
 * Nine reviews averaging 4.8 is nine people, not a 4.8-star catalogue, and
 * rounding a thin sample into a home-page marketing number is exactly the lie
 * the rule exists to prevent. `averageRating: null` is what the API returns
 * when there is nothing to average; coalescing it to 0 prints "0.0", which
 * reads as "rated badly" where absent reads as "not yet rated" — the truth.
 *
 * The threshold is deliberately the same number the /reviews aggregate uses
 * (`MIN_REVIEWS_FOR_AGGREGATE`). It is restated here rather than imported so a
 * home-page chunk does not drag in a route module, and the test pins the two
 * together — two surfaces disagreeing about when a rating becomes printable is
 * two designs, not one system.
 *
 * ## The score is ours, not theirs
 *
 * Their band prints "9000+ Score 4.9/ 5.0" while the star widget beside it
 * carries `<title>4.9 rating (7000 reviews)</title>` — the label disagrees with
 * the thing it labels. We copy the layout and not the number.
 *
 * ## The timer
 *
 * `autoplay-delay="5"`. An auto-advancing carousel nobody can hold still is an
 * accessibility failure and not a parity win, so it never starts under
 * `prefers-reduced-motion`, and it stops for as long as a pointer is over the
 * band or the keyboard is inside it. Those listeners are native rather than
 * React's synthetic `onMouseEnter`/`onFocus` so that `mouseenter` means the
 * region and not every child it bubbles through.
 *
 * ## Reads client-side
 *
 * The home route's loader is SSR'd for SEO; the aggregate and the feed describe
 * the catalogue rather than this URL, and a review landing is not worth a
 * slower first byte on the home page. `productsApi.catalogueReviewStats` rather
 * than a relative fetch: there is no Vite proxy for `/api`, so a relative
 * request from the dev server never reaches the API at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
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

/**
 * How many reviews the band asks the feed for.
 *
 * Deeper than it can show, because only reviews carrying a photograph are
 * quotable here — see `buildReviewsRail`. Asking for exactly MAX_SLIDES gets a
 * band a fraction of that size: the seeded catalogue has media on five reviews
 * in twelve.
 */
export const FEED_PAGE_SIZE = 24

/** How many slides the band steps through. One screenful of stepping, no more. */
export const MAX_SLIDES = 12

/** Loox `max-characters="180"`. A quote card is a pull quote, not the review. */
export const MAX_BODY_CHARACTERS = 180

/** Loox `autoplay-delay="5"`, in ms. */
export const AUTOPLAY_DELAY_MS = 5000

/** How many media tiles the strip shows at once — `items-per-view="2"`. */
export const TILES_PER_VIEW = 2

/** Loox `corner-radius="40"`, on the plate and on every tile. */
const RADIUS = 'rounded-[40px]'

/**
 * The blush plate, `rgb(246 239 236)`.
 *
 * On the swiper VIEWPORT in the original, not on the slide — the colour is a
 * fixed pane that words move through. Literals rather than tokens throughout
 * this file: they belong to one ported widget, and promoting them to :root
 * would invite the rest of the storefront to reach for colours that have no
 * meaning outside this band.
 */
const PLATE = 'bg-[#f6efec]'

/** The quote glyph and nothing else. Their computed fill, not `main-color`. */
const QUOTE_INK = 'text-[#78583b]'

/** Loox `stars-color="#ff8d00"` — the slide stars. */
const SLIDE_STARS = 'fill-[#ff8d00] text-[#ff8d00]'

/**
 * The header's stars are a DIFFERENT orange from the slides' — `#f5c264`
 * against `#ff8d00`. Two widgets by the same vendor on the same band, and they
 * disagree. Copied because the band is measurably that.
 */
const HEADER_STARS = 'fill-[#f5c264] text-[#f5c264]'

/** Body copy on the plate, `rgb(76 70 66)`. */
const BODY_INK = 'text-[#4c4642]'

/** The reviewer's name, `rgb(51 48 46)`. */
const NAME_INK = 'text-[#33302e]'

/** The verified check, `rgb(104 92 83)`. */
const BADGE_INK = 'text-[#685c53]'

// ============================================================================
// Rail model
// ============================================================================

export interface HomeReviewsRail {
  /** The quoted reviews, in feed order. One quote card each. */
  quotes: ReviewFeedItem[]
  /** The same reviews, same order — their cover attachment. One tile each. */
  tiles: { key: string; review: ReviewFeedItem; media: ReviewMediaItem }[]
  /** Steps the index may take. Both tracks are this long. */
  pageCount: number
}

/**
 * Build the band's two tracks out of a page of the feed.
 *
 * ONE list, rendered twice. Position `i` of the quote track and position `i` of
 * the media track are the same review, so the photograph beside a set of words
 * belongs to the person who wrote them — which is the entire composition.
 *
 * That means a review with no photograph cannot appear: it is dropped from both
 * tracks rather than quoted beside a stranger's picture. Keeping every review
 * in the left track and only the photographed ones in the right made two lists
 * of different lengths whose indices meant different reviews, and the strip then
 * had to be clamped at `tiles - 2` — with five photographs among twelve reviews
 * it froze on step three and the words carried on without it.
 *
 * Loox does not have this problem: their widget is a photo-review widget, so
 * every slide has a picture by construction. Ours filters to reach the same
 * guarantee.
 *
 * A review contributes at most one tile. Their strip shows one frame per
 * customer, and a single enthusiastic reviewer with six photos would otherwise
 * take the whole band.
 */
export function buildReviewsRail(reviews: ReviewFeedItem[]): HomeReviewsRail {
  const slides = reviews
    .flatMap((review) => {
      const cover = review.media?.[0]
      return cover ? [{ key: `${review.id}-media`, review, media: cover }] : []
    })
    .slice(0, MAX_SLIDES)

  return {
    quotes: slides.map((slide) => slide.review),
    tiles: slides,
    pageCount: slides.length,
  }
}

/**
 * The pull quote, cut to the widget's character cap.
 *
 * Cut in JS rather than clamped in CSS because the cap is a Loox setting and
 * not a line count: a two-line clamp says something different on a 320px phone
 * and a 1600px desktop, and the reference's cards are plainly the same length
 * of text at every width. The cut lands on a word boundary — "the colours are
 * amazing and vibr…" reads as a bug where a whole-word cut reads as an excerpt.
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
 * fallback is the same one the grid card uses: `author` is nullable because the
 * review outlives a deleted account.
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
// Glyphs
// ============================================================================

/**
 * `quote-marks-icon="style-1"` — their own 54x38 path, not a typographic
 * `&ldquo;`. Two solid comma marks; a text quote character in a heading face is
 * a visibly different shape at this size and was the first thing that read as
 * "not the same band".
 */
function QuoteMarks({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 54 38"
      width="54"
      height="38"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.7097 18.2043C22.3871 20.1936 23.2258 22.5807 23.2258 25.3656C23.2258 28.681 22.0645 31.5323 19.7419 33.9194C17.5484 36.3064 14.8387 37.5 11.6129 37.5C8.3871 37.5 5.6129 36.3728 3.29032 34.1183C1.09677 31.7312 0 28.8136 0 25.3656C0 16.0824 5.35484 7.79391 16.0645 0.5L19.9355 3.88172C18.6452 5.07527 17.4194 6.66667 16.2581 8.65592C15.2258 10.5125 14.5806 12.3029 14.3226 14.0269C16.9032 14.69 19.0323 16.0824 20.7097 18.2043ZM51.4839 18.2043C53.1613 20.1936 54 22.5807 54 25.3656C54 28.681 52.8387 31.5323 50.5161 33.9194C48.1936 36.3064 45.4839 37.5 42.3871 37.5C39.1613 37.5 36.3871 36.3064 34.0645 33.9194C31.7419 31.5323 30.5806 28.681 30.5806 25.3656C30.5806 16.3477 36 8.05914 46.8387 0.5L50.9032 3.88172C49.6129 5.07527 48.3871 6.60036 47.2258 8.45699C46.1935 10.3136 45.4839 12.1703 45.0968 14.0269C47.6774 14.69 49.8064 16.0824 51.4839 18.2043Z" />
    </svg>
  )
}

/**
 * Their star, not ours.
 *
 * `StarRating` draws lucide's `Star`: rounded joins, blunted points, and — the
 * part that actually gives the port away — an UNFILLED star in the page's cool
 * neutral. Loox draws a sharp classic star and renders the empty state as a
 * hollow outline in the SAME hue as the filled one, so the row stays one warm
 * object. A blue-grey star in an otherwise entirely warm band is the loudest
 * wrong note on the whole surface.
 *
 * The path is Loox's own `looxicons-rating-icon-fill`. A fractional star is the
 * outline with a solid one clipped over it, which is how a 4.5 aggregate prints
 * without a second glyph.
 */
function LooxStars({
  rating,
  size,
  className,
  starClassName,
}: {
  rating: number
  /** Edge length in px — 24 on a card, 16 in the header. */
  size: number
  className?: string
  starClassName?: string
}) {
  const stars = Array.from({ length: 5 }, (_, index) =>
    Math.max(0, Math.min(1, rating - index))
  )

  return (
    <span
      role="img"
      aria-label={`${rating} out of 5 stars`}
      className={cn('flex items-center gap-1', className)}
    >
      {stars.map((fill, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn('relative block', starClassName)}
          style={{ width: size, height: size }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="absolute inset-0 h-full w-full"
          >
            <path d={LOOX_STAR_PATH} />
          </svg>
          {fill > 0 ? (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="absolute inset-0 h-full w-full"
              style={
                fill < 1
                  ? { clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }
                  : undefined
              }
            >
              <path d={LOOX_STAR_PATH} />
            </svg>
          ) : null}
        </span>
      ))}
    </span>
  )
}

const LOOX_STAR_PATH =
  'M24 9.425c0 .212-.125.443-.375.693l-5.236 5.105 1.24 7.212c.01.067.015.164.015.289a.85.85 0 0 1-.151.511.51.51 0 0 1-.44.21c-.183 0-.375-.058-.577-.174L12 19.869l-6.476 3.404c-.212.115-.404.173-.577.173-.202 0-.353-.07-.454-.21a.85.85 0 0 1-.152-.511c0-.058.01-.154.03-.289l1.24-7.211-5.25-5.106C.12 9.858 0 9.628 0 9.425c0-.355.27-.577.808-.663l7.24-1.053 3.245-6.562c.183-.395.418-.592.707-.592s.524.197.707.592l3.245 6.562 7.24 1.053c.539.086.808.308.808.663Z'

/** Their verified badge — a filled disc with a check knocked out of it. */
function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="Verified purchase"
      className={className}
    >
      <path d="m10.6 16.6 7.05-7.05-1.4-1.4-5.65 5.65-2.85-2.85-1.4 1.4 4.25 4.25ZM12 22a9.738 9.738 0 0 1-3.9-.788 10.099 10.099 0 0 1-3.175-2.137c-.9-.9-1.612-1.958-2.137-3.175A9.738 9.738 0 0 1 2 12a9.74 9.74 0 0 1 .788-3.9 10.099 10.099 0 0 1 2.137-3.175c.9-.9 1.958-1.612 3.175-2.137A9.738 9.738 0 0 1 12 2a9.74 9.74 0 0 1 3.9.788 10.098 10.098 0 0 1 3.175 2.137c.9.9 1.613 1.958 2.137 3.175A9.738 9.738 0 0 1 22 12a9.738 9.738 0 0 1-.788 3.9 10.098 10.098 0 0 1-2.137 3.175c-.9.9-1.958 1.613-3.175 2.137A9.738 9.738 0 0 1 12 22Z" />
    </svg>
  )
}

// ============================================================================
// Slide bodies
// ============================================================================

export interface HomeReviewQuoteCardProps {
  review: ReviewFeedItem
  /** False for the cards parked off-plate, so only one is in the tab order. */
  active: boolean
}

/**
 * One quote: stars, the cut body, and the sign-off, on a 56/40 grid.
 *
 * The card is transparent — the blush belongs to the plate it slides across.
 */
export function HomeReviewQuoteCard({ review, active }: HomeReviewQuoteCardProps) {
  return (
    <article
      data-testid="home-review-card"
      data-rating={review.rating}
      aria-hidden={active ? undefined : 'true'}
      // `auto 1fr auto`: the words take whatever the stars and the sign-off do
      // not, which is what floors the sign-off. An auto third row lets a short
      // review push it up into the middle of the plate, and because the band
      // steps between reviews of different lengths the name would then visibly
      // jump on every advance.
      className="grid h-full w-full shrink-0 basis-full grid-rows-[auto_1fr_auto] gap-4 px-8 py-12 sm:px-10 sm:py-14"
    >
      <div data-testid="home-review-stars">
        {/* 24px on a 4px gap — measured. */}
        <LooxStars
          rating={review.rating}
          size={24}
          starClassName={cn('h-6 w-6', SLIDE_STARS)}
        />
      </div>

      <p
        data-testid="home-review-body"
        className={cn('text-xl leading-8 sm:text-2xl sm:leading-9', BODY_INK)}
      >
        {truncateBody(review.content)}
      </p>

      {/* Bottom-right, under the words — the reference's own placement. */}
      <p
        data-testid="home-review-author"
        className={cn(
          'flex items-center justify-end gap-1 self-end text-lg',
          NAME_INK
        )}
      >
        {review.verified ? (
          <span data-testid="home-review-verified" className={BADGE_INK}>
            <VerifiedBadge className="h-[18px] w-[18px]" />
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
 * A media-only tile: the customer's photo or the poster frame of their clip,
 * filling the whole tile. No words on it, by design — their rating overlay
 * ships in the markup and is `hidden`.
 *
 * A clip costs one poster frame and nothing else — `preload="none"`, a
 * `poster`, never `autoPlay`. Same rule as the grid (#488): a strip that
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
      // A warm neutral while the photograph loads. `bg-muted` is a cool grey
      // and flashes blue-ish against the blush plate beside it; theirs paints
      // each tile its own image's average colour.
      className={cn(
        'relative h-full w-full overflow-hidden bg-[#e8e0da]',
        RADIUS
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
// Pagination
// ============================================================================

/** How many bullets their dynamic pagination keeps on screen. */
const BULLET_WINDOW = 5

/**
 * The window of pages their bullets show, clamped to the ends.
 *
 * Swiper's `dynamicBullets`: five at a time, the active one a pill, the two
 * innermost neighbours full-size, the outermost pair shrunk to a hint that the
 * list continues. Twenty-one flat dots under a band is a scrollbar, not a
 * pagination.
 */
export function bulletWindow(
  active: number,
  pageCount: number
): { index: number; size: 'active' | 'large' | 'medium' }[] {
  if (pageCount <= 1) return []

  const span = Math.min(BULLET_WINDOW, pageCount)
  const start = Math.max(0, Math.min(active - 1, pageCount - span))

  return Array.from({ length: span }, (_, offset) => {
    const index = start + offset
    if (index === active) return { index, size: 'active' as const }
    const atEdge = offset === 0 || offset === span - 1
    return { index, size: atEdge ? ('medium' as const) : ('large' as const) }
  })
}

/**
 * Warm, not neutral. Sampled off the reference: the active bullet is the same
 * brown family as the quote glyph and the inactive ones are barely there.
 * `bg-foreground` makes the dot row the darkest object in the lower half of
 * the band, which is backwards — pagination should be the quietest thing on
 * the surface, and a near-black row under a blush plate reads as a different
 * design system leaking in.
 */
const BULLET_SIZE = {
  active: 'h-2 w-6 bg-[#7e6044]',
  large: 'h-2 w-2 bg-[#e5d9d2]',
  medium: 'h-[5px] w-[5px] bg-[#ebe1db]',
} as const

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
 * The header, the two tracks, the controls — or nothing at all.
 *
 * Split from the data-connected section below so the suppression rule is
 * testable without a query client.
 */
export function CustomerReviewsStrip({
  averageRating,
  reviewCount,
  reviews,
}: CustomerReviewsStripProps) {
  const regionRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const rail = useMemo(() => buildReviewsRail(reviews), [reviews])
  const { quotes, tiles, pageCount } = rail

  /**
   * Hold the band still while it is being used.
   *
   * Native listeners on the region, not React's `onMouseEnter`/`onFocus`:
   * `mouseenter` does not bubble, which is exactly what is wanted here — the
   * region either has the pointer or it does not — and `focusin`/`focusout` are
   * what tell us the keyboard has arrived in or left the band, arrows and
   * bullets included.
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

  /** One step, wrapping at either end — theirs loops, so ours does. */
  const step = useCallback(
    (direction: -1 | 1) => {
      setIndex((current) => {
        if (pageCount === 0) return 0
        return (current + direction + pageCount) % pageCount
      })
    },
    [pageCount]
  )

  /**
   * Autoplay. Off under reduced motion, off while the band is in use, and
   * cleared on unmount — a timer that outlives its band steps a detached node
   * forever.
   */
  useEffect(() => {
    if (reducedMotion || paused) return
    if (pageCount < 2) return

    const timer = window.setInterval(() => step(1), AUTOPLAY_DELAY_MS)
    return () => window.clearInterval(timer)
  }, [reducedMotion, paused, step, pageCount])

  /** A shorter feed can strand the index past the end. */
  useEffect(() => {
    setIndex((current) => (current >= pageCount ? 0 : current))
  }, [pageCount])

  /**
   * THE SUPPRESSION RULE. Everything below this line is unreachable on a thin
   * sample, which is the point — see the module comment. It sits after the
   * hooks because hook order may not vary between renders.
   */
  if (
    averageRating === null ||
    reviewCount < MIN_REVIEWS_FOR_HOME_STRIP ||
    quotes.length === 0
  ) {
    return null
  }

  const arrowClass =
    'absolute top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-background text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition hover:bg-background'

  return (
    <SectionBand tone="plain" data-testid="home-reviews">
      {/* Heading and score on the left, View All on the right — one row with
          two ends, which is where the reference puts its pill. */}
      <div
        data-testid="home-reviews-header"
        className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="grid gap-2.5">
          <DisplayHeading as="h2" className="text-section">
            Customer Reviews
          </DisplayHeading>

          {/* The REAL aggregate. Their "9000+ Score 4.9/ 5.0" is hardcoded and
              disagrees with its own star widget; see the module comment.

              CENTRED under the heading, not flush left with it: their row is
              `justify-content: center` inside a column the heading sizes, and
              flush-left is the arrangement a rebuild reaches for by default. */}
          <div
            data-testid="home-reviews-score"
            className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-base text-black"
          >
            {/* Header stars TOUCH — the row is one continuous ink run, where
                the card's 24px stars carry a 4px gap. Same widget, two
                spacings, and copying only the card's makes the header row
                read 9% wide. */}
            <LooxStars
              rating={averageRating}
              size={16}
              className="gap-0"
              starClassName={HEADER_STARS}
            />
            {/* Two spans and a gap rather than one string with a margin in
                the middle of it — the margin is invisible to a screen reader,
                which would otherwise read "12 reviewsScore 4.5". */}
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span>{reviewCount.toLocaleString('en-IN')} reviews</span>
              <span>Score {averageRating.toFixed(1)}/ 5.0</span>
            </span>
          </div>
        </div>

        <a
          href="/reviews"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'pill' }),
            // The live element computes `border: 0px none`, but the rendered
            // pill plainly carries a 2px black edge — a shadow, or a border
            // the computed style does not account for. Measured off the
            // rendering, which is what anyone actually sees.
            'shrink-0 gap-3 self-start rounded-full text-lg font-medium text-black sm:self-auto'
          )}
        >
          View All
          <ArrowRight aria-hidden="true" className="h-5 w-5" />
        </a>
      </div>

      <div
        ref={regionRef}
        data-testid="home-reviews-carousel"
        className="mt-16"
        role="group"
        aria-roledescription="carousel"
        aria-label="Customer reviews"
      >
        {/* The arrows are positioned against THIS box and not against the
            region, which also holds the bullets — centring on the region puts
            them ten pixels below the tiles' midline. */}
        <div className="relative">
        {/* 384px of plate and the rest of the row for photographs — their
            grid, with the media column collapsing under the plate on a phone
            rather than shrinking the words. */}
        <div
          data-testid="home-reviews-rail"
          // `minmax(0,1fr)` at BOTH widths, not just the two-column one. A
          // bare `grid` has no explicit column, so the implicit one is
          // max-content: the tracks are as wide as all their slides put
          // together, the plate stops clipping, and the phone gets a page
          // that scrolls sideways.
          className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:h-[424px] lg:grid-cols-[384px_minmax(0,1fr)]"
        >
          {/* The plate. Fixed; cards translate through it.

              The glyph is a SIBLING of the clipping box, not a child of it:
              it hangs -8,-8 off the corner, and inside `overflow-hidden` the
              rounded corner cuts both marks into half-discs. */}
          <div className="relative h-[380px] lg:h-full">
            <QuoteMarks
              className={cn(
                'absolute -left-2 -top-2 z-10 h-[38px] w-[54px]',
                QUOTE_INK
              )}
            />

            <div
              data-testid="home-reviews-plate"
              className={cn('h-full overflow-hidden', PLATE, RADIUS)}
            >
              <div
                data-testid="home-reviews-quote-track"
                className="flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{
                  // The track is exactly one plate wide, so 100% is one card.
                  transform: `translateX(calc(${index} * -100%))`,
                }}
              >
                {quotes.map((review, position) => (
                  <HomeReviewQuoteCard
                    key={review.id}
                    review={review}
                    active={position === index}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* The strip. Two tiles visible, 8px apart, clipped at the column. */}
          <div className="overflow-hidden">
            <div
              data-testid="home-reviews-media-track"
              // `--step` is one tile plus one gap, and the percentage resolves
              // against the track — which is exactly one viewport wide — so
              // the offset needs no measurement at either width. Two tiles up
              // on the desktop grid, one on a phone, where two would be 177px
              // of photograph each.
              className="flex h-[240px] w-full gap-2 transition-transform duration-500 ease-out [--step:calc(100%+8px)] sm:h-[320px] lg:h-full lg:[--step:calc(50%+4px)] motion-reduce:transition-none"
              // The SAME index as the quote track, unclamped. Both tracks hold
              // the same reviews in the same order, so tile `index` is the
              // photograph belonging to the words on the plate.
              style={{
                transform: `translateX(calc(var(--step) * -1 * ${index}))`,
              }}
            >
              {tiles.map(({ key, review, media }) => (
                <div
                  key={key}
                  className="h-full shrink-0 basis-full lg:basis-[calc((100%-8px)/2)]"
                >
                  <HomeReviewMediaTile review={review} media={media} />
                </div>
              ))}

              {/* Two tiles are visible at a time, so on the last index the
                  right-hand slot would be a gap. Theirs loops; repeating the
                  first tile at the tail is what a loop looks like from the
                  final step, and it costs one already-decoded image.

                  Hidden from assistive tech and untabbable — it is the same
                  photograph announced a second time. */}
              {pageCount > 1 && tiles[0] ? (
                <div
                  key="tail-clone"
                  data-testid="home-review-media-clone"
                  aria-hidden="true"
                  className="h-full shrink-0 basis-full lg:basis-[calc((100%-8px)/2)]"
                >
                  <HomeReviewMediaTile
                    review={tiles[0].review}
                    media={tiles[0].media}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

          {/* Centred on the content edges, over the row — the reference's
              arrows, rather than a pair parked in the header. */}
          <button
            type="button"
            aria-label="Previous review"
            onClick={() => step(-1)}
            className={cn(arrowClass, 'left-0 -translate-x-1/2')}
          >
            {/* Their chevron is a heavier, darker mark than lucide's default
                — at 2px it reads mid-grey against their near-black. */}
            <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Next review"
            onClick={() => step(1)}
            className={cn(arrowClass, 'right-2 translate-x-1/2')}
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>

        {pageCount > 1 ? (
          <div
            data-testid="home-reviews-dots"
            className="mt-3 flex items-center gap-2 lg:pl-16"
          >
            {bulletWindow(index, pageCount).map((bullet) => (
              <button
                key={bullet.index}
                type="button"
                data-testid="home-reviews-dot"
                data-size={bullet.size}
                data-active={bullet.index === index ? 'true' : 'false'}
                aria-label={`Go to review ${bullet.index + 1}`}
                aria-current={bullet.index === index ? 'true' : undefined}
                onClick={() => setIndex(bullet.index)}
                className={cn(
                  'rounded-full transition-all',
                  BULLET_SIZE[bullet.size]
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
 * State because it gates a timer set up in an effect, and a user who flips the
 * OS setting mid-visit should have the carousel stop then, not on the next
 * navigation. Guarded for SSR and for jsdom-shaped environments where
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

  const { data: feed } = useReviewFeed(1, FEED_PAGE_SIZE)

  return (
    <CustomerReviewsStrip
      averageRating={stats?.averageRating ?? null}
      reviewCount={stats?.reviewCount ?? 0}
      reviews={feed?.items ?? []}
    />
  )
}

export default CustomerReviewsSection
