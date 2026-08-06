/**
 * Gift card contracts.
 *
 * Two rules these tests exist to hold.
 *
 * First, the full code crosses the wire exactly once, in the delivery email.
 * No response schema here may be able to carry it — not even an admin one —
 * because only the hash and last four are ever stored, so a `code` field on a
 * card representation could only be a leak or a lie.
 *
 * Second, a gift card is tender. Amounts are integer paise, matching the
 * wallet's existing contracts, and there is no discount-shaped field anywhere
 * in this module: a gift card must never be modelled as a price reduction.
 */

import { describe, it, expect } from 'vitest'
import {
  giftCardPurchaseInputSchema,
  giftCardCodeInputSchema,
  giftCardPublicSchema,
  giftCardQuoteSchema,
  giftCardAdjustInputSchema,
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
} from '../../src/schemas/gift-card'

describe('purchase input', () => {
  const valid = {
    amountPaise: 200_000,
    recipientEmail: 'friend@example.com',
    recipientName: 'Friend',
    senderName: 'Dhruv',
    message: 'Happy birthday',
  }

  it('accepts a well-formed purchase', () => {
    expect(giftCardPurchaseInputSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an amount below the minimum', () => {
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, amountPaise: 100 }).success).toBe(false)
  })

  it('rejects an amount above the maximum', () => {
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, amountPaise: 99_000_000 }).success).toBe(false)
  })

  it('accepts exactly the bounds', () => {
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, amountPaise: GIFT_CARD_MIN_PAISE }).success).toBe(true)
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, amountPaise: GIFT_CARD_MAX_PAISE }).success).toBe(true)
  })

  it('rejects a fractional amount — paise are integers', () => {
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, amountPaise: 200_000.5 }).success).toBe(false)
  })

  it('rejects a send date more than a year out', () => {
    const farFuture = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000)
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, sendAt: farFuture }).success).toBe(false)
  })

  it('accepts a send date inside the window', () => {
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, sendAt: soon }).success).toBe(true)
  })

  it('rejects a recipient address that is not an address', () => {
    expect(giftCardPurchaseInputSchema.safeParse({ ...valid, recipientEmail: 'not-an-email' }).success).toBe(false)
  })
})

describe('code input', () => {
  it('accepts a grouped code as typed', () => {
    expect(giftCardCodeInputSchema.safeParse({ code: '7QF3-A8K2-M4NP-XR59' }).success).toBe(true)
  })

  it('accepts the same code ungrouped and lowercased', () => {
    // Grouping and case are cosmetic; normalization happens server-side.
    expect(giftCardCodeInputSchema.safeParse({ code: '7qf3a8k2m4npxr59' }).success).toBe(true)
  })

  it('rejects an empty code', () => {
    expect(giftCardCodeInputSchema.safeParse({ code: '' }).success).toBe(false)
  })
})

describe('public representation', () => {
  it('has no field capable of carrying the full code', () => {
    const keys = Object.keys(giftCardPublicSchema.shape)
    expect(keys).toContain('last4')
    expect(keys).not.toContain('code')
    expect(keys).not.toContain('codeHash')
  })

  it('reports a derived status rather than a stored one', () => {
    const parsed = giftCardPublicSchema.safeParse({
      id: '11111111-2222-3333-4444-555555555555',
      last4: 'XR59',
      balancePaise: 150_000,
      initialBalancePaise: 200_000,
      currency: 'INR',
      status: 'active',
      expiresAt: null,
      createdAt: new Date(),
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a status outside the derived set', () => {
    const parsed = giftCardPublicSchema.safeParse({
      id: '11111111-2222-3333-4444-555555555555',
      last4: 'XR59',
      balancePaise: 0,
      initialBalancePaise: 200_000,
      currency: 'INR',
      status: 'redeemed',
      expiresAt: null,
      createdAt: new Date(),
    })
    expect(parsed.success).toBe(false)
  })

  it('carries no discount-shaped field — a gift card is tender', () => {
    // If a card ever grows a `discountAmount` or `percentOff`, it has been
    // modelled as a price reduction and will end up in a discount column.
    const keys = Object.keys(giftCardPublicSchema.shape)
    for (const forbidden of ['discount', 'discountAmount', 'percentOff', 'discountType']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('quote', () => {
  const valid = {
    giftCardId: '11111111-2222-3333-4444-555555555555',
    last4: 'XR59',
    balancePaise: 150_000,
    applicablePaise: 120_000,
  }

  it('reports what the card can pay without debiting it', () => {
    expect(giftCardQuoteSchema.safeParse(valid).success).toBe(true)
  })

  it('never carries the code it was quoted from', () => {
    expect(Object.keys(giftCardQuoteSchema.shape)).not.toContain('code')
  })

  it('rejects a negative applicable amount', () => {
    expect(giftCardQuoteSchema.safeParse({ ...valid, applicablePaise: -1 }).success).toBe(false)
  })
})

describe('admin adjustment', () => {
  it('requires a reason — an unexplained balance change is unauditable', () => {
    expect(giftCardAdjustInputSchema.safeParse({ amountPaise: 5000 }).success).toBe(false)
    expect(giftCardAdjustInputSchema.safeParse({ amountPaise: 5000, reason: 'ok' }).success).toBe(false)
    expect(giftCardAdjustInputSchema.safeParse({ amountPaise: 5000, reason: 'goodwill' }).success).toBe(true)
  })

  it('allows a negative adjustment — a correction can go either way', () => {
    expect(giftCardAdjustInputSchema.safeParse({ amountPaise: -5000, reason: 'issued twice' }).success).toBe(true)
  })
})
