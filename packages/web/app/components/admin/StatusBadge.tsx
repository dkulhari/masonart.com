import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * The pill shape every admin status badge wears. Only the palette and the copy
 * change between them, and both of those come from the caller.
 */
const BADGE_SHELL =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium'

interface StatusBadgeProps<TStatus extends string> {
  status: TStatus
  /** Palette per status value. Exhaustive, so a new status cannot render bare. */
  styles: Record<TStatus, string>
  /**
   * Display copy per status value. Omit it where the raw value already reads
   * as a label — the product statuses are single lower-case words shown
   * through `capitalize`.
   */
  labels?: Record<TStatus, ReactNode>
  /** Extra classes applied before the palette, e.g. `capitalize`. */
  className?: string
}

/**
 * A pill for one enum value.
 *
 * The colour and copy maps stay with the caller: order status, payment status
 * and product status are different vocabularies, and merging them would mean a
 * single map that has to be exhaustive over all three.
 *
 * The palettes those callers pass are raw Tailwind scales rather than design
 * tokens. That is deliberate here — moving them was in scope for #634,
 * recolouring the admin screens was not.
 */
export function StatusBadge<TStatus extends string>({
  status,
  styles,
  labels,
  className,
}: StatusBadgeProps<TStatus>) {
  return (
    <span className={cn(BADGE_SHELL, className, styles[status])}>
      {labels ? labels[status] : status}
    </span>
  )
}
