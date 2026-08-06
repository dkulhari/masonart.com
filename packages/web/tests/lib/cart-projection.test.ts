/**
 * The projection from `GET /api/cart` to the store's `CartItem`.
 *
 * The store's items ARE the server's rows: `item.id` is `cartItems.id`, so
 * update and remove can address a line without any client-side mapping.
 */

import { describe, it, expect } from 'vitest'
import { toCartItems, type ServerCartPayload } from '~/lib/cart-projection'

const payload: ServerCartPayload = {
  id: 'cart-1',
  itemCount: 2,
  subtotal: '5000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: 'frame-1',
      quantity: 2,
      unitPrice: '2000.00',
      framePrice: '500.00',
      lineTotal: '5000.00',
      customizations: { matWidth: 2 },
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T06:00:00.000Z',
      product: {
        id: 'prod-1',
        title: 'Blue Hour',
        slug: 'blue-hour',
        images: [{ url: '/img/blue.jpg', thumbnailUrl: '/img/blue-thumb.jpg' }],
      },
      variant: {
        id: 'var-1',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
      frame: { id: 'frame-1', name: 'Oak', type: 'wood' },
    },
  ],
}

describe('toCartItems', () => {
  it('uses the server row id as the item id', () => {
    expect(toCartItems(payload)[0].id).toBe(
      '11111111-1111-1111-1111-111111111111'
    )
  })

  it('parses decimal strings into numbers', () => {
    const [item] = toCartItems(payload)
    expect(item.unitPrice).toBe(2000)
    expect(item.framePrice).toBe(500)
  })

  it('reads the timestamp from createdAt, which is the column that exists', () => {
    expect(toCartItems(payload)[0].addedAt).toBe('2026-08-06T06:00:00.000Z')
  })

  it('denormalises product, variant and frame for offline display', () => {
    const [item] = toCartItems(payload)
    expect(item.productTitle).toBe('Blue Hour')
    expect(item.productSlug).toBe('blue-hour')
    expect(item.thumbnailUrl).toBe('/img/blue-thumb.jpg')
    expect(item.sizeLabel).toBe('24x36 inches')
    expect(item.widthInches).toBe(24)
    expect(item.frameName).toBe('Oak')
    expect(item.frameType).toBe('wood')
  })

  it('falls back to the full-size image when there is no thumbnail', () => {
    const noThumb: ServerCartPayload = {
      ...payload,
      items: [
        {
          ...payload.items[0],
          product: {
            ...payload.items[0].product!,
            images: [{ url: '/img/blue.jpg' }],
          },
        },
      ],
    }
    expect(toCartItems(noThumb)[0].thumbnailUrl).toBe('/img/blue.jpg')
  })

  it('survives a line whose relations did not load', () => {
    const bare: ServerCartPayload = {
      ...payload,
      items: [
        {
          ...payload.items[0],
          product: undefined,
          variant: undefined,
          frame: undefined,
        },
      ],
    }
    const [item] = toCartItems(bare)
    expect(item.productTitle).toBe('')
    expect(item.frameName).toBeUndefined()
    expect(item.widthInches).toBe(0)
  })

  it('ignores saved-for-later lines, which the cart does not show', () => {
    const withSaved: ServerCartPayload = {
      ...payload,
      savedForLater: [{ ...payload.items[0], id: 'saved-1' }],
    }
    expect(toCartItems(withSaved)).toHaveLength(1)
  })
})
