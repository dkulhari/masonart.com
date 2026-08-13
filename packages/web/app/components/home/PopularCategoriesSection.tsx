/**
 * PopularCategoriesSection — the home page's "Shop By Popular" band (#531).
 *
 * SUPERSEDES `CategoriesSection` in `app/routes/index.tsx` ("Shop by Style").
 * That section drew four flat CSS gradients with the category name and a
 * strapline overlaid inside the tile; this is the bar's band — a left-aligned
 * heading, wide photographic tiles of real artwork, the name centred BELOW the
 * tile in light weight, and one centred outline pill under the lot. The old
 * section is left in place for the integration step to remove — see the ticket.
 *
 * ## Why the tiles are collections, not facet values
 *
 * `~/lib/homeCategories` (#452) is a hand-written list of four facet values,
 * filtered against `/api/products/facets` so a tile never leads to an empty
 * grid. That filter is the part worth keeping, and it is kept — see
 * `popularCategoryTiles`. What it cannot do is put a picture on a tile: a
 * facet count is a number, so those four tiles had `/images/categories/*.jpg`
 * files that do not exist in the repo and a gradient painted over the gap.
 *
 * `GET /api/collections?discover=true` answers with the same honesty guarantee
 * AND the image: one row per curated collection carrying `count` (resolved
 * against active products, exactly what the facet filter was proxying for) and
 * `image` — the main artwork of a representative product in that collection,
 * chosen server-side in #410. So every tile here shows a poster you can
 * actually buy from the collection it links to.
 *
 * It is also what the bar does. Their tiles read "Abstract", "Landscape",
 * "Beach & Ocean", "Graffiti", "latest work", "City", "Floral", "Horse" —
 * style, subject and a date window side by side, which is the collection
 * vocabulary DiscoverChips was built around and not any one facet group.
 *
 * ## The crop
 *
 * Stored product images are square: sharp contains the artwork at
 * MAT_ART_INSET of its LONGEST side on a flat rgb(250 250 250) mat. Dropped
 * into a 7:4 tile at `object-cover` that leaves mat showing, so the image is
 * scaled up and centre-cropped until the artwork covers the tile — the same
 * move `chipArtScale` makes for the round Discover chips.
 *
 * HOW DEEP depends on the artwork's proportion, because the inset applies to
 * the longest side: a square needs ~1.3, a 1.96:1 panoramic ~1.5, and a 1:1.9
 * portrait ~2.5 before its short edge clears the tile. `tileArtScale` derives
 * it from `orientation`.
 *
 * The first cut of this band did NOT trust that column, and was right not to:
 * 27 of the catalogue's 41 products declared an orientation their picture
 * contradicted, so the band used one constant (2.36) sized for the narrowest
 * artwork anywhere in the catalogue. That constant is what lost the first
 * blind A/B — it cropped the wide pieces to 1:1 with the source, which turned
 * three tiles soft, while still leaving a wall sliver on the pieces whose
 * declared shape was a lie.
 *
 * #545 fixed the column: every orientation in the dev catalogue is now
 * measured off the pixels of the artwork the product actually ships with. So
 * this derives its crop from `orientation` again, as #545 asks, and every tile
 * downsamples rather than enlarging.
 *
 * `bg-mat` stays behind the image regardless — the exact colour sharp bakes
 * into the canvas. If a piece narrower than any measured here is ever added,
 * its mat continues into the tile background with no visible seam and the
 * artwork reads as centred, rather than as a picture that failed to load.
 */

import { useQuery } from '@tanstack/react-query'
import { SectionBand, type SectionBandProps } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { buttonVariants } from '~/components/ui/Button'
import { productsApi } from '~/lib/api'
import type { DiscoverCollection } from '~/components/product/DiscoverChips'

/**
 * How many tiles the band draws at most.
 *
 * Eight, because the bar's band is two rows of four and this grid is four
 * columns. Fewer is fine — the row simply ends — but a ninth tile would open a
 * third row the bar does not have.
 */
export const POPULAR_TILE_COUNT = 8

/** Width : height of one tile. Measured on the bar: 316.5 x 182 at 1440. */
export const TILE_ASPECT = 7 / 4

/** Artwork fraction of the LONGEST side. Mirrors MAT_ART_INSET in @chobii/shared. */
const MAT_ART_INSET = 0.88

