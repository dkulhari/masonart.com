/**
 * Wishlist store.
 *
 * Three properties carry the weight here and all three are asserted below:
 *
 *  - the toggle is OPTIMISTIC and rolls back, because a heart that waits on a
 *    round-trip reads as broken;
 *  - saving does NOT require an account. A guest's list lives in localStorage
 *    and merges into the account on sign-in (#477);
 *  - only the GUEST list is persisted. Once signed in the account owns it, and
 *    writing it to disk would show the next user of a shared machine the last
 *    one's hearts — which is why the store originally persisted nothing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Node 25 exposes its own `localStorage` global with no usable methods, and it
// shadows jsdom's. zustand's persist captures the storage object once, at
// module init, so the replacement has to be installed before the store is
// imported — hence vi.hoisted rather than beforeEach.
const memoryStorage = vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => void mem.set(key, String(value)),
      removeItem: (key: string) => void mem.delete(key),
      clear: () => mem.clear(),
      key: (index: number) => [...mem.keys()][index] ?? null,
      get length() {
        return mem.size
      },
    },
  })
  return mem
})

import { useWishlistStore, WISHLIST_STORAGE_KEY } from '~/stores/wishlist'

/** The ids zustand has actually written to storage, if any. */
function persistedIds(): string[] | undefined {
  const raw = memoryStorage.get(WISHLIST_STORAGE_KEY)
  return raw ? JSON.parse(raw).state?.ids : undefined
}

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
  memoryStorage.clear()
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

/** Every fetch call as `METHOD /path`, for asserting which endpoint ran. */
const callsTo = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map(
    ([url, init]) =>
      `${(init as RequestInit | undefined)?.method ?? 'GET'} ${new URL(String(url)).pathname}`
  )

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

  it('keeps a guest loaded on their own local list, without asking the server', async () => {
    // Saving does not require an account (#477) — the rehydrated list IS the
    // guest's wishlist, so reporting "signed out" must not wipe it.
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    const spy = stubFetch({ items: [] })

    useWishlistStore.getState().setAuthenticated(false)

    expect(spy).not.toHaveBeenCalled()
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
    // Loaded, so every heart renders its real state instead of waiting.
    expect(useWishlistStore.getState().isLoaded).toBe(true)

    // And a late-mounting card's load() still does not reach the server.
    await useWishlistStore.getState().load()
    expect(spy).not.toHaveBeenCalled()
  })

  it('drops the account list on sign-out rather than keeping it locally', async () => {
    // The other direction: what is on screen belongs to the account, not to
    // this browser. Keeping it would persist one user's hearts for the next.
    useWishlistStore.setState({ isAuthenticated: true, ids: [PRODUCT_A] })

    useWishlistStore.getState().setAuthenticated(false)

    expect(useWishlistStore.getState().ids).toEqual([])
    expect(persistedIds()).toEqual([])
  })

  it('loads exactly once when the session arrives', async () => {
    const spy = stubFetch({ items: [{ id: PRODUCT_A }] })

    // Reporting the session is enough — it waits for rehydration and then
    // loads on its own, which is all the root route's effect does.
    useWishlistStore.getState().setAuthenticated(true)
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
  })
})

