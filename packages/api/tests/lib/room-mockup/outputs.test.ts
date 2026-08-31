/**
 * The two non-room outputs.
 *
 * renderFramedMain produces the file that gets uploaded as the product's main
 * image. It is deliberately NOT squared here — buildProductMedia() mats and
 * squares every upload already, and duplicating that would mean two places to
 * change the square contract.
 *
 * buildContactSheet produces the single image a human opens to choose. Its
 * numbering is the whole point: it is how someone says "keep 2, 5 and 7".
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAT_COLOR } from '@chobii/shared';
import { renderFramedMain, buildContactSheet } from '../../../src/lib/room-mockup/outputs';
import type { FrameRender } from '../../../src/lib/room-mockup/templates';

const OAK: FrameRender = { widthRatio: 0.05, color: [178, 141, 94], depthRatio: 0.024 };

const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();

const cell = (w: number, h: number, colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: colour } }).jpeg().toBuffer();

describe('renderFramedMain', () => {
  it('keeps the artwork aspect ratio — squaring is the upload pipeline job, not this one', async () => {
    const out = await renderFramedMain(await art(500, 1000), OAK);
    const meta = await sharp(out).metadata();

    expect(meta.width! / meta.height!).toBeCloseTo(0.5, 1);
  });

  it('surrounds the framed art with margin in the catalogue mat colour', async () => {
    const out = await renderFramedMain(await art(400, 400), OAK);
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // Tolerance, not equality: the output is JPEG, and even a flat region can
    // shift by a level or two. Asserting exact bytes here would be a flaky
    // test dressed up as a strict one.
    expect(data[0]).toBeCloseTo(MAT_COLOR.r, -1);
    expect(data[1]).toBeCloseTo(MAT_COLOR.g, -1);
    expect(data[2]).toBeCloseTo(MAT_COLOR.b, -1);
  });

  it('is larger than the framed artwork it contains', async () => {
    const out = await renderFramedMain(await art(400, 400), OAK);
    const meta = await sharp(out).metadata();

    expect(meta.width).toBeGreaterThan(400);
  });
});

describe('buildContactSheet', () => {
  it('lays entries out in a grid of the requested column count', async () => {
    const entries = [
      { label: 'One', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) },
      { label: 'Two', image: await cell(200, 200, { r: 0, g: 255, b: 0 }) },
      { label: 'Three', image: await cell(200, 200, { r: 0, g: 0, b: 255 }) },
    ];

    const sheet = await buildContactSheet(entries, 2, 200);
    const meta = await sharp(sheet).metadata();

    // 2 columns, so 3 entries need 2 rows.
    expect(meta.width).toBeGreaterThanOrEqual(400);
    expect(meta.height).toBeGreaterThan(400);
  });

  it('grows taller, not wider, as entries are added', async () => {
    const one = [{ label: 'One', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) }];
    const four = await Promise.all(
      [0, 1, 2, 3].map(async (i) => ({
        label: `Item ${i}`,
        image: await cell(200, 200, { r: 10 * i, g: 0, b: 0 }),
      }))
    );

    const a = await sharp(await buildContactSheet(one, 2, 200)).metadata();
    const b = await sharp(await buildContactSheet(four, 2, 200)).metadata();

    expect(b.width).toBe(a.width);
    expect(b.height!).toBeGreaterThan(a.height!);
  });

  it('refuses an empty set rather than writing a blank sheet', async () => {
    await expect(buildContactSheet([], 2, 200)).rejects.toThrow(/empty/i);
  });
});
