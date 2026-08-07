/**
 * The home page's Customer Reviews band.
 *
 * Four things here are load-bearing:
 *
 *   1. SUPPRESSION. The whole section — band, heading, rail, pill — returns
 *      null below ten approved reviews, and when `averageRating` is null
 *      however many there are. Not a placeholder, not a zero. Nine people are
 *      not a rating, and a synthetic "0.0" on the home page reads as "rated
 *      badly" where absent reads as "not yet rated", which is the truth. Seed
 *      data currently holds twelve approved reviews, so the live margin is two
 *      — one reset away from mattering.
 *
 *   2. The threshold is the SAME NUMBER the /reviews aggregate uses. Two
 *      surfaces disagreeing about when a rating becomes printable is two
 *      designs, not one system, so the constant is pinned here.
 *
 *   3. THE REAL AGGREGATE. mesonart's band prints "9000+ Score 4.9/ 5.0" and
 *      its own star `<title>` says "4.9 rating (7000 reviews)" — the label is
 *      hardcoded and disagrees with the widget beside it. Ours prints what the
 *      catalogue actually holds, and the score-band tests below pin that.
 *
 *   4. AUTOPLAY IS OPTIONAL, ALWAYS. It does not start under
 *      `prefers-reduced-motion`, and it stops while a pointer is over the rail
 *      or the keyboard is inside it. An auto-advancing carousel nobody can
 *      hold still is an accessibility failure, not a parity win.
 *
 * The rail is CSS scroll-snap driven by arrows, dots and a timer — no carousel
 * dependency. jsdom does no layout, so `scrollWidth`/`clientWidth`/`scrollLeft`
 * are stubbed on the rail and a `scroll` event is fired to make the component
 * re-read them; `Element.scrollBy`/`scrollTo` do not exist in jsdom at all and
 * are stubbed too.
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
  buildReviewSlides,
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

/** `count` reviews, none of which carry media — i.e. all text slides. */
function makeReviews(count: number): ReviewFeedItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeReview({
      id: `rev-${i + 1}`,
      title: `Review ${i + 1}`,
      author: { id: `user-${i + 1}`, name: `Reviewer ${i + 1}` },
    })
  )
}

/** jsdom does no layout and has no Element.scrollBy/scrollTo — stub all three. */
function stubRailGeometry(
  rail: HTMLElement,
  { scrollLeft = 0, clientWidth = 400, scrollWidth = 1200 } = {}
) {
  Object.defineProperty(rail, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  })
  Object.defineProperty(rail, 'scrollWidth', {
    value: scrollWidth,
    configurable: true,
  })
  Object.defineProperty(rail, 'scrollLeft', {
    value: scrollLeft,
    configurable: true,
    writable: true,
  })
}

function stubScrollMethods(rail: HTMLElement) {
  const scrollBy = vi.fn()
  const scrollTo = vi.fn()
  Object.defineProperty(rail, 'scrollBy', {
    value: scrollBy,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(rail, 'scrollTo', {
    value: scrollTo,
    configurable: true,
    writable: true,
  })
  return { scrollBy, scrollTo }
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

    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the average is null, however many reviews', () => {
    // The API returns null — never 0 — when there is nothing to average.
    // Coalescing that to 0 would print "0.0" on the home page.
    const { container } = render(
      <CustomerReviewsStrip
        averageRating={null}
        reviewCount={40}
        reviews={makeReviews(6)}
      />
    )

    expect(container.innerHTML).toBe('')
    expect(container.textContent).not.toContain('0.0')
  })

  it('renders nothing when the aggregate is fine but no rows came back', () => {
    // A heading promising reviews above an empty rail is worse than silence.
    const { container } = render(
      <CustomerReviewsStrip averageRating={4.7} reviewCount={128} reviews={[]} />
    )

    expect(container.innerHTML).toBe('')
  })
})

// ============================================================================
// The score band
// ============================================================================

