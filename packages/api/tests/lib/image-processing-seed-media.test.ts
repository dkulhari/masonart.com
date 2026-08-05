/**
 * matToSquare against the real reference imagery — #418.
 *
 * The synthetic fixtures in image-processing-mat.test.ts prove the contract on
 * shapes we construct. This proves it on the captured artwork the seed actually
 * uses, which is where the double-mat defect was found: those files arrive on a
 * light field of their own, measured at rgb(240,240,240) against our
 * rgb(250,250,250), and had already been through matToSquare once.
 *
 * SEED_MEDIA_DIR is machine-local and gitignored. Absence is the normal case on
 * a fresh clone, so this suite skips rather than fails when it is not there.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAT_CANVAS, MAT_ART_INSET, MAT_COLOR } from '@chobii/shared';
import { matToSquare } from '../../src/lib/image-processing';

const TARGET = MAT_CANVAS * MAT_ART_INSET;

/**
 * Anchored to this file rather than reused from seed-images.ts, whose
 * SEED_MEDIA_DIR resolves off process.cwd() — correct when the seed runs from
 * the repo root, wrong under vitest, which runs from packages/api.
 */
const MEDIA_DIR =
  process.env.SEED_MEDIA_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), '../../../..', '.cache', 'seed-media');

const artworks = existsSync(MEDIA_DIR)
  ? readdirSync(MEDIA_DIR).filter((f) => f.endsWith('-main.webp')).sort()
  : [];

/**
 * Content box, plus any pixel outside it that is not the mat colour.
 *
 * The tolerance is 4 levels. The defect this guards against was a 10-level step
 * (240 against 250) spanning hundreds of pixels; what remains at 4 is webp
 * ringing on the row adjacent to the artwork, which measured 253 and is not a
 * seam anyone can see.
 */
async function analyse(buf: Buffer) {
  const { data, info } = await sharp(buf)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  const isContent = (i: number) =>
    Math.abs(data[i] - MAT_COLOR.r) > 4 ||
    Math.abs(data[i + 1] - MAT_COLOR.g) > 4 ||
    Math.abs(data[i + 2] - MAT_COLOR.b) > 4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isContent((y * w + x) * 3)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  let offMat = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
      if (isContent((y * w + x) * 3)) offMat++;
    }
  }

  return { longest: Math.max(maxX - minX + 1, maxY - minY + 1), offMat };
}

describe.skipIf(artworks.length === 0)('matToSquare on captured artwork', () => {
  it('mats all of it to the 88% inset under a single mat', async () => {
    const failures: string[] = [];

    for (const file of artworks) {
      const { longest, offMat } = await analyse(
        await matToSquare(await readFile(join(MEDIA_DIR, file)))
      );
      // 10px of slack: the art box is measured by tone, so lossy edges move it
      // a pixel or two either way.
      if (Math.abs(longest - TARGET) > 10) {
        failures.push(`${file}: longest side ${longest}px, expected ${TARGET}px`);
      }
      if (offMat > 0) {
        failures.push(`${file}: ${offMat}px of second mat outside the art box`);
      }
    }

    expect(failures).toEqual([]);
  }, 300_000);
});
