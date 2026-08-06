/**
 * TrustList
 *
 * Four stacked trust rows below the buy panel — icon, bold title with a `?`
 * tooltip, muted sub-line (ticket #519, docs/design/pdp-parity-reference.md
 * "Trust list"). Replaces the three-badge grid at the bottom of
 * ProductDetail.tsx.
 *
 * The reference site's copy is NOT reused verbatim — "Free Shipping on All
 * Orders" would be false here. Every claim below is checked against our own
 * policy pages rather than copied, and each is cited in the comment next to
 * it so a future edit can re-verify instead of re-guessing:
 *
 *   - app/routes/shipping.tsx  — costs, production/delivery timelines
 *   - app/routes/returns.tsx   — the 30-day window, refund terms, and the
 *                                 explicit note that AI-generated prints get
 *                                 the same policy as everything else
 *   - app/routes/faq.tsx       — payment methods, same timelines restated
 *   - packages/api/src/database/schema/approvals.ts and
 *     packages/api/src/services/approval.ts — the production-photo approval
 *     workflow, which only runs for `isAiGenerated` order items, not the
 *     whole catalogue. That scoping is why "ship after you approve" is a
 *     tooltip footnote here rather than the headline claim: it is not true
 *     of every product this component renders on.
 *
 * The existing three-badge strip in ProductDetail.tsx already got the
 * shipping/returns claims right ("Free Shipping / Orders over ₹999",
 * "Easy Returns / 30-day policy") — this list keeps that accuracy and adds
 * the two missing rows plus the tooltips.
 */

import { useId, useState, type ReactNode } from 'react'
import { PackageCheck, Truck, RotateCcw, ShieldCheck, type LucideIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface TrustListProps {
  className?: string
}

interface TrustRowData {
  icon: LucideIcon
  title: string
  sub: ReactNode
  /** Tooltip body behind the `?` — a real clarifying detail, not filler. */
  detail: string
}

// ============================================================================
// Row data — see file header for sourcing
// ============================================================================

const ROWS: TrustRowData[] = [
  {
    icon: PackageCheck,
    title: 'Made Just For You',
    // app/routes/shipping.tsx: "Every piece is printed to order. Production
    // takes 2–4 business days..."
    sub: 'Every piece is printed to order — production takes 2–4 business days',
    // packages/api/src/services/approval.ts: the photo-approval workflow is
    // scoped to isAiGenerated order items, so it is a footnote, not the
    // headline claim above.
    detail:
      'Custom AI-generated prints go through a production photo approval step before they ship.',
  },
  {
    icon: Truck,
    title: 'Free Shipping Over ₹999',
    // app/routes/shipping.tsx "Costs": "Shipping is free on orders over
    // ₹999. For smaller orders, the shipping cost is calculated and shown at
    // checkout." Matches the existing PDP badge, not the reference's
    // "on All Orders" claim.
    sub: 'Free on orders over ₹999 — smaller orders see the cost at checkout',
    // app/routes/shipping.tsx "Timelines".
    detail: 'Delivery typically takes 3–7 business days after your order ships.',
  },
  {
    icon: RotateCcw,
    title: '30 Days Easy Returns',
    sub: (
      // app/routes/returns.tsx exists and is the real policy page — unlike
      // components/returns/ReturnPolicyDisplay.tsx, which links a
      // "/return-policy" route that is not registered anywhere.
      <a href="/returns" className="underline-offset-2 hover:underline">
        Learn more.
      </a>
    ),
    // app/routes/returns.tsx "Conditions".
    detail: 'Custom AI-generated prints are covered by the same 30-day policy as everything else.',
  },
  {
    icon: ShieldCheck,
    title: 'Safe Payment Options',
    // app/routes/faq.tsx "What payment methods do you accept?": "Cards, UPI,
    // netbanking, and wallets via Razorpay. Payment details never touch our
    // servers."
    sub: 'Secure checkout via Razorpay — cards, UPI, netbanking & wallets',
    // app/routes/returns.tsx "The policy": "Return any order within 30 days
    // of delivery for a full refund."
    detail: "Full refund within 30 days of delivery if it isn't right for your space.",
  },
]

// ============================================================================
// Tooltip
// ============================================================================

/**
 * A real, keyboard-reachable tooltip — not a decorative glyph. Opens on
 * hover, focus, or click (click covers touch, which has no hover); closes on
 * blur, a second click, or Escape. `aria-describedby` only points at the
 * bubble while it is open, and the trigger carries its own accessible name so
 * a screen reader announces what it is before the content is read.
 */
function TrustTooltip({ id, title, detail }: { id: string; title: string; detail: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`More about: ${title}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border',
          'text-[10px] leading-none text-muted-foreground',
          'hover:border-foreground hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-md border border-border bg-background p-2 text-xs font-normal text-muted-foreground shadow-md"
        >
          {detail}
        </span>
      )}
    </span>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * TrustList - four stacked rows: icon, bold title + `?` tooltip, muted
 * sub-line.
 *
 * @example
 * <TrustList />
 */
export function TrustList({ className }: TrustListProps) {
  const idPrefix = useId()

  return (
    <div className={cn('space-y-4', className)}>
      {ROWS.map((row, index) => {
        const tooltipId = `${idPrefix}-tooltip-${index}`
        const Icon = row.icon
        return (
          <div key={row.title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-foreground" aria-hidden="true" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">{row.title}</span>
                <TrustTooltip id={tooltipId} title={row.title} detail={row.detail} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{row.sub}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default TrustList
