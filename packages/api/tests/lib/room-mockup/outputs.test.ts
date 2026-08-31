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
import {
  renderFramedMain,
  buildContactSheet,
  truncateCaptionLine,
  LABEL_CHARS_PER_CELL_PX,
  FILE_CHARS_PER_CELL_PX,
} from '../../../src/lib/room-mockup/outputs';
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

  it('with a file line, the caption band is taller than the old single-line band alone would allow', async () => {
    const entries = [
      {
        label: 'Coastal bedroom',
        file: 'room-coastal-bedroom-north.jpg',
        image: await cell(200, 200, { r: 255, g: 0, b: 0 }),
      },
    ];

    const sheet = await buildContactSheet(entries, 1, 200);
    const meta = await sharp(sheet).metadata();

    // One row, one column: height = cellSize + GUTTER*2 + captionBand. Before
    // this fix the caption band was a fixed 34px, sized for one line only —
    // asserting the real height clears what a 34px band could ever produce
    // (with the same cellSize/GUTTER) proves the band actually grew to fit a
    // second line, not just that some caption rendered without throwing.
    const oldSingleLineBandHeight = 200 + 16 * 2 + 34;
    expect(meta.height!).toBeGreaterThan(oldSingleLineBandHeight);
  });

  it('still renders an entry with no file, at the same dimensions as one that has one', async () => {
    const withFile = [
      { label: 'One', file: 'room-one.jpg', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) },
    ];
    const withoutFile = [{ label: 'One', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) }];

    const a = await sharp(await buildContactSheet(withFile, 1, 200)).metadata();
    const b = await sharp(await buildContactSheet(withoutFile, 1, 200)).metadata();

    // The band is sized for the two-line case regardless of any one entry —
    // omitting `file` (the pre-existing, single-line SheetEntry shape) must
    // still render, at the same sheet dimensions, not throw or shrink.
    expect(b.format).toBe('jpeg');
    expect(b.width).toBe(a.width);
    expect(b.height).toBe(a.height);
  });

  it('does not change sheet dimensions when a label or filename is far longer than its budget', async () => {
    const veryLongLabel = 'An extremely long, hand-written room description '.repeat(5);
    const veryLongFile = 'room-a-very-long-template-id-indeed.jpg'.repeat(5);

    const normal = [{ label: 'One', image: await cell(200, 200, { r: 255, g: 0, b: 0 }) }];
    const long = [
      { label: veryLongLabel, file: veryLongFile, image: await cell(200, 200, { r: 255, g: 0, b: 0 }) },
    ];

    const a = await sharp(await buildContactSheet(normal, 1, 200)).metadata();
    const b = await sharp(await buildContactSheet(long, 1, 200)).metadata();

    // Truncation bounds the text before it ever reaches the SVG, so runaway
    // label/filename length must not throw, and must not change the sheet's
    // own geometry (there is no wrapping to grow the cell into).
    expect(b.width).toBe(a.width);
    expect(b.height).toBe(a.height);
  });
});

describe('truncateCaptionLine', () => {
  it('leaves a string within budget unchanged', () => {
    expect(truncateCaptionLine('Coastal bedroom', 42)).toBe('Coastal bedroom');
  });

  it('truncates a string over budget to exactly the budget, marking the cut with an ellipsis', () => {
    const long = '1. Coastal bedroom, north-facing, warm afternoon light through sheers';
    const result = truncateCaptionLine(long, 42);

    expect(result.length).toBe(42);
    expect(result.endsWith('…')).toBe(true);
    // The kept text is a genuine prefix of the original — truncation cuts
    // the tail, it does not otherwise rewrite the string.
    expect(long.startsWith(result.slice(0, -1))).toBe(true);
  });

  it('derives the label and filename budgets from cellSize rather than a fixed cell', () => {
    // Documents the values this was specced against — ~42 label characters
    // and ~56 filename characters (it renders smaller) at the default 420px
    // cell — and proves the budget scales with a different cellSize instead
    // of staying pinned to numbers tuned for a cell the caller never asked
    // for.
    expect(Math.round(420 * LABEL_CHARS_PER_CELL_PX)).toBe(42);
    expect(Math.round(420 * FILE_CHARS_PER_CELL_PX)).toBe(56);
    expect(Math.round(210 * LABEL_CHARS_PER_CELL_PX)).toBe(21);
  });
});
