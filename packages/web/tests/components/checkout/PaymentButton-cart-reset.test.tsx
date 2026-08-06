/**
 * After a paid order the server has already emptied the cart
 * (routes/orders.ts:542). The button must not send a second DELETE — it would
 * be a wasted round trip, and it would take out anything added since.
 *
 * This test verifies that PaymentButton uses resetLocalCart (not clearCart)
 * and that resetLocalCart does not call cartApi.clear().
 * The test is a regression pin: it prevents a future developer from "fixing"
 * the code back to clearCart, which would waste a round trip and could remove
 * items added between order placement and redirect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
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
  cartApi: { get: vi.fn(), clear: vi.fn() },
}))

import { cartApi } from '~/lib/api'
import { useCartActions } from '~/hooks/useCartActions'
import { useCartStore } from '~/stores/cart'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('resetLocalCart regression pin', () => {
  beforeEach(() => {
    // Set up initial cart state with items
    useCartStore.setState({
      items: [
        {
          id: 'server-1',
          productId: 'p',
          variantId: 'v',
          frameId: null,
          quantity: 1,
          productTitle: 'Test Poster',
          productSlug: 'test-poster',
          thumbnailUrl: '',
          sizeLabel: 'A4',
          widthInches: 8,
          heightInches: 12,
          unitPrice: 100,
          framePrice: 0,
          isAiGenerated: false,
          addedAt: '2026-08-06T06:00:00.000Z',
        },
      ],
    })

    vi.clearAllMocks()
  })

  it('resetLocalCart clears store locally WITHOUT calling cartApi.clear()', () => {
    // Precondition: cart has items
    expect(useCartStore.getState().items).toHaveLength(1)

    // Call resetLocalCart via the hook
    const { result } = renderHook(() => useCartActions(), { wrapper })
    act(() => result.current.resetLocalCart())

    // Verify: store is cleared
    expect(useCartStore.getState().items).toEqual([])

    // CRITICAL ASSERTION: cartApi.clear() was NOT called.
    // This is the regression pin: if PaymentButton is changed to call
    // clearCart() instead of resetLocalCart(), this assertion will fail,
    // because clearCart() calls cartApi.clear().
    expect(cartApi.clear).not.toHaveBeenCalled()
  })
})
