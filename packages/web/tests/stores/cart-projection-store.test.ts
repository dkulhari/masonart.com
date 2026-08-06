/**
 * The live storefront store (`~/stores/cart`) as a projection of the server
 * cart (#511).
 *
 * Not to be confused with tests/stores/cart.test.ts, which covers the dead
 * `@/stores/cart` under packages/web/src.
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
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

import { useCartStore, type CartItem } from '~/stores/cart'
import type { ServerCartPayload } from '~/lib/cart-projection'

const serverCart: ServerCartPayload = {
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

const localItem: CartItem = {
  id: 'pending-1',
  productId: 'prod-9',
  variantId: 'var-9',
  frameId: null,
  quantity: 1,
  productTitle: 'Old',
  productSlug: 'old',
  thumbnailUrl: '',
  sizeLabel: 'A4',
  widthInches: 8,
  heightInches: 12,
  unitPrice: 100,
  framePrice: 0,
  isAiGenerated: false,
  addedAt: '2026-08-01T00:00:00.000Z',
}

describe('cart store as a server projection', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
  })

  it('replaceFromServer discards whatever was local', () => {
    useCartStore.setState({ items: [localItem] })
    useCartStore.getState().replaceFromServer(serverCart)

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('addItemLocal returns the temporary id it minted', () => {
    const id = useCartStore.getState().addItemLocal({
      productId: 'prod-1',
      variantId: 'var-1',
      productTitle: 'Blue Hour',
      productSlug: 'blue-hour',
      thumbnailUrl: '',
      sizeLabel: '24x36 inches',
      widthInches: 24,
      heightInches: 36,
      unitPrice: 2000,
    })

    expect(id).toMatch(/^pending/)
    expect(useCartStore.getState().items[0].id).toBe(id)
  })

  it('addItemLocal opens the drawer', () => {
    useCartStore.getState().addItemLocal({
      productId: 'prod-1',
      variantId: 'var-1',
      productTitle: 'Blue Hour',
      productSlug: 'blue-hour',
      thumbnailUrl: '',
      sizeLabel: '24x36 inches',
      widthInches: 24,
      heightInches: 36,
      unitPrice: 2000,
    })

    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('restore puts back an exact snapshot', () => {
    useCartStore.getState().replaceFromServer(serverCart)
    useCartStore.getState().restore([localItem])

    expect(useCartStore.getState().items).toEqual([localItem])
  })

  it('setSyncError carries a message and clears with null', () => {
    useCartStore.getState().setSyncError('Out of stock')
    expect(useCartStore.getState().syncError).toBe('Out of stock')

    useCartStore.getState().setSyncError(null)
    expect(useCartStore.getState().syncError).toBeNull()
  })

  it('clearLocal empties the items and nothing else', () => {
    useCartStore.setState({ items: [localItem], isDrawerOpen: true })
    useCartStore.getState().clearLocal()

    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('updateQuantityLocal at zero removes the line', () => {
    useCartStore.setState({ items: [localItem] })
    useCartStore.getState().updateQuantityLocal('pending-1', 0)

    expect(useCartStore.getState().items).toEqual([])
  })

  // #511 fix round 1, finding 1: syncError only ever had one way back to
  // null — adding something — so a rejected write's message survived every
  // successful edit that came after it, attached to an operation that no
  // longer failed.
  it('replaceFromServer clears a previous sync error', () => {
    useCartStore.getState().setSyncError('Product variant is out of stock')
    useCartStore.getState().replaceFromServer(serverCart)

    expect(useCartStore.getState().syncError).toBeNull()
  })

  it('closeDrawer clears a previous sync error', () => {
    useCartStore.setState({
      syncError: 'Product variant is out of stock',
      isDrawerOpen: true,
    })
    useCartStore.getState().closeDrawer()

    expect(useCartStore.getState().syncError).toBeNull()
  })
})
