/**
 * The site-wide floating review toast.
 *
 * Three of these are correctness tests rather than styling tests:
 *
 *   1. **Suppression.** A social-proof popup floating over a payment form is a
 *      conversion and a trust problem, and over the admin console it is just
 *      noise. The route check has to happen BEFORE the data hook runs, so a
 *      suppressed route makes no network call at all — hence the
 *      `toHaveBeenCalled` assertions on the feed hook, not just DOM checks.
 *
 *   2. **Stacking.** The cart drawer is `z-40` (backdrop) / `z-50` (panel) in
 *      `components/cart/CartDrawer.tsx`. The toast must sit under both, or it
 *      punches through the drawer's scrim.
 *
 *   3. **Reduced motion.** The slide-in is opt-out via `matchMedia`, not just a
 *      `motion-reduce:` class, because the class is invisible to jsdom and to
 *      anything asserting on behaviour.
 *
 * jsdom notes, both of which will bite anyone editing this file:
 *
 *   - Node 25 ships its own inert `sessionStorage` global that SHADOWS jsdom's,
 *     so `setItem` throws "is not a function". It has to be replaced in
 *     `vi.hoisted`, above the imports — `tests/setup.ts` does the same for
 *     `localStorage`, but not for this one.
 *   - jsdom has no `matchMedia` at all, so the component guards for its absence
 *     and these tests install one.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import type { ReviewFeedItem, ReviewFeedResponse } from '~/lib/api'

// ============================================================================
// Hoisted stubs — these MUST run before the component module is imported
// ============================================================================

const { sessionStore, useReviewFeedMock } = vi.hoisted(() => {
  const store = new Map<string, string>()

  // Node 25's own `sessionStorage` global is inert and shadows jsdom's; every
  // method on it throws. Own-property definition on globalThis (=== window in
  // jsdom) shadows it right back.
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    },
  })

  return { sessionStore: store, useReviewFeedMock: vi.fn() }
})

vi.mock('~/hooks/useReviews', () => ({
  useReviewFeed: (...args: unknown[]) => useReviewFeedMock(...args),
}))

import {
  ReviewToast,
  REVIEW_TOAST_DISMISSED_KEY,
  REVIEW_TOAST_INITIAL_DELAY_MS,
  REVIEW_TOAST_CYCLE_MS,
  isReviewToastSuppressed,
} from '~/components/reviews/ReviewToast'

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
    product: {
      id: 'prod-1',
      title: 'Kyoto Rain',
      slug: 'kyoto-rain',
      imageUrl: 'https://cdn.test/kyoto.webp',
    },
    media: [],
    ...overrides,
  }
}

const SECOND_REVIEW = makeReview({
  id: 'rev-2',
  rating: 4,
  title: 'Colours are true',
  content: 'Exactly the tones on screen, no surprise magenta cast.',
  author: { id: 'user-2', name: 'Vikram S' },
  product: {
    id: 'prod-2',
    title: 'Osaka Dusk',
    slug: 'osaka-dusk',
    imageUrl: 'https://cdn.test/osaka.webp',
  },
})

function feed(items: ReviewFeedItem[]): { data: ReviewFeedResponse } {
  return {
    data: {
      items,
      total: items.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  }
}

/** jsdom ships no matchMedia; the component treats its absence as "animate". */
function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

/**
 * Mount the toast under a real memory router so `useRouterState` reports a real
 * pathname and `<Link>` resolves a real href. Mocking the router instead would
 * make the suppression tests assert on the mock rather than on the route.
 */
async function renderToast(initialPath = '/') {
  const rootRoute = createRootRoute({ component: () => <ReviewToast /> })
  const children = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/posters/$slug',
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/checkout',
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/admin/orders',
      component: () => null,
    }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  const utils = render(<RouterProvider router={router} />)
  // RouterProvider mounts asynchronously; flush that before touching timers.
  await act(async () => {})
  return utils
}

