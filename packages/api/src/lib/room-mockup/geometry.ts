/**
 * Room mockup geometry.
 *
 * Pure arithmetic, deliberately free of sharp and of the filesystem, so the
 * two rules that decide whether a mockup looks real can be tested directly.
 */

/** A rectangle normalised 0..1 against an image's own dimensions. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle in whole pixels, ready to hand to sharp's composite(). */
export interface Placed {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Fit artwork inside a template's placement rectangle.
 *
 * The rect is a BOUNDING BOX, not a stretch target: the artwork keeps its own
 * aspect ratio and is centred in the box. A portrait poster and a landscape
 * poster therefore both land correctly in the same room, one leaving margin at
 * the sides and the other at the top and bottom.
 *
 * Centring rather than top-anchoring matches how art is actually hung — on a
 * centre line, not from a corner.
 */
export function fitIntoBox(
  artW: number,
  artH: number,
  box: Box,
  canvasW: number,
  canvasH: number
): Placed {
  const boxW = box.w * canvasW;
  const boxH = box.h * canvasH;

  const scale = Math.min(boxW / artW, boxH / artH);
  const width = Math.round(artW * scale);
  const height = Math.round(artH * scale);

  return {
    width,
    height,
    left: Math.round(box.x * canvasW + (boxW - width) / 2),
    top: Math.round(box.y * canvasH + (boxH - height) / 2),
  };
}

/** One blurred, offset, semi-transparent black layer. */
export interface ShadowSpec {
  blurSigma: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export interface ShadowPair {
  contact: ShadowSpec;
  ambient: ShadowSpec;
}

/**
 * sharp's blur() rejects a sigma below roughly 0.3; clamp above it so a very
 * small render cannot produce an invalid parameter.
 */
const MIN_SIGMA = 0.4;

/**
 * Derive the two-shadow pair that makes a flat composite read as an object
 * standing off a wall.
 *
 * One shadow is never enough — it reads as a sticker. Two do the work:
 *
 *   contact — tight, dark, barely offset. The edge meeting the wall.
 *   ambient — wide, faint, offset further. The body of the object.
 *
 * Opacity is fixed and only geometry scales with depth. A thicker frame casts
 * a LARGER shadow, not a darker one; darkening with depth reads as a change in
 * the room's lighting instead of a change in the object.
 */
export function shadowParams(
  shortEdge: number,
  depthRatio: number,
  light: 'left' | 'right'
): ShadowPair {
  const depth = shortEdge * depthRatio;
  const dir = light === 'left' ? 1 : -1;

  return {
    contact: {
      blurSigma: Math.max(MIN_SIGMA, depth * 0.35),
      opacity: 0.55,
      offsetX: dir * depth * 0.18,
      offsetY: depth * 0.22,
    },
    ambient: {
      blurSigma: Math.max(MIN_SIGMA, depth * 1.9),
      opacity: 0.3,
      offsetX: dir * depth * 0.9,
      offsetY: depth * 1.1,
    },
  };
}
