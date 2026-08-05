/**
 * The PDP review section — ONE surface, not two.
 *
 * mesonart runs the same Loox grid on the product page that it runs on
 * /reviews; the only difference is that this one is filtered to a product
 * (docs/design/mesonart/mesonart-pdp-reviews-loox.png). Header row — star row,
 * "<N> Reviews" with a chevron, a "Write a review" pill — then the masonry,
 * then "Show more reviews".
 *
 * What this file exists to prevent coming back:
 *
 *   1. The invented split. The PDP used to mount a media-only `ReviewMediaWall`
 *      ABOVE a written `ProductReviews` list. There is no second media surface
 *      in the reference and there is none here: a review without a photo is the
 *      same card with its media slot omitted, in the same grid.
 *   2. A second design for the header. The row is the same component /reviews
 *      renders, so the two surfaces cannot drift apart.
 *   3. A severed review-submission path. The written list carried the only
 *      "leave a review" link on the page. Retiring it without the pill would
 *      quietly remove the way in — #493 showed how invisible that is here.
 *   4. A dangling `#reviews` anchor. The written list owned the id the review
 *      section is linked by; the unified section has to keep it.
 *
 * The source-level block at the bottom is deliberate: "the file is deleted and
 * nothing imports it" is a wiring fact, not a rendering one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'

/**
 * Mocked at the module boundary so the section renders without a
 * QueryClientProvider. `vi.hoisted` because vi.mock's factory is lifted above
 * the imports and cannot close over anything declared normally.
 */
const reviewCardsMock = vi.hoisted(() => vi.fn())

vi.mock('~/hooks/useReviews', () => ({
  useReviewCards: (...args: unknown[]) => reviewCardsMock(...args),
}))

import { ProductReviewSection } from '~/components/product/ProductReviewSection'
import type { ReviewCardData } from '~/components/reviews/ReviewGridCard'

// ============================================================================
// Fixtures
// ============================================================================

const PRODUCT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

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

/** A review with a photo — used to live on the media wall. */
const WITH_PHOTO = makeReview('rev-photo', {
  media: [
    {
      id: 'media-photo',
      reviewId: 'rev-photo',
      mediaType: 'image',
      url: 'https://cdn.test/photo.jpg',
      thumbnailUrl: 'https://cdn.test/photo-thumb.jpg',
      posterUrl: null,
      durationSeconds: null,
      width: 800,
      height: 1000,
      sortOrder: 0,
    },
  ],
})

/** A clip — same surface as the photo and the prose, not a third one. */
const WITH_CLIP = makeReview('rev-clip', {
  media: [
    {
      id: 'media-clip',
      reviewId: 'rev-clip',
      mediaType: 'video',
      url: 'https://cdn.test/clip.mp4',
      thumbnailUrl: null,
      posterUrl: 'https://cdn.test/clip-poster.jpg',
      durationSeconds: 12,
      width: 1080,
      height: 1920,
      sortOrder: 0,
    },
  ],
})

/** A review with no attachment — used to live in the written list below. */
const WITHOUT_MEDIA = makeReview('rev-text')

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

/** The pill links to /account/orders, so that route exists in the router. */
function renderSection(ui: React.ReactNode) {
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

beforeEach(() => {
  reviewCardsMock.mockReset()
  reviewCardsMock.mockReturnValue(
    cardsPage([WITH_PHOTO, WITHOUT_MEDIA, WITH_CLIP])
  )
})

// ============================================================================
// One surface
// ============================================================================

describe('the PDP review section — one surface', () => {
  it('holds media-bearing and text-only reviews in a single grid', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    const grid = await screen.findByTestId('review-grid')
    expect(within(grid).getAllByTestId('review-grid-card')).toHaveLength(3)

    // The prose is IN the grid, not in a second list beneath it.
    expect(within(grid).getByText('Body of rev-text')).toBeTruthy()
    expect(within(grid).getByTestId('review-card-photo')).toBeTruthy()
    expect(within(grid).getByTestId('review-card-video')).toBeTruthy()
  })

  it('renders no media-only wall above the words', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    await screen.findByTestId('review-grid')

    // The split is gone: no wall, no second grid, no tile surface.
    expect(screen.queryByTestId('review-media-wall')).toBeNull()
    expect(screen.queryByTestId('review-media-tile')).toBeNull()
    expect(screen.queryAllByTestId('review-grid')).toHaveLength(1)
  })

  it('filters the grid to this product', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    await screen.findByTestId('review-grid')

    // `productId` is the only difference between this deployment of the grid
    // and the one on /reviews.
    expect(reviewCardsMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.any(Number),
      expect.any(Number)
    )
  })

  it('runs the five-column product masonry, not the catalogue six', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    const grid = await screen.findByTestId('review-grid')
    expect(grid.className).toContain('xl:columns-5')
  })
})

