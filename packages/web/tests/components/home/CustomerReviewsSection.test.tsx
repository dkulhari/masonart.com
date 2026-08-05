/**
 * The home page's Customer Reviews strip.
 *
 * Two things here are load-bearing:
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
 * The rail is CSS scroll-snap driven by two arrow buttons — no carousel
 * dependency. jsdom does no layout, so `scrollWidth`/`clientWidth`/`scrollLeft`
 * are stubbed on the rail and a `scroll` event is fired to make the component
 * re-read them; `Element.scrollBy` does not exist in jsdom at all and is
 * stubbed too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  CustomerReviewsSection,
  CustomerReviewsStrip,
  MIN_REVIEWS_FOR_HOME_STRIP,
} from '~/components/home/CustomerReviewsSection'
import { MIN_REVIEWS_FOR_AGGREGATE } from '~/routes/reviews'
import type { ReviewFeedItem } from '~/lib/api'

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
    author: { id: 'user-1', name: 'Ananya R' },
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

function makeReviews(count: number): ReviewFeedItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeReview({
      id: `rev-${i + 1}`,
      title: `Review ${i + 1}`,
      author: { id: `user-${i + 1}`, name: `Reviewer ${i + 1}` },
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  cleanup()
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
})

// ============================================================================
// The rail
// ============================================================================

describe('the review rail', () => {
  it('renders one card per review, with its rating, words and author', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={[makeReview(), makeReview({ id: 'rev-2', rating: 4 })]}
      />
    )

    const cards = screen.getAllByTestId('home-review-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].getAttribute('data-rating')).toBe('5')
    expect(cards[1].getAttribute('data-rating')).toBe('4')
    expect(screen.getAllByText(/paper stock is heavier/)).toHaveLength(2)
    expect(screen.getAllByText('Ananya R')).toHaveLength(2)
  })

  it('survives a review whose author account is gone', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={[makeReview({ author: null })]}
      />
    )

    // `author` is nullable — the review outlives the account.
    expect(screen.getByTestId('home-review-card')).toBeTruthy()
    expect(screen.getByText(/verified customer/i)).toBeTruthy()
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
})

// ============================================================================
// Arrows
// ============================================================================

/** jsdom does no layout and has no Element.scrollBy, so both are stubbed. */
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
    const scrollBy = vi.fn()
    Object.defineProperty(rail, 'scrollBy', {
      value: scrollBy,
      configurable: true,
      writable: true,
    })

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
// View All
// ============================================================================

describe('the View All pill', () => {
  it('points at the /reviews page', () => {
    render(
      <CustomerReviewsStrip
        averageRating={4.7}
        reviewCount={128}
        reviews={makeReviews(3)}
      />
    )

    const link = screen.getByRole('link', { name: /view all/i })
    expect(link.getAttribute('href')).toBe('/reviews')
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
