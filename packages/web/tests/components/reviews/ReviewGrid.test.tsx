/**
 * ReviewGrid — ONE masonry grid holding every review.
 *
 * mesonart runs the same Loox grid twice: unfiltered on /reviews (~6 columns)
 * and product-filtered on the PDP (~5). There is no media-only wall above a
 * written list — a review without a photo is the same card with the media slot
 * omitted, and it sits in the same grid as the ones with photos. The previous
 * attempt invented that split; these tests exist so it cannot come back.
 *
 * Three rules are asserted rather than assumed:
 *
 *  - The masonry is CSS `columns`. No measuring pass, no layout dependency,
 *    no ResizeObserver.
 *  - `productId` is the only difference between the two deployments.
 *  - The grid fetches through `getApiUrl()`. A relative `/api` passes in
 *    jsdom and fails in the browser — there is no Vite proxy here, and that
 *    exact bug already bit ReviewModal in #493.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'

/**
 * Mocked at the module boundary so the grid can be rendered without a
 * QueryClientProvider. `vi.hoisted` because vi.mock's factory is lifted above
 * the imports and cannot close over anything declared normally.
 */
const reviewCardsMock = vi.hoisted(() => vi.fn())

vi.mock('~/hooks/useReviews', () => ({
  useReviewCards: (...args: unknown[]) => reviewCardsMock(...args),
}))

import { ReviewGrid } from '~/components/reviews/ReviewGrid'
import { reviewsApi } from '~/lib/api'
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

const WITHOUT_MEDIA = makeReview('rev-text')

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

function page(items: ReviewCardData[], overrides: Record<string, unknown> = {}) {
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

function renderGrid(ui: React.ReactNode) {
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
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  reviewCardsMock.mockReset()
  reviewCardsMock.mockReturnValue(page([WITH_PHOTO, WITHOUT_MEDIA, WITH_CLIP]))
})

// ============================================================================
// One grid, every review
// ============================================================================

describe('ReviewGrid — one grid holds every review', () => {
  it('puts media-bearing and text-only reviews in the same grid', async () => {
    renderGrid(<ReviewGrid />)

    const grid = await screen.findByTestId('review-grid')
    const cards = within(grid).getAllByTestId('review-grid-card')

    expect(cards).toHaveLength(3)
    // The text-only review is IN the grid, not in a second list below it.
    expect(within(grid).getByText('Body of rev-text')).toBeTruthy()
    expect(within(grid).getByTestId('review-card-photo')).toBeTruthy()
    expect(within(grid).getByTestId('review-card-video')).toBeTruthy()
  })

  it('renders no second surface for media', async () => {
    renderGrid(<ReviewGrid />)

    await screen.findByTestId('review-grid')
    // The media wall is a separate component with its own testid; the grid
    // must never grow one of its own.
    expect(screen.queryByTestId('review-media-wall')).toBeNull()
    expect(screen.queryAllByTestId('review-grid')).toHaveLength(1)
  })
})

// ============================================================================
// Masonry
// ============================================================================

describe('ReviewGrid — CSS columns masonry', () => {
  it('lays out with CSS columns and unbreakable items, not a measuring pass', async () => {
    renderGrid(<ReviewGrid />)

    const grid = await screen.findByTestId('review-grid')

    expect(grid.className).toMatch(/\bcolumns-\d/)

    // Each card sits in a wrapper that refuses to be split across a column.
    const items = within(grid).getAllByTestId('review-grid-item')
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.className).toContain('break-inside-avoid')
    }
  })

  it('runs six columns unfiltered and five product-filtered', async () => {
    const { unmount } = renderGrid(<ReviewGrid />)
    expect((await screen.findByTestId('review-grid')).className).toContain(
      'xl:columns-6'
    )
    unmount()

    renderGrid(<ReviewGrid productId={PRODUCT_ID} />)
    expect((await screen.findByTestId('review-grid')).className).toContain(
      'xl:columns-5'
    )
  })
})

// ============================================================================
// One component, two filters
// ============================================================================

describe('ReviewGrid — productId is the only difference', () => {
  it('asks for one product when given one', async () => {
    renderGrid(<ReviewGrid productId={PRODUCT_ID} />)

    await screen.findByTestId('review-grid')
    expect(reviewCardsMock).toHaveBeenCalledWith(
      PRODUCT_ID,
      expect.any(Number),
      expect.any(Number)
    )
  })

  it('asks for the whole catalogue when given none', async () => {
    renderGrid(<ReviewGrid />)

    await screen.findByTestId('review-grid')
    expect(reviewCardsMock).toHaveBeenCalledWith(
      undefined,
      expect.any(Number),
      expect.any(Number)
    )
  })
})

