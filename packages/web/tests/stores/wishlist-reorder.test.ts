/**
 * Reordering the wishlist.
 *
 * The store already distinguishes guest from signed-in for `toggle`, and this
 * follows it: apply locally first, and only the persistence path differs. A
 * guest's list lives in localStorage and is authoritative; a signed-in list has
 * to be told.
 *
 * The one departure from `toggle` is the failure path. `toggle` rolls back to
 * the previous array; a failed reorder RELOADS instead, because the server
 * rejecting a reorder means the list changed underneath — that is precisely
 * the 409 the endpoint returns, and rolling back to a stale array would leave
 * the client wrong in a second way.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWishlistStore } from '~/stores/wishlist'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const reorderMock = vi.fn()
const listMock = vi.fn()

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

/** Put the store in a known state without going through load(). */
function seed(ids: string[], isAuthenticated: boolean) {
  useWishlistStore.setState({
    ids,
    isAuthenticated,
    isLoaded: true,
    isPending: false,
    inFlight: null,
  })
}

const idsNow = () => useWishlistStore.getState().ids

beforeEach(() => {
  vi.clearAllMocks()
  reorderMock.mockResolvedValue({ productIds: [] })
  listMock.mockResolvedValue({ items: [] })
})

afterEach(() => {
  useWishlistStore.setState({ ids: [], isAuthenticated: null, isLoaded: false })
})

describe('moving an item', () => {
  it('moves it down and shifts the rest up', async () => {
    seed([A, B, C], false)
    await useWishlistStore.getState().reorder(0, 2)
    expect(idsNow()).toEqual([B, C, A])
  })

  it('moves it up and shifts the rest down', async () => {
    seed([A, B, C], false)
    await useWishlistStore.getState().reorder(2, 0)
    expect(idsNow()).toEqual([C, A, B])
  })

  it('moves it one place, which is what the buttons do', async () => {
    seed([A, B, C], false)
    await useWishlistStore.getState().reorder(1, 0)
    expect(idsNow()).toEqual([B, A, C])
  })

  it('treats a move to its own index as a no-op', async () => {
    seed([A, B, C], true)
    await useWishlistStore.getState().reorder(1, 1)
    expect(idsNow()).toEqual([A, B, C])
    // Nothing changed, so nothing to persist.
    expect(reorderMock).not.toHaveBeenCalled()
  })

  it('ignores out-of-range indices rather than corrupting the array', async () => {
    // A drop outside the list is a real event, not a caller bug to crash on.
    seed([A, B, C], false)
    await useWishlistStore.getState().reorder(0, 9)
    expect(idsNow()).toEqual([A, B, C])
    await useWishlistStore.getState().reorder(-1, 1)
    expect(idsNow()).toEqual([A, B, C])
  })
})

describe('persistence', () => {
  it('never calls the API for a guest', async () => {
    // A guest's list is local and authoritative. The persist middleware writes
    // localStorage; there is nothing to send.
    seed([A, B, C], false)
    await useWishlistStore.getState().reorder(0, 1)

    expect(reorderMock).not.toHaveBeenCalled()
    expect(idsNow()).toEqual([B, A, C])
  })

  it('sends the new order when signed in', async () => {
    seed([A, B, C], true)
    await useWishlistStore.getState().reorder(0, 2)

    expect(reorderMock).toHaveBeenCalledWith([B, C, A])
  })

  it('applies optimistically, before the request settles', async () => {
    seed([A, B, C], true)
    let release: () => void = () => {}
    reorderMock.mockReturnValue(new Promise<void>((r) => (release = r)))

    const pending = useWishlistStore.getState().reorder(0, 2)
    // Already moved, with the write still in flight.
    expect(idsNow()).toEqual([B, C, A])

    release()
    await pending
  })
})

describe('when the write fails', () => {
  it('reloads from the server rather than keeping the optimistic order', async () => {
    // A rejected reorder means the list changed underneath — the 409 case.
    // Rolling back to the previous array would be wrong in a second way.
    seed([A, B, C], true)
    reorderMock.mockRejectedValue(new Error('conflict'))
    listMock.mockResolvedValue({
      items: [{ id: C }, { id: B }, { id: A }],
    })

    await useWishlistStore.getState().reorder(0, 2)

    expect(listMock).toHaveBeenCalled()
    expect(idsNow()).toEqual([C, B, A])
  })

  it('leaves the list usable when the reload also fails', async () => {
    seed([A, B, C], true)
    reorderMock.mockRejectedValue(new Error('conflict'))
    listMock.mockRejectedValue(new Error('offline'))

    await expect(
      useWishlistStore.getState().reorder(0, 2)
    ).resolves.toBeUndefined()

    // Whatever it holds, it holds three items and has not thrown.
    expect(idsNow()).toHaveLength(3)
  })
})
