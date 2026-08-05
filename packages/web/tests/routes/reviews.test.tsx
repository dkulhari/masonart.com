/**
 * The site-wide /reviews page.
 *
 * mesonart runs Loox here and the page is almost entirely the wall: one
 * compact header row — star row, "<N> Reviews", a chevron, a "Write a review"
 * pill — and then the masonry grid, ending in "Show more reviews"
 * (docs/design/mesonart/mesonart-reviews-page-loox.png). There is no beige
 * score band on this page. The one that used to be here was invented; the big
 * aggregate treatment belongs to the home strip, which is a different surface.
 *
 * Four things are guarded here rather than assumed:
 *
 *   1. `validateSearch` must COERCE. `app/routes/router.tsx` overrides
 *      TanStack's search serialisation, so `?page=2` arrives as the STRING
 *      '2'. A bare `z.number()` throws inside validateSearch, the route
 *      error-boundaries, and a shared link resolves to a blank page. The grid
 *      appends rather than pages now, but old links still have to land.
 *   2. The `SectionBand`/`DisplayHeading` aggregate band stays gone.
 *   3. The grid on this page is UNFILTERED — `productId` undefined — which is
 *      the only difference between this deployment of ReviewGrid and the PDP's.
 *   4. A catalogue with zero approved reviews gets a real empty state, not
 *      "0 Reviews" floating over nothing.
 *
 * The entry-point block at the bottom is source-level on purpose: it asserts
 * that a link exists in three separate files, which is a wiring fact rather
 * than a rendering one. The header carries two independent nav trees and
 * patching only the desktop one is the classic miss.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'

/**
 * Both mocked at the module boundary. `vi.hoisted` because vi.mock's factory
 * is lifted above the imports and cannot close over anything declared normally.
 */
const reviewCardsMock = vi.hoisted(() => vi.fn())
const catalogueStatsMock = vi.hoisted(() => vi.fn())

vi.mock('~/hooks/useReviews', () => ({
  useReviewCards: (...args: unknown[]) => reviewCardsMock(...args),
}))

vi.mock('~/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/api')>()
  return {
    ...actual,
    productsApi: {
      ...actual.productsApi,
      catalogueReviewStats: () => catalogueStatsMock(),
    },
  }
})

import {
  Route,
  ReviewsPage,
  ReviewsHeader,
  MIN_REVIEWS_FOR_AGGREGATE,
} from '~/routes/reviews'
import type { ReviewCardData } from '~/components/reviews/ReviewGridCard'

// ============================================================================
// Fixtures
// ============================================================================

function makeReview(
  id: string,
  overrides: Partial<ReviewCardData> = {}
): ReviewCardData {
  return {
    id,
    rating: 5,
    title: null,
    content: `Body of ${id}`,
    createdAt: '2026-08-04T09:30:00.000Z',
    author: { id: `user-${id}`, name: `Author ${id}` },
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

/** A review of a different poster — the wall here is not product-scoped. */
const OTHER_PRODUCT = makeReview('rev-other', {
  product: {
    id: 'prod-2',
    title: 'Osaka Dusk',
    slug: 'osaka-dusk',
    sku: 'OD002',
    imageUrl: 'https://cdn.test/osaka.webp',
  },
})

function cardsPage(
  items: ReviewCardData[],
  overrides: Record<string, unknown> = {}
) {
  return {
    data: {
      items,
      total: items.length,
      page: 1,
      pageSize: 24,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...overrides,
    },
    isLoading: false,
    isError: false,
  }
}

/**
 * The page's links reach three routes, so all three exist in the memory
 * router. The provider mounts asynchronously — every assertion under it is a
 * `findBy*`.
 */
function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
  const children = ['/posters', '/posters/$slug', '/account/orders'].map(
    (path) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: () => null,
      })
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

/** The connected page needs a query client for the catalogue aggregate. */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderWithRouter(
    <QueryClientProvider client={queryClient}>
      <ReviewsPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  reviewCardsMock.mockReset()
  reviewCardsMock.mockReturnValue(cardsPage([makeReview('rev-1'), OTHER_PRODUCT]))
  catalogueStatsMock.mockReset()
  catalogueStatsMock.mockResolvedValue({ averageRating: 4.8, reviewCount: 9605 })
})

// ============================================================================
// validateSearch
// ============================================================================

