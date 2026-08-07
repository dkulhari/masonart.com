/**
 * The home page's Customer Reviews band.
 *
 * The band is a port of mesonart's Loox `dynamic-carousel` widget, and the bar
 * is `docs/design/mesonart/home-reviews-band-measured-spec.md` — measurements
 * read off the live widget's shadow root, not off a screenshot.
 *
 * Five things here are load-bearing:
 *
 *   1. TWO TRACKS, ONE INDEX. The band is a fixed blush plate that quote cards
 *      translate through, beside a strip of media tiles two-at-a-time. Both
 *      move off one integer. The first implementation interleaved cards and
 *      tiles into a single scroll-snap rail, which is a different band; these
 *      tests exist so that cannot come back.
 *
 *   2. SUPPRESSION. The whole section returns null below ten approved reviews,
 *      and when `averageRating` is null however many there are. Not a
 *      placeholder, not a zero. Nine people are not a rating, and a synthetic
 *      "0.0" on the home page reads as "rated badly" where absent reads as "not
 *      yet rated", which is the truth. Seed data currently holds twelve
 *      approved reviews, so the live margin is two.
 *
 *   3. The threshold is the SAME NUMBER the /reviews aggregate uses. Two
 *      surfaces disagreeing about when a rating becomes printable is two
 *      designs, not one system, so the constant is pinned here.
 *
 *   4. THE REAL AGGREGATE. mesonart's band prints "9000+ Score 4.9/ 5.0" and
 *      its own star `<title>` says "4.9 rating (7000 reviews)" — the label is
 *      hardcoded and disagrees with the widget beside it. Ours prints what the
 *      catalogue actually holds.
 *
 *   5. AUTOPLAY IS OPTIONAL, ALWAYS. It does not start under
 *      `prefers-reduced-motion`, and it stops while a pointer is over the band
 *      or the keyboard is inside it.
 *
 * jsdom does no layout, which the band is built not to care about: the tracks
 * step by percentages of their own width, so the transform is assertable as a
 * string with no geometry stubbing at all.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  CustomerReviewsSection,
  CustomerReviewsStrip,
  MIN_REVIEWS_FOR_HOME_STRIP,
  MAX_BODY_CHARACTERS,
  AUTOPLAY_DELAY_MS,
  TILES_PER_VIEW,
  buildReviewsRail,
  bulletWindow,
  tileIndex,
  truncateBody,
  formatAuthorName,
} from '~/components/home/CustomerReviewsSection'
import { MIN_REVIEWS_FOR_AGGREGATE } from '~/routes/reviews'
import type { ReviewFeedItem, ReviewMediaItem } from '~/lib/api'

// ============================================================================
// Mocks — the connected component only
// ============================================================================

const catalogueReviewStats = vi.fn()
const useReviewFeed = vi.fn()

vi.mock('~/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/api')>()
  return {
    ...actual,
    productsApi: {
      ...actual.productsApi,
      catalogueReviewStats: (...args: unknown[]) =>
        catalogueReviewStats(...args),
    },
  }
})

vi.mock('~/hooks/useReviews', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/hooks/useReviews')>()
  return {
    ...actual,
    useReviewFeed: (...args: unknown[]) => useReviewFeed(...args),
  }
})

// ============================================================================
// Fixtures
// ============================================================================

function makeMedia(overrides: Partial<ReviewMediaItem> = {}): ReviewMediaItem {
  return {
    id: 'media-1',
    reviewId: 'rev-1',
    mediaType: 'image',
    url: 'https://cdn.test/photo.jpg',
    thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
    posterUrl: null,
    durationSeconds: null,
    width: 900,
    height: 1200,
    sortOrder: 0,
    ...overrides,
  }
}

function makeReview(overrides: Partial<ReviewFeedItem> = {}): ReviewFeedItem {
  return {
    id: 'rev-1',
    productId: 'prod-1',
    rating: 5,
    title: 'Frames beautifully',
    content:
      'The paper stock is heavier than I expected and the print is crisp.',
    createdAt: '2026-07-14T09:30:00.000Z',
    updatedAt: '2026-07-14T09:30:00.000Z',
    author: { id: 'user-1', name: 'Ananya Rao' },
    verified: true,
    itemType: {
      sizeLabel: '24"Hx 20"W/ 61x 51 CM',
      frameName: 'Stretch+Black Frame',
      frameType: 'stretched',
    },
    product: {
      id: 'prod-1',
      title: 'Kyoto Rain',
      slug: 'kyoto-rain',
      sku: 'KR001',
      imageUrl: 'https://cdn.test/kyoto.webp',
    },
    media: [],
    ...overrides,
  }
}

/** `count` reviews, none of which carry media. */
function makeReviews(count: number): ReviewFeedItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeReview({
      id: `rev-${i + 1}`,
      title: `Review ${i + 1}`,
      author: { id: `user-${i + 1}`, name: `Reviewer ${i + 1}` },
    })
  )
}

