/**
 * Perspective compositing of artwork into a room template's placement quad.
 *
 * This is the sharp-facing half of the angled-wall path; the arithmetic it
 * leans on lives in homography.ts and is tested without pixels. Splitting it
 * that way is the same split geometry.ts/render.ts already use.
 *
 * WHY A PANEL, THEN ONE WARP
 *
 * The artwork almost never matches the aperture's proportion — the catalogue
 * spans panoramic through portrait, and a generated frame has one fixed
 * shape. So the mat and the art are composed FLAT first, into a single panel
 * the exact proportion of the aperture, and that panel is warped once.
 *
 * The alternative — warping the art alone and filling the leftover with the
 * mat afterwards — has to reason about the gap in perspective space, where
 * "leftover" is a quadrilateral ring rather than two rectangles. Composing
 * flat makes the mismatch a plain centring problem, and it makes the mat
 * opaque across the WHOLE aperture by construction. Nothing behind the panel
 * can show through at the edges, which is the failure this design exists to
 * rule out.
 */

import sharp from 'sharp';
import {
  applyHomography,
  quadPixelBounds,
  solveHomography,
  type Point,
  type Quad,
} from './homography';

/** The source rectangle a panel occupies, in its own pixel coordinates. */
function panelQuad(w: number, h: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Pick the flat panel's pixel size from the quad's longest opposing edges.
 *
 * Taking the LONGER of each opposing pair, not the average, means the panel
 * is at least as dense as the most foreshortened part of the aperture. Under
 * a perspective warp the near edge is sampled hardest; sizing to the average
 * would soften it, and softness on the near edge is exactly where a viewer
 * looks.
 */
export function panelSizeForQuad(quad: Quad, canvasW: number, canvasH: number): {
  width: number;
  height: number;
} {
  const p = quad.map((c) => ({ x: c.x * canvasW, y: c.y * canvasH })) as Quad;

  return {
    width: Math.max(2, Math.round(Math.max(dist(p[0], p[1]), dist(p[3], p[2])))),
    height: Math.max(2, Math.round(Math.max(dist(p[0], p[3]), dist(p[1], p[2])))),
  };
}

/**
 * A mat's minimum border, as a fraction of the panel's SHORT edge.
 *
 * Without a floor the art meets the frame directly on whichever axis it
 * happens to fill, and the leftover appears on the other axis only. That
 * reads as letterboxing — two bands across an otherwise full-bleed print —
 * rather than as a mounted picture, because a real mat borders all four
 * sides. Reserving the border first makes a proportion mismatch widen two
 * borders instead of erasing the other two.
 *
 * Six percent is the shallow end of ordinary poster framing. It is deliberately
 * modest: the mat is here to look intentional, not to shrink the artwork.
 */
const MIN_MAT_RATIO = 0.06;

/**
 * Compose the artwork onto an opaque mat, centred, at the panel's proportion.
 *
 * `contain` rather than `cover`: cropping a poster to fill the aperture would
 * show the customer a different picture from the one they buy. The leftover
 * becomes visible mat, which is what a real framed print looks like anyway.
 *
 * The mat is painted across the FULL panel and the art is inset into it, so
 * the panel is opaque edge to edge no matter what the art's proportion is.
 * That is what guarantees nothing behind the panel shows through once it is
 * warped into the aperture.
 */
export async function buildPanel(
  art: Buffer,
  width: number,
  height: number,
  mat: [number, number, number],
  matRatio: number = MIN_MAT_RATIO
): Promise<Buffer> {
  const border = Math.round(Math.min(width, height) * matRatio);

  // Guard the degenerate case rather than letting sharp receive a zero or
  // negative resize target: a very small aperture on a low-resolution room
  // photo can otherwise consume the whole panel in border.
  const innerW = Math.max(1, width - border * 2);
  const innerH = Math.max(1, height - border * 2);

  const inner = await sharp(art)
    .resize(innerW, innerH, {
      fit: 'contain',
      background: { r: mat[0], g: mat[1], b: mat[2] },
    })
    .removeAlpha()
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: mat[0], g: mat[1], b: mat[2] },
    },
  })
    .composite([{ input: inner, left: border, top: border, blend: 'over' }])
    .removeAlpha()
    // PNG, explicitly. A `create` pipeline has no input format to inherit, so
    // a bare toBuffer() yields something the next sharp() call cannot read.
    // Lossless is also the only correct choice here: this panel is about to be
    // resampled by the warp, and a JPEG round-trip would bake compression
    // artefacts in beforehand — the same trap render.ts warns about, where the
    // pipeline's one deliberate lossy step belongs at the very end.
    .png()
    .toBuffer();
}

/**
 * Warp a flat panel into the quad, returning a full-canvas RGBA layer.
 *
 * Inverse mapping: every DESTINATION pixel is pushed back through the
 * transform to find where it came from in the panel. Forward mapping would
 * scatter source pixels across the destination and leave holes wherever the
 * warp stretches, which is precisely what happens along the near edge.
 *
 * Alpha comes from 2x2 supersampling of the inside/outside test. A single
 * centre sample gives a hard, visibly stair-stepped border along the two
 * slanted edges of any angled quad — and that border sits directly against
 * the frame, where it reads as a rendering artefact rather than as a print.
 */
export async function warpPanelIntoQuad(
  panel: Buffer,
  panelW: number,
  panelH: number,
  quad: Quad,
  canvasW: number,
  canvasH: number
): Promise<Buffer> {
  const { data: src, info } = await sharp(panel)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sc = info.channels;

  const dstQuad = quad.map((c) => ({ x: c.x * canvasW, y: c.y * canvasH })) as Quad;

  // Destination -> source, so the loop below reads rather than scatters.
  const toSource = solveHomography(dstQuad, panelQuad(panelW, panelH));

  const out = Buffer.alloc(canvasW * canvasH * 4, 0);
  const bounds = quadPixelBounds(quad, canvasW, canvasH);

  // Quarter-pixel offsets: the four sub-sample positions of a 2x2 grid.
  const SUB = [-0.25, 0.25];

  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) {
      let inside = 0;
      for (const dy of SUB) {
        for (const dx of SUB) {
          const s = applyHomography(toSource, { x: x + 0.5 + dx, y: y + 0.5 + dy });
          if (s.x >= 0 && s.y >= 0 && s.x <= panelW && s.y <= panelH) inside++;
        }
      }
      if (inside === 0) continue;

      const s = applyHomography(toSource, { x: x + 0.5, y: y + 0.5 });
      const sx = Math.min(panelW - 1, Math.max(0, s.x));
      const sy = Math.min(panelH - 1, Math.max(0, s.y));

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(panelW - 1, x0 + 1);
      const y1 = Math.min(panelH - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;

      const o = (y * canvasW + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const p00 = src[(y0 * panelW + x0) * sc + ch]!;
        const p10 = src[(y0 * panelW + x1) * sc + ch]!;
        const p01 = src[(y1 * panelW + x0) * sc + ch]!;
        const p11 = src[(y1 * panelW + x1) * sc + ch]!;

        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[o + ch] = Math.round(top + (bottom - top) * fy);
      }
      out[o + 3] = Math.round((inside / 4) * 255);
    }
  }

  return out;
}
