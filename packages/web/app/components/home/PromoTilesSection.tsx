/**
 * The home page's three promo tiles (#533).
 *
 * mesonart runs a row of three equal photo tiles directly under the Shop by
 * Room band: a lifestyle photograph, rounded corners, the label in large white
 * type at the bottom-left and a thin white arrow at the bottom-right. No heavy
 * scrim — the photograph carries the contrast. We had nothing here at all.
 *
 * Measured off mesonart.com on 2026-08-06 (2x captures, halved below):
 *
 *  - desktop 1440: 48px page gutter, three 436x327 tiles (4:3) with an 18px
 *    gap; 12px corner radius; label ~28px, cap-aligned with the arrow; 27px of
 *    padding on the label's left and the arrow's right;
 *  - mobile 390: 20px gutter, 12px gaps. The first tile is full width (350x263,
 *    still 4:3) and the other two sit beside each other (169x126, 4:3). Label
 *    ~21px on the wide tile, ~17px on the pair, 11px of padding.
 *
 * Ours takes the house `--card-radius` (15px at 1440) rather than a literal 12,
 * because every other rounded plate on the storefront is already that token and
 * three pixels of corner is not worth a second one.
 *
 * (Not to be confused with `components/product/PromoTile`, which is the single
 * review-score cell the collection grid drops into its ninth slot.)
 *
 * ## Where the three go, and why they are not theirs
 *
 * Theirs read On Sale / Quick Ship / Custom Art. Two of those we have; one we
 * do not sell.
 *
 *  1. **On Sale → `/sale`**, but ONLY while a promotion is actually running.
 *     The rule is already settled on this storefront: `SaleNavLink` renders the
 *     red Sale link as absent rather than disabled, because a Sale door that
 *     outlives its promotion opens onto a page with nothing on it. A tile is a
 *     much louder door than a nav link, so it obeys the same rule — and when
 *     there is no promotion the slot becomes **Limited Edition →
 *     `/posters?uniqueness=limited-edition`**, a real facet with real stock
 *     behind it rather than an empty grid under a merchandising word.
 *
 *  2. **In Stock → `/posters?availability=in-stock`**, where theirs says Quick
 *     Ship. We make no delivery-speed promise anywhere on the site — no
 *     express tier, no dispatch SLA on a product, nothing in the shipping page
 *     to back one — so "Quick Ship" would be a claim invented by this file.
 *     `availability` is a real facet in the shared vocabulary with two values,
 *     and `in-stock` is the honest half of the same idea: pieces that exist
 *     now, as opposed to made-to-order. The tile carries the vocabulary's own
 *     caption, so it names exactly the filter it applies.
 *
 *  3. **Custom Art → `/create`**, our AI generator. The one tile that lands on
 *     theirs without translation.
 *
 * Both facet ids are read off `@chobii/shared` rather than typed as literals.
 * That is the drift #452 ended — a home tile advertising a value the API's zod
 * enum would 400 on — and it is why no runtime count guard sits in front of
 * these two: the destination is always a valid `/posters` query, so the worst
 * case is that page's own empty state rather than a dead link. Making the whole
 * band conditional on a facets call would trade that for a photographic row
 * that vanishes whenever the endpoint hiccups.
 *
 * ## The photographs are mesonart's, on loan
 *
 * PLACEHOLDERS. The repo has no interior photography of its own, and a CSS
 * gradient standing in for a room is exactly the fabricated band this parity
 * work is not allowed to ship. So the tiles run on mesonart's own photographs,
 * pulled into a git-ignored directory for development only. **#544 blocks
 * go-live on replacing them.** Every path goes through `PROMO_TILE_IMAGES`
 * below — swapping in our own photography is three lines there and nothing in
 * the JSX.
 *
 * ## Reads the promotion client-side, and holds its fire until it can paint
 *
 * The only thing here that is not static is which door slot one opens, and
 * that answer arrives from `useActivePromotion` — the same deduplicated lookup
 * the header's Sale link makes on every page, so this costs no extra request.
 * The row renders nothing until it has answered: painting "Limited Edition"
 * server-side and swapping it to "On Sale" a beat later is the flash
 * `SaleNavLink` documents as worse than arriving late.
 */

