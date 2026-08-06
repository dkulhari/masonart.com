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