describe('the score band', () => {
  it('shows the score, the stars and the count once the sample is big enough', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(3)}
      />
    )

    expect(screen.getByTestId('home-reviews-score')).toBeTruthy()
    expect(screen.getByText('4.7')).toBeTruthy()
    expect(screen.getByText(/128 reviews/i)).toBeTruthy()
    // Same star row the /reviews aggregate uses.
    expect(screen.getByRole('img', { name: /4\.7 out of 5 stars/i })).toBeTruthy()
  })

  it('prints the real aggregate rather than mesonart’s hardcoded one', () => {
    // Their band says "9000+ Score 4.9/ 5.0" while its own star title says
    // "4.9 rating (7000 reviews)". Ours says what the catalogue holds.
    render(
      <CustomerReviewsStrip
        averageRating={4.5}
        reviewCount={12}
        reviews={makeReviews(3)}
      />
    )

    const score = screen.getByTestId('home-reviews-score')
    expect(score.textContent).toContain('4.5')
    expect(score.textContent).toContain('12 reviews')
    expect(score.textContent).not.toContain('9000')
    expect(score.textContent).not.toContain('4.9')
  })
})

// ============================================================================
// Slide composition
// ============================================================================

describe('the slide list', () => {
  it('turns a review with media into a media slide and one without into text', () => {
    const slides = buildReviewSlides([
      makeReview({ id: 'a', media: [] }),
      makeReview({ id: 'b', media: [makeMedia()] }),
    ])

    expect(slides.map((slide) => slide.kind)).toEqual(['text', 'media'])
    expect(slides[0].review.id).toBe('a')
    expect(slides[1].review.id).toBe('b')
  })

  it('alternates rather than grouping all the text then all the media', () => {
    // mesonart's band reads text, photo, text, photo across the rail. Grouping
    // would put every quote card off the right-hand edge on first paint.
    const slides = buildReviewSlides([
      makeReview({ id: 't1', media: [] }),
      makeReview({ id: 't2', media: [] }),
      makeReview({ id: 'm1', media: [makeMedia({ id: 'md1' })] }),
      makeReview({ id: 'm2', media: [makeMedia({ id: 'md2' })] }),
    ])

    expect(slides.map((slide) => slide.kind)).toEqual([
      'text',
      'media',
      'text',
      'media',
    ])
  })

  it('keeps the leftovers when one kind runs out', () => {
    const slides = buildReviewSlides([
      makeReview({ id: 't1', media: [] }),
      makeReview({ id: 't2', media: [] }),
      makeReview({ id: 't3', media: [] }),
      makeReview({ id: 'm1', media: [makeMedia()] }),
    ])

    expect(slides).toHaveLength(4)
    expect(slides.map((slide) => slide.kind)).toEqual([
      'text',
      'media',
      'text',
      'text',
    ])
  })

  it('renders both kinds into the rail, tagged for what they are', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={[
          makeReview({ id: 'a', media: [] }),
          makeReview({ id: 'b', media: [makeMedia()] }),
        ]}
      />
    )

    const rail = screen.getByTestId('home-reviews-rail')
    const kinds = Array.from(rail.children).map((li) =>
      li.getAttribute('data-slide')
    )
    expect(kinds).toEqual(['text', 'media'])
    expect(screen.getAllByTestId('home-review-card')).toHaveLength(1)
    expect(screen.getAllByTestId('home-review-media')).toHaveLength(1)
  })

  it('is a scroll-snap rail rather than a carousel widget', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(4)}
      />
    )

    const rail = screen.getByTestId('home-reviews-rail')
    expect(rail.className).toContain('overflow-x-auto')
    expect(rail.className).toContain('snap-x')
    expect(rail.className).toContain('snap-mandatory')
  })

  it('rounds every slide to the widget’s corner-radius="40"', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={[
          makeReview({ id: 'a', media: [] }),
          makeReview({ id: 'b', media: [makeMedia()] }),
        ]}
      />
    )

    expect(screen.getByTestId('home-review-card').className).toContain(
      'rounded-[40px]'
    )
    expect(screen.getByTestId('home-review-media').className).toContain(
      'rounded-[40px]'
    )
  })
})

// ============================================================================
// The quote card
// ============================================================================

