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

export interface ServerCartLine {
  id: string
  productId: string
  variantId: string
  frameId: string | null
  quantity: number
  /** Decimal string, e.g. "2000.00". */
  unitPrice: string
  framePrice: string
  lineTotal: string
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
  itemCount: number
  subtotal: string
  items: ServerCartLine[]
  savedForLater: ServerCartLine[]
  savingTotal: string
}

/** Decimal string to number; anything unparseable is zero, never NaN. */
function toNumber(value: string | null | undefined): number {
  const parsed = parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function toCartItem(line: ServerCartLine): CartItem {
  const image = line.product?.images?.[0]

  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId,
    frameId: line.frameId,
    quantity: line.quantity,
    productTitle: line.product?.title ?? '',
    productSlug: line.product?.slug ?? '',
    thumbnailUrl: image?.thumbnailUrl ?? image?.url ?? '',
    sizeLabel: line.variant?.sizeLabel ?? '',
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
