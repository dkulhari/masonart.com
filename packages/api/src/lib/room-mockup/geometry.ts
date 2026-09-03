/**
 * Room mockup geometry.
 *
 * Pure arithmetic, deliberately free of sharp and of the filesystem, so the
 * placement rule that decides whether a mockup looks real can be tested directly.
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

