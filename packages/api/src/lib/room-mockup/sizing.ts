/**
 * Which physical size a poster is shown at.
 *
 * The room is measured in centimetres, so the poster needs a size in
 * centimetres — and it has to be one the shop sells, or the mockup shows a
 * product that does not exist. Default: the middle rung of the ladder for
 * the art's orientation band, the size a shopper is most likely to see
 * first. The CLI can override it per run with --poster-cm.
 *
 * The art is then CONTAINED in that rectangle with a mat, exactly as a real
 * print is: a 0.57-ratio artwork sold at 61 × 91 cm gets wider side mats.
 * That is honest about the product, and buildPanel already does it.
 */

import { getSizesForOrientation, orientationFromRatio } from '@chobii/shared';
import type { SizeCm } from './wall';

/** Ladders are listed short side first; these bands hang wide. */
const TURNED = new Set(['landscape', 'panoramic']);

export function posterSizeForAspect(artW: number, artH: number): SizeCm {
  const orientation = orientationFromRatio(artW / artH);
  if (!orientation) {
    throw new Error(`Cannot size a poster with dimensions ${artW}×${artH}.`);
  }

  const ladder = getSizesForOrientation(orientation);
  const rung = ladder[Math.floor(ladder.length / 2)];
  if (!rung) {
    throw new Error(`No size ladder for orientation "${orientation}".`);
  }

  return TURNED.has(orientation)
    ? { widthCm: rung.heightCm, heightCm: rung.widthCm }
    : { widthCm: rung.widthCm, heightCm: rung.heightCm };
}

/**
 * The size that FILLS the room's allowable box at the art's own proportion.
 *
 * The room shot is a representative image, not a size chart: the poster
 * should be as large as the wall allows and keep the art's aspect, so the
 * mat comes out even on all four sides. The allowable box is for the framed
 * outer rectangle, so the face is taken off both sides first.
 */
export function posterSizeToFill(
  artW: number,
  artH: number,
  faceCm: number,
  allowable: { maxWidthCm: number; maxHeightCm: number }
): SizeCm {
  if (!(artW > 0) || !(artH > 0)) {
    throw new Error(`Cannot size a poster with dimensions ${artW}×${artH}.`);
  }

  const boxW = allowable.maxWidthCm - 2 * faceCm;
  const boxH = allowable.maxHeightCm - 2 * faceCm;
  if (boxW <= 0 || boxH <= 0) {
    throw new Error(
      `A ${faceCm} cm frame face leaves no room inside the ${allowable.maxWidthCm}×${allowable.maxHeightCm} cm allowable box.`
    );
  }

  const aspect = artW / artH;
  const byHeight = { widthCm: boxH * aspect, heightCm: boxH };
  return byHeight.widthCm <= boxW ? byHeight : { widthCm: boxW, heightCm: boxW / aspect };
}

export function parsePosterCm(value: string): SizeCm {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(value);
  const w = m ? Number(m[1]) : 0;
  const h = m ? Number(m[2]) : 0;

  if (!m || w <= 0 || h <= 0) {
    throw new Error(
      `--poster-cm expects WIDTHxHEIGHT in centimetres, e.g. 60x80; got "${value}".`
    );
  }

  return { widthCm: w, heightCm: h };
}