describe('the quote card', () => {
  function renderCard(overrides: Partial<ReviewFeedItem> = {}) {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={[makeReview({ media: [], ...overrides })]}
      />
    )
    return screen.getByTestId('home-review-card')
  }

  it('carries the serif quote mark mesonart sets above the words', () => {
    renderCard()
    // Decorative: it must not be read out as a stray double-quote.
    const mark = screen.getByTestId('home-review-quote-mark')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
  })

  it('sits on the blush plate rather than a plain white card', () => {
    const card = renderCard()
    expect(card.className).toContain('bg-[#f6ebe6]')
  })

  it('rates the review in the widget’s orange, not the page amber', () => {
    renderCard({ rating: 5 })
    const stars = screen.getByTestId('home-review-stars')
    expect(stars.innerHTML).toContain('#ff8d00')
  })

  it('prints the body untouched when it is under the character cap', () => {
    const content = 'Short and sweet.'
    renderCard({ content })

    expect(screen.getByTestId('home-review-body').textContent).toBe(content)
  })

  it('truncates a body longer than the widget’s max-characters="180"', () => {
    const content = `${'word '.repeat(60)}end`
    renderCard({ content })

    const body = screen.getByTestId('home-review-body').textContent ?? ''
    expect(body.length).toBeLessThanOrEqual(MAX_BODY_CHARACTERS + 1)
    expect(body.endsWith('…')).toBe(true)
    expect(body).not.toContain('end')
  })

  it('signs off "Firstname L." with the verified check, bottom-right', () => {
    renderCard({ author: { id: 'u', name: 'Daniel Newton' }, verified: true })

    const author = screen.getByTestId('home-review-author')
    expect(author.textContent).toContain('Daniel N.')
    expect(screen.getByTestId('home-review-verified')).toBeTruthy()
    // Bottom-right is the whole point of the sign-off's placement.
    expect(author.className).toContain('justify-end')
  })

  it('drops the check on a review that is not a verified purchase', () => {
    renderCard({ verified: false })

    expect(screen.queryByTestId('home-review-verified')).toBeNull()
  })

  it('survives a review whose author account is gone', () => {
    renderCard({ author: null })

    // `author` is nullable — the review outlives the account.
    expect(screen.getByTestId('home-review-card')).toBeTruthy()
    expect(screen.getByText(/verified customer/i)).toBeTruthy()
  })

  it('formats names the way the reference prints them', () => {
    expect(formatAuthorName('Daniel Newton')).toBe('Daniel N.')
    expect(formatAuthorName('Ananya Rao')).toBe('Ananya R.')
    expect(formatAuthorName('Prince')).toBe('Prince')
    expect(formatAuthorName('  ')).toBe('Verified customer')
    expect(formatAuthorName(null)).toBe('Verified customer')
  })

  it('truncates on a word boundary rather than mid-word', () => {
    const long = `${'alpha '.repeat(40)}omega`
    const cut = truncateBody(long)

    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toContain('alph…')
    expect(truncateBody('tiny')).toBe('tiny')
  })
})

// ============================================================================
// The media tile
// ============================================================================

describe('the media tile', () => {
  function renderMedia(media: ReviewMediaItem) {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={[makeReview({ media: [media] })]}
      />
    )
    return screen.getByTestId('home-review-media')
  }

  it('renders a photo from its thumbnail, lazily', () => {
    renderMedia(makeMedia())

    const photo = screen.getByTestId('home-review-photo') as HTMLImageElement
    expect(photo.getAttribute('src')).toBe('https://cdn.test/photo-thumb.jpg')
    expect(photo.getAttribute('loading')).toBe('lazy')
  })

  it('renders a clip as a poster frame — no autoplay, no preload', () => {
    // Non-negotiable, same rule as the grid: a rail of clips that preload
    // themselves is tens of megabytes before anyone asks for one.
    renderMedia(
      makeMedia({
        mediaType: 'video',
        url: 'https://cdn.test/clip.mp4',
        posterUrl: 'https://cdn.test/clip-poster.jpg',
      })
    )

    const video = screen.getByTestId('home-review-video') as HTMLVideoElement
    expect(video.getAttribute('poster')).toBe('https://cdn.test/clip-poster.jpg')
    expect(video.getAttribute('preload')).toBe('none')
    expect(video.hasAttribute('autoplay')).toBe(false)
  })

  it('says nothing in words — the tile is media only', () => {
    const tile = renderMedia(makeMedia())

    expect(tile.textContent).toBe('')
    // It still has to announce itself to a screen reader.
    expect(tile.getAttribute('aria-label')).toMatch(/Ananya R\./)
  })
})

// ============================================================================
// Arrows
// ============================================================================

