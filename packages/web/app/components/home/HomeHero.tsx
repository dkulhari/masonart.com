/**
 * HomeHero — the home page's opening band (#529).
 *
 * SUPERSEDES `HeroSection` in `app/routes/index.tsx`. That section is a centred
 * wall of text on white — an amber badge pill, a two-line h1, a three-line
 * paragraph, two buttons and a trust row — which reads as a SaaS landing page
 * rather than an art storefront. This is the bar's band: a full-bleed
 * photograph carousel with rounded corners, the neighbouring slides peeking at
 * both edges, and one outline pill carrying the whole call to action. The old
 * section is left in place for the integration step to remove; see the ticket.
 *
 * ## The measured band (mesonart.com home, 1440x900 and 390x844)
 *
 * Every number below was read off the captured page at device-pixel accuracy,
 * not eyeballed:
 *
 *   desktop   slide 48px from each page edge, 1344 x 553, 16px corner. 30px
 *             between slides, so a neighbour shows 18px at each edge. Pill
 *             230 x 45, inset 60px from the slide's right and bottom edge.
 *             The slide's top sits 10px under the category rail — no white
 *             band, which is why this component has no vertical padding.
 *   mobile    one slide 20px from each page edge, 349.5 x 513.5, no peek.
 *             Pill spans the slide inset by 20px, 10px off the slide's bottom,
 *             40px tall.
 *
 * The peek is not positioned anywhere — it falls out of two numbers. With a
 * track inset of `I` and a gap of `G`, the neighbour shows exactly `I - G`:
 * desktop 48/30 gives the measured 18px, mobile 20/20 gives zero, which is why
 * the phone needs no second rule to suppress it.
 *
 * Slide width is `100%` of the track's CONTENT box, which the inset has already
 * narrowed, so no `100vw` (which would include the scrollbar and overhang the
 * page) is involved. The track is capped at `--page-width` and centred, so at
 * viewports past 1600px the hero stays 56px narrower than `.container-wide`
 * exactly as it is at 1440.
 *
 * ## The photography is a DEVELOPMENT PLACEHOLDER
 *
 * `packages/web/public/dev-reference/` holds mesonart's own hero slides. They
 * are git-ignored, they are not ours, and **ticket #544 blocks go-live on
 * replacing them**. Repopulate a clone with
 * `bash scripts/dev/fetch-reference-imagery.sh`.
 *
 * Two consequences this file is built around:
 *
 *   1. Every path goes through `HERO_SLIDES` below and nothing else references
 *      `/dev-reference` — swapping in our own photography is an edit to one
 *      table, not a hunt through JSX.
 *   2. The directory can be absent (a fresh clone, CI). A missing hero image
 *      hides the whole band rather than painting broken-image glyphs across the
 *      top of the home page — see `failed` in the component.
 *
 * The campaign words on slide 1 ("Late Summer / Home Refresh Event / 40% off")
 * are pixels inside mesonart's JPEG, not copy this component writes. That is
 * also how the real band will work: the slide is a merchandising slot and the
 * campaign is composited into the asset, exactly as the bar does it. Nothing
 * here reads a promotion or prints a discount — the sale surfaces
 * (`SaleStrip`, `SaleBanner`, sale pricing) already own that, and inventing a
 * second, unbacked claim in the hero is the failure mode this repo has rules
 * about. The alt text therefore describes the room and not the placeholder
 * campaign.
 *
 * ## Why the track is cloned at both ends
 *
 * The bar shows a slide peeking at BOTH edges while its first slide is
 * showing, which a plain scroller cannot do at `scrollLeft: 0`. So the track
 * renders `[last, ...slides, first]` and starts one step in. When a clone
 * settles under the snap point the scroll position jumps to its real twin with
 * `behavior: 'instant'`, which is invisible because the two are the same
 * photograph. That is the whole loop: no transform track, no index state.
 *
 * The scroll position IS the state. A swipe and an arrow press therefore
 * cannot disagree about which slide is showing, which is the bug every
 * `activeIndex` version of this component eventually grows.
 *
 * ## The overlay is one layer, not one per slide
 *
 * The pill sits ABOVE the track, positioned against the same `--hero-inset`,
 * rather than inside every `<li>`. Every slide has identical geometry, so a
 * single overlay lands exactly on whichever slide is snapped into view — and
 * the page gets one "Shop All Art" link instead of one per slide competing for
 * the same accessible name.
 *
 * ## Controls
 *
 * The bar shows no arrows and no dots at rest, so neither does this. The track
 * is a real tab stop with ArrowLeft/ArrowRight (the same shape as
 * `product/ProductCarousel`), and circular arrows fade in on hover or keyboard
 * focus. Autoplay advances every 6s, pauses while the band is hovered or
 * focused, and does not run at all under `prefers-reduced-motion: reduce` — a
 * hero that moves on its own is precisely what that setting is asking us not
 * to do.
 *
 * ## The h1
 *
 * The bar's hero has no heading element; its words are pixels. Dropping ours
 * would leave the home page with no h1 at all, so one is rendered `sr-only`
 * with the site's own proposition — the same claim as the route's `<title>`.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '~/lib/utils'
import { buttonVariants } from '~/components/ui/Button'

// ============================================================================
// The slide table — the ONE place any image path is written
// ============================================================================

/**
 * Where the placeholder photography lives. Git-ignored; see the header and
 * ticket #544. Nothing outside this file may reference it.
 */
