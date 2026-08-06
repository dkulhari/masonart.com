/**
 * The cart's single write path (#511).
 *
 * Before this hook existed, every cart write landed in localStorage and
 * nowhere else, while POST /api/orders built the order from the database cart —
 * so checkout failed with "No active cart found". These tests exist to keep
 * that from coming back: every action must reach cartApi, and a rejection must
 * leave the local cart exactly as it was.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

vi.mock('~/lib/api', () => ({
  cartApi: {
    get: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}))

import { cartApi } from '~/lib/api'
import { useCartStore } from '~/stores/cart'
import { useCartActions } from '~/hooks/useCartActions'

const SERVER_ID = '11111111-1111-1111-1111-111111111111'

const serverCart = {
  id: 'cart-1',
  itemCount: 1,
  subtotal: '2000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: SERVER_ID,
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      unitPrice: '2000.00',
      framePrice: '0.00',
      lineTotal: '2000.00',
      customizations: null,
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T06:00:00.000Z',
      product: { id: 'prod-1', title: 'Blue Hour', slug: 'blue-hour', images: [] },
      variant: {
        id: 'var-1',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
    },
  ],
}

const addInput = {
  productId: 'prod-1',
  variantId: 'var-1',
  frameId: null,
  quantity: 1,
  productTitle: 'Blue Hour',
  productSlug: 'blue-hour',
  thumbnailUrl: '',
  sizeLabel: '24x36 inches',
  widthInches: 24,
  heightInches: 36,
  unitPrice: 2000,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
  vi.mocked(cartApi.get).mockResolvedValue(serverCart)
})

describe('useCartActions.addItem', () => {
  it('sends the line to the server', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.addItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.addItem(addInput))

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      customizations: undefined,
      isAiGenerated: false,
      aiDetails: undefined,
    })
  })

  it('replaces the optimistic line with the server row', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.addItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.addItem(addInput))

    await waitFor(() =>
      expect(useCartStore.getState().items[0].id).toBe(SERVER_ID)
    )
  })

  it('rolls back and reports when the server refuses', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.addItem).mockRejectedValue(
      new Error('Product variant is out of stock')
    )

    await act(() => result.current.addItem(addInput))

    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().syncError).toBe(
      'Product variant is out of stock'
    )
  })
})

describe('useCartActions.updateQuantity', () => {
  beforeEach(() => {
    useCartStore.getState().replaceFromServer(serverCart)
  })

  it('patches the server row', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.updateItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.updateQuantity(SERVER_ID, 3))

    expect(cartApi.updateItem).toHaveBeenCalledWith(SERVER_ID, { quantity: 3 })
  })

  it('removes rather than patching a quantity of zero', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.updateQuantity(SERVER_ID, 0))

    expect(cartApi.updateItem).not.toHaveBeenCalled()
    expect(cartApi.removeItem).toHaveBeenCalledWith(SERVER_ID)
  })

  it('restores the previous quantity when the patch fails', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.updateItem).mockRejectedValue(new Error('nope'))

    await act(() => result.current.updateQuantity(SERVER_ID, 3))

    expect(useCartStore.getState().items[0].quantity).toBe(1)
    expect(useCartStore.getState().syncError).toBe('nope')
  })
})

describe('useCartActions.removeItem', () => {
  beforeEach(() => {
    useCartStore.getState().replaceFromServer(serverCart)
  })

  it('deletes the server row', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.removeItem(SERVER_ID))

    expect(cartApi.removeItem).toHaveBeenCalledWith(SERVER_ID)
  })

  it('puts the line back when the delete fails', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.removeItem).mockRejectedValue(new Error('nope'))

    await act(() => result.current.removeItem(SERVER_ID))

    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('never sends a pending id to the server', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    const pendingId = useCartStore.getState().addItemLocal(addInput)

    await act(() => result.current.removeItem(pendingId))

    expect(cartApi.removeItem).not.toHaveBeenCalled()
  })
})

describe('useCartActions.clearCart', () => {
  it('clears on the server and locally', async () => {
    useCartStore.getState().replaceFromServer(serverCart)
    vi.mocked(cartApi.clear).mockResolvedValue({ message: 'ok' })
    vi.mocked(cartApi.get).mockResolvedValue({ ...serverCart, items: [] })

    const { result } = renderHook(() => useCartActions(), { wrapper })
    await act(() => result.current.clearCart())

    expect(cartApi.clear).toHaveBeenCalled()
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
  })
})

describe('useCartActions.resetLocalCart', () => {
  it('empties the local cart without calling the server', () => {
    useCartStore.getState().replaceFromServer(serverCart)

    const { result } = renderHook(() => useCartActions(), { wrapper })
    act(() => result.current.resetLocalCart())

    expect(useCartStore.getState().items).toEqual([])
    expect(cartApi.clear).not.toHaveBeenCalled()
  })
})

/**
 * #511 fix round 1, finding 1: `replaceFromServer` was the only success path
 * that touched `syncError`... except it never did — nothing cleared it but
 * `addItemLocal`. A failed PATCH's message survived every successful write
 * that followed, attached to an operation that no longer failed.
 */
describe('useCartActions — syncError lifecycle', () => {
  beforeEach(() => {
    useCartStore.getState().replaceFromServer(serverCart)
  })

  it('a later successful write clears an earlier sync error', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.updateItem).mockRejectedValueOnce(new Error('nope'))

    await act(() => result.current.updateQuantity(SERVER_ID, 3))
    expect(useCartStore.getState().syncError).toBe('nope')

    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })
    await act(() => result.current.removeItem(SERVER_ID))

    expect(useCartStore.getState().syncError).toBeNull()
  })

  it('closing the drawer clears a stale sync error', () => {
    useCartStore.getState().setSyncError('Product variant is out of stock')

    const { result } = renderHook(() => useCartActions(), { wrapper })
    act(() => result.current.closeDrawer())

    expect(useCartStore.getState().syncError).toBeNull()
  })
})

