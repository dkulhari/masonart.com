/**
 * OfferRail — the way back to a dismissed offer (#446).
 *
 * A black vertical tab pinned to the right edge, mid-viewport, reading the
 * promotion's depth. It is the documented sticky-teaser pattern: dismissing the
 * banner (#445) should close the interruption, not retire the sale. Without a
 * recovery path a single stray click costs the visitor the discount for a week,
 * and costs us the join.
 *
 * ## It decides nothing
 *
 * Every question this component could ask — is a sale running, has the banner
 * been seen, is it cooling down, is the viewer a member — is already answered by
 * `useSaleOffer()`. The rail renders on `stage === 'rail'` and calls `reopen()`.
 * A storage read or a promotion fetch here would be a second answer to a
 * question that has one, and the two would drift: the banner marks the session
 * seen, and a rail reading storage a beat later would conclude the banner had
 * already shown and appear alongside it.
 *
 * Mounted once in `routes/__root.tsx`, beside the banner. Per-route mounting
 * would reset the recovery path on every navigation, which is the opposite of
 * what a sticky teaser is for.
 *
 * ## The label is the promotion
 *
 * `Get {percentOff}% OFF`, read from `GET /api/promotions/active` (#432) on
 * every render. The parity target's tab says 40%; a literal 40 in this file
 * would keep saying it after the campaign changed depth, after it was disabled
 * and after it ended, with nothing failing to say so. A fixed-amount promotion
 * has no percentage to quote, so it gets wording instead of `Get null% OFF`.
 *
 * ## Why it starts at `lg`
 *
 * Their layout runs a bottom dock on small screens and a right-edge rail lands
 * on top of it — a tab overlapping the primary mobile navigation is worse than
 * no tab, and the phone still gets the offer once per session through the
 * banner. `hidden lg:flex`, asserted in the test, because a stray display
 * utility added later would silently put it back over the dock.
 */

import { useSaleOffer } from '~/components/promo/SaleBanner'
import { cn } from '~/lib/utils'

/** Never a hardcoded depth — see the header. */
function railLabel(percentOff: number | null): string {
  return percentOff !== null ? `Get ${percentOff}% OFF` : 'Get the sale price'
}

export function OfferRail() {
  const { promotion, stage, reopen } = useSaleOffer()

  // `stage` already covers no promotion, a member, the server pass and the
  // banner still being open. The `promotion` check is for the type, not a
  // second rule.
  if (stage !== 'rail' || !promotion) return null

  return (
    <button
      type="button"
      onClick={reopen}
      data-testid="offer-rail"
      className={cn(
        // Mid-viewport on the right edge, and below the dialog it opens: the
        // modal owns z-50, so a rail at the same layer would paint over its
        // backdrop and stay clickable behind an open offer.
        'fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 lg:flex',
        'items-center justify-center',
        'rounded-l-lg bg-black py-5 pl-2 pr-1.5',
        'text-xs font-semibold uppercase tracking-widest text-white',
        'shadow-lg transition-colors hover:bg-neutral-800',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Rotates the text, not the box, so the tab keeps its hit area and the
        // label stays selectable and readable to assistive tech.
        '[writing-mode:vertical-rl]',
      )}
    >
      {railLabel(promotion.percentOff)}
    </button>
  )
}

export default OfferRail