describe('guest saving', () => {
  beforeEach(() => useWishlistStore.getState().setAuthenticated(false))

  it('toggles locally and sends nothing', async () => {
    const spy = stubFetch({})

    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
    expect(spy).not.toHaveBeenCalled()
  })

  it('unsaves locally too', async () => {
    const spy = stubFetch({})

    await useWishlistStore.getState().toggle(PRODUCT_A)
    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(useWishlistStore.getState().ids).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('writes the list to localStorage so it survives a reload', async () => {
    stubFetch({})

    await useWishlistStore.getState().toggle(PRODUCT_A)

    expect(persistedIds()).toEqual([PRODUCT_A])
  })
})

describe('merge on sign-in', () => {
  it('sends the local list and takes the server answer', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    // The account already held B; the merge is a union of both.
    const spy = stubFetch({ items: [{ id: PRODUCT_A }, { id: PRODUCT_B }] })

    authenticate()
    await useWishlistStore.getState().load()

    expect(callsTo(spy)).toEqual(['POST /api/wishlist/merge'])
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      productIds: [PRODUCT_A],
    })
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A, PRODUCT_B])
  })

  it('stops persisting once the account owns the list', async () => {
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    stubFetch({ items: [{ id: PRODUCT_A }] })

    authenticate()
    await useWishlistStore.getState().load()

    // On screen, but no longer on disk — the next user of this machine must
    // not inherit it.
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
    expect(persistedIds()).toEqual([])
  })

  it('plain-loads when there is nothing local to contribute', async () => {
    // The usual case: a signed-in user opening a second page. A merge POST
    // here would be a write on every page load.
    const spy = stubFetch({ items: [{ id: PRODUCT_B }] })

    authenticate()
    await useWishlistStore.getState().load()

    expect(callsTo(spy)).toEqual(['GET /api/wishlist'])
  })

  it('merges even though the guest list already counted as loaded', async () => {
    /**
     * A guest is marked loaded — there is nothing to wait for. Signing in from
     * that state must not hit `load()`'s "already loaded" guard, or the merge
     * never runs while the flag flip has already emptied the stored list. That
     * is precisely how the browser lost a guest's saves at sign-in.
     */
    useWishlistStore.getState().setAuthenticated(false)
    await useWishlistStore.getState().toggle(PRODUCT_A)
    expect(useWishlistStore.getState().isLoaded).toBe(true)

    const spy = stubFetch({ items: [{ id: PRODUCT_A }] })
    useWishlistStore.getState().setAuthenticated(true)
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())

    expect(callsTo(spy)).toEqual(['POST /api/wishlist/merge'])
  })

  it('waits for the rehydrated guest list before merging', async () => {
    /**
     * zustand reads storage asynchronously, so on a fast machine the root
     * route reports the session BEFORE the guest's ids are back. Merging then
     * sends an empty list, the server answers with the account's list, and the
     * guest's saves are gone — which is exactly what the browser did before
     * this wait existed.
     */
    let finishHydration = () => {}
    vi.spyOn(useWishlistStore.persist, 'hasHydrated').mockReturnValue(false)
    vi.spyOn(useWishlistStore.persist, 'onFinishHydration').mockImplementation(
      (cb) => {
        finishHydration = () => cb(useWishlistStore.getState())
        return () => {}
      }
    )
    const spy = stubFetch({ items: [{ id: PRODUCT_A }, { id: PRODUCT_B }] })

    useWishlistStore.getState().setAuthenticated(true)
    await Promise.resolve()
    expect(spy).not.toHaveBeenCalled()
    // Nor may the flag flip yet: `partialize` would write an empty list over
    // the guest's stored one while rehydration is still reading it.
    expect(useWishlistStore.getState().isAuthenticated).toBeNull()

    // Storage comes back with what the guest saved.
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    finishHydration()
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())

    expect(callsTo(spy)).toEqual(['POST /api/wishlist/merge'])
    expect(JSON.parse(String(spy.mock.calls[0]?.[1]?.body))).toEqual({
      productIds: [PRODUCT_A],
    })
  })

  it('keeps the local list when the merge fails', async () => {
    // Losing a guest's saves to a flaky sign-in is worse than showing them
    // twice; the next load merges again.
    useWishlistStore.setState({ ids: [PRODUCT_A] })
    stubFetch({ error: 'boom' }, false)

    authenticate()
    await useWishlistStore.getState().load()

    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A])
    expect(useWishlistStore.getState().isLoaded).toBe(true)
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

  it('leaves the store empty and loaded when the request fails', async () => {
    // A session can lapse mid-visit; the resulting 401 is not worth throwing
    // over, and the UI must stop waiting either way.
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
  // Signed in — the guest path is local-only and covered above.
  beforeEach(authenticate)

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
  it('persists a guest list', () => {
    // A guest cart is real and so is a guest wishlist (#477) — it must survive
    // a reload without an account.
    useWishlistStore.setState({ isAuthenticated: false, ids: [PRODUCT_A] })

    expect(persistedIds()).toEqual([PRODUCT_A])
  })

  it('persists nothing for a signed-in user', () => {
    // The original reason this store had no persist middleware at all: a
    // shared machine must not show the previous user's hearts.
    useWishlistStore.setState({ isAuthenticated: true, ids: [PRODUCT_A] })

    expect(persistedIds()).toEqual([])
  })
})
