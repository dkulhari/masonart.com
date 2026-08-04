/**
 * Wishlist store.
 *
 * Two properties carry the weight here and both are asserted below:
 *
 *  - the toggle is OPTIMISTIC and rolls back, because a heart that waits on a
 *    round-trip reads as broken;
 *  - the store does NOT persist to localStorage, unlike the cart store. The
 *    wishlist is server-owned and auth-gated; persisting it would show a
 *    signed-out visitor the previous user's hearts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWishlistStore } from '~/stores/wishlist'

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const reset = () =>
  useWishlistStore.setState({ ids: [], isLoaded: false, isPending: false })

beforeEach(() => {
  reset()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Stub fetch with a resolved JSON body. */
function stubFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('load', () => {
  it('populates ids from the server', async () => {
    stubFetch({ items: [{ id: PRODUCT_A }, { id: PRODUCT_B }] })

    await useWishlistStore.getState().load()

    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A, PRODUCT_B])
    expect(useWishlistStore.getState().isLoaded).toBe(true)
  })

  it('leaves the store empty and loaded when the user is signed out', async () => {
    // 401 is the normal case for a guest, not an error worth throwing over.
    stubFetch({ error: 'Unauthorized' }, false)

    await useWishlistStore.getState().load()

    expect(useWishlistStore.getState().ids).toEqual([])
    expect(useWishlistStore.getState().isLoaded).toBe(true)
  })

  it('fetches once, not once per card', async () => {
    // The grid renders up to 24 cards; each asking the server whether it is
    // saved would be 24 requests.
    const spy = stubFetch({ items: [{ id: PRODUCT_A }] })

    await useWishlistStore.getState().load()
    await useWishlistStore.getState().load()

    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('toggle', () => {
  it('adds optimistically, before the request resolves', async () => {
    let release: (v: unknown) => void = () => {}
    const pending = new Promise((r) => (release = r))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(pending.then(() => ({ ok: true, json: async () => ({}) })))
    )

    const done = useWishlistStore.getState().toggle(PRODUCT_A)

    // Asserted BEFORE the request settles — this is the whole point.
    expect(useWishlistStore.getState().ids).toContain(PRODUCT_A)

    release(null)
    await done
    expect(useWishlistStore.getState().ids).toContain(PRODUCT_A)
  })

  it('removes optimistically', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A], isLoaded: true })
    stubFetch({})

    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(useWishlistStore.getState().ids).not.toContain(PRODUCT_A)
  })

  it('rolls back an add when the request fails', async () => {
    stubFetch({ error: 'boom' }, false)

    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(useWishlistStore.getState().ids).not.toContain(PRODUCT_A)
  })

  it('rolls back a remove when the request fails', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A], isLoaded: true })
    stubFetch({ error: 'boom' }, false)

    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(useWishlistStore.getState().ids).toContain(PRODUCT_A)
  })

  it('rolls back when the request rejects outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(useWishlistStore.getState().ids).not.toContain(PRODUCT_A)
  })

  it('does not duplicate an id that is already saved', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A], isLoaded: true })
    stubFetch({})

    await useWishlistStore.getState().toggle(PRODUCT_B)

    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A, PRODUCT_B])
  })

  it('sends DELETE when saved and POST when not', async () => {
    const spy = stubFetch({})

    await useWishlistStore.getState().toggle(PRODUCT_A)
    expect(spy.mock.calls[0]?.[1]?.method).toBe('POST')

    await useWishlistStore.getState().toggle(PRODUCT_A)
    expect(spy.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })
})

describe('persistence', () => {
  it('does not write to localStorage', () => {
    // The cart store persists because a guest cart is real. The wishlist is
    // server-owned; persisting it leaks one user's hearts to the next.
    useWishlistStore.setState({ ids: [PRODUCT_A], isLoaded: true })

    const keys = Object.keys(globalThis.localStorage ?? {})
    expect(keys.some((k) => k.toLowerCase().includes('wishlist'))).toBe(false)
  })
})
