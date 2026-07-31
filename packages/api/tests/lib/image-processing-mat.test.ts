/**
 * matToSquare tests
 *
 * matToSquare is what makes the product grid's square invariant true. It takes
 * artwork of ANY aspect ratio and returns a MAT_CANVAS x MAT_CANVAS opaque WebP
 * with the art contained at MAT_ART_INSET of the longest side.
 *
 * Artwork is never cropped — that distinguishes this from cropToSquare, which
 * handles photographs using a human-chosen window.
 *
 * Pure sharp; no database required.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAT_CANVAS, MAT_ART_INSET } from '@chobii/shared';
import { matToSquare } from '../../src/lib/image-processing';

/**
 * Solid-colour source, clearly distinct from the mat, so sharp's trim() can
 * find the art box against the background.
 */
const src = (w: number, h: number) =>
  sharp({
    create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

/**
 * Longest side must exceed the 1320px inner box, otherwise `withoutEnlargement`
 * correctly leaves the art at its source size and the inset assertion is
 * meaningless. The no-upscale rule is covered separately below.
 */
const RATIOS: Array<[string, number, number]> = [
  ['square 1:1', 2000, 2000],
  ['portrait 2:3', 1400, 2100],
  ['landscape 3:2', 2100, 1400],
  ['panoramic 16:9', 2400, 1350],
];

/** The art box after the flat mat is trimmed away. */
async function artBox(out: Buffer) {
  const { info } = await sharp(out).trim().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}

describe('matToSquare', () => {
  it.each(RATIOS)('%s outputs a %ix%i square webp', async (_label, w, h) => {
    const out = await matToSquare(await src(w, h));
    const m = await sharp(out).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
    expect(m.format).toBe('webp');
  });

  it.each(RATIOS)('%s insets the art to 88% of the longest side', async (_label, w, h) => {
    const box = await artBox(await matToSquare(await src(w, h)));
    const longest = Math.max(box.width, box.height);
    // 1500 * 0.88 = 1320, allow a couple of px for rounding
    expect(Math.abs(longest - MAT_CANVAS * MAT_ART_INSET)).toBeLessThanOrEqual(2);
  });

  it.each(RATIOS)('%s centres the art on the mat', async (_label, w, h) => {
    const box = await artBox(await matToSquare(await src(w, h)));
    const leftGap = (MAT_CANVAS - box.width) / 2;
    const topGap = (MAT_CANVAS - box.height) / 2;
    expect(leftGap).toBeGreaterThanOrEqual(0);
    expect(topGap).toBeGreaterThanOrEqual(0);
    // symmetric on both axes
    expect(Math.abs(MAT_CANVAS - box.width - leftGap - leftGap)).toBeLessThanOrEqual(1);
    expect(Math.abs(MAT_CANVAS - box.height - topGap - topGap)).toBeLessThanOrEqual(1);
  });

  it.each(RATIOS)('%s preserves the source aspect ratio (never crops)', async (_label, w, h) => {
    const box = await artBox(await matToSquare(await src(w, h)));
    const sourceRatio = w / h;
    const artRatio = box.width / box.height;
    expect(Math.abs(artRatio - sourceRatio)).toBeLessThan(0.02);
  });

  it('guarantees a visible mat even for large square art', async () => {
    // Plain fit:'contain' would give square art a 0% mat and let it bleed to
    // the card edge while portrait art floated. The inset prevents that.
    const box = await artBox(await matToSquare(await src(2000, 2000)));
    expect(box.width).toBeLessThan(MAT_CANVAS);
    expect(box.height).toBeLessThan(MAT_CANVAS);
    // exactly the 6% margin the design specifies
    expect(Math.abs(box.width - MAT_CANVAS * MAT_ART_INSET)).toBeLessThanOrEqual(2);
  });

  it('never upscales a small source', async () => {
    // withoutEnlargement: a 600px source sits smaller on the mat rather than
    // being interpolated. Fake resolution is worse than a wider mat.
    const box = await artBox(await matToSquare(await src(600, 600)));
    expect(Math.max(box.width, box.height)).toBeLessThanOrEqual(602);
  });

  it('produces an opaque image (no alpha)', async () => {
    const m = await sharp(await matToSquare(await src(1000, 1500))).metadata();
    expect(m.hasAlpha).toBe(false);
  });

  it('is size-stable when re-run on its own output', async () => {
    const once = await matToSquare(await src(1000, 1500));
    const twice = await matToSquare(once);
    const m = await sharp(twice).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
  });
});
