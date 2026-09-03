/**
 * Perspective compositing.
 *
 * `warpPanelIntoQuad` is the one step where the artwork's pixels are
 * resampled, so it is the one step that can silently ship a smeared, clipped
 * or shifted poster. The round-trip test pins it: every destination pixel
 * inside the quad, pushed back through the inverse homography, must land on
 * the panel sample it was taken from.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  applyHomography,
  solveHomography,
  type Quad,
} from '../../../src/lib/room-mockup/homography';
import {
  buildPanel,
  panelSizeForQuad,
  warpPanelIntoQuad,
} from '../../../src/lib/room-mockup/warp';

/** A wall seen from the left: the far (right) edge is shorter. */
const TRAPEZOID: Quad = [
  { x: 0.2, y: 0.15 },
  { x: 0.8, y: 0.25 },
  { x: 0.8, y: 0.75 },
  { x: 0.2, y: 0.85 },
];

const CW = 400;
const CH = 400;

/** A `cells`×`cells` checkerboard with `cell`-px squares, black and white. */
async function checkerboard(cells: number, cell: number): Promise<Buffer> {
  const size = cells * cell;
  const raw = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 255 : 0;
      const o = (y * size + x) * 3;
      raw[o] = raw[o + 1] = raw[o + 2] = v;
    }
  }

  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

describe('panelSizeForQuad', () => {
  it('uses the longer of each opposing edge pair', () => {
    const { width, height } = panelSizeForQuad(TRAPEZOID, 1000, 1000);

    expect(width).toBe(Math.round(Math.hypot(600, 100)));
    expect(height).toBe(700);
  });

  it('never returns a dimension below 2', () => {
    const tiny: Quad = [
      { x: 0.5, y: 0.5 },
      { x: 0.5005, y: 0.5 },
      { x: 0.5005, y: 0.5005 },
      { x: 0.5, y: 0.5005 },
    ];

    expect(panelSizeForQuad(tiny, 100, 100)).toEqual({ width: 2, height: 2 });
  });
});

describe('buildPanel', () => {
  it('is opaque edge to edge, mat at the border and art in the middle', async () => {
    const art = await sharp({
      create: { width: 50, height: 100, channels: 3, background: { r: 10, g: 20, b: 200 } },
    })
      .png()
      .toBuffer();

    const panel = await buildPanel(art, 200, 100, [250, 250, 250]);
    const { data, info } = await sharp(panel).raw().toBuffer({ resolveWithObject: true });

    expect(info.channels).toBe(3);
    expect([info.width, info.height]).toEqual([200, 100]);
    expect(data[0]).toBe(250);

    const centre = (50 * 200 + 100) * 3;
    expect(data[centre + 2]).toBe(200);
  });
});

describe('warpPanelIntoQuad round trip', () => {
  it('every destination pixel inside the quad matches the panel sample it maps back to', async () => {
    const cell = 8;
    const cells = 8;
    const size = cell * cells;
    const panel = await checkerboard(cells, cell);
    const out = await warpPanelIntoQuad(panel, size, size, TRAPEZOID, CW, CH);

    const dst = TRAPEZOID.map((p) => ({ x: p.x * CW, y: p.y * CH })) as Quad;
    const back = solveHomography(dst, [
      { x: 0, y: 0 },
      { x: size, y: 0 },
      { x: size, y: size },
      { x: 0, y: size },
    ]);

    let checked = 0;
    let wrong = 0;

    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const o = (y * CW + x) * 4;
        if (out[o + 3] !== 255) continue;

        const s = applyHomography(back, { x: x + 0.5, y: y + 0.5 });

        // Skip anything within a panel pixel of a cell edge: bilinear
        // sampling blends there by design, and that is not an error.
        const fx = s.x % cell;
        const fy = s.y % cell;
        if (fx < 1 || fx > cell - 1 || fy < 1 || fy > cell - 1) continue;

        const expected = (Math.floor(s.x / cell) + Math.floor(s.y / cell)) % 2 === 0 ? 255 : 0;
        checked++;
        if (Math.abs(out[o]! - expected) > 8) wrong++;
      }
    }

    expect(checked).toBeGreaterThan(5000);
    expect(wrong / checked).toBeLessThan(0.002);
  });

  it('is transparent outside the quad and opaque deep inside', async () => {
    const panel = await checkerboard(2, 4);
    const out = await warpPanelIntoQuad(panel, 8, 8, TRAPEZOID, CW, CH);
    const alpha = (x: number, y: number) => out[(y * CW + x) * 4 + 3]!;

    expect(alpha(10, 10)).toBe(0);
    expect(alpha(200, 200)).toBe(255);
    expect(alpha(390, 390)).toBe(0);
  });

  it('partially covers pixels along a slanted edge, so the border is not stair-stepped', async () => {
    const panel = await checkerboard(2, 4);
    const out = await warpPanelIntoQuad(panel, 8, 8, TRAPEZOID, CW, CH);

    // The top edge runs from (80,60) to (320,100), a slope of 1/6: over 240
    // columns it crosses 40 rows, so a 2x2 supersample must leave partial
    // pixels along most of it. A single column can legitimately land where
    // the edge meets a pixel boundary, so count across the whole edge.
    let partial = 0;
    for (let x = 90; x < 310; x++) {
      for (let y = 55; y < 110; y++) {
        const v = out[(y * CW + x) * 4 + 3]!;
        if (v > 0 && v < 255) partial++;
      }
    }

    expect(partial).toBeGreaterThan(100);
  });

  it('keeps the last row and column when the quad lands on exact integers', async () => {
    const square: Quad = [
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.25, y: 0.5 },
    ];
    const panel = await checkerboard(1, 4);
    const out = await warpPanelIntoQuad(panel, 4, 4, square, CW, CH);

    // Pixel 199 is the last one inside [100, 200); pixel 200 is outside.
    expect(out[(199 * CW + 199) * 4 + 3]).toBeGreaterThan(0);
    expect(out[(200 * CW + 200) * 4 + 3]).toBe(0);
  });

  it('returns a full-canvas RGBA buffer', async () => {
    const panel = await checkerboard(2, 4);
    const out = await warpPanelIntoQuad(panel, 8, 8, TRAPEZOID, CW, CH);

    expect(out.length).toBe(CW * CH * 4);
  });
});
