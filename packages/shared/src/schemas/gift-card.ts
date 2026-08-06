/**
 * Gift card contracts.
 *
 * A gift card is TENDER, not a discount. It is bought, carries a balance, is
 * partially consumable, and refunds return to it. It reduces the amount due
 * *after* tax — it never reduces a price. So nothing in this module is
 * discount-shaped, and no gift card value may ever reach the sale pricing
 * resolver or a discount column.
 *
 * The existing declarations at `checkout.ts:198-199` (`appliedGiftCardIds[]`,
 * `giftCardAmount`) and `checkout.ts:359` (`giftCardAmount` on the order)
 * stay exactly as they are and finally become true. There is deliberately no
 * second, differently-named field for the same thing.
 *
 * Amounts crossing the wire are integer paise, matching the wallet's existing
 * contracts. Orders are decimal rupees; conversion happens only at the API
 * boundary.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §4
 */

import { z } from 'zod'

/** Bounds on a purchased card. Unbounded amounts are a fraud-testing surface. */
export const GIFT_CARD_MIN_PAISE = 50_000 // Rs 500
export const GIFT_CARD_MAX_PAISE = 5_000_000 // Rs 50,000
/** A send date further out than this is almost always a typo. */
export const GIFT_CARD_MAX_SCHEDULE_DAYS = 365

/**
 * Derived from balance, disabledAt and expiresAt — never stored. A status
 * column would drift from the balance on every redemption.
 */
export const giftCardStatusSchema = z.enum(['active', 'spent', 'disabled', 'expired'])

/**
 * What any caller may see of a card. There is deliberately no `code` field:
 * the full code exists once, in the delivery email, and nowhere else. Only
 * the hash and last four are stored, so a `code` here could only be a leak or
 * a lie. Admin responses are no exception — the issue endpoint returns the
 * code once, from its own dedicated response type, and never again.
 */
export const giftCardPublicSchema = z.object({
  id: z.string().uuid(),
  last4: z.string().length(4),
  balancePaise: z.number().int().nonnegative(),
  initialBalancePaise: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  status: giftCardStatusSchema,
  expiresAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export const giftCardPurchaseInputSchema = z.object({
  amountPaise: z.number().int().min(GIFT_CARD_MIN_PAISE).max(GIFT_CARD_MAX_PAISE),
  recipientEmail: z.string().email(),
  recipientName: z.string().min(1).max(120),
  senderName: z.string().min(1).max(120),
  message: z.string().max(500).optional(),
  sendAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + GIFT_CARD_MAX_SCHEDULE_DAYS * 86_400_000, {
      message: 'Send date cannot be more than a year away',
    })
    .optional(),
})

/** Accepted as typed — grouping and case are normalized server-side. */
export const giftCardCodeInputSchema = z.object({
  code: z.string().min(1).max(32),
})

/**
 * The reply to a quote: nothing is debited when this is produced. The debit
 * happens later, at payment initiation, under a row lock — quoting at code
 * entry would let an abandoned checkout eat the balance.
 */
export const giftCardQuoteSchema = z.object({
  giftCardId: z.string().uuid(),
  last4: z.string().length(4),
  balancePaise: z.number().int().nonnegative(),
  applicablePaise: z.number().int().nonnegative(),
})

export const giftCardAdjustInputSchema = z.object({
  amountPaise: z.number().int(),
  /** Mandatory: an unexplained balance change is unauditable. */
  reason: z.string().min(3).max(500),
})

/**
 * The one response that carries a plaintext code: the reply to an issue or a
 * purchase, shown once and never recoverable afterwards. Kept as its own type
 * so no ordinary card representation can ever grow the field.
 */
export const giftCardIssuedSchema = z.object({
  card: giftCardPublicSchema,
  /** Displayed once, grouped as XXXX-XXXX-XXXX-XXXX. Not stored anywhere. */
  code: z.string(),
})

export type GiftCardStatus = z.infer<typeof giftCardStatusSchema>
export type GiftCardPublic = z.infer<typeof giftCardPublicSchema>
export type GiftCardPurchaseInput = z.infer<typeof giftCardPurchaseInputSchema>
export type GiftCardCodeInput = z.infer<typeof giftCardCodeInputSchema>
export type GiftCardQuote = z.infer<typeof giftCardQuoteSchema>
export type GiftCardAdjustInput = z.infer<typeof giftCardAdjustInputSchema>
export type GiftCardIssued = z.infer<typeof giftCardIssuedSchema>
