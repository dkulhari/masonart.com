/**
 * Projecting a gift card cart line (#579).
 *
 * A gift card line has no product and no variant behind it, so every field the
 * cart surfaces render — title, image, size — has nothing to read. Left alone,
 * the projection produced a blank row linking to `/posters/undefined`.
 *
 * The line describes itself instead, from the purchase stored on it.
 */

import { describe, it, expect } from 'vitest'

import { toCartItems, type ServerCartPayload } from '~/lib/cart-projection'

const PURCHASE = {
  amountPaise: 200_000,
  recipientEmail: 'friend@example.com',
  recipientName: 'Asha',
  senderName: 'Dhruv',
  message: 'For the empty wall',
  sendAt: null,
}

function payload(line: Record<string, unknown>): ServerCartPayload {
  return {
    id: 'cart-1',
    userId: 'user-1',
    itemCount: 1,
    subtotal: '2000.00',
    couponCode: null,
    couponDiscount: '0.00',
    currency: 'INR',
    items: [
      {
        id: 'line-1',
        productId: null,
        variantId: null,
        frameId: null,
        quantity: 1,
        unitPrice: '2000.00',
        framePrice: '0.00',
        lineTotal: '2000.00',
        pricing: {
          base: '2000.00',
          sale: null,
          locked: false,
          headline: null,
          percentOff: null,
        },
        customizations: null,
        isAiGenerated: false,
        aiDetails: null,
        isSavedForLater: false,
        createdAt: '2026-08-11T00:00:00.000Z',
        ...line,
      },
    ],
    savedForLater: [],
    savingTotal: '0.00',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  } as ServerCartPayload
}

describe('a gift card line', () => {
  it('titles itself from the amount, since there is no product', () => {
    const [item] = toCartItems(
      payload({ lineType: 'gift_card', giftCardPurchase: PURCHASE }),
    )

    expect(item!.productTitle).toBe('Gift card — ₹2,000')
  })

  it('says who it is for instead of a size', () => {
    const [item] = toCartItems(
      payload({ lineType: 'gift_card', giftCardPurchase: PURCHASE }),
    )

    expect(item!.sizeLabel).toContain('Asha')
  })

  it('shows the send date when one was chosen', () => {
    const [item] = toCartItems(
      payload({
        lineType: 'gift_card',
        giftCardPurchase: { ...PURCHASE, sendAt: '2026-12-25T00:00:00.000Z' },
      }),
    )

    expect(item!.sizeLabel).toContain('2026-12-25')
  })

  it('carries the line type through, so the UI can drop the link and stepper', () => {
    const [item] = toCartItems(
      payload({ lineType: 'gift_card', giftCardPurchase: PURCHASE }),
    )

    // `/posters/undefined` is a 404, and quantity on a card would have to mean
    // "how many codes" — each with its own recipient.
    expect(item!.lineType).toBe('gift_card')
    expect(item!.productId).toBeNull()
    expect(item!.productSlug).toBe('')
  })

  it('keeps the purchase, so the cart can show who it is going to', () => {
    const [item] = toCartItems(
      payload({ lineType: 'gift_card', giftCardPurchase: PURCHASE }),
    )

    expect(item!.giftCardPurchase?.recipientName).toBe('Asha')
  })
})

describe('an ordinary product line', () => {
  const PRODUCT_LINE = {
    productId: 'product-1',
    variantId: 'variant-1',
    product: {
      id: 'product-1',
      title: 'Synthetic Nature',
      slug: 'abstract/synthetic-nature',
      images: [{ url: 'https://cdn.example.com/a.jpg' }],
    },
    variant: {
      id: 'variant-1',
      sizeLabel: '24x32 inches',
      widthInches: 24,
      heightInches: 32,
      price: '2000.00',
    },
  }

  it('is unchanged', () => {
    const [item] = toCartItems(payload(PRODUCT_LINE))

    expect(item!.productTitle).toBe('Synthetic Nature')
    expect(item!.sizeLabel).toBe('24x32 inches')
    expect(item!.productSlug).toBe('abstract/synthetic-nature')
  })

  it('reads as a product line even from a payload that predates line types', () => {
    // An older server sends no `lineType` at all; everything it ever sent was
    // a product.
    const [item] = toCartItems(payload(PRODUCT_LINE))

    expect(item!.lineType).toBe('product')
  })
})
