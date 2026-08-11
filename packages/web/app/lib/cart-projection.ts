/**
 * `GET /api/cart` → the store's items.
 *
 * The server cart is the cart (#511). Its rows are what checkout reads, so the
 * store holds those rows verbatim — `item.id` is `cartItems.id` — and every
 * update or removal addresses a line by the id the server gave it.
 *
 * The mapping is here rather than in the store so it can be tested as the pure
 * function it is, and so the store keeps no knowledge of the wire format.
 */

import type { CartItem } from '~/stores/cart'

interface ServerImage {
  url: string
  thumbnailUrl?: string
}

/**
 * One line's pricing, exactly as `GET /api/cart` resolves it (#429).
 *
 * `base` is the stored line total — the figure the cart was written with — and
 * `sale` is re-resolved on every read, so a cart left sitting across the end of
 * a promotion comes back with `sale: null` by itself. `locked` means the price
 * exists but the viewer is not in the gallery yet: the server will charge
 * `base`, and the cart-level `savingTotal` says `0.00` because that is the
 * truth about the money. The teaser is still shown — that is what the gate is.
 */
export interface CartLinePricing {
  base: string
  sale: string | null
  locked: boolean
  headline: string | null
  percentOff: number | null
}

/**
 * What is being bought on a gift card line. Mirrors the API's
 * `GiftCardPurchase`.
 */
export interface ServerGiftCardPurchase {
  amountPaise: number
  recipientEmail: string
  recipientName: string
  senderName: string
  message: string | null
  /** ISO timestamp; null means send as soon as payment clears. */
  sendAt: string | null
}

export interface ServerCartLine {
  id: string
  /**
   * What kind of line this is (#579).
   *
   * Absent on a payload from an older server, which only ever sent product
   * lines — hence the optional and the `?? 'product'` when projecting.
   */
  lineType?: 'product' | 'gift_card'
  /** Null on a gift card line: there is no catalogue entry behind it. */
  productId: string | null
  variantId: string | null
  giftCardPurchase?: ServerGiftCardPurchase | null
  frameId: string | null
  quantity: number
  /** Decimal string, e.g. "2000.00". */
  unitPrice: string
  framePrice: string
  lineTotal: string
  pricing: CartLinePricing
  customizations: CartItem['customizations'] | null
  isAiGenerated: boolean
  aiDetails: CartItem['aiDetails'] | null
  isSavedForLater: boolean
  /** The column is `created_at`; there is no `added_at`. */
  createdAt: string
  product?: {
    id: string
    title: string
    slug: string
    images: ServerImage[]
  }
  variant?: {
    id: string
    sizeLabel: string
    widthInches: number
    heightInches: number
    price: string
  }
  frame?: {
    id: string
    name: string
    type: string
  }
}

export interface ServerCartPayload {
  id: string
  userId: string | null
  itemCount: number
  subtotal: string
  couponCode: string | null
  couponDiscount: string
  currency: string
  items: ServerCartLine[]
  savedForLater: ServerCartLine[]
  savingTotal: string
  createdAt: string
  updatedAt: string
}

/** Decimal string to number; anything unparseable is zero, never NaN. */
function toNumber(value: string | null | undefined): number {
  const parsed = parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function toCartItem(line: ServerCartLine): CartItem {
  const image = line.product?.images?.[0]
  const lineType = line.lineType ?? 'product'
  const purchase = line.giftCardPurchase ?? null

  /**
   * A gift card line describes itself (#579).
   *
   * There is no product row to read a title or an image out of, so the fields
   * every cart surface renders are filled from the purchase instead. Without
   * this the line renders as a blank row with a broken link to
   * `/posters/undefined`.
   */
  const isGiftCard = lineType === 'gift_card' && purchase !== null

  return {
    id: line.id,
    lineType,
    giftCardPurchase: purchase,
    productId: line.productId,
    variantId: line.variantId,
    frameId: line.frameId,
    quantity: line.quantity,
    productTitle: isGiftCard
      ? `Gift card — ₹${(purchase.amountPaise / 100).toLocaleString('en-IN')}`
      : (line.product?.title ?? ''),
    productSlug: line.product?.slug ?? '',
    thumbnailUrl: image?.thumbnailUrl ?? image?.url ?? '',
    sizeLabel: isGiftCard
      ? `For ${purchase.recipientName}${purchase.sendAt ? ` — ${purchase.sendAt.slice(0, 10)}` : ''}`
      : (line.variant?.sizeLabel ?? ''),
    widthInches: line.variant?.widthInches ?? 0,
    heightInches: line.variant?.heightInches ?? 0,
    frameName: line.frame?.name,
    frameType: line.frame?.type,
    unitPrice: toNumber(line.unitPrice),
    framePrice: toNumber(line.framePrice),
    customizations: line.customizations ?? undefined,
    isAiGenerated: line.isAiGenerated,
    aiDetails: line.aiDetails ?? undefined,
    addedAt: line.createdAt,
  }
}

/**
 * The active lines only. `savedForLater` is a different list with a different
 * meaning — order creation filters it out (`routes/orders.ts:407`) and so does
 * the cart.
 */
export function toCartItems(cart: ServerCartPayload): CartItem[] {
  return cart.items.map(toCartItem)
}
