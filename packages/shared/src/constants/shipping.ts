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
 * Above this, a configured threshold is high enough that almost no basket
 * qualifies for free shipping.
 *
 * A warning, never a limit: "free shipping on very large orders only" is a real
 * campaign, so both the admin form and `PUT /api/admin/shipping-config` say
 * something and then do as they are told. It lives here so the screen cannot
 * warn at one figure while the API warns at another.
 */
export const FREE_SHIPPING_THRESHOLD_WARN_ABOVE = 50_000;

/**
 * The threshold as the copy says it, so a banner and the cart cannot drift
 * apart from the figure the server actually charges by.
 *
 * A *function* of the threshold rather than a single string, because the
 * threshold is an admin setting as of #569: the storefront renders whatever
 * value the root route delivered, and every customer-facing surface formats it
 * through here so "₹1,499" and "₹1499" cannot both appear on one page.
 */
export function freeShippingThresholdLabel(
  threshold: number = FREE_SHIPPING_THRESHOLD
): string {
  return `₹${threshold.toLocaleString('en-IN')}`
}

/**
 * The label for the bundled default. Still the value in force when the table
 * is empty or unreachable, and the only figure a surface rendered outside the
 * router can honestly print.
 */
export const FREE_SHIPPING_THRESHOLD_LABEL = freeShippingThresholdLabel();

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

/**
 * Whether a net, post-discount amount ships free.
 *
 * The threshold is an admin setting as of #569 (`shipping_config`), so the
 * server passes the figure in force. It stays a *parameter with a default*
 * rather than becoming required: the bundled constant is what the storefront
 * renders, what seeds the table, and what the API falls back to when the table
 * is empty or unreachable — a database hiccup must not make all shipping free
 * or all shipping charged.
 *
 * The default is applied on `undefined` only, so a configured `0` — everything
 * ships free — is honoured rather than quietly falling back to ₹999.
 */
export function qualifiesForFreeShipping(
  netAmount: number,
  threshold: number = FREE_SHIPPING_THRESHOLD
): boolean {
  return netAmount >= threshold
}
