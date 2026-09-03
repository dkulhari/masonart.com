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
