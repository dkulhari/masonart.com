/**
 * The store is a projection of the server cart, so something has to fetch it
 * on arrival. Without this the first paint shows a stale localStorage cart and
 * checkout disagrees with what is on screen (#511).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
  cartApi: { get: vi.fn() },
}))

import { cartApi } from '~/lib/api'
import { useCartStore } from '~/stores/cart'
import { CartSync } from '~/components/cart/CartSync'

const serverCart = {
  id: 'cart-1',
  itemCount: 1,
  subtotal: '2000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: '11111111-1111-1111-1111-111111111111',
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

function renderSync() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CartSync />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
})

describe('CartSync', () => {
  it('projects the server cart into the store', async () => {
    vi.mocked(cartApi.get).mockResolvedValue(serverCart)

    renderSync()

    await waitFor(() =>
      expect(useCartStore.getState().items[0].id).toBe(
        '11111111-1111-1111-1111-111111111111'
      )
    )
  })

  it('leaves the store alone when the cart cannot be fetched', async () => {
    vi.mocked(cartApi.get).mockRejectedValue(new Error('offline'))

    renderSync()

    await waitFor(() => expect(cartApi.get).toHaveBeenCalled())
    expect(useCartStore.getState().items).toEqual([])
  })

  it('renders nothing', () => {
    vi.mocked(cartApi.get).mockResolvedValue(serverCart)
    const { container } = renderSync()
    expect(container.firstChild).toBeNull()
  })
})