// ============================================================================
// States and paging
// ============================================================================

describe('ReviewGrid — states', () => {
  it('renders an empty state instead of an empty grid', async () => {
    reviewCardsMock.mockReturnValue(page([]))

    renderGrid(<ReviewGrid />)

    expect(await screen.findByTestId('review-grid-empty')).toBeTruthy()
    expect(screen.queryByTestId('review-grid')).toBeNull()
  })

  it('offers more reviews only when there are more', async () => {
    const { unmount } = renderGrid(<ReviewGrid />)
    await screen.findByTestId('review-grid')
    expect(screen.queryByTestId('review-grid-more')).toBeNull()
    unmount()

    reviewCardsMock.mockReturnValue(
      page([WITH_PHOTO], { hasNextPage: true, totalPages: 2, total: 2 })
    )
    renderGrid(<ReviewGrid />)
    expect(await screen.findByTestId('review-grid-more')).toBeTruthy()
  })

  it('appends the next page rather than replacing the grid', async () => {
    const first = makeReview('rev-page-1')
    const second = makeReview('rev-page-2')

    reviewCardsMock.mockImplementation(
      (_productId: string | undefined, pageNumber: number) =>
        pageNumber === 1
          ? page([first], { hasNextPage: true, totalPages: 2, total: 2 })
          : page([second], { page: 2, hasNextPage: false, totalPages: 2, total: 2 })
    )

    renderGrid(<ReviewGrid />)

    fireEvent.click(await screen.findByTestId('review-grid-more'))

    const grid = await screen.findByTestId('review-grid')
    expect(within(grid).getByText('Body of rev-page-1')).toBeTruthy()
    expect(within(grid).getByText('Body of rev-page-2')).toBeTruthy()
    expect(reviewCardsMock).toHaveBeenCalledWith(
      undefined,
      2,
      expect.any(Number)
    )
  })
})

// ============================================================================
// Lightbox
// ============================================================================

describe('ReviewGrid — lightbox', () => {
  it('opens the shared review lightbox on the clicked attachment', async () => {
    renderGrid(<ReviewGrid />)

    await screen.findByTestId('review-grid')
    expect(screen.queryByTestId('review-media-lightbox')).toBeNull()

    fireEvent.click(screen.getAllByTestId('review-card-media-trigger')[0]!)

    const lightbox = await screen.findByTestId('review-media-lightbox')
    expect(
      within(lightbox).getByTestId('review-media-full').getAttribute('src')
    ).toBe('https://cdn.test/photo.jpg')
  })

  it('closes on Escape', async () => {
    renderGrid(<ReviewGrid />)

    await screen.findByTestId('review-grid')
    fireEvent.click(screen.getAllByTestId('review-card-media-trigger')[0]!)
    await screen.findByTestId('review-media-lightbox')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('review-media-lightbox')).toBeNull()
  })

  it('hands focus back to the card that opened it', async () => {
    // Carried over from the PDP media wall this grid replaced (#498). A
    // keyboard reader who opens a card and closes the viewer must land back on
    // that card, not at the top of the document.
    renderGrid(<ReviewGrid />)

    await screen.findByTestId('review-grid')
    const trigger = screen.getAllByTestId('review-card-media-trigger')[0]!

    fireEvent.click(trigger)
    await screen.findByTestId('review-media-lightbox')
    expect(document.activeElement).not.toBe(trigger)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(document.activeElement).toBe(trigger)
  })
})

// ============================================================================
// The fetch itself
// ============================================================================

describe('reviewsApi.listForProduct', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('goes through getApiUrl rather than a relative /api', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await reviewsApi.listForProduct(PRODUCT_ID, { page: 1, pageSize: 24 })

    const url = String(fetchMock.mock.calls[0]?.[0])
    // A relative '/api/...' works in jsdom and silently fails in the browser:
    // there is no Vite proxy in this repo (#493).
    expect(url.startsWith('/api')).toBe(false)
    expect(url).toMatch(/^https?:\/\//)
    expect(url).toContain(`/api/products/${PRODUCT_ID}/reviews`)
  })
})