describe('/reviews validateSearch', () => {
  const validate = (search: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Route.options.validateSearch as any)(search) as { page: number }

  it('coerces the string page the router hands it into a number', () => {
    // The whole reason this test exists. router.tsx serialises search params
    // as strings; `z.number()` would throw here and blank the page.
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
// The header row
// ============================================================================

describe('the Loox header row', () => {
  it('is a star row and a count, not a score band', async () => {
    renderWithRouter(
      <ReviewsHeader averageRating={4.8} reviewCount={9605} />
    )

    const header = await screen.findByTestId('reviews-header')
    expect(
      within(header).getByRole('img', { name: /Rating: 4\.8 out of 5 stars/i })
    ).toBeTruthy()
    expect(within(header).getByText(/9,605 Reviews/)).toBeTruthy()

    // The beige aggregate band is gone — no big score, no band testid.
    expect(screen.queryByTestId('reviews-aggregate')).toBeNull()
    expect(screen.queryByText('4.8')).toBeNull()
  })

  it('offers a way to write one', async () => {
    // A review needs a purchase behind it, so the CTA leads to the orders
    // list rather than to a form nobody could submit.
    renderWithRouter(<ReviewsHeader averageRating={4.8} reviewCount={9605} />)

    const cta = await screen.findByRole('link', { name: /Write a review/i })
    expect(cta.getAttribute('href')).toBe('/account/orders')
  })

  it('discloses the exact average behind the chevron', async () => {
    renderWithRouter(<ReviewsHeader averageRating={4.8} reviewCount={9605} />)

    const toggle = await screen.findByTestId('reviews-count-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('reviews-average')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect((await screen.findByTestId('reviews-average')).textContent).toContain(
      '4.8'
    )
  })

  it('says nothing about a count it does not have yet', async () => {
    // While the aggregate is in flight the row must not print "0 Reviews".
    renderWithRouter(<ReviewsHeader averageRating={null} reviewCount={null} />)

    await screen.findByTestId('reviews-header')
    expect(screen.queryByTestId('reviews-count-toggle')).toBeNull()
    expect(screen.queryByText(/Reviews$/)).toBeNull()
    // The CTA is not aggregate-dependent and stays.
    expect(screen.getByRole('link', { name: /Write a review/i })).toBeTruthy()
  })
})

// ============================================================================
// The page
// ============================================================================

describe('the /reviews page', () => {
  it('renders the header row over one unfiltered grid', async () => {
    renderPage()

    const grid = await screen.findByTestId('review-grid')
    expect(await screen.findByTestId('reviews-header')).toBeTruthy()

    // Unfiltered: `productId` undefined is the only thing separating this
    // deployment of the grid from the PDP's.
    expect(reviewCardsMock).toHaveBeenCalledWith(
      undefined,
      expect.any(Number),
      expect.any(Number)
    )

    // ...which is visible in the output: two different posters in one wall.
    expect(within(grid).getByText('Kyoto Rain')).toBeTruthy()
    expect(within(grid).getByText('Osaka Dusk')).toBeTruthy()
  })

  it('has no aggregate band and no numbered pager', async () => {
    renderPage()

    await screen.findByTestId('review-grid')
    expect(screen.queryByTestId('reviews-aggregate')).toBeNull()
    expect(screen.queryByTestId('reviews-pagination')).toBeNull()
    expect(screen.queryByTestId('review-feed-row')).toBeNull()
  })

  it('shows a real empty state when the catalogue has no reviews', async () => {
    catalogueStatsMock.mockResolvedValue({ averageRating: null, reviewCount: 0 })
    reviewCardsMock.mockReturnValue(cardsPage([]))

    renderPage()

    const empty = await screen.findByTestId('reviews-empty')
    expect(empty.textContent).toMatch(/No reviews yet/i)
    // Not "0 Reviews" over an empty wall.
    expect(screen.queryByText(/0 Reviews/)).toBeNull()
    expect(screen.queryByTestId('reviews-count-toggle')).toBeNull()
    expect(screen.queryByTestId('review-grid')).toBeNull()
  })
})

// ============================================================================
// The band stays gone
// ============================================================================

const webRoot = process.cwd()
const repoRoot = join(webRoot, '../..')
const read = (p: string) => readFileSync(p, 'utf8')

describe('the invented score band', () => {
  it('is not imported back into the route', () => {
    // mesonart has no beige band on this page. The band belongs to the home
    // strip, which is a different surface and is out of scope here.
    const source = read(join(webRoot, 'app/routes/reviews.tsx'))
    expect(source).not.toContain('SectionBand')
    expect(source).not.toContain('DisplayHeading')
  })

  it('renders the wall through ReviewGrid with no product filter', () => {
    const source = read(join(webRoot, 'app/routes/reviews.tsx'))
    expect(source).toContain('ReviewGrid')
    expect(source).not.toMatch(/<ReviewGrid[^>]*productId/)
  })

  it('still exports the threshold the home strip mirrors', () => {
    // CustomerReviewsSection's suppression rule is pinned to this constant.
    expect(MIN_REVIEWS_FOR_AGGREGATE).toBe(10)
  })
})

// ============================================================================
// Entry points — nav, footer, sitemap
// ============================================================================

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
