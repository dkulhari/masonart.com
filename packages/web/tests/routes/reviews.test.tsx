/**
 * The site-wide /reviews page.
 *
 * Unlike the other route suites in this directory these are real tests, not
 * source greps: the route module imports cleanly into jsdom (`createFileRoute`
 * does not need a live router at module scope), and the two things worth
 * guarding here are behaviours rather than shapes —
 *
 *   1. `validateSearch` must COERCE. `app/routes/router.tsx` overrides
 *      TanStack's search serialisation, so `?page=2` arrives as the STRING
 *      '2'. A bare `z.number()` throws inside validateSearch, the route
 *      error-boundaries, and the visitor gets a blank page rather than page 2.
 *
 *   2. The aggregate strip must stay silent on a thin sample. Below ten
 *      approved reviews the average is noise, and `averageRating: null` — what
 *      the API returns for that case — must NOT be coalesced to 0. "0.0" reads
 *      as "rated badly"; absent reads as "not yet rated", which is the truth.
 *
 * The entry-point block at the bottom is source-level on purpose: it is
 * asserting that a link exists in three separate files, which is a wiring
 * fact, not a rendering one. The header carries two independent nav trees and
 * patching only the desktop one is the classic miss.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import {
  Route,
  ReviewsAggregate,
  ReviewFeedList,
  MIN_REVIEWS_FOR_AGGREGATE,
} from '~/routes/reviews'
import type { ReviewFeedItem } from '~/lib/api'

// ============================================================================
// Fixtures
// ============================================================================

function makeReview(overrides: Partial<ReviewFeedItem> = {}): ReviewFeedItem {
  return {
    id: 'rev-1',
    productId: 'prod-1',
    rating: 5,
    title: 'Frames beautifully',
    content: 'The paper stock is heavier than I expected and the print is crisp.',
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

/** Rows render <Link>, so they need a router around them. */
function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const productRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posters/$slug',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([productRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // The provider mounts asynchronously, so every assertion below it is a
  // `findBy*` rather than a `getBy*`.
  return render(<RouterProvider router={router} />)
}

// ============================================================================
// validateSearch
// ============================================================================

describe('/reviews validateSearch', () => {
  const validate = (search: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Route.options.validateSearch as any)(search) as { page: number }

  it('coerces the string page the router hands it into a number', () => {
    // The whole reason this test exists. router.tsx serialises search params
    // as strings; `z.number()` would throw here.
    expect(validate({ page: '2' })).toEqual({ page: 2 })
  })

  it('defaults to page 1 when there is no page param', () => {
    expect(validate({})).toEqual({ page: 1 })
  })

  it('falls back to page 1 rather than throwing on junk', () => {
    // A hand-edited or stale URL must not error-boundary the page.
    expect(validate({ page: 'nonsense' })).toEqual({ page: 1 })
    expect(validate({ page: '0' })).toEqual({ page: 1 })
    expect(validate({ page: '-4' })).toEqual({ page: 1 })
    expect(validate({ page: '2.5' })).toEqual({ page: 1 })
  })
})

// ============================================================================
// Aggregate header
// ============================================================================

describe('the aggregate header', () => {
  it('needs ten approved reviews before it says anything', () => {
    expect(MIN_REVIEWS_FOR_AGGREGATE).toBe(10)
  })

  it('renders the score and the count once the sample is big enough', () => {
    render(<ReviewsAggregate averageRating={4.6} reviewCount={128} />)

    expect(screen.getByTestId('reviews-aggregate')).toBeTruthy()
    expect(screen.getByText('4.6')).toBeTruthy()
    expect(screen.getByText(/128 reviews/i)).toBeTruthy()
  })

  it('renders nothing below ten reviews', () => {
    // Nine reviews averaging 4.8 is not a 4.8-star catalogue, it is nine
    // people. Rounding a thin sample into a marketing number is the thing the
    // suppression rule exists to prevent.
    const { container } = render(
      <ReviewsAggregate averageRating={4.8} reviewCount={9} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when the average is null, however many reviews', () => {
    // The API returns null — never 0 — when there is nothing to average.
    // Coalescing that to 0 would print "0.0", i.e. "rated badly".
    const { container } = render(
      <ReviewsAggregate averageRating={null} reviewCount={40} />
    )
    expect(container.innerHTML).toBe('')
    expect(container.textContent).not.toContain('0.0')
  })
})

// ============================================================================
// The feed
// ============================================================================

describe('the review list', () => {
  it('shows the rating, title, body, author and date of a review', async () => {
    renderWithRouter(<ReviewFeedList reviews={[makeReview()]} />)

    const row = await screen.findByTestId('review-feed-row')
    expect(row.getAttribute('data-rating')).toBe('5')
    expect(screen.getByText('Frames beautifully')).toBeTruthy()
    expect(screen.getByText(/paper stock is heavier/)).toBeTruthy()
    expect(screen.getByText('Ananya R')).toBeTruthy()
    expect(row.textContent).toContain('2026')
  })

  it('links every review back to the product it reviews', async () => {
    // A review shown away from its detail page is unreadable without one.
    renderWithRouter(<ReviewFeedList reviews={[makeReview()]} />)

    const link = await screen.findByRole('link', { name: /Kyoto Rain/i })
    expect(link.getAttribute('href')).toBe('/posters/kyoto-rain')
  })

  it('survives a review whose author account is gone', async () => {
    // `author` is nullable — the review outlives the account.
    renderWithRouter(
      <ReviewFeedList reviews={[makeReview({ id: 'rev-2', author: null })]} />
    )
    expect(await screen.findByTestId('review-feed-row')).toBeTruthy()
  })

  it('renders an empty state rather than throwing on no reviews', async () => {
    renderWithRouter(<ReviewFeedList reviews={[]} />)

    expect(await screen.findByTestId('reviews-empty')).toBeTruthy()
    expect(screen.queryByTestId('review-feed-row')).toBeNull()
  })
})

// ============================================================================
// Entry points — nav, footer, sitemap
// ============================================================================

const webRoot = process.cwd()
const repoRoot = join(webRoot, '../..')
const read = (p: string) => readFileSync(p, 'utf8')

describe('the ways in', () => {
  it('is registered in the generated route tree', () => {
    const tree = read(join(webRoot, 'app/routeTree.gen.ts'))
    expect(tree).toContain("path: '/reviews'")
    expect(tree).toContain("from './routes/reviews'")
  })

  it('appears in BOTH header nav trees, not just the desktop one', () => {
    // The same links exist twice in Header.tsx — a desktop <NavLink> row and a
    // mobile <MobileNavLink> drawer. Patching one and shipping is the classic
    // miss on this file.
    const header = read(join(webRoot, 'app/components/layout/Header.tsx'))
    expect(header).toMatch(/<NavLink\s+to="\/reviews"/)
    expect(header).toMatch(/<MobileNavLink\s+to="\/reviews"/)
  })

  it('is linked from the footer', () => {
    const footer = read(join(webRoot, 'app/components/layout/Footer.tsx'))
    expect(footer).toMatch(/<FooterLink to="\/reviews">/)
    expect(footer).toMatch(/Reviews & Ratings|Reviews &amp; Ratings/)
  })

  it('is in the sitemap so a crawler can find it', () => {
    const sitemap = read(join(repoRoot, 'packages/api/src/routes/sitemap.ts'))
    expect(sitemap).toContain('${SITE_URL}/reviews')
  })
})
