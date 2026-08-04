/**
 * Product variants, derived from the shared size ladder.
 *
 * WHAT THIS REPLACED
 *
 * `seed.ts` used to carry a hand-written `variantsByOrientation` table: four
 * steps per orientation, each with a literal "price addition" typed in by
 * hand. Meanwhile @chobii/shared declared three fully-tested size ladders and
 * `getSizesForOrientation()` — and nothing in the monorepo called any of them.
 *
 * The two disagreed. Seed square was 12/18/24/36"; the shared ladder was
 * 12/16/20/24/30/36/40/48". Nothing reconciled them, and the ladder lost by
 * default, because the seed is what actually reaches the database.
 *
 * There is now one source of truth, and it is the shared ladder.
 *
 * See docs/design/mesonart/mesonart-parity-analysis.md §5.6.
 */

import {
  getSizesForOrientation,
  priceForSize,
  type ProductSize,
} from "@chobii/shared";
import type { NewProductVariant } from "./schema";

/** The orientations `getSizesForOrientation` knows how to ladder. */
type LadderedOrientation = "square" | "portrait" | "landscape" | "panoramic";

/**
 * The shared ladder lists rectangular steps short-side-first, which reads as
 * portrait. Landscape is the same ladder with the long side moved — one set of
 * manufacturing sizes, two labellings, exactly as mesonart shares its rect-14
 * between Orientation_Vertical and Orientation_Horizontal (§5.2).
 *
 * Square is unaffected; panoramic is already stored wide.
 */
const orientFor = (
  orientation: LadderedOrientation,
  size: ProductSize
): { widthInches: number; heightInches: number } =>
  orientation === "landscape"
    ? { widthInches: size.heightInches, heightInches: size.widthInches }
    : { widthInches: size.widthInches, heightInches: size.heightInches };

const cmFor = (
  orientation: LadderedOrientation,
  size: ProductSize
): { widthCm: number; heightCm: number } =>
  orientation === "landscape"
    ? { widthCm: size.heightCm, heightCm: size.widthCm }
    : { widthCm: size.widthCm, heightCm: size.heightCm };

/**
 * Dual-unit label built from the ORIENTED dimensions.
 *
 * `size.displayLabelDual` is portrait-ordered because the ladder is; using it
 * directly would print `36" × 48"` on a landscape row whose stored width is
 * 48. Same format, oriented numbers.
 */
const labelFor = (
  widthInches: number,
  heightInches: number,
  widthCm: number,
  heightCm: number
): string =>
  `${widthInches}" × ${heightInches}" / ${widthCm} × ${heightCm} cm`;

/**
 * Stock declines with size: the largest steps are made to order rather than
 * held. A crude curve, but better than the flat hand-entered numbers it
 * replaced, and the seed is the only caller.
 */
const stockFor = (index: number, ladderLength: number): number => {
  const remaining = 1 - index / ladderLength;
  return Math.max(5, Math.round(50 * remaining));
};

/**
 * Build the full variant set for one product.
 *
 * `basePrice` is the product's own entry price; the smallest ladder step is
 * priced at exactly that, and every larger step scales by area with the
 * measured volume taper. See `priceForSize` in @chobii/shared.
 *
 * Returns an empty array for an orientation with no ladder (`round`, and the
 * `Set of 2/3` family if we ever adopt that facet), so the seed skips the
 * product rather than throwing mid-run.
 */
export function buildVariantsForOrientation(
  orientation: LadderedOrientation,
  basePrice: number
): Omit<NewProductVariant, "productId">[] {
  const ladder = getSizesForOrientation(orientation);

  return ladder.map((size, index) => {
    const { widthInches, heightInches } = orientFor(orientation, size);
    const { widthCm, heightCm } = cmFor(orientation, size);

    return {
      // Dual-unit inline, so the size list is scannable in either system at
      // once rather than behind a toggle (§5.6.6).
      sizeLabel: labelFor(widthInches, heightInches, widthCm, heightCm),
      widthInches,
      heightInches,
      widthCm,
      heightCm,
      price: priceForSize(basePrice, size).toFixed(2),
      stockQuantity: stockFor(index, ladder.length),
      sortOrder: index + 1,
    };
  });
}
