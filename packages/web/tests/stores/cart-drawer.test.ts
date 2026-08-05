/**
 * Cart Drawer State Tests (#460)
 *
 * The cart is a left slide-out drawer, so its open/closed state lives on the
 * cart store rather than in a parent component: any surface (header button,
 * PDP add-to-cart, quickview) opens it without prop-drilling through __root.
 *
 * Note the import: `~/stores/cart` is the live storefront store (app/), not the
 * legacy API-backed `@/stores/cart` covered by cart.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Node 25 exposes its own `localStorage` global with no usable methods, and it
// shadows jsdom's. zustand's persist captures the storage object once, at
// module init, so the replacement has to be installed before the store is
// imported — hence vi.hoisted rather than beforeEach.
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

import { useCartStore, type AddToCartInput } from '~/stores/cart'

const sampleItem: AddToCartInput = {
  productId: 'p1',
  variantId: 'v1',
  productTitle: 'Test Poster',
  productSlug: 'test-poster',
  thumbnailUrl: '/img.jpg',
  sizeLabel: '18x24',
  widthInches: 18,
  heightInches: 24,
  unitPrice: 1999,
  quantity: 1,
}

describe('cart drawer state', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isDrawerOpen: false })
    localStorage.clear()
  })

  it('starts closed', () => {
    expect(useCartStore.getState().isDrawerOpen).toBe(false)
  })

  it('opens and closes', () => {
    useCartStore.getState().openDrawer()
    expect(useCartStore.getState().isDrawerOpen).toBe(true)

    useCartStore.getState().closeDrawer()
    expect(useCartStore.getState().isDrawerOpen).toBe(false)
  })

  it('toggles', () => {
    useCartStore.getState().toggleDrawer()
    expect(useCartStore.getState().isDrawerOpen).toBe(true)

    useCartStore.getState().toggleDrawer()
    expect(useCartStore.getState().isDrawerOpen).toBe(false)
  })

  it('auto-opens when an item is added', () => {
    useCartStore.getState().addItem(sampleItem)
    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('auto-opens when adding a duplicate that only bumps quantity', () => {
    useCartStore.getState().addItem(sampleItem)
    useCartStore.getState().closeDrawer()

    useCartStore.getState().addItem(sampleItem)

    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].quantity).toBe(2)
    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('does not persist drawer state to localStorage', () => {
    useCartStore.getState().addItem(sampleItem)

    const raw = localStorage.getItem('chobii-cart-storage') ?? '{}'
    expect(raw).not.toContain('isDrawerOpen')
  })
})
