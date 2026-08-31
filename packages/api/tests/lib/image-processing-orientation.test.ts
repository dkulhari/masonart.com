/**
 * EXIF orientation tests for image-processing
 *
 * A phone shooting in portrait very often stores the frame LANDSCAPE and adds
 * an EXIF `orientation: 6` tag meaning "rotate 90 degrees clockwise to
 * display". Finder, Preview, the browser file picker and the admin form's own
 * preview all honour that tag. Sharp does not, unless asked — and worse, it
 * STRIPS the tag from its output, so the rotation is unrecoverable downstream.
 *
 * Every function here measures or transforms against the pixels it is handed,
 * so a stored-orientation read mats the art sideways, measures the wrong art
 * box, and lands the admin's crop window somewhere else entirely. #716.
 *
 * The subtlety these tests pin: `sharp(x).metadata()` reports the INPUT's
 * stored dimensions, so an `.autoOrient()` later in the same chain does not
 * retroactively correct an earlier `metadata()` read. The oriented image has
 * to be materialised before anything measures it.
 *
 * Assertions are on dimensions, art boxes and flat colour only — never on an
 * image diff.
 *
 * Pure sharp; no database required.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAT_CANVAS, MAT_COLOR } from '@chobii/shared';
import {
  processImage,
  getImageMetadata,
  convertToWebP,
  matToSquare,
  measureArtBox,
  cropToSquare,
} from '../../src/lib/image-processing';

const RED = { r: 220, g: 20, b: 20 };
const BLUE = { r: 20, g: 20, b: 220 };
const ART = { r: 10, g: 20, b: 30 };

/** The tag a phone writes when it was held in portrait: rotate 90 CW to display. */
const ORIENTATION_ROTATE_90 = 6;

/**
 * A stored-landscape photograph that DISPLAYS portrait.
 *
 * Left half red / right half blue in STORED space. Rotating 90 clockwise puts
 * the stored LEFT half along the displayed TOP half, which is what lets the
 * crop test prove WHICH region a window actually landed on rather than merely
 * that something was cropped.
 */
async function halvesTagged(w: number, h: number): Promise<Buffer> {
  const half = Math.floor(w / 2);
  const red = await sharp({
    create: { width: half, height: h, channels: 3, background: RED },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: w - half, height: h, channels: 3, background: BLUE },
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
    .withMetadata({ orientation: ORIENTATION_ROTATE_90 })
    .jpeg({ quality: 100 })
    .toBuffer();
}

/**
 * An already-matted square whose ART is stored landscape and displays portrait.
 *
 * measureArtBox reads a composited output rather than the geometry that made
 * it, so this is the shape the backfill and the orientation guard both see.
 */
async function mattedTagged(): Promise<Buffer> {
  const art = await sharp({
    create: { width: 300, height: 150, channels: 3, background: ART },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 400, height: 400, channels: 3, background: MAT_COLOR },
  })
    .composite([{ input: art, left: 50, top: 125 }])
    .withMetadata({ orientation: ORIENTATION_ROTATE_90 })
    .jpeg({ quality: 100 })
    .toBuffer();
}

/** Actual pixel dimensions of an output buffer, tag ignored. */
async function dims(buf: Buffer) {
  const { width, height } = await sharp(buf).metadata();
  return { width, height };
}

/** Mean colour of an output, as a single pixel. Proves WHICH region survived. */
async function meanColour(buf: Buffer) {
  const { data } = await sharp(buf)
    .resize(1, 1, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0]!, g: data[1]!, b: data[2]! };
}

describe('image-processing EXIF orientation', () => {
  describe('the fixture itself', () => {
    it('is stored landscape and carries orientation 6', async () => {
      const meta = await sharp(await halvesTagged(800, 400)).metadata();
      expect(meta.width).toBe(800);
      expect(meta.height).toBe(400);
      expect(meta.orientation).toBe(ORIENTATION_ROTATE_90);
    });
  });

  describe('getImageMetadata', () => {
    it('reports the displayed dimensions, not the stored ones', async () => {
      const meta = await getImageMetadata(await halvesTagged(800, 400));
      expect(meta.width).toBe(400);
      expect(meta.height).toBe(800);
    });
  });

  describe('processImage', () => {
    it('reports the displayed dimensions on the original', async () => {
      const out = await processImage(await halvesTagged(800, 400));
      expect(out.original.width).toBe(400);
      expect(out.original.height).toBe(800);
    });

    it('writes the WebP original with the rotation baked into the pixels', async () => {
      const out = await processImage(await halvesTagged(800, 400));
      expect(await dims(out.original.buffer)).toEqual({ width: 400, height: 800 });
    });

    it('generates every variant from the displayed orientation', async () => {
      const out = await processImage(await halvesTagged(1600, 800));
      // 1600x800 stored displays 800x1600, so only the sizes under 800 wide
      // are generated — and each must be portrait.
      expect(out.variants.length).toBeGreaterThan(0);
      for (const variant of out.variants) {
        const { width, height } = await dims(variant.buffer);
        expect(width).toBe(variant.width);
        expect(height).toBeGreaterThan(width!);
      }
    });
  });

  describe('convertToWebP', () => {
    it('bakes the rotation into the pixels', async () => {
      const out = await convertToWebP(await halvesTagged(800, 400));
      expect(await dims(out)).toEqual({ width: 400, height: 800 });
    });
  });

  describe('matToSquare', () => {
    it('mats the artwork upright rather than sideways', async () => {
      const out = await matToSquare(await halvesTagged(800, 400));
      expect(await dims(out)).toEqual({ width: MAT_CANVAS, height: MAT_CANVAS });

      const { info } = await sharp(out).trim().toBuffer({ resolveWithObject: true });
      expect(info.height).toBeGreaterThan(info.width);
    });
  });

  describe('measureArtBox', () => {
    it('measures the art box on the displayed rectangle', async () => {
      const box = await measureArtBox(await mattedTagged());
      expect(box).toBeDefined();
      expect(box!.h).toBeGreaterThan(box!.w);
    });
  });

  describe('cropToSquare', () => {
    it('applies the window to the orientation the admin cropped against', async () => {
      // Displayed top half is the stored LEFT half, which is red.
      const out = await cropToSquare(await halvesTagged(800, 400), {
        x: 0,
        y: 0,
        w: 1,
        h: 0.5,
      });
      expect(await dims(out)).toEqual({ width: MAT_CANVAS, height: MAT_CANVAS });

      const mean = await meanColour(out);
      expect(mean.r).toBeGreaterThan(150);
      expect(mean.b).toBeLessThan(90);
    });
  });
});
