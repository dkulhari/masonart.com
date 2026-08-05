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
  useWishlistStore.setState({
    ids: [],
    isLoaded: false,
    isPending: false,
    // `null` is "the root route has not reported yet", which is the state a
    // leaf effect sees on first paint — clearing it to `true` here would hide
    // the very thing the guest cases assert (#417).
    isAuthenticated: null,
    inFlight: null,
  })

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

/** Signed in, as far as the store is concerned. */
const authenticate = () => useWishlistStore.setState({ isAuthenticated: true })

describe('auth gate', () => {
  it('makes no request while the session is still unknown', async () => {
    // Leaf effects (one per heart) run before the root route reports the
    // session. A guest loading a 24-card grid used to fire a request per card,
    // all 401 (#417).
    const spy = stubFetch({ items: [] })

    await useWishlistStore.getState().load()

    expect(spy).not.toHaveBeenCalled()
    expect(useWishlistStore.getState().isLoaded).toBe(false)
  })

  it('marks a guest loaded and empty without asking the server', async () => {
    const spy = stubFetch({ items: [] })

    useWishlistStore.getState().setAuthenticated(false)

    expect(spy).not.toHaveBeenCalled()
    expect(useWishlistStore.getState().ids).toEqual([])
    // Loaded, so every heart renders its empty state instead of waiting.
    expect(useWishlistStore.getState().isLoaded).toBe(true)

    // And a late-mounting card's load() still does not reach the server.
    await useWishlistStore.getState().load()
    expect(spy).not.toHaveBeenCalled()
  })

  it('loads exactly once when the session arrives', async () => {
    const spy = stubFetch({ items: [{ id: PRODUCT_A }] })

    useWishlistStore.getState().setAuthenticated(true)
    await useWishlistStore.getState().load()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
  })
})

describe('load', () => {
  beforeEach(authenticate)

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

  it('fetches once when every card calls load in the same tick', async () => {
    // The sequential case above passed all along: `isLoaded` flips before the
    // second call. Real cards mount together and all clear the guard before
    // any request resolves, which is the actual defect (#417).
    const spy = stubFetch({ items: [{ id: PRODUCT_A }] })

    const { load } = useWishlistStore.getState()
    await Promise.all(Array.from({ length: 24 }, () => load()))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
  })

  it('lets a later load run after an in-flight one fails', async () => {
    // The in-flight promise must be cleared on the failure path too, or the
    // store is wedged for the rest of the session.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await useWishlistStore.getState().load()

    useWishlistStore.setState({ isLoaded: false })
    const spy = stubFetch({ items: [{ id: PRODUCT_B }] })
    await useWishlistStore.getState().load()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_B])
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
