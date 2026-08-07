/**
 * Shop By Orientation — the home page's facet chip row (#535).
 *
 * Their band is one heading and six soft-cream pills. Measured off
 * mesonart.com on 2026-08-06 at 1440x900 and 390x844:
 *
 *  - chip fill rgb(245 241 230), fully rounded, near-black label;
 *  - desktop: 52px tall, 27px of horizontal padding, a single left-aligned
 *    row with a 24px gap, sitting on white;
 *  - mobile: 40px tall, a two-column grid (16px column gap, 12px row gap)
 *    filling the gutter, sitting on a full-bleed sand band — rgb(219 216 194),
 *    which is exactly our `--band-strong`. The band is a real difference
 *    between their two breakpoints, not a screenshot artefact: the desktop
 *    capture is white edge to edge through the same section.
 *  - labels are `text-transform: capitalize`, which is why theirs reads
 *    "Set Of 2/3" with a capital O.
 *
 * WHERE THE LIST COMES FROM
 *
 * `ORIENTATION_OPTIONS` in `@chobii/shared` — the same vocabulary the facet
 * sidebar, the API's zod enum and the seed read. Hardcoding six labels here
 * is exactly the drift that constant was created to end (#395), and it would
 * let the home page advertise an orientation the API would 400 on.
 *
 * Two things this file does own, both because they are properties of THIS
 * surface rather than of the vocabulary:
 *
 *  1. ORDER. Theirs leads with Vertical, not Square. The constant is ordered
 *     to match the sidebar. `CHIP_RANK` reorders a copy; anything it does not
 *     name keeps its constant order at the tail, so a seventh orientation
 *     added upstream still appears here rather than silently vanishing.
 *
 *  2. ONE LABEL. Their home pill says "Circular" where their filter sidebar
 *     says "Circle" (parity analysis §1.3 records the sidebar wording, and
 *     `facets.test.ts` pins it). Renaming the constant would buy this band a
 *     word and cost the already-shipped collection page one, so the override
 *     lives here, next to the surface that needs it.
 *
 * The other drift found while building this WAS the constant's, and was fixed
 * there: it read "Set of 2-3" where both their storefront and §1.3 read
 * "Set of 2/3".
 *
 * WHERE THE CHIPS GO
 *
 * `/posters` with `?orientation=<id>` — our catalogue grid with one facet
 * applied, which is the same destination the All Art mega panel's Orientation
 * column uses. There is no per-orientation collection row to link at; the
 * seed builds collections per style plus "new" and "best-selling".
 *
 * The search object is handed to `<Link>` rather than spelled into the href.
 * `router.tsx` overrides TanStack's search serialisation, and a hand-built
 * query string that disagrees with `validateSearch` throws inside it — which
 * error-boundaries the target route to a blank page instead of degrading to
 * an unfiltered grid.
 */

import { Link } from '@tanstack/react-router'
import { ORIENTATION_OPTIONS } from '@chobii/shared'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { SectionBand } from '~/components/ui/SectionBand'
import type { Orientation } from '~/components/product/ProductFilters'

const HEADING_ID = 'shop-by-orientation-heading'

/** Their running order. Unranked ids sort to the tail, keeping constant order. */
const CHIP_RANK: Record<string, number> = {
  portrait: 0,
  square: 1,
  landscape: 2,
  panoramic: 3,
  round: 4,
  'set-of-2-3': 5,
}

/** This surface's wording where it differs from the facet vocabulary's. */
const HOME_LABEL_OVERRIDES: Record<string, string> = {
  round: 'Circular',
}

export interface OrientationChip {
  id: string
  label: string
  /**
   * Named, not `Record<string, unknown>`: `/posters` drops a search key it
   * does not know, so a chip with a mistyped key would land silently on the
   * unfiltered grid. `Orientation` carries all six values as of #540 — it was
   * a five-value union predating `set-of-2-3`, which is what forced the loose
   * type here in the first place.
   *
   * The `as` is the one unavoidable cast: `FacetOption.id` is `string`
   * because the shared vocabularies feed Zod enums, so the ids cannot narrow
   * themselves. It is safe in the direction that matters — every id in
   * `ORIENTATION_OPTIONS` is in the union, and the route re-validates anyway.
   */
  search: { orientation: Orientation }
}

export const ORIENTATION_CHIPS: readonly OrientationChip[] = [
  ...ORIENTATION_OPTIONS,
]
  .sort((a, b) => (CHIP_RANK[a.id] ?? 99) - (CHIP_RANK[b.id] ?? 99))
  .map((option) => ({
    id: option.id,
    label: HOME_LABEL_OVERRIDES[option.id] ?? option.label,
    search: { orientation: option.id as Orientation },
  }))

export function ShopByOrientationSection() {
  return (
    <SectionBand
      aria-labelledby={HEADING_ID}
      data-testid="shop-by-orientation"
      /*
       * Sand below lg, white from lg up — theirs, at both widths. The vertical
       * rhythm follows the band that is visible: 32px as measured wherever the
       * sand shows, the house 96px from lg up where the edges cannot be seen
       * anyway. `sm:py-8` is not redundant — it is what displaces SectionBand's
       * own `sm:py-24`, which would otherwise put 96px of sand around the
       * chips on a tablet.
       */
      className="bg-band-strong py-8 sm:py-8 lg:bg-background lg:py-24"
    >
      <DisplayHeading as="h2" id={HEADING_ID} className="text-section">
        Shop By Orientation
      </DisplayHeading>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 lg:mt-5 lg:flex lg:flex-wrap lg:gap-6">
        {ORIENTATION_CHIPS.map((chip) => (
          <li key={chip.id}>
            <Link
              to="/posters"
              search={chip.search}
              data-testid="orientation-chip"
              data-orientation={chip.id}
              className="flex h-10 items-center justify-center rounded-full bg-[#f5f1e6] px-6 text-center text-sm font-normal capitalize text-foreground transition-colors duration-300 hover:bg-band lg:h-[52px] lg:px-7 lg:text-base"
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </SectionBand>
  )
}

export default ShopByOrientationSection