/**
 * A little past the artwork's own edge.
 *
 * Catalogue artwork is photographed framed and hanging, so the outermost band
 * of the picture is a frame moulding and its shadow on the wall, not paint.
 * Landing the crop exactly on the measured edge puts that dark line and the
 * wall behind it in shot along one border — two tiles did precisely that in
 * the first blind A/B. 12% of the binding side clears both.
 */
const CROP_MARGIN = 1.12

/**
 * The narrowest artwork each orientation can be describing, as width : height.
 *
 * Not the size ladder's proportion — that is the poster you buy, whereas this
 * is the photograph of it, and the two are not the same rectangle. These are
 * the extremes measured across the dev catalogue when `orientation` was
 * re-derived from the pixels (#545): panoramic pieces run to 1.96:1, portrait
 * ones down to 1:1.9, and the class boundaries for landscape and square are
 * 1.15 and 0.87. Planning for the narrowest member of a class means a crop
 * that clears the tile for every member of it.
 *
 * `round` is here because the facet exists; nothing in the catalogue uses it.
 */
const PLANNED_ASPECT = {
  panoramic: 1.96,
  landscape: 1.15,
  square: 0.87,
  portrait: 0.52,
  round: 1,
} as const

type PlannedOrientation = keyof typeof PLANNED_ASPECT

/**
 * The deepest crop this component will make.
 *
 * Used for an orientation the table above does not know — including
 * `set-of-2-3`, which the collections API no longer hands out as a
 * representative precisely because no centred crop of a two-panel photograph
 * is one picture. Deepest, because the failure it guards against is mat inside
 * the tile; softness is the cheaper mistake.
 */
const FALLBACK_ASPECT = PLANNED_ASPECT.portrait

/**
 * How far the square source is enlarged before the tile crops it.
 *
 * `object-cover` on a square inside a 7:4 tile renders the source at the
 * tile's WIDTH both ways, so the visible window is the full source width by
 * 1/TILE_ASPECT of its height. Covering the artwork needs both
 *
 *     scale >= 1 / widthFraction
 *     scale >= (1 / TILE_ASPECT) / heightFraction
 *
 * Resolution holds everywhere it matters: sources are 1500px square, and the
 * widest tile (332 CSS at 1440, 664 device px at 2x DPR) reads a window of
 * 1500/scale source pixels — 1147 at the shallowest of these, 613 at the
 * deepest. Every orientation the API can currently send downsamples.
 */
export function tileArtScale(orientation: string | null | undefined): number {
  const aspect =
    orientation && orientation in PLANNED_ASPECT
      ? PLANNED_ASPECT[orientation as PlannedOrientation]
      : FALLBACK_ASPECT

  const width = aspect >= 1 ? MAT_ART_INSET : MAT_ART_INSET * aspect
  const height = aspect >= 1 ? MAT_ART_INSET / aspect : MAT_ART_INSET

  return +(
    Math.max(1 / width, 1 / TILE_ASPECT / height) * CROP_MARGIN
  ).toFixed(3)
}

/** Where the band's pill goes. `/posters` is where every collection is listed. */
export const VIEW_ALL_HREF = '/posters'

// ============================================================================
// Selection
// ============================================================================

/**
 * The collections worth a tile.
 *
 * The #452 rule, carried over: **a tile only shows if the catalogue can fill
 * it.** `count` is resolved server-side against active products, so a
 * collection whose rule currently matches nothing is dropped rather than
 * offered as a door onto an empty grid.
 *
 * A second condition the facet version never had to make: no image, no tile.
 * A photographic band with one grey rectangle in it is worse than a band of
 * seven, and the alternative — an initial on a plate, as the chips do — is not
 * artwork and would be the gradient problem again in a quieter colour.
 *
 * Order is the admin's `discoverOrder`, exactly as the API returns it. NOT
 * re-sorted by `count`: the row is a curated set, and one re-sorting itself as
 * stock moves makes the home page restless.
 */
export function popularCategoryTiles(
  collections: DiscoverCollection[] | undefined
): DiscoverCollection[] {
  if (!collections) return []

  return collections
    .filter((collection) => collection.count > 0 && Boolean(collection.image))
    .slice(0, POPULAR_TILE_COUNT)
}

// ============================================================================
// Band (presentational)
// ============================================================================

export interface PopularCategoriesBandProps {
  categories: DiscoverCollection[]
  tone?: SectionBandProps['tone']
}

/**
 * The heading, the tiles and the pill — or nothing at all.
 *
 * Split from the connected component below so the selection rule is testable
 * without a query client, the same shape CustomerReviewsSection uses.
 */
