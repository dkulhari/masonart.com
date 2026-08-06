/**
 * Test suite for idempotent replaceFromServer behavior.
 * When the same or equal cart data is projected twice, the items array
 * identity is preserved on the second call (no re-render), and syncError
 * is always cleared.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { useCartStore } from '~/stores/cart'
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

const differentCart: ServerCartPayload = {
  id: 'cart-1',
  itemCount: 2,
  subtotal: '4000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    ...serverCart.items,
    {
      id: '22222222-2222-2222-2222-222222222222',
      productId: 'prod-2',
      variantId: 'var-2',
      frameId: null,
      quantity: 1,
      unitPrice: '2000.00',
      framePrice: '0.00',
      lineTotal: '2000.00',
      customizations: null,
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T07:00:00.000Z',
      product: { id: 'prod-2', title: 'Golden Hour', slug: 'golden-hour', images: [] },
      variant: {
        id: 'var-2',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
    },
  ],
}

beforeEach(() => {
  useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
})

describe('replaceFromServer idempotent behavior', () => {
  it('preserves items array identity when projecting an equal payload twice', () => {
    // First projection
    useCartStore.getState().replaceFromServer(serverCart)
    const firstItems = useCartStore.getState().items
    expect(firstItems).toHaveLength(1)

    // Second projection with equal payload (different object, same content)
    const equalCart: ServerCartPayload = JSON.parse(JSON.stringify(serverCart))
    useCartStore.getState().replaceFromServer(equalCart)
    const secondItems = useCartStore.getState().items

    // Array identity should be preserved (no re-render)
    expect(secondItems).toBe(firstItems)
    expect(secondItems).toHaveLength(1)
  })

  it('clears syncError even when items array is preserved', () => {
    // Set an error state first
    useCartStore.setState({ syncError: 'Cart error' })
    expect(useCartStore.getState().syncError).toBe('Cart error')

    // Project an equal payload
    useCartStore.getState().replaceFromServer(serverCart)
    const firstItems = useCartStore.getState().items

    // syncError should be cleared
    expect(useCartStore.getState().syncError).toBeNull()

    // Project again with equal payload
    const equalCart: ServerCartPayload = JSON.parse(JSON.stringify(serverCart))
    useCartStore.getState().replaceFromServer(equalCart)
    const secondItems = useCartStore.getState().items

    // Array identity preserved, syncError still null
    expect(secondItems).toBe(firstItems)
    expect(useCartStore.getState().syncError).toBeNull()
  })

  it('replaces items array when payload differs', () => {
    // First projection
    useCartStore.getState().replaceFromServer(serverCart)
    const firstItems = useCartStore.getState().items
    expect(firstItems).toHaveLength(1)

    // Project a different payload
    useCartStore.getState().replaceFromServer(differentCart)
    const secondItems = useCartStore.getState().items

    // Array should be replaced (different content)
    expect(secondItems).not.toBe(firstItems)
    expect(secondItems).toHaveLength(2)
  })

  it('preserves array identity when aiDetails are equal but distinct objects', () => {
    // This tests the case that matters most in production: AI-generated items
    // with aiDetails objects that are deep-equal but have different references
    // (which happens when TanStack Query's structuralSharing reuses unchanged
    // leaf objects but allocates new parents when any sibling field changes).

    const cartWithAi: ServerCartPayload = {
      id: 'cart-1',
      itemCount: 1,
      subtotal: '2000.00',
      savingTotal: '0.00',
      savedForLater: [],
      items: [
        {
          ...serverCart.items[0],
          isAiGenerated: true,
          aiDetails: {
            generationId: 'gen-1',
            prompt: 'blue landscape',
            stylePreset: 'oil-painting',
            thumbnailUrl: 'https://example.com/thumb.jpg',
          },
        },
      ],
    }

    // First projection
    useCartStore.getState().replaceFromServer(cartWithAi)
    const firstItems = useCartStore.getState().items
    const firstAiDetails = firstItems[0].aiDetails
    expect(firstAiDetails).not.toBeNull()

    // Second projection with equal aiDetails but different object reference
    // (simulating what structuralSharing does)
    const cartWithEqualAi: ServerCartPayload = {
      ...cartWithAi,
      items: [
        {
          ...cartWithAi.items[0],
          aiDetails: {
            generationId: 'gen-1',
            prompt: 'blue landscape',
            stylePreset: 'oil-painting',
            thumbnailUrl: 'https://example.com/thumb.jpg',
          },
        },
      ],
    }

    useCartStore.getState().replaceFromServer(cartWithEqualAi)
    const secondItems = useCartStore.getState().items

    // Array identity should be preserved (content is equal)
    // This proves the dedup worked: even though toCartItems received a new
    // customizations/aiDetails object, the item content was equal so the
    // array identity was preserved
    expect(secondItems).toBe(firstItems)
  })

  it('preserves array identity when customizations are equal but distinct objects', () => {
    const cartWithCustomizations: ServerCartPayload = {
      id: 'cart-1',
      itemCount: 1,
      subtotal: '2000.00',
      savingTotal: '0.00',
      savedForLater: [],
      items: [
        {
          ...serverCart.items[0],
          customizations: {
            matWidth: 2,
            matColor: 'white',
            mountingStyle: 'float',
            glazingType: 'anti-glare',
            notes: 'frame me carefully',
          },
        },
      ],
    }

    useCartStore.getState().replaceFromServer(cartWithCustomizations)
    const firstItems = useCartStore.getState().items
    const firstCustomizations = firstItems[0].customizations

    // Simulate structuralSharing: new customizations object with same content
    const cartWithEqualCustomizations: ServerCartPayload = {
      ...cartWithCustomizations,
      items: [
        {
          ...cartWithCustomizations.items[0],
          customizations: {
            matWidth: 2,
            matColor: 'white',
            mountingStyle: 'float',
            glazingType: 'anti-glare',
            notes: 'frame me carefully',
          },
        },
      ],
    }

    useCartStore.getState().replaceFromServer(cartWithEqualCustomizations)
    const secondItems = useCartStore.getState().items

    // Array identity should be preserved (content is equal)
    // This proves the dedup worked even though customizations was a new object
    expect(secondItems).toBe(firstItems)
  })

  it('replaces items when aiDetails genuinely differ', () => {
    const cartWithAi: ServerCartPayload = {
      ...serverCart,
      items: [
        {
          ...serverCart.items[0],
          isAiGenerated: true,
          aiDetails: {
            generationId: 'gen-1',
            prompt: 'blue landscape',
            stylePreset: 'oil-painting',
            thumbnailUrl: 'https://example.com/thumb.jpg',
          },
        },
      ],
    }

    useCartStore.getState().replaceFromServer(cartWithAi)
    const firstItems = useCartStore.getState().items

    // Change a field in aiDetails
    const cartWithDifferentAi: ServerCartPayload = {
      ...cartWithAi,
      items: [
        {
          ...cartWithAi.items[0],
          aiDetails: {
            generationId: 'gen-2', // different
            prompt: 'blue landscape',
            stylePreset: 'oil-painting',
            thumbnailUrl: 'https://example.com/thumb.jpg',
          },
        },
      ],
    }

    useCartStore.getState().replaceFromServer(cartWithDifferentAi)
    const secondItems = useCartStore.getState().items

    // Array should be replaced (content differs)
    expect(secondItems).not.toBe(firstItems)
    expect(secondItems[0].aiDetails?.generationId).toBe('gen-2')
  })

  it('handles null and undefined correctly for nested objects', () => {
    const cartWithNullAi: ServerCartPayload = {
      ...serverCart,
      items: [
        {
          ...serverCart.items[0],
          aiDetails: null,
          customizations: null,
        },
      ],
    }

    useCartStore.getState().replaceFromServer(cartWithNullAi)
    const firstItems = useCartStore.getState().items

    // Project again with null aiDetails and customizations
    useCartStore.getState().replaceFromServer(cartWithNullAi)
    const secondItems = useCartStore.getState().items

    // Array identity should be preserved when both are null
    expect(secondItems).toBe(firstItems)
    // Both should be falsy (null or undefined is acceptable since projection normalizes)
    expect(secondItems[0].aiDetails).toBeFalsy()
    expect(secondItems[0].customizations).toBeFalsy()
  })
})