describe('the arrow buttons', () => {
  function setup() {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(8)}
      />
    )

    const rail = screen.getByTestId('home-reviews-rail')
    const { scrollBy } = stubScrollMethods(rail)

    const left = screen.getByRole('button', {
      name: /scroll left/i,
    }) as HTMLButtonElement
    const right = screen.getByRole('button', {
      name: /scroll right/i,
    }) as HTMLButtonElement

    return { rail, scrollBy, left, right }
  }

  it('scrolls the rail forward when the right arrow is pressed', () => {
    const { rail, scrollBy, right } = setup()
    stubRailGeometry(rail)
    fireEvent.scroll(rail)

    fireEvent.click(right)

    expect(scrollBy).toHaveBeenCalledTimes(1)
    const [args] = scrollBy.mock.calls[0]
    expect(args.left).toBeGreaterThan(0)
    expect(args.behavior).toBe('smooth')
  })

  it('scrolls the rail backward when the left arrow is pressed', () => {
    const { rail, scrollBy, left } = setup()
    stubRailGeometry(rail, { scrollLeft: 600 })
    fireEvent.scroll(rail)

    fireEvent.click(left)

    expect(scrollBy).toHaveBeenCalledTimes(1)
    const [args] = scrollBy.mock.calls[0]
    expect(args.left).toBeLessThan(0)
  })

  it('disables the left arrow at the start and the right arrow at the end', () => {
    const { rail, left, right } = setup()

    stubRailGeometry(rail, { scrollLeft: 0 })
    fireEvent.scroll(rail)
    expect(left.disabled).toBe(true)
    expect(right.disabled).toBe(false)

    // Mid-rail: both live.
    stubRailGeometry(rail, { scrollLeft: 300 })
    fireEvent.scroll(rail)
    expect(left.disabled).toBe(false)
    expect(right.disabled).toBe(false)

    // scrollWidth - clientWidth = 800, i.e. the far end.
    stubRailGeometry(rail, { scrollLeft: 800 })
    fireEvent.scroll(rail)
    expect(left.disabled).toBe(false)
    expect(right.disabled).toBe(true)
  })
})

// ============================================================================
// Dot pagination
// ============================================================================

describe('the dot pagination', () => {
  function setup() {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(8)}
      />
    )
    const rail = screen.getByTestId('home-reviews-rail')
    const { scrollTo } = stubScrollMethods(rail)
    return { rail, scrollTo }
  }

  it('renders one dot per page and marks the one in view', () => {
    const { rail } = setup()
    // 1200 of content through a 400 window is three pages.
    stubRailGeometry(rail)
    fireEvent.scroll(rail)

    const dots = screen.getAllByTestId('home-reviews-dot')
    expect(dots).toHaveLength(3)
    expect(dots[0].getAttribute('data-active')).toBe('true')

    stubRailGeometry(rail, { scrollLeft: 800 })
    fireEvent.scroll(rail)

    expect(
      screen
        .getAllByTestId('home-reviews-dot')
        .map((dot) => dot.getAttribute('data-active'))
    ).toEqual(['false', 'false', 'true'])
  })

  it('jumps the rail to a page when its dot is pressed', () => {
    const { rail, scrollTo } = setup()
    stubRailGeometry(rail)
    fireEvent.scroll(rail)

    fireEvent.click(screen.getAllByTestId('home-reviews-dot')[2])

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.calls[0][0].left).toBe(800)
  })
})

// ============================================================================
// Autoplay — and every way it must stop
// ============================================================================

