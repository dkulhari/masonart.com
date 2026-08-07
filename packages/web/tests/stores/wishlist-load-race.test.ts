/**
 * Wishlist store load() race condition.
 *
 * Bug #505: load() overwrites ids with server response even if a reorder was
 * made while the request was in flight. Fixed by versioning: when a write
 * increments loadVersion, any in-flight load() response is considered stale.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

const reorderMock = vi.hoisted(() => vi.fn())
const listMock = vi.hoisted(() => vi.fn())

vi.mock('~/lib/api', () => ({
  wishlistApi: {
    reorder: (...args: unknown[]) => reorderMock(...args),
    list: (...args: unknown[]) => listMock(...args),
    add: vi.fn(),
    remove: vi.fn(),
    merge: vi.fn(),
    count: vi.fn(),
  },
}))

import { useWishlistStore } from '~/stores/wishlist'

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PRODUCT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

beforeEach(() => {
  vi.clearAllMocks()
  reorderMock.mockResolvedValue({ productIds: [] })
  listMock.mockResolvedValue({ items: [] })
  useWishlistStore.setState({
    ids: [],
    isLoaded: false,
    isPending: false,
    isAuthenticated: null,
    inFlight: null,
    loadVersion: 0,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('load() race condition', () => {
  it('preserves a reorder made while load() is in flight', async () => {
    useWishlistStore.setState({ isAuthenticated: true, ids: [] })

    let releaseReorder: () => void = () => {}
    let releaseFetch: () => void = () => {}
    const reorderPending = new Promise<void>((r) => (releaseReorder = r))
    const fetchPending = new Promise<void>((r) => (releaseFetch = r))

    // Mock reorder and list to control timing
    reorderMock.mockImplementation(() => reorderPending.then(() => ({ productIds: [] })))
    listMock.mockImplementation(() =>
      fetchPending.then(() => ({
        items: [{ id: PRODUCT_A }, { id: PRODUCT_B }, { id: PRODUCT_C }],
      }))
    )

    // Start a load that will resolve AFTER reorder completes
    const loadDone = useWishlistStore.getState().load()
    await Promise.resolve()

    // Set up initial ids and reorder while load is in flight
    useWishlistStore.setState({ ids: [PRODUCT_A, PRODUCT_B, PRODUCT_C] })
    const reorderDone = useWishlistStore.getState().reorder(0, 2)

    // Verify reorder applied optimistically
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_B, PRODUCT_C, PRODUCT_A])
    expect(useWishlistStore.getState().isPending).toBe(true)

    // Reorder completes
    releaseReorder()
    await reorderDone

    // Reordered state preserved after reorder completes
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_B, PRODUCT_C, PRODUCT_A])
    expect(useWishlistStore.getState().isPending).toBe(false)

    // Load resolves with original order
    releaseFetch()
    await loadDone

    // Reordered state must survive — load's stale response is discarded
    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_B, PRODUCT_C, PRODUCT_A])
    expect(useWishlistStore.getState().isLoaded).toBe(true)
  })

  it('applies load response when no writes occur', async () => {
    useWishlistStore.setState({ isAuthenticated: true, ids: [] })

    listMock.mockResolvedValue({
      items: [{ id: PRODUCT_A }, { id: PRODUCT_B }],
    })

    await useWishlistStore.getState().load()

    expect(useWishlistStore.getState().ids).toEqual([PRODUCT_A, PRODUCT_B])
    expect(useWishlistStore.getState().isLoaded).toBe(true)
  })
})