// ============================================================================
// The anchor
// ============================================================================

describe('the review anchor', () => {
  it('keeps the #reviews target the written list used to own', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    await screen.findByTestId('review-grid')

    // The buy-box star row and every deep link into the reviews point here.
    const anchor = document.getElementById('reviews')
    expect(anchor).not.toBeNull()
    expect(anchor!.tagName.toLowerCase()).toBe('section')
    // The grid is INSIDE the anchored section — an anchor that lands above an
    // empty container is an anchor that lands nowhere.
    expect(anchor!.querySelector('[data-testid="review-grid"]')).not.toBeNull()
  })

  it('is still findable as the Customer Reviews section', async () => {
    // The reference carries no visible heading — the wall is the section — but
    // a screen reader and the e2e locators still need the name.
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    expect(
      await screen.findByRole('heading', { name: /Customer Reviews/i })
    ).toBeTruthy()
  })
})

// ============================================================================
// The header row
// ============================================================================

describe('the Loox header row on the PDP', () => {
  it('is a star row, a count and a way in — the same row /reviews renders', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    const header = await screen.findByTestId('reviews-header')
    expect(
      within(header).getByRole('img', { name: /Rating: 4\.8 out of 5 stars/i })
    ).toBeTruthy()
    expect(within(header).getByText(/66 Reviews/)).toBeTruthy()

    // No beige aggregate band, no rating-distribution summary — the PDP used
    // to carry ReviewSummary here and mesonart does not.
    expect(screen.queryByTestId('reviews-aggregate')).toBeNull()
    expect(screen.queryByTestId('review-summary')).toBeNull()
  })

  it('keeps the write-a-review path alive', async () => {
    // A review needs a purchase behind it — the API creates one against an
    // order item — so the CTA leads to the orders list. Retiring the written
    // list without this pill would sever the only way in from the PDP.
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    const cta = await screen.findByRole('link', { name: /Write a review/i })
    expect(cta.getAttribute('href')).toBe('/account/orders')
  })

  it('discloses the exact average behind the chevron', async () => {
    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={4.8}
        reviewCount={66}
      />
    )

    const toggle = await screen.findByTestId('reviews-count-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('reviews-average')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const disclosed = await screen.findByTestId('reviews-average')
    expect(disclosed.textContent).toContain('4.8')
    // Scoped to the poster, not to the catalogue — same row, honest wording.
    expect(disclosed.textContent).not.toContain('catalogue')
  })

  it('says nothing about a count this poster does not have', async () => {
    // An unreviewed poster must not print "0 Reviews" over an empty wall.
    reviewCardsMock.mockReturnValue(cardsPage([]))

    renderSection(
      <ProductReviewSection
        productId={PRODUCT_ID}
        averageRating={null}
        reviewCount={null}
      />
    )

    await screen.findByTestId('reviews-header')
    expect(screen.queryByTestId('reviews-count-toggle')).toBeNull()
    expect(screen.queryByText(/0 Reviews/)).toBeNull()
    // The way in is not aggregate-dependent and stays.
    expect(screen.getByRole('link', { name: /Write a review/i })).toBeTruthy()
  })
})

// ============================================================================
// The split is gone from the source
// ============================================================================

const webRoot = process.cwd()
const read = (p: string) => readFileSync(join(webRoot, p), 'utf8')

/** Every .ts/.tsx under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('the invented split', () => {
  it('is gone from the product page', () => {
    const source = read('app/routes/posters/$slug.tsx')

    expect(source).not.toContain('ReviewMediaWall')
    // The written list is no longer mounted either — the grid replaced it.
    expect(source).not.toMatch(/<ProductReviews\b/)
    expect(source).toMatch(/<ProductReviewSection[^>]*productId/)
  })

  it('has no media wall component left to import', () => {
    expect(
      existsSync(join(webRoot, 'app/components/product/ReviewMediaWall.tsx'))
    ).toBe(false)
  })

  it('is referenced by nothing in the app tree', () => {
    // Grep before delete, and assert it after: a dangling import is a build
    // failure that only shows up on the route that still holds it.
    const offenders = sourceFiles(join(webRoot, 'app')).filter((file) =>
      readFileSync(file, 'utf8').includes('ReviewMediaWall')
    )
    expect(offenders).toEqual([])
  })
})