import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { AVAILABILITY_OPTIONS, UNIQUENESS_OPTIONS } from '@chobii/shared'
import { useActivePromotion } from '~/hooks/useActivePromotion'
import { SectionBand } from '~/components/ui/SectionBand'
import { cn } from '~/lib/utils'

/**
 * THE PHOTOGRAPHS — mesonart's, borrowed, git-ignored, and blocking #544.
 *
 * Four were supplied for three slots. `tile-1` and `tile-2` are the interiors
 * behind their own On Sale and Quick Ship tiles and are used the same way here.
 * Their third is a photograph of a painter at an easel, which was not among the
 * four; `tile-4` is the closest reading of the same idea — wet impasto flowers,
 * paint as a substance rather than a finished frame on a wall — and its soft
 * pinks and greens sit next to two cream interiors far better than `tile-3`'s
 * deep blue figurative scene, which is left unused.
 *
 * Replace all three at once with our own interiors. Nothing else in this file
 * knows where a picture comes from.
 */
export const PROMO_TILE_IMAGES = {
  /** Slot one — On Sale, or Limited Edition when no promotion is running. */
  lead: '/dev-reference/promo/tile-1.jpg',
  /** Slot two — In Stock. */
  inStock: '/dev-reference/promo/tile-2.jpg',
  /** Slot three — Custom Art. */
  customArt: '/dev-reference/promo/tile-4.png',
} as const

/** Tiles are a third of the container at lg, half of it below, full on the lead. */
const TILE_SIZES = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'

/**
 * Facet ids, taken from the shared vocabulary rather than spelled out.
 *
 * `find` rather than an index: reordering the options upstream must not
 * silently repoint a home tile at a different filter.
 */
const IN_STOCK_ID = AVAILABILITY_OPTIONS.find(
  (option) => option.id === 'in-stock'
)
const LIMITED_EDITION_ID = UNIQUENESS_OPTIONS.find(
  (option) => option.id === 'limited-edition'
)

// ============================================================================
// Destinations
// ============================================================================

export interface PromoDestination {
  /** Stable id — also the `data-destination` a test reads. */
  key: string
  label: string
  /**
   * Typed as the three literals TanStack knows rather than `string`, so a typo
   * is a type error instead of a dead tile.
   */
  to: '/sale' | '/posters' | '/create'
  /**
   * Handed to `<Link>` rather than spelled into the href: `router.tsx`
   * overrides TanStack's search serialisation, and a hand-built query string
   * that disagrees with the target's `validateSearch` throws inside it — which
   * error-boundaries the route to a blank page rather than degrading to an
   * unfiltered grid. Same reasoning as the orientation chips.
   */
  search?: Record<string, unknown>
  /** Path under `PROMO_TILE_IMAGES`. */
  image: string
}

/** Slot one while a promotion is running. */
export const SALE_DESTINATION: PromoDestination = {
  key: 'on-sale',
  label: 'On Sale',
  to: '/sale',
  image: PROMO_TILE_IMAGES.lead,
}

/** Slot one the rest of the time — see the module comment. */
export const LIMITED_EDITION_DESTINATION: PromoDestination = {
  key: 'limited-edition',
  // The vocabulary's own caption, so the tile names the filter it applies.
  label: LIMITED_EDITION_ID?.label ?? 'Limited Edition',
  to: '/posters',
  search: { uniqueness: LIMITED_EDITION_ID?.id ?? 'limited-edition' },
  image: PROMO_TILE_IMAGES.lead,
}

/** Slot two. Their Quick Ship, told the truth. */
export const IN_STOCK_DESTINATION: PromoDestination = {
  key: 'in-stock',
  label: IN_STOCK_ID?.label ?? 'In Stock',
  to: '/posters',
  search: { availability: IN_STOCK_ID?.id ?? 'in-stock' },
  image: PROMO_TILE_IMAGES.inStock,
}

