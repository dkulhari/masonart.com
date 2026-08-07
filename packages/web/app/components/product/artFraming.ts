/**
 * Art framing — EQUAL INK AREA, CAPPED BY THE PLATE'S CORNER RADIUS.
 *
 * ## The problem this solves
 *
 * Every stored product image is a 1500x1500 master with the mat BAKED INTO THE
 * PIXELS: the pipeline contains the artwork at MAT_ART_INSET (88%) of its
 * LONGEST side and fills the rest with MAT_COLOR. That rule normalises the long
 * side and nothing else, so what the card actually draws varies enormously —
 * and the stored asset says `1500x1500` for a 2:1 panorama and a square alike,
 * so the card cannot tell them apart.
 *
 * `ProductImage.artBox` is the missing measurement: where the artwork actually
 * sits inside its square master. Given it, this module returns the two CSS
 * properties that re-frame the piece:
 *
 *   clip-path   crops the baked mat away, so the CARD's plate is the only
 *               background and its colour is finally visible (the baked mat is
 *               #FAFAFA — 2% against white, which is why the plate read as
 *               absent).
 *   transform   scales and centres what is left onto the target rect below.
 *
 * ## Why this rule and not the two that lost
 *
 * Two pure rules have now been tried and both lost a blind A/B against
 * mesonart's own band:
 *
 *   equal AREA, uncapped   every card carries the same ink, but the long sides
 *                          spread 1.39x, so the row still arrives at four sizes
 *   one shared BOX         every long side identical, but coverage spreads
 *                          1.93x — a 1.02:1 piece fills 79% of its plate while
 *                          a 1.98:1 piece fills 41%, and the row reads as one
 *                          big picture beside three small ones
 *
 * Neither is wrong in isolation; the two properties are in direct opposition
 * whenever the stock's aspects are spread. With the plate square, the art
 * centred and L the long side as a fraction of the plate:
 *
 *   coverage = L^2 * r        where r = short/long of the artwork
 *
 * so holding coverage constant forces L proportional to r^-0.5, and holding L
 * constant forces coverage proportional to r. You cannot have both unless every
 * piece has the same r. mesonart's Best Seller stock runs r 0.75..0.98; ours
 * runs 0.48..0.98 over 41 products, with 39% of the catalogue at 2:1.
 *
 * So the constants are not argued from first principles — they are read off the
 * bar.
 *
 * ## The measurement, and the correction to it
 *
 * Source: `scratchpad/shots/bar-desktop-full.png`, the reference's home page
 * captured at a 1440x900 viewport, deviceScaleFactor 2. Method: locate each
 * grey plate, take the median of its 4..8px border ring as the plate colour,
 * and bound the pixels that differ from it by more than an ink threshold.
 * Every figure below is quoted at threshold 20 and was re-run at 8 and 45.
 * Band A's spread moves by 0.012x across all three, so it is not a threshold
 * artefact; Band B has two cards that are, and the correction note below says
 * which and why.
 *
 * BAND A — the reference's Best Seller row (322px plates at x 48/389/729/1070):
 *
 *   art      261x255   261x256   245x304   233x311
 *   aspect      1.02      1.02      0.81      0.75
 *   coverage   64.2%     64.3%     71.8%     70.2%     spread 1.12x, mean 67.6%
 *
 * BAND B — the reference's "New In" rail, further down the same page, and the
 * useful one: unlike Band A its stock is genuinely mixed, the way ours is.
 *
 *   art      231x301   261x256   306x156   149x301
 *   aspect      0.77      1.02      1.96      0.49
 *   coverage   67.0%     64.4%     46.1%     43.2%     spread 1.55x, mean 55.2%
 *   mat left/top     46/12     33/33     10/80     87/12
 *
 * i.e. the reference's own elongated stock carries an 80-87px mat on its short
 * axis, which is what ours carries too (87px on our 2:1 pieces).
 *
 * Two facts carry the whole rule. First, the reference draws a near-square at
 * 261x256 and ~64% of the plate in BOTH bands — the same shape at the same
 * scale twice, which is a rule and not a coincidence. Second, when its own
 * stock spans 0.49..1.96 its coverage spreads 1.55x. So the reference does NOT
 * hold coverage flat; it holds a fixed near-square and lets the elongated
 * pieces fall where their shape puts them.
 *
 * CORRECTIONS, recorded so they are not re-derived a third time. Round 3 read
 * Band A as `65 / 65 / 73 / 88 %`, a 1.35x spread, and set ART_AREA = 0.554 to
 * reproduce that 1.35x. The fourth figure was wrong: card 4 is 233x311 in a
 * 322px plate, which is 70%, not 88%. The other three were right. Band A's real
 * spread is 1.12x, so 1.35x was never the reference's number and 0.554 was
 * calibrated against it — which put our near-square at 242x236 / 55% where the
 * reference's is 261x256 / 64%.
 *
 * Round 3 also read Band B as `96 / 65 / 47 / 96 %`, a 2.05x spread, and used
 * that to argue the reference tolerates very uneven rows. That reading is a
 * threshold artefact: Band B's cards 1 and 4 are photographed against a wall
 * whose tone sits 1-2 levels off the plate's own (239,238,237 against
 * 239,239,239), so at an ink threshold of 8 their bounding box swallows the
 * whole plate and reads 100%. At 20 and 45 they resolve to 67% and 43%, and the
 * band spreads 1.55x — which is why every figure here is quoted at 20 and
 * re-checked at both ends.
 *
 * What DOESN'T change is stock: our 2:1 pieces cannot exceed 50% coverage in a
 * square plate at any scale, where none of Band A's four goes below 64%. That
 * gap is photographic, not layout (see the note on mean coverage below).
 *
 * ## What this does to the mat, which is the other half of the complaint
 *
 * The mat is not set here; it is what is left over. But because the long side
 * now varies with shape, so does it, and in the bar's own direction — the
 * rounder the picture the wider its mat:
 *
 *   shortness r    1.00  0.98  0.80  <=0.79
 *   our mat, long axis, 321px plate    32    31    17    16
 *   the bar's, Band A                  --    33     --     6
 *
 * Under the shared box it was a flat 16px on every card, which is why the
 * near-square read as a bordered card rather than a matted one: a uniform ring
 * thinner than the 20px gap between tiles is a border. A near-square is always
 * uncapped, so its ring can no longer be narrower than 31px — and the
 * reference's own near-square ring measures 33px.
 *
 * What does NOT change, and cannot: a 1.98:1 piece centred in a square plate
 * leaves at least P(1 - 1/1.98)/2 = 79px above and below it whatever the rule
 * does, so a row holding both that and a portrait can never bring its top edges
 * within 63px of each other. Observed 71px, of which 63 is the shape.
 *
 * ## Why transform + clip-path and not a wrapper element
 *
 * Neither property affects layout. The card's row-alignment contract — exactly
 * ONE image in normal flow, carrying MEDIA_RATIO, defining the media box height,
 * with every hover slide `absolute inset-0` — survives untouched. See
 * docs/superpowers/specs/2026-07-30-product-grid-alignment-design.md.
 *
 * An asset with no `artBox` (anything processed before the measurement existed)
 * gets no framing at all and draws exactly as it always did.
 */

