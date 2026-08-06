/**
 * A cart write that the server refused is rolled back, so the drawer has to
 * say why — otherwise the item the customer added simply is not there and
 * nothing explains it (#511).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  cartApi: {
    get: vi.fn().mockResolvedValue({
      id: 'cart-1',
      itemCount: 0,
      subtotal: '0.00',
      savingTotal: '0.00',
      items: [],
      savedForLater: [],
    }),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}))

import { useCartStore } from '~/stores/cart'
import { CartDrawer } from '~/components/cart/CartDrawer'

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CartDrawer />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useCartStore.setState({ items: [], isDrawerOpen: true, syncError: null })
})

describe('CartDrawer sync error', () => {
  it('shows nothing when there is no error', () => {
    renderDrawer()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server’s reason when a write was refused', () => {
    useCartStore.setState({ syncError: 'Product variant is out of stock' })
    renderDrawer()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Product variant is out of stock'
    )
  })
})