/** Slot three. */
export const CUSTOM_ART_DESTINATION: PromoDestination = {
  key: 'custom-art',
  label: 'Custom Art',
  to: '/create',
  image: PROMO_TILE_IMAGES.customArt,
}

// ============================================================================
// Row (presentational)
// ============================================================================

export interface PromoTilesRowProps {
  tiles: readonly PromoDestination[]
  className?: string
}

/**
 * The band, or nothing.
 *
 * Split from the connected section below so the layout can be rendered from a
 * literal in a test, and so "no tiles, no band" is one visible rule.
 */
export function PromoTilesRow({ tiles, className }: PromoTilesRowProps) {
  if (tiles.length === 0) return null

  return (
    <SectionBand
      data-testid="home-promo-tiles"
      /*
       * Deliberately shallower than the house 96px. Measured, their tiles sit
       * 64px under the room band and 138px above the New In heading — the row
       * reads as the tail of the band above it rather than a section of its
       * own. Whatever band precedes this one contributes its own bottom
       * padding, so the integrator can take the top to nothing with `pt-0`
       * through `className` if the stack ends up airier than theirs.
       */
      className={cn('py-8 lg:py-10', className)}
    >
      {/*
       * A list, because it is one: three doors of equal weight. The lead tile
       * spans both mobile columns and the other two pair up beneath it, which
       * is their mobile layout exactly; from lg all three share a row.
       */}
      <ul className="grid list-none grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-[18px]">
        {tiles.map((tile, index) => (
          <li
            key={tile.key}
            className={index === 0 ? 'col-span-2 lg:col-span-1' : undefined}
          >
            <Link
              to={tile.to}
              search={tile.search}
              data-testid="home-promo-tile"
              data-destination={tile.key}
              className="group relative block aspect-[4/3] overflow-hidden rounded-[var(--card-radius)] bg-mat"
            >
              <img
                src={tile.image}
                sizes={TILE_SIZES}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-primary)] motion-safe:group-hover:scale-[1.03]"
              />

              {/*
               * Not a scrim. Theirs have none — their photography is chosen to
               * carry white type on its own — and the label still has to
               * survive a bright plaster wall arriving under it when these
               * placeholders are replaced. This is the least that guarantees
               * it: black at 30% along the very bottom edge, gone by a third of
               * the way up, so the photograph still reads as a photograph
               * rather than a darkened one.
               */}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent"
              />

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3 lg:p-7">
                <span
                  className={cn(
                    'font-heading font-light leading-none text-white [text-shadow:0_1px_6px_rgb(0_0_0_/_35%)] lg:text-3xl',
                    index === 0 ? 'text-xl' : 'text-lg'
                  )}
                >
                  {tile.label}
                </span>

                {/*
                 * Theirs is ~15x12 at a single-pixel stroke — a typographic
                 * arrow, not an icon button. 1.25 is the thinnest lucide
                 * stroke that still survives being drawn over a photograph.
                 */}
                <ArrowRight
                  aria-hidden="true"
                  strokeWidth={1.25}
                  className="h-4 w-4 shrink-0 text-white transition-transform duration-500 ease-[var(--ease-primary)] motion-safe:group-hover:translate-x-1 lg:h-5 lg:w-5"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </SectionBand>
  )
}

// ============================================================================
// Section (connected)
// ============================================================================

export interface PromoTilesSectionProps {
  className?: string
}

/**
 * What the home page mounts. Decides slot one and defers the rest to the row.
 */
export function PromoTilesSection({ className }: PromoTilesSectionProps) {
  const { promotion, isResolved } = useActivePromotion()

  // `undefined` is "still asking", and asking is neither a reason to advertise
  // a sale nor to rule one out.
  if (!isResolved) return null

  const lead = promotion ? SALE_DESTINATION : LIMITED_EDITION_DESTINATION

  return (
    <PromoTilesRow
      tiles={[lead, IN_STOCK_DESTINATION, CUSTOM_ART_DESTINATION]}
      className={className}
    />
  )
}

export default PromoTilesSection