/** `count` reviews, every one of them carrying a photograph. */
function makeReviewsWithMedia(count: number): ReviewFeedItem[] {
  return makeReviews(count).map((review, i) => ({
    ...review,
    media: [makeMedia({ id: `media-${i + 1}`, reviewId: review.id })],
  }))
}

/** Force `(prefers-reduced-motion: reduce)` to answer `matches`. */
function stubReducedMotion(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        void listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        void listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

const originalMatchMedia = window.matchMedia

/**
 * The band, mounted with enough reviews to clear the suppression rule.
 *
 * `reviewCount` is the CATALOGUE total, not the length of the page handed to
 * the band — a two-slide fixture still describes a catalogue of hundreds.
 */
function renderStrip(
  reviews: ReviewFeedItem[],
  averageRating = 4.7,
  reviewCount = Math.max(reviews.length, MIN_REVIEWS_FOR_HOME_STRIP)
) {
  return render(
    <CustomerReviewsStrip
      averageRating={averageRating}
      reviewCount={reviewCount}
      reviews={reviews}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  cleanup()
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
})

// ============================================================================
// Suppression
// ============================================================================

describe('the suppression rule', () => {
  it('uses the same threshold as the /reviews aggregate', () => {
    // One system, not two. If either surface moves, this fails.
    expect(MIN_REVIEWS_FOR_HOME_STRIP).toBe(10)
    expect(MIN_REVIEWS_FOR_HOME_STRIP).toBe(MIN_REVIEWS_FOR_AGGREGATE)
  })

  it('renders nothing at all below ten approved reviews', () => {
    // Not a placeholder and not a zero — the entire section goes.
    const { container } = render(
      <CustomerReviewsStrip
        averageRating={4.8}
        reviewCount={MIN_REVIEWS_FOR_HOME_STRIP - 1}
        reviews={makeReviews(9)}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no average to print', () => {
    // `null` means "nothing to average". Coalescing it to 0 prints "0.0",
    // which reads as a bad rating rather than an absent one.
    const { container } = render(
      <CustomerReviewsStrip
        averageRating={null}
        reviewCount={4000}
        reviews={makeReviews(12)}
      />
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('0.0')).toBeNull()
  })

  it('renders nothing when the feed came back empty', () => {
    const { container } = render(
      <CustomerReviewsStrip averageRating={4.8} reviewCount={4000} reviews={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

// ============================================================================
// The score band
// ============================================================================

describe('the score band', () => {
  it('prints the catalogue aggregate, never their hardcoded number', () => {
    renderStrip(makeReviews(12), 4.7)

    const score = screen.getByTestId('home-reviews-score')
    expect(score).toHaveTextContent('4.7')
    expect(score).toHaveTextContent('12 reviews')
    // Theirs says "9000+ Score 4.9/ 5.0" over a widget titled "4.9 rating
    // (7000 reviews)". We copy the shape and not the fiction.
    expect(score).not.toHaveTextContent('9000+')
    expect(score).not.toHaveTextContent('4.9')
  })

  it('keeps their "Score x.x/ 5.0" phrasing beside the real number', () => {
    renderStrip(makeReviews(12), 4.5)
    expect(screen.getByTestId('home-reviews-score')).toHaveTextContent(
      'Score 4.5/ 5.0'
    )
  })

  it('heads the band the way the reference does', () => {
    renderStrip(makeReviews(12))
    expect(
      screen.getByRole('heading', { name: 'Customer Reviews' })
    ).toBeInTheDocument()
  })

  it('puts View All at the far end of the header row', () => {
    renderStrip(makeReviews(12))

    const link = screen.getByRole('link', { name: /view all/i })
    expect(link).toHaveAttribute('href', '/reviews')
    expect(screen.getByTestId('home-reviews-header').className).toContain(
      'justify-between'
    )
  })
})

// ============================================================================
// The rail model
// ============================================================================

describe('buildReviewsRail', () => {
  it('quotes every review and tiles only the ones with photographs', () => {
    // NOT an interleave. The two tracks are different lengths on purpose:
    // every customer can be quoted, only some sent a photo.
    const reviews = [
      makeReview({ id: 'a', media: [makeMedia({ id: 'm-a' })] }),
      makeReview({ id: 'b' }),
      makeReview({ id: 'c', media: [makeMedia({ id: 'm-c' })] }),
    ]

    const rail = buildReviewsRail(reviews)

    expect(rail.quotes.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(rail.tiles.map((t) => t.review.id)).toEqual(['a', 'c'])
  })

  it('takes one tile per review, however many photos they sent', () => {
    // One frame per customer. Six photos from one reviewer would otherwise
    // take the whole strip.
    const rail = buildReviewsRail([
      makeReview({
        id: 'a',
        media: [makeMedia({ id: 'm-1' }), makeMedia({ id: 'm-2' })],
      }),
    ])

    expect(rail.tiles).toHaveLength(1)
    expect(rail.tiles[0].media.id).toBe('m-1')
  })

  it('pages over the longer of the two tracks', () => {
    const rail = buildReviewsRail(makeReviews(7))
    expect(rail.pageCount).toBe(7)
  })
})

describe('tileIndex', () => {
  it('keeps the strip in lockstep with the quotes', () => {
    expect(tileIndex(0, 10)).toBe(0)
    expect(tileIndex(3, 10)).toBe(3)
  })

  it('holds at the last full pair rather than stepping into empty space', () => {
    // Five tiles, two visible: the furthest honest position is 3.
    expect(tileIndex(4, 5)).toBe(3)
    expect(tileIndex(9, 5)).toBe(3)
  })

  it('never goes negative when there is nothing to show', () => {
    expect(tileIndex(2, 0)).toBe(0)
    expect(tileIndex(2, 1)).toBe(0)
  })

  it('shows two tiles at a time, as the widget is configured to', () => {
    expect(TILES_PER_VIEW).toBe(2)
  })
})

// ============================================================================
// The two tracks
// ============================================================================

describe('the two tracks', () => {
  it('renders one quote card per review and one tile per photo', () => {
    const reviews = [
      ...makeReviewsWithMedia(4),
      ...makeReviews(8).map((r) => ({ ...r, id: `text-${r.id}` })),
    ]
    renderStrip(reviews)

    expect(screen.getAllByTestId('home-review-card')).toHaveLength(12)
    expect(screen.getAllByTestId('home-review-media')).toHaveLength(4)
  })

  it('steps the quote track one whole plate at a time', () => {
    renderStrip(makeReviews(12))

    const track = screen.getByTestId('home-reviews-quote-track')
    expect(track).toHaveStyle({ transform: 'translateX(calc(0 * -100%))' })

    fireEvent.click(screen.getByRole('button', { name: /next review/i }))
    expect(track).toHaveStyle({ transform: 'translateX(calc(1 * -100%))' })
  })

  it('steps the media track one tile — half a viewport plus half the gap', () => {
    renderStrip(makeReviewsWithMedia(12))

    const track = screen.getByTestId('home-reviews-media-track')
    fireEvent.click(screen.getByRole('button', { name: /next review/i }))

    expect(track).toHaveStyle({
      transform: 'translateX(calc(var(--step) * -1 * 1))',
    })
  })

  it('holds the strip still once it runs out of tiles', () => {
    // Twelve quotes, three photos: the strip parks at 1 and the words carry on.
    const reviews = makeReviews(12).map((review, i) =>
      i < 3 ? { ...review, media: [makeMedia({ id: `m-${i}` })] } : review
    )
    renderStrip(reviews)

    const next = screen.getByRole('button', { name: /next review/i })
    fireEvent.click(next)
    fireEvent.click(next)
    fireEvent.click(next)

    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(3 * -100%))',
    })
    expect(screen.getByTestId('home-reviews-media-track')).toHaveStyle({
      transform: 'translateX(calc(var(--step) * -1 * 1))',
    })
  })

  it('is a grid of plate and strip, not one scrolling rail', () => {
    // The shipped band was `overflow-x-auto snap-x snap-mandatory`. That is a
    // different composition and it is not to come back.
    renderStrip(makeReviewsWithMedia(12))

    const rail = screen.getByTestId('home-reviews-rail')
    expect(rail.className).toContain('lg:grid-cols-[384px_minmax(0,1fr)]')
    expect(rail.className).not.toContain('overflow-x-auto')
    expect(rail.className).not.toContain('snap-x')
  })

  it('paints the blush on the plate, which never moves', () => {
    renderStrip(makeReviews(12))

    const plate = screen.getByTestId('home-reviews-plate')
    // Measured `rgb(246 239 236)` — the widget's own, not the old #f6ebe6.
    expect(plate.className).toContain('bg-[#f6efec]')
    expect(plate.className).toContain('rounded-[40px]')
    expect(plate.className).toContain('overflow-hidden')
  })

  it('hides the cards parked off-plate from assistive tech', () => {
    renderStrip(makeReviews(12))

    const cards = screen.getAllByTestId('home-review-card')
    expect(cards[0]).not.toHaveAttribute('aria-hidden')
    expect(cards[1]).toHaveAttribute('aria-hidden', 'true')
  })
})

// ============================================================================
// The quote card
// ============================================================================

describe('a quote card', () => {
  it('hangs the quote glyph off the plate corner', () => {
    renderStrip(makeReviews(12))

    // Measured at -8,-8 against the plate — it overlaps the corner rather
    // than sitting inside the padding, which means it must live OUTSIDE the
    // plate's `overflow-hidden` or the rounded corner cuts it into half-discs.
    const plate = screen.getByTestId('home-reviews-plate')
    const glyph = screen
      .getByTestId('home-reviews-rail')
      .querySelector('svg[viewBox="0 0 54 38"]')
    expect(glyph).not.toBeNull()
    expect(plate.contains(glyph)).toBe(false)
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
    expect(glyph?.getAttribute('class')).toContain('-left-2')
    expect(glyph?.getAttribute('class')).toContain('-top-2')
  })

  it('draws the stars in the widget orange, not the page amber', () => {
    renderStrip(makeReviews(12))
    expect(screen.getAllByTestId('home-review-stars')[0].innerHTML).toContain(
      '#ff8d00'
    )
  })

  it('floors the sign-off instead of letting it float with the copy', () => {
    // `auto 1fr auto`. With three auto rows a short review pushes the name
    // into the middle of the plate, and since the band steps between reviews
    // of different lengths the name then jumps on every advance.
    renderStrip(makeReviews(12))
    expect(screen.getAllByTestId('home-review-card')[0].className).toContain(
      'grid-rows-[auto_1fr_auto]'
    )
  })

  it('sets the card stars at the reference 24px, not the 20px default', () => {
    renderStrip(makeReviews(12))
    const star = screen
      .getAllByTestId('home-review-stars')[0]
      .querySelector('span[aria-hidden="true"]') as HTMLElement | null
    expect(star?.style.width).toBe('24px')
    expect(star?.style.height).toBe('24px')
  })

  it('draws an empty star as a hollow outline in the same hue, never grey', () => {
    // A cool-grey unfilled star is the loudest wrong note on an otherwise
    // entirely warm band, and it is what the shared StarRating renders.
    renderStrip([makeReview({ rating: 3 }), ...makeReviews(11)])

    const row = screen.getAllByTestId('home-review-stars')[0]
    const slots = row.querySelectorAll('span[aria-hidden="true"]')
    expect(slots).toHaveLength(5)
    // Three filled slots carry a second, solid svg; the empty two do not.
    expect(row.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(3)
    expect(slots[4].querySelectorAll('svg')).toHaveLength(1)
    expect(row.className + slots[0].className).toContain('#ff8d00')
  })

  it('half-fills a fractional aggregate rather than rounding it', () => {
    renderStrip(makeReviews(12), 4.5)

    const solid = screen
      .getByTestId('home-reviews-score')
      .querySelectorAll('svg[fill="currentColor"]')
    expect(solid).toHaveLength(5)
    expect((solid[4] as SVGElement).style.clipPath).toBe('inset(0 50% 0 0)')
  })

  it('leaves a short review alone', () => {
    const short = 'Beautiful print, arrived early.'
    renderStrip([makeReview({ content: short }), ...makeReviews(11)])
    expect(screen.getAllByTestId('home-review-body')[0]).toHaveTextContent(short)
  })

  it('cuts a long review to the widget cap', () => {
    const long = `${'word '.repeat(80)}end`
    renderStrip([makeReview({ content: long }), ...makeReviews(11)])

    const body = screen.getAllByTestId('home-review-body')[0].textContent ?? ''
    expect(body.length).toBeLessThanOrEqual(MAX_BODY_CHARACTERS + 1)
    expect(body.endsWith('…')).toBe(true)
  })

  it('signs off bottom-right with the verified check', () => {
    renderStrip([
      makeReview({ author: { id: 'u', name: 'Daniel Norris' }, verified: true }),
      ...makeReviews(11),
    ])

    const author = screen.getAllByTestId('home-review-author')[0]
    expect(author).toHaveTextContent('Daniel N.')
    expect(author.className).toContain('justify-end')
    expect(screen.getAllByTestId('home-review-verified')[0]).toBeInTheDocument()
  })

  it('drops the check when the purchase was not verified', () => {
    renderStrip([makeReview({ verified: false }), ...makeReviews(11)])
    // The other eleven fixtures ARE verified — scope to the card in question.
    const first = screen.getAllByTestId('home-review-card')[0]
    expect(
      first.querySelector('[data-testid="home-review-verified"]')
    ).toBeNull()
  })

  it('survives a review whose author was deleted', () => {
    renderStrip([makeReview({ author: null }), ...makeReviews(11)])
    expect(screen.getAllByTestId('home-review-author')[0]).toHaveTextContent(
      'Verified customer'
    )
  })
})

describe('truncateBody', () => {
  it('cuts on a word boundary rather than mid-word', () => {
    const text = `${'alpha '.repeat(40)}omega`
    const cut = truncateBody(text)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/alph…$/)
  })

  it('still cuts a long run with no spaces in it', () => {
    const cut = truncateBody('x'.repeat(300))
    expect(cut.length).toBe(MAX_BODY_CHARACTERS + 1)
  })
})

describe('formatAuthorName', () => {
  it('prints a first name and a last initial', () => {
    expect(formatAuthorName('Daniel Norris')).toBe('Daniel N.')
  })

  it('leaves a single-part name alone', () => {
    expect(formatAuthorName('Daniel')).toBe('Daniel')
  })

  it('falls back when the account is gone', () => {
    expect(formatAuthorName(null)).toBe('Verified customer')
    expect(formatAuthorName('   ')).toBe('Verified customer')
  })
})

// ============================================================================
// Media tiles
// ============================================================================

describe('a media tile', () => {
  it('shows the thumbnail, lazily', () => {
    renderStrip(makeReviewsWithMedia(12))

    const photo = screen.getAllByTestId('home-review-photo')[0]
    expect(photo).toHaveAttribute('src', 'https://cdn.test/photo-thumb.jpg')
    expect(photo).toHaveAttribute('loading', 'lazy')
  })

  it('costs a poster frame and nothing else for a clip', () => {
    const reviews = makeReviews(12).map((review, i) =>
      i === 0
        ? {
            ...review,
            media: [
              makeMedia({
                mediaType: 'video',
                url: 'https://cdn.test/clip.mp4',
                posterUrl: 'https://cdn.test/clip-poster.jpg',
              }),
            ],
          }
        : review
    )
    renderStrip(reviews)

    const video = screen.getByTestId('home-review-video')
    expect(video).toHaveAttribute('poster', 'https://cdn.test/clip-poster.jpg')
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).not.toHaveAttribute('autoplay')
    expect(screen.getByTestId('home-review-play')).toBeInTheDocument()
  })

  it('carries no words, so it announces itself', () => {
    renderStrip(makeReviewsWithMedia(12))

    const tile = screen.getAllByTestId('home-review-media')[0]
    expect(tile).toHaveTextContent('')
    expect(tile.getAttribute('aria-label')).toMatch(
      /Photo from Reviewer 1\., who rated Kyoto Rain 5 out of 5/
    )
  })

  it('rounds every tile to the widget radius', () => {
    renderStrip(makeReviewsWithMedia(12))
    expect(screen.getAllByTestId('home-review-media')[0].className).toContain(
      'rounded-[40px]'
    )
  })
})

// ============================================================================
// Controls
// ============================================================================

describe('the arrows', () => {
  it('steps forward and back', () => {
    renderStrip(makeReviews(12))
    const track = screen.getByTestId('home-reviews-quote-track')

    fireEvent.click(screen.getByRole('button', { name: /next review/i }))
    expect(track).toHaveStyle({ transform: 'translateX(calc(1 * -100%))' })

    fireEvent.click(screen.getByRole('button', { name: /previous review/i }))
    expect(track).toHaveStyle({ transform: 'translateX(calc(0 * -100%))' })
  })

  it('wraps at both ends, the way theirs loops', () => {
    renderStrip(makeReviews(3))
    const track = screen.getByTestId('home-reviews-quote-track')

    fireEvent.click(screen.getByRole('button', { name: /previous review/i }))
    expect(track).toHaveStyle({ transform: 'translateX(calc(2 * -100%))' })

    fireEvent.click(screen.getByRole('button', { name: /next review/i }))
    expect(track).toHaveStyle({ transform: 'translateX(calc(0 * -100%))' })
  })
})

describe('bulletWindow', () => {
  it('shows nothing when there is nowhere to go', () => {
    expect(bulletWindow(0, 1)).toEqual([])
    expect(bulletWindow(0, 0)).toEqual([])
  })

  it('keeps five bullets, shrinking the outermost pair', () => {
    // Their dynamic pagination, measured: 5px, the 24px pill, 8px, 8px, 5px.
    const bullets = bulletWindow(1, 21)
    expect(bullets.map((b) => b.size)).toEqual([
      'medium',
      'active',
      'large',
      'large',
      'medium',
    ])
    expect(bullets.map((b) => b.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('clamps the window at the end of the list', () => {
    const bullets = bulletWindow(20, 21)
    expect(bullets.map((b) => b.index)).toEqual([16, 17, 18, 19, 20])
    expect(bullets[4].size).toBe('active')
  })

  it('never renders more bullets than there are pages', () => {
    expect(bulletWindow(0, 3)).toHaveLength(3)
  })
})

describe('the bullets', () => {
  it('marks the active one and jumps on click', () => {
    renderStrip(makeReviews(12))

    const dots = screen.getAllByTestId('home-reviews-dot')
    expect(dots).toHaveLength(5)
    expect(dots[0]).toHaveAttribute('data-active', 'true')

    fireEvent.click(dots[2])
    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(2 * -100%))',
    })
  })

  it('sits under the band, left-aligned like theirs', () => {
    renderStrip(makeReviews(12))
    // Measured 64px in from the content edge, not centred.
    const dots = screen.getByTestId('home-reviews-dots')
    expect(dots.className).toContain('lg:pl-16')
    expect(dots.className).not.toContain('justify-center')
  })
})

// ============================================================================
// Autoplay
// ============================================================================

describe('autoplay', () => {
  it('advances one step every five seconds', () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
    renderStrip(makeReviews(12))

    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS)
    })

    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(1 * -100%))',
    })
  })

  it('wraps back to the first quote at the end', () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
    renderStrip(makeReviews(2))

    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 2)
    })

    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(0 * -100%))',
    })
  })

  it('never starts under prefers-reduced-motion', () => {
    vi.useFakeTimers()
    stubReducedMotion(true)
    renderStrip(makeReviews(12))

    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 3)
    })

    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(0 * -100%))',
    })
  })

  it('stops while the pointer is over the band', () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
    renderStrip(makeReviews(12))

    const region = screen.getByTestId('home-reviews-carousel')
    fireEvent.mouseEnter(region)
    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 2)
    })
    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(0 * -100%))',
    })

    fireEvent.mouseLeave(region)
    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS)
    })
    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(1 * -100%))',
    })
  })

  it('stops while the keyboard is inside the band', () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
    renderStrip(makeReviews(12))

    // focusin/focusout, so arrows and bullets count as "inside" too.
    fireEvent.focusIn(screen.getByRole('button', { name: /next review/i }))
    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 2)
    })
    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(0 * -100%))',
    })

    fireEvent.focusOut(screen.getByTestId('home-reviews-carousel'))
    act(() => {
      vi.advanceTimersByTime(AUTOPLAY_DELAY_MS)
    })
    expect(screen.getByTestId('home-reviews-quote-track')).toHaveStyle({
      transform: 'translateX(calc(1 * -100%))',
    })
  })

  it('clears its timer on unmount', () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
    const clearInterval = vi.spyOn(window, 'clearInterval')

    const { unmount } = renderStrip(makeReviews(12))
    unmount()

    expect(clearInterval).toHaveBeenCalled()
    clearInterval.mockRestore()
  })
})