import type { CSSProperties } from 'react'
import type { ImageArtBox } from '@chobii/shared'

/**
 * TARGET INK AREA, as a fraction of the plate.
 *
 * Every piece the cap below does not bind is drawn at exactly this coverage,
 * whatever its shape — so two cards can be compared by the amount of picture on
 * them, which is what the third blind A/B said the row failed at.
 *
 * 0.64 IS the reference's near-square coverage. It is not fitted to a spread
 * and not a preference: the reference draws its 1.02:1 piece at 64.2% in Band A
 * and 64.4% in Band B (see the header), so a piece the cap does not bind is
 * drawn at 0.64 and lands at 260x255 of a 321px plate against its 261x256 of a
 * 322px plate. Everything else follows: the row's coverage spread comes out at
 * 1.56x, which is what the reference's own mixed-aspect band measures (1.55x),
 * and it is an OUTPUT of the constant rather than the thing being tuned.
 *
 * Measured on the live Best Seller row at 1440, so the next round does not have
 * to re-derive them:
 *
 *   ART_AREA   near-square   cov spread   row mean cov
 *   0.810 *       289px         1.93x        51.0%   <- round 2, the shared box
 *   0.640         260px         1.56x        47.1%   <- here; the reference is
 *                                                       261px / 64% / 1.55x
 *   0.554         242px         1.35x        44.9%   <- round 3, calibrated
 *                                                       against a mis-read 88%
 *   0.410         208px         1.05x        41.3%   <- flat coverage
 *   * 0.81 = ART_MAX_SIDE^2, i.e. any value at or above it caps every shape and
 *     degenerates to the shared box.
 *
 * Flat coverage is reachable and is NOT what the reference does — its mixed
 * band spreads 1.55x. Chasing 1.05x would shrink the near-square to 208px,
 * 53px under the reference's own, on mean coverage, the one axis where the
 * reference is unambiguously ahead (67.6% in Band A against our 47.1%). That
 * remaining gap is photographic, not layout: a 1.98:1 piece cannot exceed 50.6%
 * of a square plate at any scale without cropping, and 39% of the catalogue is
 * 2:1.
 */