export function PopularCategoriesBand({
  categories,
  tone = 'plain',
}: PopularCategoriesBandProps) {
  // No categories the catalogue can fill is not an empty grid under a
  // heading — it is no band.
  if (categories.length === 0) return null

  return (
    <SectionBand tone={tone} data-testid="popular-categories">
      <DisplayHeading as="h2" className="mb-5 text-section sm:mb-10">
        Shop By Popular
      </DisplayHeading>

      {/*
        The row gap is deliberately larger than the gap above a label. A
        caption between two tiles belongs to exactly one of them, and the only
        thing that says which is proximity: 12px up, 24px down on a phone, 16
        and 40 from `sm`. The bar's own band sets 12.5 and 12, which is a coin
        toss four rows deep.

        The phone figure was 36px down (#541): four rows of it, plus 32 under
        the heading and 64 of band padding each side, put this band at 910px
        against the bar's 736 for the same eight tiles. Halving the row gap
        keeps the label owned by the tile above it and stops the band paying
        for the ownership four times over.
      */}
      <ul className="grid list-none grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <a
              href={`/collections/${category.slug}`}
              data-testid="popular-category-tile"
              data-slug={category.slug}
              // The ring wraps the tile AND its label, because the label is
              // part of the link — not decoration beside it.
              className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 sm:rounded-xl"
            >
              <span
                className="block overflow-hidden rounded-lg bg-mat sm:rounded-xl"
                style={{ aspectRatio: String(TILE_ASPECT) }}
              >
                <span className="block h-full w-full transition-transform duration-700 [transition-timing-function:var(--ease-primary)] group-hover:scale-[1.04]">
                  <img
                    // Decorative: the category name is right underneath it in
                    // text, so an alt would be read out twice.
                    alt=""
                    src={category.image ?? undefined}
                    loading="lazy"
                    decoding="async"
                    data-matted={category.imageIsMatted ? 'true' : 'false'}
                    /**
                     * Only matted product artwork is enlarged. An image the
                     * admin uploaded for the collection is already a
                     * photograph edge to edge, and scaling it crops into the
                     * picture they chose — the distinction DiscoverChips draws
                     * for the same two sources.
                     */
                    style={
                      category.imageIsMatted
                        ? {
                            transform: `scale(${tileArtScale(
                              category.orientation
                            )})`,
                          }
                        : undefined
                    }
                    className="h-full w-full object-cover object-center"
                  />
                </span>
              </span>

              {/*
                Below the tile, never over it. Light weight, centred.

                16 / 20 / 24px against a 28px mobile and 44px desktop heading —
                a step of 1.75x and 1.83x. It was 14 / 18 / 20 (2.0x and 2.2x),
                which put eight labels at the very bottom of the page's size
                ramp and made a 318px-wide tile read as an unlabelled
                thumbnail. The bar steps 1.6x; ours stays a little further
                back, because these are labels under pictures and not a second
                heading.
              */}
              <span className="mt-3 block text-center text-base font-light leading-snug text-foreground transition-opacity duration-300 group-hover:opacity-70 sm:mt-4 sm:text-xl lg:text-2xl">
                {category.title}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex justify-center sm:mt-12">
        <a
          href={VIEW_ALL_HREF}
          className={buttonVariants({ variant: 'outline', size: 'pill' })}
        >
          View Popular Categories
        </a>
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Section (connected)
// ============================================================================

export interface PopularCategoriesSectionProps {
  tone?: SectionBandProps['tone']
}

/**
 * What the home page mounts.
 *
 * Reads client-side. The collection list describes the catalogue rather than
 * this URL, it is the same request `/posters` already makes for its Discover
 * rail, and a category tile is not worth a slower first byte on the home page
 * — the same reasoning as the reviews strip and the facet counts on /posters.
 *
 * `productsApi.collections` rather than a relative fetch: there is no Vite
 * proxy for `/api`, so a relative request from the dev server never reaches
 * the API at all.
 *
 * A failed request leaves `data` undefined, which `popularCategoryTiles` turns
 * into an empty list and the band turns into nothing. Absent, not broken.
 */
export function PopularCategoriesSection({
  tone,
}: PopularCategoriesSectionProps = {}) {
  const { data } = useQuery({
    queryKey: ['collections', 'discover'] as const,
    queryFn: () => productsApi.collections(),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <PopularCategoriesBand
      categories={popularCategoryTiles(data?.collections)}
      tone={tone}
    />
  )
}

export default PopularCategoriesSection
