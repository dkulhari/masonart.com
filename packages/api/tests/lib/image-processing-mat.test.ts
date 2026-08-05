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
import { MAT_CANVAS, MAT_ART_INSET, MAT_COLOR } from '@chobii/shared';
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

/**
 * One mat, not two.
 *
 * The seed reference imagery was captured from a storefront that sits its own
 * pieces on a light field of its own — measured at rgb(240,240,240), ten levels
 * off our rgb(250,250,250) mat. Matting that source without stripping the field
 * first leaves both visible: our mat as an outer ring, theirs as an inner one,
 * with a hard tone step between. #418.
 *
 * The same defect appears whenever matToSquare runs on its own output, which
 * the seed path does — `.cache/seed-media/tools/fetch-media.ts` mats on capture
 * and `product-media.ts` mats again on seed. The art box measured 77.5% of the
 * canvas (0.88 squared) instead of 88%.
 *
 * The test above this one only asserted the CANVAS stayed 1500x1500, which is
 * true of both the correct and the broken output. Size stability is not
 * idempotency; the art box is what moved.
 */
describe('matToSquare — sources carrying their own border', () => {
  /** Art block of `art` px centred on a `canvas` px field of `border`. */
  const bordered = (canvas: number, art: number, border: number) =>
    sharp({
      create: {
        width: canvas,
        height: canvas,
        channels: 3,
        background: { r: border, g: border, b: border },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: art,
              height: art,
              channels: 3,
              background: { r: 10, g: 20, b: 30 },
            },
          },
          gravity: 'centre',
        },
      ])
      .png()
      .toBuffer();

  /**
   * Box of the art itself, found by tone rather than by trim().
   *
   * artBox() above uses sharp's trim(), which cannot separate our 250 mat from
   * a 240 field ten levels away — it reports the two together as one box and so
   * measures ~1320 whether or not the field was stripped. This looks for
   * pixels that are unambiguously art.
   */
  async function darkArtBox(out: Buffer) {
    const { data, info } = await sharp(out)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 3] < 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  /** Every mat pixel on the centre row, from the edge inward to the art. */
  async function matTones(out: Buffer) {
    const { data, info } = await sharp(out)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const y = Math.floor(info.height / 2);
    const tones: number[] = [];
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      // Stop at the art, backing off 4px so webp ringing at the hard edge is
      // not read as a second mat.
      if (Math.abs(data[i] - MAT_COLOR.r) > 24) break;
      tones.push(data[i]);
    }
    return tones.slice(0, Math.max(0, tones.length - 4));
  }

  it('strips the source field so only our mat colour remains', async () => {
    // 1700px art inside a 2000px field: larger than the 1320px inner box, so
    // withoutEnlargement is not what decides the result.
    const out = await matToSquare(await bordered(2000, 1700, 240));
    const tones = await matTones(out);

    expect(tones.length).toBeGreaterThan(0);
    const offMat = tones.filter((t) => Math.abs(t - MAT_COLOR.r) > 2);
    expect(offMat).toEqual([]);
  });

  it('insets the art to 88% after stripping, not 88% of the field', async () => {
    // Without stripping, the 2000px source (art + field) is what gets fitted to
    // 1320, leaving the art itself at 1700/2000 of that = 1122px.
    const box = await darkArtBox(await matToSquare(await bordered(2000, 1700, 240)));
    expect(
      Math.abs(Math.max(box.width, box.height) - MAT_CANVAS * MAT_ART_INSET)
    ).toBeLessThanOrEqual(4);
  });

  it('keeps the art box at 88% when re-run on its own output', async () => {
    const once = await matToSquare(await src(2000, 2000));
    const twice = await matToSquare(once);
    const box = await darkArtBox(twice);
    // Broken: 0.88 * 0.88 = 1163px. Correct: 1320px.
    expect(
      Math.abs(Math.max(box.width, box.height) - MAT_CANVAS * MAT_ART_INSET)
    ).toBeLessThanOrEqual(4);
  });

  it('does not eat artwork whose own composition is a light field', async () => {
    // A small dark mark on white is the artwork, not a border. Trimming to the
    // mark and blowing it up to 88% would destroy the piece. The guard is a
    // floor on how much of the source may be removed.
    const box = await darkArtBox(await matToSquare(await bordered(2000, 200, 255)));
    // The mark keeps its share of the frame rather than filling it.
    expect(Math.max(box.width, box.height)).toBeLessThan(MAT_CANVAS * 0.4);
  });
});