/** Push past the opening delay. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  sessionStore.clear()
  useReviewFeedMock.mockReset()
  useReviewFeedMock.mockReturnValue(feed([makeReview(), SECOND_REVIEW]))
  setReducedMotion(false)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// Suppression — the correctness half of this ticket
// ============================================================================

describe('where the toast is allowed to appear', () => {
  it('treats /checkout and every admin route as suppressed', () => {
    expect(isReviewToastSuppressed('/checkout')).toBe(true)
    expect(isReviewToastSuppressed('/checkout/success')).toBe(true)
    expect(isReviewToastSuppressed('/admin')).toBe(true)
    expect(isReviewToastSuppressed('/admin/orders')).toBe(true)
    expect(isReviewToastSuppressed('/')).toBe(false)
    expect(isReviewToastSuppressed('/posters/kyoto-rain')).toBe(false)
  })

  it('renders nothing on /checkout, and fetches nothing either', async () => {
    await renderToast('/checkout')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS + 1000)

    expect(screen.queryByTestId('review-toast')).toBeNull()
    // The route check has to come BEFORE the data hook — a suppressed route
    // must not even ask the API for reviews.
    expect(useReviewFeedMock).not.toHaveBeenCalled()
  })

  it('renders nothing on an admin route, and fetches nothing either', async () => {
    await renderToast('/admin/orders')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS + 1000)

    expect(screen.queryByTestId('review-toast')).toBeNull()
    expect(useReviewFeedMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Appearing and cycling
// ============================================================================

describe('appearing and cycling', () => {
  it('stays hidden until the opening delay has passed', async () => {
    await renderToast('/')

    expect(screen.queryByTestId('review-toast')).toBeNull()

    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    expect(screen.getByTestId('review-toast')).toBeTruthy()
    expect(screen.getByText(/Frames beautifully/)).toBeTruthy()
    expect(screen.getByText(/Ananya R/)).toBeTruthy()
  })

  it('cycles to the next review on the interval', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    expect(screen.getByText(/Frames beautifully/)).toBeTruthy()

    await advance(REVIEW_TOAST_CYCLE_MS)

    expect(screen.queryByText(/Frames beautifully/)).toBeNull()
    expect(screen.getByText(/Colours are true/)).toBeTruthy()
    expect(screen.getByText(/Vikram S/)).toBeTruthy()
  })

  it('renders nothing when the feed comes back empty', async () => {
    useReviewFeedMock.mockReturnValue(feed([]))
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS + REVIEW_TOAST_CYCLE_MS)

    expect(screen.queryByTestId('review-toast')).toBeNull()
  })

  it('survives a review whose author account is gone', async () => {
    useReviewFeedMock.mockReturnValue(feed([makeReview({ author: null })]))
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    expect(screen.getByTestId('review-toast')).toBeTruthy()
  })
})

// ============================================================================
// Dismissal
// ============================================================================

describe('dismissal', () => {
  it('hides the toast and records the flag in sessionStorage', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    fireEvent.click(screen.getByTestId('review-toast-dismiss'))

    expect(screen.queryByTestId('review-toast')).toBeNull()
    expect(sessionStore.get(REVIEW_TOAST_DISMISSED_KEY)).toBeTruthy()
  })

  it('stays dismissed for the rest of the session — it does not come back', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)
    fireEvent.click(screen.getByTestId('review-toast-dismiss'))

    await advance(REVIEW_TOAST_CYCLE_MS * 3)

    expect(screen.queryByTestId('review-toast')).toBeNull()
  })

  it('a flag already set suppresses it on mount, with no fetch at all', async () => {
    sessionStore.set(REVIEW_TOAST_DISMISSED_KEY, '1')

    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS + REVIEW_TOAST_CYCLE_MS)

    expect(screen.queryByTestId('review-toast')).toBeNull()
    // Same rule as the suppressed routes: no toast means no request.
    expect(useReviewFeedMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Stacking and motion
// ============================================================================

describe('stacking and motion', () => {
  it('sits below the cart drawer and clear of the mobile sticky bar', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    const toast = screen.getByTestId('review-toast')
    const className = toast.className

    // CartDrawer.tsx: backdrop z-40, panel z-50. Anything >= 40 punches
    // through the drawer's scrim.
    expect(className).toContain('z-30')
    expect(className).not.toMatch(/z-(40|50)\b/)
    // Bottom-left, and lifted on small screens so it clears a sticky
    // add-to-cart bar on the PDP.
    expect(className).toContain('fixed')
    expect(className).toContain('left-')
    expect(className).toMatch(/bottom-2\d/)
    expect(className).toMatch(/sm:bottom-/)
  })

  it('slides in when motion is allowed', async () => {
    setReducedMotion(false)
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    const toast = screen.getByTestId('review-toast')
    expect(toast.className).toContain('animate-slide-in-from-left')
    expect(toast.getAttribute('data-reduced-motion')).toBe('false')
  })

  it('drops the slide-in entirely when prefers-reduced-motion is set', async () => {
    setReducedMotion(true)
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    const toast = screen.getByTestId('review-toast')
    expect(toast.className).not.toContain('animate-slide-in-from-left')
    expect(toast.className).not.toMatch(/animate-slide/)
    expect(toast.getAttribute('data-reduced-motion')).toBe('true')
  })
})

// ============================================================================
// Linking out
// ============================================================================

describe('linking out', () => {
  it('links the toast to the product the review is about', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    const link = screen.getByTestId('review-toast-link')
    expect(link.getAttribute('href')).toBe('/posters/kyoto-rain')
  })

  it('follows the cycle — the link tracks whichever review is showing', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)
    await advance(REVIEW_TOAST_CYCLE_MS)

    expect(screen.getByTestId('review-toast-link').getAttribute('href')).toBe(
      '/posters/osaka-dusk'
    )
  })

  it('asks for one small page of the feed, not the whole thing', async () => {
    await renderToast('/')
    await advance(REVIEW_TOAST_INITIAL_DELAY_MS)

    expect(useReviewFeedMock).toHaveBeenCalled()
    const [page, pageSize] = useReviewFeedMock.mock.calls[0]
    expect(page).toBe(1)
    expect(pageSize).toBeLessThanOrEqual(10)
  })
})
