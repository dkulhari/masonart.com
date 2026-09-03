/**
 * Stage 3: the framed poster, drawn flat.
 *
 * Structure only, no pixel diffing: the panel is the exact size asked for,
 * the face is the frame colour, the mat separates face from art, and the
 * face is lit from the declared side. The warp that follows cannot fix any
 * of these, so they are pinned before it runs.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildFramedPanel, FACE_GRADIENT } from '../../../src/lib/room-mockup/panel';
import type { FrameRender } from '../../../src/lib/room-mockup/templates';

const BLACK: FrameRender = {
  widthRatio: 0.028,
  color: [26, 26, 28],
  depthRatio: 0.022,
  widthCm: 2,
  depthCm: 3,
};

const WRAP: FrameRender = {
  widthRatio: 0,
  color: [0, 0, 0],
  depthRatio: 0.03,
  widthCm: 0,
  depthCm: 3.8,
};

const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();

const px = async (png: Buffer, x: number, y: number): Promise<[number, number, number]> => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const o = (y * info.width + x) * info.channels;
  return [data[o]!, data[o + 1]!, data[o + 2]!];
};

describe('buildFramedPanel', () => {
  // Poster 60×80 + 2 cm face each side = 64×84 cm; at 5 px/cm that is 320×420.
  const poster = { widthCm: 60, heightCm: 80 };

  it('is exactly the requested pixel size, opaque RGB', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, BLACK, 320, 420, {
      direction: 'left',
    });
    const meta = await sharp(p.png).metadata();

    expect([p.width, p.height]).toEqual([320, 420]);
    expect([meta.width, meta.height]).toEqual([320, 420]);
    expect(meta.channels).toBe(3);
  });

  it('paints the face in the frame colour and the art in the middle', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, BLACK, 320, 420, {
      direction: 'left',
    });

    // 2 cm face at 5 px/cm = 10 px: x=4 is on the face.
    const [r, , b] = await px(p.png, 4, 210);
    expect(r).toBeLessThan(40);
    expect(b).toBeLessThan(40);

    const centre = await px(p.png, 160, 210);
    expect(centre[2]).toBe(200);
  });

  it('keeps a mat of at least 6% between face and art', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, BLACK, 320, 420, {
      direction: 'left',
    });

    // Face 10 px + bevel; the inner panel is ~298 px wide, 6% of that is ~18 px
    // of mat, so x = 20 is still mat.
    const [r, g, b] = await px(p.png, 20, 210);
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it('lights the face from the declared side: lit edge brighter than far edge', async () => {
    const grey: FrameRender = { ...BLACK, color: [128, 128, 128] };
    const p = await buildFramedPanel(await art(600, 800), poster, grey, 320, 420, {
      direction: 'left',
    });

    const [left] = await px(p.png, 3, 210);
    const [right] = await px(p.png, 316, 210);

    expect(left).toBeGreaterThan(right);
    expect(left - right).toBeGreaterThan(128 * FACE_GRADIENT * 2 * 0.8);
  });

  it('flips the gradient when the light is on the right', async () => {
    const grey: FrameRender = { ...BLACK, color: [128, 128, 128] };
    const p = await buildFramedPanel(await art(600, 800), poster, grey, 320, 420, {
      direction: 'right',
    });

    const [left] = await px(p.png, 3, 210);
    const [right] = await px(p.png, 316, 210);

    expect(right).toBeGreaterThan(left);
  });

  it('gallery-wrap has no face and no mat: art reaches the edge', async () => {
    const p = await buildFramedPanel(await art(600, 800), poster, WRAP, 300, 400, {
      direction: 'left',
    });
    const meta = await sharp(p.png).metadata();

    expect([meta.width, meta.height]).toEqual([300, 400]);
    const [, , b] = await px(p.png, 1, 200);
    expect(b).toBe(200);
  });

  it('contains art of another proportion inside the poster rectangle rather than cropping it', async () => {
    // Square art in a portrait poster: mat above and below is wider, and the
    // art still fills the width (minus mat).
    const p = await buildFramedPanel(await art(500, 500), poster, BLACK, 320, 420, {
      direction: 'left',
    });

    const top = await px(p.png, 160, 40);
    expect(Math.min(...top)).toBeGreaterThan(240);
    const centre = await px(p.png, 160, 210);
    expect(centre[2]).toBe(200);
  });
});
