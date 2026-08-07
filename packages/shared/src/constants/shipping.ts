/**
 * Shipping money rules — the single source of truth for the free-shipping
 * threshold.
 *
 * WHY THIS FILE EXISTS
 *
 * The threshold used to be written in three different places with three
 * different values: `calculateShippingCost` in `routes/orders.ts` gave free
 * shipping over ₹2000, `/api/shipping/estimate` over ₹1000, and the storefront
 * hardcoded `const shippingThreshold = 999` next to copy promising "Free
 * shipping on orders over ₹999". Nothing reconciled them, so the cart promised
 * free shipping that the checkout then charged for — a pricing bug the customer
 * only discovers at the card screen. ₹999 is the figure every customer-facing
 * surface already states, so ₹999 is what the server now charges by.
 *
 * ## What the threshold is measured against (decision, 2026-08-07)
 *
 * The NET, post-discount amount: base line totals minus the price-level
 * discounts (the promotion today, plus the code discount when D8 lands).
 *
 * `orders.subtotal` itself stays GROSS — the sum of base line totals, the
 * meaning it has on every settled order — and `orders.total` subtracts the
 * discount exactly once. This threshold is the one place that reads the
 * discounted figure.
 *
 * Gift cards are NOT subtracted. A gift card is tender, applied after tax
 * against the amount due; it is payment, not price, and must never move a
 * price-level threshold. `netAmountForShipping` takes the two price figures and
 * nothing else, which is what makes a gift card leaking in impossible rather
 * than merely discouraged.
 */

/** Rupees. At or above this net amount, standard shipping is free. */
export const FREE_SHIPPING_THRESHOLD = 999;

/**
 * The threshold as the copy says it, so a banner and the cart cannot drift
 * apart from the figure the server actually charges by.
 */
export const FREE_SHIPPING_THRESHOLD_LABEL = `₹${FREE_SHIPPING_THRESHOLD.toLocaleString(
  'en-IN'
)}`;

/**
 * The figure the threshold is evaluated against: gross minus price-level
 * discount, rounded to the paisa so a float tick cannot decide a boundary.
 *
 * Both arguments are prices. Gift card balance is deliberately not a parameter.
 */
export function netAmountForShipping(
  grossSubtotal: number,
  priceDiscount: number
): number {
  const net = grossSubtotal - priceDiscount;
  return Math.max(0, Math.round((net + Number.EPSILON) * 100) / 100);
}

/** Whether a net, post-discount amount ships free. */
export function qualifiesForFreeShipping(netAmount: number): boolean {
  return netAmount >= FREE_SHIPPING_THRESHOLD;
}
