/**
 * cropToSquare tests
 *
 * Photographs (room mockups, detail and texture shots) fill the square
 * edge-to-edge with no mat — matting a photograph makes it look letterboxed.
 * The framing is chosen by a human at upload; this function just applies the
 * rect it is handed, defensively.
 *
 * Pure sharp; no database required.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAT_CANVAS } from '@chobii/shared';
import { cropToSquare, centredSquareCrop } from '../../src/lib/image-processing';

/**
 * Left half red, right half blue — lets us prove WHICH region survived,
 * not merely that something was cropped.
 */
async function halves(w: number, h: number): Promise<Buffer> {
  const half = Math.floor(w / 2);
  const red = await sharp({
    create: { width: half, height: h, channels: 3, background: { r: 220, g: 20, b: 20 } },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: w - half, height: h, channels: 3, background: { r: 20, g: 20, b: 220 } },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: red, left: 0, top: 0 },
      { input: blue, left: half, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** Average colour of the output, as a cheap "what survived" probe. */
async function meanColour(buf: Buffer) {
  const { data } = await sharp(buf)
    .resize(1, 1, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
}

describe('centredSquareCrop', () => {
  it('takes full height and a centred slice of a landscape source', () => {
    expect(centredSquareCrop(1600, 900)).toEqual({
      x: (1600 - 900) / 2 / 1600,
      y: 0,
      w: 900 / 1600,
      h: 1,
    });
  });

  it('takes full width and a centred slice of a portrait source', () => {
    expect(centredSquareCrop(900, 1600)).toEqual({
      x: 0,
      y: (1600 - 900) / 2 / 1600,
      w: 1,
      h: 900 / 1600,
    });
  });

  it('is the whole frame for a square source', () => {
    expect(centredSquareCrop(1000, 1000)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('cropToSquare', () => {
  it('outputs a square webp at the canonical canvas size', async () => {
    const out = await cropToSquare(await halves(1600, 900), { x: 0, y: 0, w: 0.5, h: 1 });
    const m = await sharp(out).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
    expect(m.format).toBe('webp');
  });

  it('honours the chosen window — left third yields red', async () => {
    const px = await meanColour(
      await cropToSquare(await halves(1600, 900), { x: 0, y: 0, w: 0.3, h: 1 })
    );
    expect(px.r).toBeGreaterThan(150);
    expect(px.b).toBeLessThan(90);
  });

  it('honours the chosen window — right third yields blue', async () => {
    const px = await meanColour(
      await cropToSquare(await halves(1600, 900), { x: 0.7, y: 0, w: 0.3, h: 1 })
    );
    expect(px.b).toBeGreaterThan(150);
    expect(px.r).toBeLessThan(90);
  });

  it('fills edge to edge — no mat colour anywhere', async () => {
    // A matted output would show MAT_COLOR (250,250,250) in the margins.
    const out = await cropToSquare(await halves(1600, 900), { x: 0, y: 0, w: 0.3, h: 1 });
    const px = await meanColour(out);
    const looksLikeMat = px.r > 240 && px.g > 240 && px.b > 240;
    expect(looksLikeMat).toBe(false);
  });

  it('clamps a rect that overflows the source', async () => {
    const out = await cropToSquare(await halves(1600, 900), {
      x: 0.9,
      y: 0.9,
      w: 0.5,
      h: 0.5,
    });
    const m = await sharp(out).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
  });

  it('clamps a zero-area rect instead of throwing', async () => {
    const out = await cropToSquare(await halves(1600, 900), { x: 0.5, y: 0.5, w: 0, h: 0 });
    expect((await sharp(out).metadata()).width).toBe(MAT_CANVAS);
  });

  it('clamps negative and NaN values instead of throwing', async () => {
    const out = await cropToSquare(await halves(1600, 900), {
      x: -1,
      y: Number.NaN,
      w: 2,
      h: 1,
    });
    expect((await sharp(out).metadata()).width).toBe(MAT_CANVAS);
  });

  it('defaults to the largest centred square when no crop is given', async () => {
    const out = await cropToSquare(await halves(1600, 900));
    const m = await sharp(out).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
    // centred on a red|blue source, so the mean should be roughly balanced
    const px = await meanColour(out);
    expect(Math.abs(px.r - px.b)).toBeLessThan(120);
  });

  it('handles a portrait source', async () => {
    const out = await cropToSquare(await halves(900, 1600));
    const m = await sharp(out).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
  });

  it('produces an opaque image', async () => {
    const out = await cropToSquare(await halves(1600, 900));
    expect((await sharp(out).metadata()).hasAlpha).toBe(false);
  });
});
