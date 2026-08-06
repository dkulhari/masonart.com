/**
 * DeliveryEstimate
 *
 * The one-line "order today, get it by" promise that sits under the frame
 * swatches on the PDP (ticket #517, docs/design/pdp-parity-reference.md
 * "Delivery estimate" — reference reads "Arrives soon! Get it by Aug 13–Aug
 * 21 if you order today").
 *
 * The window is NEVER hardcoded: it is today's date plus our real shipping
 * lead time, in business days. That lead time has no single exported
 * constant anywhere in the codebase — it exists only as prose, duplicated in
 * two info pages:
 *
 *   - app/routes/shipping.tsx  ("Every piece is printed to order. Production
 *     takes 2–4 business days; delivery adds another 3–7 business days
 *     depending on your pincode.")
 *   - app/routes/faq.tsx       (same figures under "How long does delivery
 *     take?")
 *
 * `DEFAULT_LEAD_TIME_DAYS` below is read off that copy: production (2–4) +
 * delivery (3–7) = 5–11 business days end to end. Callers that know a more
 * specific shipping option (see ShippingSelector's estimatedDaysMin/Max) can
 * override via the `leadTimeDays` prop instead of trusting this default.
 *
 * Business-day skipping mirrors the same rule
 * app/components/checkout/ShippingSelector.tsx already uses for its own
 * delivery estimate (skip Saturday/Sunday) — re-implemented locally rather
 * than imported, since that component lives in a different feature and pulls
 * in the shipping API client this leaf component has no business touching.
 */

import { CheckCircle2 } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface LeadTimeDays {
  /** Fastest realistic business-day count, order to delivery. */
  min: number
  /** Slowest realistic business-day count, order to delivery. */
  max: number
}

export interface DeliveryEstimateProps {
  /**
   * Business-day lead time window. Defaults to the site's stated 2–4 day
   * production + 3–7 day delivery (5–11 business days total) — see the file
   * header for the source pages.
   */
  leadTimeDays?: LeadTimeDays
  /**
   * The "order today" reference point. Defaults to `new Date()`; exposed as a
   * prop purely so tests can pin it instead of asserting against a moving
   * target.
   */
  now?: Date
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 2–4 business days to print (production) + 3–7 business days to deliver =
 * 5–11 business days end to end. Source: app/routes/shipping.tsx and
 * app/routes/faq.tsx — see file header.
 */
export const DEFAULT_LEAD_TIME_DAYS: LeadTimeDays = { min: 5, max: 11 }

// ============================================================================
// Helpers
// ============================================================================

/** Add `days` business days to `date`, skipping Saturday and Sunday. */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const dayOfWeek = result.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) remaining--
  }
  return result
}

/**
 * `Aug 13` style. Deliberately `en-US` rather than the rest of the site's
 * `en-IN` date formatting (see app/lib/utils.ts `formatDate`): the parity
 * reference is explicit that this line reads "Aug 13–Aug 21", month before
 * day, which is what `en-US` gives and `en-IN` does not (`en-IN` prints
 * "13 Aug").
 */
function formatShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ============================================================================
// Component
// ============================================================================

/**
 * DeliveryEstimate - "Arrives soon! Get it by <bold range> if you order
 * today", with a check glyph and muted surrounding text.
 *
 * @example
 * <DeliveryEstimate />
 * <DeliveryEstimate leadTimeDays={{ min: 3, max: 5 }} />
 */
export function DeliveryEstimate({
  leadTimeDays = DEFAULT_LEAD_TIME_DAYS,
  now,
  className,
}: DeliveryEstimateProps) {
  const reference = now ?? new Date()
  const from = addBusinessDays(reference, leadTimeDays.min)
  const to = addBusinessDays(reference, leadTimeDays.max)
  const range = `${formatShort(from)}–${formatShort(to)}`

  return (
    <p className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
      <span>
        Arrives soon! Get it by{' '}
        <strong className="font-semibold text-foreground">{range}</strong> if you order
        today
      </span>
    </p>
  )
}

export default DeliveryEstimate
