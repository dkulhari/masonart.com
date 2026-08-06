/**
 * After a paid order the server has already emptied the cart
 * (routes/orders.ts:542). The button must not send a second DELETE — it would
 * be a wasted round trip, and it would take out anything added since.
 */

import { describe, it, expect, vi } from 'vitest'
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

describe('post-payment cart reset', () => {
  it('empties locally without a DELETE', () => {
    useCartStore.setState({
      items: [
        {
          id: 'server-1',
          productId: 'p',
          variantId: 'v',
          frameId: null,
          quantity: 1,
          productTitle: 'x',
          productSlug: 'x',
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

    const { result } = renderHook(() => useCartActions(), { wrapper })
    act(() => result.current.resetLocalCart())

    expect(useCartStore.getState().items).toEqual([])
    expect(cartApi.clear).not.toHaveBeenCalled()
  })
})
