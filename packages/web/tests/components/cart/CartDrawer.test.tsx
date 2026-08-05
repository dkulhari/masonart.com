/**
 * CartDrawer Tests (#460)
 *
 * mesonart's cart slides in from the LEFT edge. Ours used to be a route
 * (`/cart`); the drawer is now the primary surface, and the panel's anchor is
 * the whole point of the ticket — hence the explicit left/right assertions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Node 25's `localStorage` global shadows jsdom's and has no methods; zustand's
// persist grabs storage at module init, so this has to run before the import.
vi.hoisted(() => {
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
})

import { CartDrawer } from '~/components/cart/CartDrawer'
import { useCartStore, type CartItem } from '~/stores/cart'

const sampleItem: CartItem = {
  id: 'cart_1',
  productId: 'p1',
  variantId: 'v1',
  frameId: null,
  quantity: 1,
  productTitle: 'Test Poster',
  productSlug: 'test-poster',
  thumbnailUrl: '/img.jpg',
  sizeLabel: '18x24',
  widthInches: 18,
  heightInches: 24,
  unitPrice: 1999,
  framePrice: 0,
  isAiGenerated: false,
  addedAt: '2026-08-05T00:00:00.000Z',
}

describe('CartDrawer', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isDrawerOpen: true })
  })

  afterEach(() => {
    cleanup()
    useCartStore.setState({ items: [], isDrawerOpen: false })
  })

  it('anchors the panel to the left edge', () => {
    render(<CartDrawer />)

    const panel = screen.getByRole('dialog')
    expect(panel.className).toContain('left-0')
    expect(panel.className).not.toContain('right-0')
    expect(panel.className).toContain('slide-in-from-left')
  })

  it('renders nothing when the store says closed', () => {
    useCartStore.setState({ isDrawerOpen: false })
    render(<CartDrawer />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', () => {
    render(<CartDrawer />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(useCartStore.getState().isDrawerOpen).toBe(false)
  })

  it('closes on backdrop click', () => {
    render(<CartDrawer />)

    fireEvent.click(screen.getByTestId('cart-drawer-backdrop'))

    expect(useCartStore.getState().isDrawerOpen).toBe(false)
  })

  it('closes from the close button', () => {
    render(<CartDrawer />)

    fireEvent.click(screen.getByRole('button', { name: /close cart/i }))

    expect(useCartStore.getState().isDrawerOpen).toBe(false)
  })

  it('shows the empty state when there is nothing in the cart', () => {
    render(<CartDrawer />)

    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument()
  })

  it('lists the items and links on to checkout and the cart page', () => {
    useCartStore.setState({ items: [sampleItem], isDrawerOpen: true })
    render(<CartDrawer />)

    expect(screen.getByText('Test Poster')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /checkout/i })).toHaveAttribute(
      'href',
      '/checkout'
    )
    expect(screen.getByRole('link', { name: /view cart/i })).toHaveAttribute(
      'href',
      '/cart'
    )
  })

  it('locks body scroll while open and restores it on close', () => {
    const { unmount } = render(<CartDrawer />)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