describe('autoplay', () => {
  function setup() {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(8)}
      />
    )
    const rail = screen.getByTestId('home-reviews-rail')
    const region = screen.getByTestId('home-reviews-carousel')
    const { scrollTo } = stubScrollMethods(rail)
    stubRailGeometry(rail)
    return { rail, region, scrollTo }
  }

  function tick(ms = AUTOPLAY_DELAY_MS) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('advances the rail by a page every five seconds', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { scrollTo } = setup()

    expect(scrollTo).not.toHaveBeenCalled()
    tick()

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.calls[0][0].left).toBe(400)
  })

  it('wraps back to the first page at the end of the rail', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { rail, scrollTo } = setup()
    stubRailGeometry(rail, { scrollLeft: 800 })

    tick()

    expect(scrollTo.mock.calls[0][0].left).toBe(0)
  })

  it('never starts under prefers-reduced-motion', () => {
    stubReducedMotion(true)
    vi.useFakeTimers()
    const { scrollTo } = setup()

    tick(AUTOPLAY_DELAY_MS * 4)

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('pauses while a pointer is over the rail, and resumes when it leaves', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { region, scrollTo } = setup()

    act(() => {
      fireEvent.mouseEnter(region)
    })
    tick(AUTOPLAY_DELAY_MS * 3)
    expect(scrollTo).not.toHaveBeenCalled()

    act(() => {
      fireEvent.mouseLeave(region)
    })
    tick()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('pauses while the keyboard is inside the rail, and resumes on the way out', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { region, scrollTo } = setup()

    act(() => {
      fireEvent.focusIn(screen.getByRole('button', { name: /scroll right/i }))
    })
    tick(AUTOPLAY_DELAY_MS * 3)
    expect(scrollTo).not.toHaveBeenCalled()

    act(() => {
      fireEvent.focusOut(region)
    })
    tick()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('stops the timer when the section unmounts', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { scrollTo } = setup()

    cleanup()
    tick(AUTOPLAY_DELAY_MS * 3)

    expect(scrollTo).not.toHaveBeenCalled()
  })
})

// ============================================================================
// The header row
// ============================================================================

describe('the header row', () => {
  it('puts View All on the right of the heading, pointing at /reviews', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(3)}
      />
    )

    const header = screen.getByTestId('home-reviews-header')
    const link = screen.getByRole('link', { name: /view all/i })

    expect(header.contains(link)).toBe(true)
    expect(link.getAttribute('href')).toBe('/reviews')
    // Heading and score on the left, pill on the right — one row, two ends.
    expect(header.className).toContain('justify-between')
    expect(header.contains(screen.getByTestId('home-reviews-score'))).toBe(true)
  })
})

// ============================================================================
// The connected section
// ============================================================================

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

describe('the connected section', () => {
  it('renders nothing while the catalogue aggregate is still in flight', () => {
    // No band flash on a slow query — it resolves into existence or not at all.
    catalogueReviewStats.mockReturnValue(new Promise(() => {}))
    useReviewFeed.mockReturnValue({ data: { items: makeReviews(6) } })

    const { container } = renderConnected()

    expect(container.innerHTML).toBe('')
  })

  it('renders the strip once the aggregate clears the threshold', async () => {
    catalogueReviewStats.mockResolvedValue({
      averageRating: 4.7,
      reviewCount: 128,
    })
    useReviewFeed.mockReturnValue({ data: { items: makeReviews(6) } })

    renderConnected()

    expect(await screen.findByTestId('home-reviews-score')).toBeTruthy()
    expect(screen.getAllByTestId('home-review-card')).toHaveLength(6)
  })

  it('stays silent when the catalogue is below the threshold', async () => {
    catalogueReviewStats.mockResolvedValue({
      averageRating: 4.9,
      reviewCount: 9,
    })
    useReviewFeed.mockReturnValue({ data: { items: makeReviews(6) } })

    const { container } = renderConnected()

    // Give the query a tick to resolve — it must still render nothing.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.innerHTML).toBe('')
  })

  it('is mounted on the home page after the value props and before the newsletter', () => {
    // Source-level on purpose: this is a wiring fact about where the section
    // sits in the stack, and mesonart places reviews late — after the
    // merchandising rails, not among them.
    const home = readFileSync(
      join(process.cwd(), 'app/routes/index.tsx'),
      'utf8'
    )

    expect(home).toContain(
      "from '~/components/home/CustomerReviewsSection'"
    )

    const valueProps = home.indexOf('<ValuePropsSection />')
    const reviews = home.indexOf('<CustomerReviewsSection />')
    const newsletter = home.indexOf('<NewsletterSection />')

    expect(reviews).toBeGreaterThan(valueProps)
    expect(newsletter).toBeGreaterThan(reviews)
  })

  it('asks the feed for the first page only', async () => {
    catalogueReviewStats.mockResolvedValue({
      averageRating: 4.7,
      reviewCount: 128,
    })
    useReviewFeed.mockReturnValue({ data: { items: makeReviews(6) } })

    renderConnected()

    expect(useReviewFeed).toHaveBeenCalled()
    expect(useReviewFeed.mock.calls[0][0]).toBe(1)
  })
})
