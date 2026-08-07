/**
 * TrustIconsRow — the four-up trust row on white, directly above the footer.
 *
 * mesonart closes its home page with four columns on a plain white band: a
 * line-art icon centred, the label under it, one short sentence under that.
 * No borders, no cards, no fills, no heading — the row is the whole section.
 *
 * ## What this replaces
 *
 * We had TWO treatments of the same idea and neither was theirs:
 *
 *   1. `ValuePropsSection` in app/routes/index.tsx — a "Why Choose chobii.art?"
 *      heading over four BORDERED cards with tinted icon chips, sitting in the
 *      middle of the page. Bordered cards are the one shape the reference never
 *      uses.
 *   2. The USP strip inside `Footer.tsx` — the same four claims again, at
 *      14px, icon-left/text-right, inside the cream footer band.
 *
 * Saying a thing twice on one page halves it. This is the single row; both of
 * the above should come out. The route change and the footer change are not
 * made here — see the ticket.
 *
 * ## Why these four claims and not theirs
 *
 * Theirs are Handcrafted Art / Free Shipping Globally / Eco Friendly / Safe
 * Payments. Two of those would be false in our mouths, so the wording below is
 * lifted from copy this repo already ships rather than newly written — the
 * claims were vetted once, against the policy pages, and are cited inline so a
 * future edit can re-verify instead of re-guess. Same discipline as
 * components/product/TrustList.tsx, which solved this exact problem for the
 * PDP.
 *
 * In particular there is no eco claim. Footer.tsx dropped theirs on the
 * grounds that "a sustainability claim we cannot substantiate is not one worth
 * copying"; that decision stands, and returns take the slot, as they do there.
 *
 * ## Measurements
 *
 * Everything below is measured off the reference capture at 1440 (2x, halved),
 * not eyeballed:
 *
 *   - white band, 64px of padding above and below (248px band; ours is 258)
 *   - icons render 36–47px tall at a 2.5px stroke
 *   - label and sentence are the SAME size — cap height 11px, so ~16px Poppins
 *     — and the SAME colour: pure black. The sentence is NOT muted.
 *   - 23.5px from the bottom of the icon to the cap of the label
 *   - 33px between the two baselines
 *
 * The values here reproduce that to within ~1px, verified by re-measuring a
 * screenshot of this component the same way.
 */

import {
  CreditCard,
  Package,
  Palette,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { SectionBand } from '~/components/ui/SectionBand'

export interface TrustClaim {
  Icon: LucideIcon
  label: string
  detail: string
}

/**
 * Four claims, each already made somewhere else in the product.
 *
 * Sources are load-bearing: every line is either verbatim from existing copy
 * or a shortening of it, so nothing here is a new promise.
 */
export const TRUST_CLAIMS: readonly TrustClaim[] = [
  {
    // Reference slot 1 is a painter's palette / "Handcrafted Art". Ours is the
    // print itself, which is the claim we can actually stand behind.
    Icon: Palette,
    // Footer.tsx USP_ITEMS: { label: 'Archival Inks', detail: 'Museum-grade
    // pigment' }. AnnouncementBar.tsx ANNOUNCEMENTS: 'Museum-grade archival
    // inks on every print'.
    label: 'Archival Inks',
    detail: 'Museum-grade pigment',
  },
  {
    // Reference slot 2 is a parcel / "Free Shipping Globally". Ours is free
    // over ₹999 and India-only, and the label says so rather than burying it.
    Icon: Package,
    // app/routes/shipping.tsx "Costs", restated in TrustList.tsx ('Free
    // Shipping Over ₹999') and Footer.tsx ('Free Over ₹999' / 'Across India').
    label: 'Free Over ₹999',
    detail: 'Free delivery across India',
  },
  {
    // Reference slot 3 is a leaf / "Eco Friendly" — see the header. Returns
    // take the slot, as they do in the footer strip.
    Icon: RotateCcw,
    // app/routes/returns.tsx "The policy", restated in index.tsx valueProps
    // ('Return within 30 days for a full refund, no questions asked') and
    // Footer.tsx ('30-Day Returns' / 'No questions asked').
    label: '30-Day Returns',
    detail: 'Full refund, no questions asked',
  },
  {
    // Reference slot 4 is a card with a tick / "Safe Payments". Same claim,
    // and it is true — but PayPal is not one of our methods, Razorpay is.
    Icon: CreditCard,
    // app/routes/faq.tsx "What payment methods do you accept?", restated in
    // TrustList.tsx ('Secure checkout via Razorpay — cards, UPI, netbanking &
    // wallets') and Footer.tsx ('Safe Payments' / 'Razorpay secured').
    label: 'Safe Payments',
    detail: 'Secure checkout via Razorpay',
  },
] as const

/**
 * TrustIconsRow — four centred icon/label/sentence columns on white.
 *
 * Four across from `md` up, two across below it, which is what the reference
 * does on a phone; see the layout note on the list for why `xl` swaps the grid
 * for `space-between`.
 *
 * `SectionBand`'s `sm:py-24` is overridden back down to the measured 64px:
 * this band is deliberately shorter than a content section, and it is the last
 * thing before the footer.
 *
 * Takes no props. There is nothing here to configure — a trust row whose
 * claims can be passed in from the outside is a trust row whose claims stop
 * being checked.
 *
 * @example
 * <TrustIconsRow />
 */
export function TrustIconsRow() {
  return (
    <SectionBand data-testid="home-trust-row" className="sm:py-16">
      {/* Three layouts, and the last one is the point.
       *
       * On the reference the four groups are `space-between` across the page
       * box, NOT four equal columns — the first sentence starts flush with the
       * container's left edge and the last ends flush with its right, which is
       * measurably not where centring in equal quarters would put them.
       *
       * That only works while the four sentences fit side by side (they total
       * ~886px, so it holds from about 940px up); below `xl` the equal-column
       * grid takes over, and below `md` it is 2×2, which is what theirs does
       * on a phone. */}
      <ul className="grid list-none grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-4 md:gap-x-4 xl:flex xl:justify-between xl:gap-x-8">
        {TRUST_CLAIMS.map(({ Icon, label, detail }) => (
          <li
            key={label}
            data-testid="home-trust-item"
            className="flex flex-col items-center text-center"
          >
            {/* Line art, not a chip: no plate, no fill, no hover state.
                56px because that is what puts the rendered glyph at their
                ~40–47px — lucide leaves a viewBox margin their icons do not.
                The stroke is thinned from lucide's default 2 to land on their
                measured 2.5px; at weight 2 a 56px outline reads as a filled
                glyph, which theirs is not. */}
            <Icon
              className="h-14 w-14 shrink-0 text-foreground"
              strokeWidth={1.1}
              aria-hidden="true"
            />
            <p className="mt-3 text-base leading-7 text-foreground">{label}</p>
            {/* Same size and same colour as the label — muted-foreground here
                would break the pair, and theirs are both black.

                Deliberately NOT text-balance: balancing splits "Museum-grade"
                across two lines on a phone, where plain greedy wrapping keeps
                the compound whole, which is what theirs does with
                "eco-friendly". */}
            <p className="mt-1.5 text-base leading-7 text-foreground">
              {detail}
            </p>
          </li>
        ))}
      </ul>
    </SectionBand>
  )
}

export default TrustIconsRow