// ============================================================================
// The connected section
// ============================================================================

describe('CustomerReviewsSection', () => {
  function renderConnected() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={client}>
        <CustomerReviewsSection />
      </QueryClientProvider>
    )
  }

  it('renders nothing while the catalogue stats are still in flight', () => {
    catalogueReviewStats.mockReturnValue(new Promise(() => {}))
    useReviewFeed.mockReturnValue({ data: undefined })

    const { container } = renderConnected()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders once the stats clear the threshold', async () => {
    catalogueReviewStats.mockResolvedValue({ averageRating: 4.6, reviewCount: 12 })
    useReviewFeed.mockReturnValue({ data: { items: makeReviewsWithMedia(12) } })

    renderConnected()

    expect(await screen.findByTestId('home-reviews')).toBeInTheDocument()
    expect(useReviewFeed).toHaveBeenCalledWith(1, 12)
  })

  it('stays silent when the catalogue is below the threshold', async () => {
    catalogueReviewStats.mockResolvedValue({ averageRating: 4.9, reviewCount: 6 })
    useReviewFeed.mockReturnValue({ data: { items: makeReviews(6) } })

    const { container } = renderConnected()
    await act(async () => {})

    expect(container).toBeEmptyDOMElement()
  })
})

// ============================================================================
// Where it is mounted
// ============================================================================

describe('the home route', () => {
  it('mounts the band after the value props and before the newsletter', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/routes/index.tsx'),
      'utf8'
    )

    const reviews = source.indexOf('<CustomerReviewsSection')
    const valueProps = source.indexOf('<ValuePropsSection')
    const newsletter = source.indexOf('<NewsletterSection')

    expect(reviews).toBeGreaterThan(valueProps)
    expect(reviews).toBeLessThan(newsletter)
  })
})
