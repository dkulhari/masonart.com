/**
 * Stage 3: the framed poster, drawn flat in wall-plane pixels.
 *
 * Art, mat and frame face are all rectangles on the wall plane, so their
 * geometry is trivial here and a mess after projection: compose flat, warp
 * once. That is already the rule in warp.ts; this module adds the frame.
 *
 * The face's directional shade is applied here as well. It is a function of
 * panel x only — lit edge brighter, far edge darker — and the warp carries
 * it into the room for free, so there is no reason to reason about it in
 * perspective space later.
 *
 * Sizes arrive in centimetres and the caller says how many pixels the
 * outer rectangle should be (2× its projected extent, so the warp
 * downsamples). Everything inside is derived from that one scale.
 */

import sharp from 'sharp';
import { MAT_COLOR } from '@chobii/shared';
import { orientBuffer } from './orient';
import type { FrameRender } from './templates';
import { buildPanel } from './warp';
import type { SizeCm } from './wall';

export interface FramedPanel {
  png: Buffer;
  width: number;
  height: number;
}

/** Lit edge +6%, far edge −6%, linear across the face. */
export const FACE_GRADIENT = 0.06;

/** The dark hairline between face and mat, as a fraction of the face. Same as frameArtwork. */
const BEVEL_RATIO = 0.12;

/** Minimum mat on all four sides, as a fraction of the poster's short edge. Same as warp.ts. */
const MAT_RATIO = 0.06;

const MAT: [number, number, number] = [MAT_COLOR.r, MAT_COLOR.g, MAT_COLOR.b];

export async function buildFramedPanel(
  art: Buffer,
  posterCm: SizeCm,
  frame: FrameRender,
  panelW: number,
  panelH: number,
  light: { direction: 'left' | 'right' }
): Promise<FramedPanel> {
  const oriented = await orientBuffer(art);

  const outerWidthCm = posterCm.widthCm + 2 * frame.widthCm;
  const pxPerCm = panelW / outerWidthCm;

  // Gallery-wrap: no face, no bevel, no mat — the art runs to the edge.
  const face = frame.widthCm === 0 ? 0 : Math.max(2, Math.round(frame.widthCm * pxPerCm));
  const bevel = face === 0 ? 0 : Math.max(1, Math.round(face * BEVEL_RATIO));

  const innerW = Math.max(1, panelW - 2 * (face + bevel));
  const innerH = Math.max(1, panelH - 2 * (face + bevel));
  const inner = await buildPanel(oriented, innerW, innerH, MAT, face === 0 ? 0 : MAT_RATIO);

  if (face === 0) {
    const png = await sharp(inner).resize(panelW, panelH, { fit: 'fill' }).png().toBuffer();
    return { png, width: panelW, height: panelH };
  }

  const [r, g, b] = frame.color;

  const { data, info } = await sharp(inner)
    .extend({
      top: bevel,
      bottom: bevel,
      left: bevel,
      right: bevel,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .extend({ top: face, bottom: face, left: face, right: face, background: { r, g, b, alpha: 1 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const lit = light.direction === 'left' ? 1 : -1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const onFace = x < face || x >= W - face || y < face || y >= H - face;
      if (!onFace) continue;

      // -1 at the left edge, +1 at the right; the lit side gets the boost.
      const t = (x / (W - 1)) * 2 - 1;
      const f = 1 - FACE_GRADIENT * t * lit;

      const o = (y * W + x) * 3;
      data[o] = Math.min(255, Math.round(data[o]! * f));
      data[o + 1] = Math.min(255, Math.round(data[o + 1]! * f));
      data[o + 2] = Math.min(255, Math.round(data[o + 2]! * f));
    }
  }

  // extend() lands on innerW + 2(face + bevel), which is panelW except when
  // the max(1, …) guards above fired; resize is a no-op in the ordinary case
  // and guarantees the size the caller measured the quad for otherwise.
  const png = await sharp(data, { raw: { width: W, height: H, channels: 3 } })
    .resize(panelW, panelH, { fit: 'fill' })
    .png()
    .toBuffer();

  return { png, width: panelW, height: panelH };
}