export const HERO_IMAGE_BASE = '/dev-reference/hero'

export interface HeroSlide {
  id: string
  /** Wide crop, used from `md` up. */
  desktopSrc: string
  /** Tall crop, used below `md`. */
  mobileSrc: string
  /**
   * Describes the photograph. Deliberately NOT the campaign text composited
   * into the placeholder — see the header.
   */
  alt: string
}

/**
 * The slides, in order.
 *
 * Replacing the placeholders is an edit to this table and nothing else. When
 * our own photography lands there is a second, better source already in the
 * catalogue: products carry `room-mockup` images — the artwork photographed
 * hanging in a styled room — which the seed builds from the reference media
 * set. Those are square, so they would need a wide and a tall crop cut for the
 * two breakpoints below before they can stand in here.
 */
export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    id: 'living-room',
    desktopSrc: `${HERO_IMAGE_BASE}/slide-1.jpg`,
    mobileSrc: `${HERO_IMAGE_BASE}/slide-mobile.jpg`,
    alt: 'A large framed painting above a blue sofa in a sunlit living room',
  },
  {
    id: 'artists-at-work',
    desktopSrc: `${HERO_IMAGE_BASE}/slide-3.webp`,
    mobileSrc: `${HERO_IMAGE_BASE}/slide-2.jpg`,
    alt: 'Artists sketching, painting at an easel, and holding a finished framed landscape',
  },
]

// ============================================================================
// Constants
// ============================================================================

/** Autoplay dwell. Long enough to take the photograph in and reach the pill. */
export const HERO_AUTOPLAY_MS = 6000

/**
 * How long after the last scroll event the track counts as settled.
 *
 * Only the clone-to-twin correction waits on this, so it is tuned to be
 * comfortably longer than the gap between two scroll events during a smooth
 * scroll rather than to feel like anything.
 */
const SETTLE_MS = 140

// ============================================================================
// Helpers
// ============================================================================

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Move the track, tolerating an environment without the scroll APIs.
 *
 * jsdom implements neither `scrollTo` nor `scrollBy` on an element, and this
 * band positions itself in a layout effect on mount — so without the fallback
 * every test that renders the home page would throw before it asserted
 * anything. Assigning `scrollLeft` is inert there and correct everywhere else.
 */
