/**
 * The wishlist page's contents.
 *
 * Lives in a component rather than in the route module so it can be rendered
 * here at all: a route calls `createFileRoute` at module scope and cannot be
 * imported into jsdom without a router.
 *
 * The page reads the store, which holds ids and nothing else — for a guest
 * those ids came from localStorage (#477), for a signed-in user from the
 * account. Either way the page hydrates them through the PUBLIC by-ids
 * endpoint, so one code path serves both and a guest is never asked to sign in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WishlistContents } from '~/components/wishlist/WishlistContents'
import { useWishlistStore } from '~/stores/wishlist'

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const productRow = (id: string, title: string) => ({
  id,
  sku: `SKU-${title}`,
  title,
  slug: title.toLowerCase(),
  basePrice: '1999.00',
  images: [],
  orientation: 'portrait',
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

/** Stub fetch, recording the ids each by-ids call asked for. */
function stubProducts(items: unknown[]) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items }),
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const requestedIds = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).ids)

beforeEach(() => {
  useWishlistStore.setState({
    ids: [],
    isLoaded: true,
    isPending: false,
    isAuthenticated: false,
    inFlight: null,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WishlistContents', () => {
  it('invites the visitor to browse when nothing is saved', async () => {
    stubProducts([])

    render(<WishlistContents />)

    await waitFor(() => {
      expect(screen.getByText(/nothing saved yet/i)).toBeTruthy()
    })
    expect(screen.getByRole('link', { name: /browse posters/i })).toBeTruthy()
  })

  it('renders a card per saved product', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A, PRODUCT_B] })
    stubProducts([productRow(PRODUCT_A, 'Alpha'), productRow(PRODUCT_B, 'Beta')])

    render(<WishlistContents />)

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy()
    })
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('never asks the wishlist API — the ids are already in the store', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    const spy = stubProducts([productRow(PRODUCT_A, 'Alpha')])

    render(<WishlistContents />)

    await waitFor(() => expect(spy).toHaveBeenCalled())
    // A guest has no session; hitting /api/wishlist would 401 and show nothing.
    for (const [url] of spy.mock.calls) {
      expect(String(url)).not.toContain('/api/wishlist')
    }
  })

  it('quietly drops an id whose product has left the catalogue', async () => {
    // No FK backs the saved-id array, so a deleted product leaves a dangling
    // id. It shows as one fewer card, not as a broken one.
    useWishlistStore.setState({ ids: [PRODUCT_A, PRODUCT_B] })
    stubProducts([productRow(PRODUCT_A, 'Alpha')])

    render(<WishlistContents />)

    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
    expect(screen.queryByText('Beta')).toBeNull()
  })

  it('asks for at most 50 ids per request', async () => {
    // The by-ids endpoint caps the payload at 50 and 400s past it, which would
    // blank the page for anyone with a long list.
    const many = Array.from(
      { length: 60 },
      (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`
    )
    useWishlistStore.setState({ ids: many })
    const spy = stubProducts([])

    render(<WishlistContents />)

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(requestedIds(spy).map((ids) => ids.length)).toEqual([50, 10])
  })

  it('says so when everything saved has gone stale, and clears the dead ids', async () => {
    /**
     * Reported live: the badge said 3, the page rendered ProductGrid's own
     * "No products found — try adjusting your filters" state, and nothing
     * explained why. A guest's ids outlive the catalogue (a reseeded database
     * changes every product id), so ALL of them can dangle at once. `ids` is
     * not empty, so the saved-nothing state never showed.
     */
    useWishlistStore.setState({ ids: [PRODUCT_A, PRODUCT_B] })
    stubProducts([])

    render(<WishlistContents />)

    await waitFor(() => {
      expect(screen.getByText(/no longer available/i)).toBeTruthy()
    })
    // Never the collection grid's filter copy — there are no filters here.
    expect(screen.queryByText(/adjusting your filters/i)).toBeNull()
    // And the dead ids are gone, so the badge stops disagreeing with the page.
    expect(useWishlistStore.getState().ids).toEqual([])
  })

  it('keeps a signed-in list intact even when nothing resolves', async () => {
    // The server already filtered these to live products, so an empty answer
    // is a failure of this request, not proof the saves are dead. Deleting an
    // account's wishlist over a bad round-trip is unrecoverable.
    useWishlistStore.setState({ ids: [PRODUCT_A], isAuthenticated: true })
    stubProducts([])

    render(<WishlistContents />)

    await waitFor(() => {
      expect(screen.getByText(/no longer available/i)).toBeTruthy()
    })
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
  })

  it('offers a retry when the lookup fails outright', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    const spy = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', spy)

    render(<WishlistContents />)

    await waitFor(() => {
      expect(screen.getByText(/could not load your saved items/i)).toBeTruthy()
    })
    // A failed lookup must not be mistaken for stale saves and delete them.
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])

    spy.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [productRow(PRODUCT_A, 'Alpha')] }),
    })
    screen.getByRole('button', { name: /try again/i }).click()

    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
  })

  it('does not re-fetch a product it already has', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    const spy = stubProducts([productRow(PRODUCT_A, 'Alpha')])

    render(<WishlistContents />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())

    // Saving something else must fetch only the new id, not the whole list.
    useWishlistStore.setState({ ids: [PRODUCT_A, PRODUCT_B] })
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(requestedIds(spy)).toEqual([[PRODUCT_A], [PRODUCT_B]])
  })
})
