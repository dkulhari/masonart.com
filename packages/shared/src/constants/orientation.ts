/**
 * Orientation, derived from the artwork instead of typed over it.
 *
 * WHY THIS FILE EXISTS
 *
 * `products.orientation` is not decoration. The Discover chips on `/posters`
 * and `/collections/$slug` size their crop from it (`chipArtScale`), and the
 * popular tiles on the home page size theirs from it (`tileArtScale`) — both
 * scale past the mat by an amount that only makes sense for the shape the
 * column claims. Feed either a wrong value and the crop misses: white mat arcs
 * inside a chip that is supposed to be a window into the painting.
 *
 * #545 found 27 of 41 catalogue rows declaring an orientation their own picture
 * contradicted. The cause was not staleness — the seed authors a fictional
 * product (title, copy, orientation) and then staples real fixture artwork onto
 * it, so the column described one object and the pixels another, and nothing
 * ever reconciled them. Nobody filed it for months because a wrong crop looks
 * plausible rather than broken.
 *
 * The measurement itself lives in the API (`measureArtBox` in
 * image-processing.ts) because it needs the pixels. The RULE lives here,
 * because the seed, the admin upload path and any future importer all have to
 * agree on what a given proportion is called.
 */

/**
 * Where one orientation stops and the next begins, as width / height.
 *
 * Read as lower bounds, widest first: a piece is panoramic from 1.8 up,
 * landscape from 1.15, square from 0.87, and portrait below that.
 *
 * The numbers are the bands the catalogue actually occupies rather than
 * geometric ideals. 1.8 sits under a 2:1 canvas because our panoramic ladder
 * runs 2:1 through 3:1 and the shallowest of those must not be filed as
 * landscape. 0.87 and 1.15 are a symmetric ±15% tolerance around 1:1: a
 * hand-stretched canvas is never exactly square, and calling a 0.95 piece
 * portrait would crop it as if it were 3:4.
 */
export const ORIENTATION_RATIO_BREAKS = {
  panoramic: 1.8,
  landscape: 1.15,
  square: 0.87,
} as const;

/** The orientations that describe the proportion of one piece. */
export type ProportionOrientation =
  | 'panoramic'
  | 'landscape'
  | 'square'
  | 'portrait';

/**
 * Orientations a bounding box cannot check.
 *
 * `set-of-2-3` counts panels; it says nothing about proportion. Measured as one
 * rectangle a diptych reads wide — paper-layers comes back 2.08 — and calling
 * that panoramic would be wrong about the product, not right about the picture.
 * `round` is a circle inside a square box, which measures 1.0 whatever the
 * piece is.
 */
export const PANEL_COUNT_ORIENTATIONS = ['set-of-2-3'] as const;

/** Every orientation this module declines to judge. */
export const UNMEASURABLE_ORIENTATIONS: readonly string[] = [
  ...PANEL_COUNT_ORIENTATIONS,
  'round',
];

/** The normalised artwork rectangle `measureArtBox` persists on a ProductImage. */
export interface ArtBoxLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Name a proportion.
 *
 * Returns undefined for a ratio that cannot describe a picture — zero, negative
 * or non-finite — rather than guessing. Callers treat "no measurement" and "the
 * measurement disagrees" very differently.
 */
export function orientationFromRatio(
  ratio: number
): ProportionOrientation | undefined {
  if (!Number.isFinite(ratio) || ratio <= 0) return undefined;
  if (ratio >= ORIENTATION_RATIO_BREAKS.panoramic) return 'panoramic';
  if (ratio >= ORIENTATION_RATIO_BREAKS.landscape) return 'landscape';
  if (ratio >= ORIENTATION_RATIO_BREAKS.square) return 'square';
  return 'portrait';
}

/**
 * Name the proportion of a measured artwork box.
 *
 * The box is normalised against a square canvas, so its own w/h IS the aspect
 * of the piece — which is the whole point of measuring it. The stored image is
 * 1500x1500 for a 3:1 panorama and for a perfect square alike.
 */
export function orientationFromArtBox(
  box: ArtBoxLike | null | undefined
): ProportionOrientation | undefined {
  if (!box) return undefined;
  return orientationFromRatio(box.w / box.h);
}

/**
 * The orientation the picture measures, when it contradicts the one declared.
 *
 * Undefined means "no objection": the two agree, there was nothing to measure,
 * or the declared value is one a bounding box has no opinion about.
 *
 * This deliberately reports rather than corrects. A measurement is a heuristic
 * over a photograph — it trims a wall, it can meet a piece composed as a light
 * field on white — so the caller decides whether to refuse the write, warn, or
 * fill in a value nobody supplied.
 */
export function orientationContradictingArt(
  declared: string | null | undefined,
  box: ArtBoxLike | null | undefined
): ProportionOrientation | undefined {
  if (!declared || UNMEASURABLE_ORIENTATIONS.includes(declared))
    return undefined;
  const measured = orientationFromArtBox(box);
  return measured && measured !== declared ? measured : undefined;
}