function scrollTrack(
  track: HTMLElement,
  options: { left: number; behavior: ScrollBehavior; relative?: boolean }
): void {
  const { left, behavior, relative } = options

  if (relative) {
    if (typeof track.scrollBy === 'function') {
      track.scrollBy({ left, behavior })
      return
    }
    track.scrollLeft += left
    return
  }

  if (typeof track.scrollTo === 'function') {
    track.scrollTo({ left, behavior })
    return
  }
  track.scrollLeft = left
}

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The initial scroll offset (one step in, so the leading clone peeks) has to be
 * applied before paint or the band flashes flush-left. React warns about
 * `useLayoutEffect` during SSR, hence the swap.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface HomeHeroProps {
  /** Defaults to `HERO_SLIDES`. A prop so tests and previews can substitute. */
  slides?: readonly HeroSlide[]
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function HomeHero({ slides = HERO_SLIDES, className }: HomeHeroProps) {
  const trackRef = useRef<HTMLUListElement>(null)
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [paused, setPaused] = useState(false)
  /**
   * A hero image did not load. The placeholder directory is git-ignored, so on
   * a clone that has not run the fetch script this is the normal case — and an
   * absent band beats a row of broken-image glyphs above the fold.
   */
  const [failed, setFailed] = useState(false)

  const loop = slides.length > 1

  /**
   * How far one advance moves the track.
   *
   * Measured off two rendered slides rather than recomputed from the inset and
   * gap tokens, so the breakpoint that changes those cannot desynchronise it.
   * Falls back to the scrollport width on a track that has not been laid out
   * (jsdom always, a real browser for one frame).
   */
  const stepWidth = useCallback((track: HTMLUListElement): number => {
    const first = track.firstElementChild as HTMLElement | null
    const second = first?.nextElementSibling as HTMLElement | null
    if (!first || !second) return track.clientWidth

    const step =
      second.getBoundingClientRect().left - first.getBoundingClientRect().left
    return step > 0 ? step : track.clientWidth
  }, [])

  // Start on the first REAL slide, one step past the leading clone.
  useIsomorphicLayoutEffect(() => {
    const track = trackRef.current
    if (!track || !loop) return
    scrollTrack(track, { left: stepWidth(track), behavior: 'instant' })
  }, [loop, slides.length, stepWidth])

  const advance = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current
      if (!track) return

      scrollTrack(track, {
        left: direction * stepWidth(track),
        behavior: prefersReducedMotion() ? 'instant' : 'smooth',
        relative: true,
      })
    },
    [stepWidth]
  )

  const advanceRef = useRef(advance)
  advanceRef.current = advance

  /**
   * Once the track stops moving, swap a clone for its real twin.
   *
   * Invisible: the clone and the twin are the same photograph, and the jump is
   * `instant`, so nothing animates across the seam.
   */
  const onScroll = useCallback(() => {
    if (!loop) return
    if (settleRef.current) clearTimeout(settleRef.current)

    settleRef.current = setTimeout(() => {
      const track = trackRef.current
      if (!track) return

      const step = stepWidth(track)
      if (step <= 0) return

      const index = Math.round(track.scrollLeft / step)
      if (index === 0) {
        scrollTrack(track, { left: slides.length * step, behavior: 'instant' })
      } else if (index === slides.length + 1) {
        scrollTrack(track, { left: step, behavior: 'instant' })
      }
    }, SETTLE_MS)
  }, [loop, slides.length, stepWidth])

  useEffect(
    () => () => {
      if (settleRef.current) clearTimeout(settleRef.current)
    },
    []
  )

  useEffect(() => {
    if (!loop || paused) return
    // Not "animate more cheaply" — do not animate. A hero that advances on its
    // own is the thing this setting is about.
    if (prefersReducedMotion()) return

    const timer = setInterval(() => advanceRef.current(1), HERO_AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [loop, paused])

  const onTrackKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      advance(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      advance(-1)
    }
  }

  if (slides.length === 0 || failed) return null

  /** `[last, ...slides, first]` — see the header for why the ends are cloned. */
  const real = slides.map((slide) => ({ slide, clone: false }))
  const first = slides[0]
  const last = slides[slides.length - 1]
  const items =
    loop && first && last
      ? [{ slide: last, clone: true }, ...real, { slide: first, clone: true }]
      : real

  return (
    <section
      data-testid="home-hero"
      aria-roledescription="carousel"
      aria-label="Featured artwork"
      // No vertical padding at all: the bar's slide starts 10px under the
      // category rail, and band padding here would reopen the white gap this
      // ticket exists to close.
      className={cn(
        'group/hero w-full',
        // The two numbers the whole geometry is built from. Declared here so
        // the track and the overlay layer both inherit them.
        '[--hero-gap:20px] [--hero-inset:20px]',
        'md:[--hero-gap:30px] md:[--hero-inset:48px]',
        className
      )}
      // Mouse only. A touch pointer that enters and never leaves would stop
      // autoplay for the rest of the visit on the first tap.
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setPaused(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setPaused(false)
      }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The page's only h1. Visually absent because the bar's is pixels. */}
      <h1 className="sr-only">
        chobii.art — premium posters and custom frames
      </h1>

      <div className="relative mx-auto w-full max-w-[var(--page-width)]">
        <ul
          ref={trackRef}
          data-testid="home-hero-track"
          // A real tab stop with its own arrow handling, as ProductCarousel
          // does: native arrow-key scrolling of a focused overflow element is
          // inconsistent across browsers.
          tabIndex={0}
          onKeyDown={onTrackKeyDown}
          onScroll={onScroll}
          className={cn(
            'flex list-none overflow-x-auto',
            'gap-[var(--hero-gap)] px-[var(--hero-inset)]',
            // Without the scroll padding the snapped slide would align to the
            // scrollport edge and sit `--hero-inset` out of position.
            'snap-x snap-mandatory [scroll-padding-inline:var(--hero-inset)]',
            // Deliberately NO `scroll-smooth`: every programmatic move below
            // passes its own behavior, and a CSS default would animate the
            // clone-to-twin jump that must not be seen.
            'scrollbar-hide focus-visible:outline-none'
          )}
        >
          {items.map(({ slide, clone }, index) => (
            <li
              key={`${slide.id}-${index}`}
              data-testid={clone ? 'home-hero-clone' : 'home-hero-slide'}
              aria-hidden={clone || undefined}
              // `w-full` resolves against the track's CONTENT box, which the
              // inset has already narrowed — that is the whole sizing rule.
              className="w-full shrink-0 snap-start"
            >
              <picture className="block">
                <source media="(min-width: 768px)" srcSet={slide.desktopSrc} />
                <img
                  src={slide.mobileSrc}
                  alt={clone ? '' : slide.alt}
                  // The leading clone and the first real slide are both on
                  // screen at rest; everything else is a swipe away at worst.
                  loading={index < 2 ? 'eager' : 'lazy'}
                  fetchPriority={index === 1 ? 'high' : 'auto'}
                  decoding="async"
                  onError={() => setFailed(true)}
                  className={cn(
                    // `h-auto` is load-bearing: without an author rule the
                    // browser's `height` presentational hint would win over the
                    // aspect ratio.
                    'block h-auto w-full rounded-2xl bg-mat object-cover',
                    // Measured boxes. Mobile matches the source's own ratio, so
                    // nothing is cropped there; desktop trims ~4% off a 2.33:1
                    // photograph, exactly as the bar does.
                    'aspect-[349/513] md:aspect-[1344/553]'
                  )}
                />
              </picture>
            </li>
          ))}
        </ul>

        {/* Overlay layer — one for the whole band, inset to the snapped
            slide's box. `pointer-events-none` so it never eats a swipe. */}
        <div className="pointer-events-none absolute inset-y-0 left-[var(--hero-inset)] right-[var(--hero-inset)]">
          {/* Deliberately NO scrim. The bar puts none under its pill and one
              is visible in a side-by-side: it greys the bottom of a
              photograph that is the whole point of the band. Legibility comes
              from the pill's own 2px white border, which is what the bar
              relies on too. A photograph that needs a scrim is the wrong
              photograph for this slot. */}

          {/* The one call to action. The same outline pill as every other
              secondary CTA on the page, retinted because it sits on an image
              rather than on the page. */}
          <Link
            to="/posters"
            data-testid="home-hero-cta"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              // `font-normal`, not the variant's `font-medium`: their measured
              // button sets its label at the body weight, which is what
              // `size: 'pill'` encodes and what this shape is.
              'pointer-events-auto absolute font-normal uppercase tracking-wide',
              // 1px, not the system's `--border-button` 2px. Measured: their
              // standard buttons sit on white and carry 2px, but the hero pill
              // sits on a photograph and carries 1 — and at this size the
              // difference is visible side by side.
              'border-[length:1px] border-white text-white before:bg-white hover:text-foreground',
              // Mobile: spans the slide, 20px in, 10px off the bottom.
              'inset-x-5 bottom-2.5 h-10',
              // Desktop: 230 x 45, 60px off the slide's right and bottom edge.
              'md:inset-x-auto md:bottom-[60px] md:right-[60px] md:h-[45px] md:px-14'
            )}
          >
            Shop All Art
          </Link>

          {loop && (
            <>
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() => advance(-1)}
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'icon' }),
                  'pointer-events-auto absolute left-6 top-1/2 hidden -translate-y-1/2 md:inline-flex',
                  'border-white/80 text-white before:bg-white hover:text-foreground',
                  // Invisible at rest, exactly as the bar is. Hover or keyboard
                  // focus is the whole reveal.
                  'opacity-0 transition-opacity duration-200',
                  'group-hover/hero:opacity-100 focus-visible:opacity-100'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() => advance(1)}
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'icon' }),
                  'pointer-events-auto absolute right-6 top-1/2 hidden -translate-y-1/2 md:inline-flex',
                  'border-white/80 text-white before:bg-white hover:text-foreground',
                  'opacity-0 transition-opacity duration-200',
                  'group-hover/hero:opacity-100 focus-visible:opacity-100'
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default HomeHero
