/**
 * SalePrice — one way to print a price that may be discounted (#435).
 *
 * The grid card and the PDP buy panel both need the same four things: the
 * price being charged, the base struck through beside it, how deep the cut
 * is, and a "Members" tag when the cut is not the viewer's yet. Two
 * implementations of that would eventually disagree about a number, so there
 * is one, and both surfaces render through it.
 *
 * ## Nothing here computes a discount
 *
 * Every figure is read off `sale`, which `resolveSalePrice` produced on the
 * API side (#428) and which the cart re-resolves at checkout. `percentOff`
 * is printed, never derived — a component that divided `salePrice` by
 * `basePrice` would be a second pricing rule, and the first time it rounded
 * differently from the server the card would advertise a discount the
 * checkout would not honour. `basePrice` the prop is only the fallback for
 * when no sale is running; the moment `sale` exists, `sale.basePrice` is
 * what gets struck through, because that is the figure the saving was
 * measured against.
 *
 * ## Why it is a pure component with no hooks
 *
 * It renders inside ProductCard, which is mounted a few dozen times per grid
 * page and whose suite mocks the router down to `Link`. Reaching for the
 * session or the promotion from in here would put a context read into every
 * cell of the grid. Membership arrives as a prop instead — read once by the
 * caller from the shared `useGalleryMembership()` signal (#443), never
 * re-derived here.
 *
 * ## Colour
 *
 * `--sale` and nothing else. The parity analysis (§3.3) already flags the
 * orange Featured and purple AI badges as fighting a monochrome page; the
 * design reserves exactly one warm token for sale prices and sale tags, and
 * it reads as "discount" precisely because nothing else on the page is red.
 * A third loud colour here would spend that. The "Members" tag is
 * deliberately an outline in the same token rather than a second fill — it
 * is a condition on the price, not a badge competing with it.
 */

import type { ReactNode } from 'react'

import { cn, formatPrice } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

/**
 * The resolved sale a product carries, mirroring `resolvedSalePriceSchema`
 * (`@chobii/shared`) as it arrives over the wire. Declared structurally here
 * so a card can hold one without the storefront depending on the API's
 * pricing module.
 */
export interface SalePricing {
  promotionId: string
  headline: string
  /** Already resolved server-side. Printed, never recomputed. */
  percentOff: number
  /** What the saving was measured against — the figure that gets struck. */
  basePrice: string
  /** What the viewer is charged, unless `locked`. */
  salePrice: string
  /** A sale price the viewer cannot have yet: shown, but base is charged. */
  locked: boolean
}

export interface SalePriceProps {
  /** `null` or omitted when the product is not on sale. */
  sale?: SalePricing | null
  /** The undiscounted price, used only when no sale is running. */
  basePrice: string | number
  /**
   * Rendered ahead of the price — the card's "From", which marks a figure
   * that is the cheapest variant rather than the price of the thing.
   */
  prefix?: ReactNode
  /**
   * The viewer's membership, from the shared signal (#443).
   *
   * The payload was resolved before a mid-session join, so it can still say
   * `locked` for somebody who is now a member. This lets the caller unlock
   * the display; it can never lock a price the payload left open.
   */
  isMember?: boolean
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function SalePrice({
  sale,
  basePrice,
  prefix,
  isMember = false,
  className,
}: SalePriceProps) {
  // Only ever unlocks. `locked` is the server's answer and this is the client
  // catching up to it, the same direction the cart's saving row moves in.
  const locked = Boolean(sale?.locked) && !isMember

  /**
   * No type scale and no colour of its own in either branch — the card's price
   * is a step below its title and the buy panel's is the biggest thing in the
   * box, and a size baked in here would have to be overridden at both call
   * sites. Callers pass their own; everything below is relative to it.
   */
  if (!sale) {
    return (
      <span className={cn('whitespace-nowrap', className)}>
        {prefix && (
          <>
            <small className="text-[0.8em]">{prefix}</small>{' '}
          </>
        )}
        <span data-testid="price-current">{formatPrice(basePrice)}</span>
      </span>
    )
  }

  return (
    <span
      data-testid="sale-price"
      className={cn(
        'flex flex-wrap items-baseline gap-x-2 gap-y-1',
        className
      )}
    >
      {prefix && <small className="text-[0.8em]">{prefix}</small>}

      <span
        data-testid="price-current"
        className="whitespace-nowrap font-medium text-sale"
      >
        {formatPrice(sale.salePrice)}
      </span>

      {/* A strike is a visual convention that screen readers do not announce,
          so the old price needs saying in words or it reads as a second,
          contradictory price. */}
      <s
        data-testid="price-was"
        aria-label={`Regular price ${formatPrice(sale.basePrice)}`}
        className="whitespace-nowrap text-[0.85em] text-muted-foreground line-through"
      >
        {formatPrice(sale.basePrice)}
      </s>

      {/* Zero is not a depth worth printing, and a fixed-amount promotion can
          round to it on a cheap line. The struck price still tells the story. */}
      {sale.percentOff > 0 && (
        <span
          data-testid="sale-percent-off"
          className="whitespace-nowrap text-[0.8em] font-medium text-sale"
        >
          {sale.percentOff}% off
        </span>
      )}

      {locked && (
        <span
          data-testid="sale-members-tag"
          className="whitespace-nowrap rounded-full border border-sale/40 px-1.5 py-0.5 text-[0.7em] font-medium uppercase tracking-wide text-sale"
        >
          Members
        </span>
      )}
    </span>
  )
}

export default SalePrice