/**
 * #511 fix round 1, finding 2: every action captured its pre-write snapshot
 * and, on rejection, restored it unconditionally — with no check for whether
 * a different write had landed in between. A rejected write could therefore
 * resurrect a line a second, successful write had already deleted server-side
 * (scenario A), and two overlapping writes on the same line could settle on
 * whichever server response happened to arrive last, not whichever write was
 * actually issued last (scenario B) — made worse by `queryClient.fetchQuery`
 * joining an already-in-flight fetch for `cartKeys.detail()` instead of
 * issuing a new request (confirmed against @tanstack/query-core 5.90's
 * `Query#fetch`, which returns the active retryer's promise whenever one
 * exists and `cancelRefetch` is not set — and the public `fetchQuery` never
 * sets it).
 */
describe('useCartActions — overlapping writes', () => {
  beforeEach(() => {
    useCartStore.getState().replaceFromServer(serverCart)
  })

  it('a rejected write does not undo a different write that already succeeded', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })

    let rejectUpdate!: (error: Error) => void
    const updateCall = new Promise<{ message: string }>((_resolve, reject) => {
      rejectUpdate = reject
    })
    vi.mocked(cartApi.updateItem).mockReturnValue(updateCall)
    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })
    vi.mocked(cartApi.get).mockResolvedValue({ ...serverCart, items: [] })

    await act(async () => {
      // Write A: a quantity bump that will stall, then fail.
      const writeA = result.current.updateQuantity(SERVER_ID, 5).catch(() => {})
      // Write B: issued after A, on the same line, and completes in full —
      // the server no longer has this row.
      await result.current.removeItem(SERVER_ID)
      expect(useCartStore.getState().items).toEqual([])

      // Only now does A's PATCH come back refused.
      rejectUpdate(new Error('nope'))
      await writeA
    })

    // A's rollback must be dropped — it is answering a question the store has
    // already moved past. Resurrecting the line here is exactly the
    // divergence from the server this task exists to close.
    expect(useCartStore.getState().items).toEqual([])
  })

  it('a later write is not clobbered by an earlier write whose response arrives after it', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.updateItem).mockResolvedValue({ message: 'ok' })

    let resolveEarlierGet!: (cart: unknown) => void
    const earlierGet = new Promise((resolve) => {
      resolveEarlierGet = resolve
    })
    vi.mocked(cartApi.get).mockReturnValueOnce(earlierGet as Promise<typeof serverCart>)

    // Write A's PATCH resolves and its own re-fetch is issued and left
    // outstanding — the guard that skips a re-fetch for an already-stale
    // write (see `applyIfCurrent`) means this only happens if A's re-fetch
    // starts before anything supersedes it, so B is not issued until here.
    const writeA = result.current.updateQuantity(SERVER_ID, 2)
    await waitFor(() => expect(cartApi.get).toHaveBeenCalledTimes(1))

    let resolveLaterGet!: (cart: unknown) => void
    const laterGet = new Promise((resolve) => {
      resolveLaterGet = resolve
    })
    vi.mocked(cartApi.get).mockReturnValueOnce(laterGet as Promise<typeof serverCart>)

    // Write B is issued while A's re-fetch is still in flight.
    const writeB = result.current.updateQuantity(SERVER_ID, 3)
    await waitFor(() => expect(cartApi.get).toHaveBeenCalledTimes(2))

    await act(async () => {
      // B's own re-fetch answers first...
      resolveLaterGet({
        ...serverCart,
        items: [{ ...serverCart.items[0], quantity: 3 }],
      })
      // ...then A's stale one arrives after.
      resolveEarlierGet({
        ...serverCart,
        items: [{ ...serverCart.items[0], quantity: 2 }],
      })

      await Promise.all([writeA, writeB])
    })

    // B was issued last; its answer has to be the one that sticks, no matter
    // which network response actually lands first, and A's re-fetch — issued
    // before B existed, answered after B already applied its own — must not
    // land on top of it.
    expect(useCartStore.getState().items[0]!.quantity).toBe(3)
  })
})

/**
 * #511 fix round 1, finding 3: `removeItem` on a still-pending line dropped
 * it locally and returned, reasoning there was no server row yet — but the
 * `addItem` that minted the id is typically still in flight, and its own
 * success re-projects the row it just created right back into view. The
 * customer's removal was silently discarded.
 */
describe('useCartActions — removing a still-pending line', () => {
  it('is deleted once the in-flight add that minted it resolves', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })

    let resolveAdd!: (value: { message: string; item: { id: string } }) => void
    const addCall = new Promise<{ message: string; item: { id: string } }>(
      (resolve) => {
        resolveAdd = resolve
      }
    )
    vi.mocked(cartApi.addItem).mockReturnValue(addCall)
    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })
    vi.mocked(cartApi.get).mockResolvedValue({ ...serverCart, items: [] })

    await act(async () => {
      const addPromise = result.current.addItem(addInput)
      const pendingId = useCartStore.getState().items[0]!.id
      expect(pendingId).toMatch(/^pending/)

      const removePromise = result.current.removeItem(pendingId)

      // The line is gone from view immediately...
      expect(useCartStore.getState().items).toEqual([])
      // ...but there is nothing to delete yet — the add has not answered.
      expect(cartApi.removeItem).not.toHaveBeenCalled()

      resolveAdd({ message: 'ok', item: { id: SERVER_ID } })
      await Promise.all([addPromise, removePromise])
    })

    expect(cartApi.removeItem).toHaveBeenCalledWith(SERVER_ID)
    expect(useCartStore.getState().items).toEqual([])
  })
})