export const ART_AREA = 0.64

/**
 * THE CAP — the longest side any piece may take, as a fraction of the plate.
 *
 * A hard geometric constraint, not a taste call: the plate's corner radius is
 * 15.16px on a 321px plate, and our artwork is photographed FRAMED, with hard
 * rectangular gilt edges. A mat thinner than the radius puts the plate's curve
 * through a straight frame edge and reads as a cropping accident. 0.90 leaves
 * 16px, the first whole pixel clear of it.
 *
 * (The bar can and does run to 3-6px because its images are canvases
 * photographed on a wall — the corner it clips is empty plaster, not a frame.)
 *
 * The cap is why coverage cannot be made uniform: a piece with r below
 * ART_AREA / ART_MAX_SIDE^2 = 0.790 hits the cap before it reaches the target
 * area and stays below it. On the dev catalogue's census — r 0.48 x1,
 * 0.51-0.53 x15, 0.62 x1, 0.74-0.78 x11, 0.80 x7, 0.98 x8 — that is 28 of 41
 * products, and their coverage lands at 0.81 * r: 38.9% at r 0.48, 63.2% at
 * r 0.78, against the flat 64% the other 13 all share. Coverage therefore falls
 * away CONTINUOUSLY with shape rather than in a step, which is the reference's
 * own profile in Band B (67 / 64 / 46 / 43 across r 0.77 / 0.98 / 0.51 / 0.49).
 */
export const ART_MAX_SIDE = 0.9

/** Below this a "box" is noise — a mis-measurement, not a piece of art. */
const MIN_SIDE = 0.05

const finite = (n: number): boolean => typeof n === 'number' && Number.isFinite(n)

/**
 * Whether a box is usable: inside the master, big enough to be artwork.
 *
 * Deliberately strict. A bad box would scale an image by an absurd factor and
 * put a 40x blown-up fragment on the card, which is far worse than the
 * un-normalised picture it replaced.
 */
export function isUsableArtBox(box: ImageArtBox | undefined): box is ImageArtBox {
  if (!box) return false
  const { x, y, w, h } = box
  if (![x, y, w, h].every(finite)) return false
  if (w < MIN_SIDE || h < MIN_SIDE || w > 1 || h > 1) return false
  if (x < 0 || y < 0) return false
  // A hair of slack: the measurement is taken in whole pixels on a 1500 grid.
  return x + w <= 1.001 && y + h <= 1.001
}

/**
 * The target rect for a piece of this shape, in plate fractions.
 *
 * The long side is whichever is smaller of
 *   - the side that gives the piece exactly `area` of the plate, and
 *   - `maxSide`, the corner-radius cap.
 * The short side then follows from the aspect, so the artwork is never
 * distorted and never cropped. Exported for the tests, which assert the
 * invariants rather than a table of numbers.
 */
export function artTargetSize(
  aspect: number,
  area: number = ART_AREA,
  maxSide: number = ART_MAX_SIDE
): { width: number; height: number } {
  // r = short/long. Equal area means long = sqrt(area / r).
  const r = aspect >= 1 ? 1 / aspect : aspect
  const long = Math.min(maxSide, Math.sqrt(area / r))
  return aspect >= 1
    ? { width: long, height: long / aspect }
    : { width: long * aspect, height: long }
}

/**
 * The style that re-frames one image, or null when it must be left alone.
 *
 * Returns `undefined` rather than an empty object so the caller can spread it
 * unconditionally: `style={frameArt(image.artBox)}`.
 */
export function frameArt(
  box: ImageArtBox | undefined,
  area: number = ART_AREA,
  maxSide: number = ART_MAX_SIDE
): CSSProperties | undefined {
  if (!isUsableArtBox(box)) return undefined

  const { x, y, w, h } = box
  const { width, height } = artTargetSize(w / h, area, maxSide)

  // The image is square and fills its (square) layout box, so one scale serves
  // both axes: the art is `w` of the box wide and has to become `width` of the
  // plate wide.
  const scale = width / w
  const left = (1 - width) / 2
  const top = (1 - height) / 2

  const pc = (n: number): string => `${(n * 100).toFixed(4)}%`

  return {
    // Local space, applied before the transform: keep only the art.
    clipPath: `inset(${pc(y)} ${pc(1 - x - w)} ${pc(1 - y - h)} ${pc(x)})`,
    transformOrigin: '0 0',
    // translate() resolves against this element's own border box — which is the
    // plate — so both terms are in the same units as `left`/`top` above.
    transform: `translate(${pc(left - scale * x)}, ${pc(top - scale * y)}) scale(${scale.toFixed(6)})`,
  }
}
