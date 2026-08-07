/**
 * measureArtBox tests
 *
 * THE MEASUREMENT THE STOREFRONT CANNOT TAKE.
 *
 * matToSquare bakes the mat into the pixels, so a 3:1 panorama and a perfect
 * square both leave the pipeline as 1500x1500. The card therefore draws the same
 * plate for both, and the artwork inside lands anywhere between 39% and 76% of
 * it — four identical plates holding four wildly different-weight pictures, the
 * "the row stutters" finding on #530.
 *
 * This recovers the box from the composited output, which is what makes the same
 * function serve both new uploads and the backfill over assets that predate it.
 *
 * Pure sharp; no database required.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MAT_CANVAS, MAT_ART_INSET, MAT_COLOR } from '@chobii/shared';
import { matToSquare, measureArtBox } from '../../src/lib/image-processing';

/** Solid-colour source, clearly distinct from the mat. */
const src = (w: number, h: number) =>
  sharp({
    create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

/** A flat sheet of nothing but mat. */
const allMat = () =>
  sharp({
    create: {
      width: MAT_CANVAS,
      height: MAT_CANVAS,
      channels: 3,
      background: MAT_COLOR,
    },
  })
    .webp()
    .toBuffer();

/** ART_SCAN is MAT_CANVAS/4, so the box is exact to ~0.3% of the canvas. */
const SCAN_SLACK = 0.01;

describe('measureArtBox', () => {
  it.each([
    ['square 1:1', 2000, 2000, 1],
    ['portrait 2:3', 1400, 2100, 2 / 3],
    ['landscape 3:2', 2100, 1400, 3 / 2],
    ['panoramic 16:9', 2400, 1350, 16 / 9],
  ])('recovers the aspect ratio of %s', async (_label, w, h, aspect) => {
    const box = await measureArtBox(await matToSquare(await src(w, h)));
    expect(box).toBeDefined();
    expect(box!.w / box!.h).toBeCloseTo(aspect, 1);
  });

  it('finds the art at the inset the pipeline promises, on the long side', async () => {
    const box = await measureArtBox(await matToSquare(await src(2400, 1350)));
    expect(box!.w).toBeGreaterThan(MAT_ART_INSET - SCAN_SLACK);
    expect(box!.w).toBeLessThan(MAT_ART_INSET + SCAN_SLACK);
  });

  it('returns a centred box, because the composite is gravity: centre', async () => {
    const box = await measureArtBox(await matToSquare(await src(2400, 1350)));
    expect(box!.x).toBeCloseTo((1 - box!.w) / 2, 2);
    expect(box!.y).toBeCloseTo((1 - box!.h) / 2, 2);
  });

  it('never returns a box that leaves the master', async () => {
    const box = await measureArtBox(await matToSquare(await src(1400, 2100)));
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.w).toBeLessThanOrEqual(1.001);
    expect(box!.y + box!.h).toBeLessThanOrEqual(1.001);
  });

  it('gives a sheet of pure mat no box at all', async () => {
    // Nothing to frame. The card must draw it as it is rather than blow an
    // empty rect up to fill the plate.
    expect(await measureArtBox(await allMat())).toBeUndefined();
  });

  it('gives a full-bleed image no box, since framing it would be a no-op', async () => {
    // cropToSquare's output fills its square. Storing a 100% box would have the
    // card computing a scale of exactly 1 forever.
    const bleed = await sharp({
      create: { width: 800, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .webp()
      .toBuffer();
    expect(await measureArtBox(bleed)).toBeUndefined();
  });

  it('answers undefined rather than throwing on an unreadable buffer', async () => {
    // An unhelpful measurement must never fail an upload.
    expect(await measureArtBox(Buffer.from('not an image'))).toBeUndefined();
  });
});

/**
 * The baked-in wall.
 *
 * Part of the catalogue is not a photograph OF a canvas but a photograph of a
 * canvas HANGING ON A WALL, and that wall is inside the composited pixels.
 * cosmic-harmony's measures #F6F6F4 against a #FAFAFA mat — four levels apart,
 * inside any colour tolerance that would not also eat real paint — so the mat
 * scan alone returns the wall as artwork. The card then scales the wall, an
 * identically-shaped neighbour renders at a different size, and the wall's own
 * edge draws a bright rectangle inside the tile. Both were named by the second
 * blind A/B.
 */
describe('measureArtBox — the wall inside the photograph', () => {
  /** `art` centred on a light `wall`, the pair then matted like any upload. */
  const onWall = async (
    artW: number,
    artH: number,
    wallW: number,
    wallH: number,
    wall = { r: 246, g: 246, b: 244 }
  ) => {
    const art = await sharp({
      create: { width: artW, height: artH, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const photo = await sharp({
      create: { width: wallW, height: wallH, channels: 3, background: wall },
    })
      .composite([{ input: art, gravity: 'centre' }])
      .png()
      .toBuffer();
    return matToSquare(photo);
  };

  it('measures the ART, not the wall it hangs on', async () => {
    // A 1:2 piece on a square wall. Left alone the box comes back 1:1.
    const box = await measureArtBox(await onWall(600, 1200, 1600, 1600));
    expect(box).toBeDefined();
    expect(box!.w / box!.h).toBeCloseTo(0.5, 1);
  });

  it('recovers the same shape whether or not the wall is there', async () => {
    // The property the row depends on: two pieces of the same shape must
    // measure the same, however each was photographed.
    const bare = await measureArtBox(await matToSquare(await src(600, 1200)));
    const walled = await measureArtBox(await onWall(600, 1200, 1600, 1600));
    expect(walled!.w / walled!.h).toBeCloseTo(bare!.w / bare!.h, 1);
  });

  it('trims a wall that carries a gradient, which a photographed one does', async () => {
    // cosmic-harmony's wall runs 246 at the top down to 225 at the foot. A flat
    // colour match would not touch it; the rule is "holds no edge", not "is one
    // colour".
    const gradient = await sharp({
      create: { width: 1600, height: 1600, channels: 3, background: { r: 246, g: 246, b: 244 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 1600, height: 800, channels: 3, background: { r: 228, g: 228, b: 226 } },
          })
            .png()
            .toBuffer(),
          top: 800,
          left: 0,
        },
      ])
      .png()
      .toBuffer();
    const art = await sharp({
      create: { width: 500, height: 1300, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const photo = await sharp(gradient)
      .composite([{ input: art, gravity: 'centre' }])
      .png()
      .toBuffer();
    const box = await measureArtBox(await matToSquare(photo));
    expect(box!.w / box!.h).toBeCloseTo(500 / 1300, 1);
  });

  it('leaves a full-bleed photograph alone — no wall trim on a room mockup', async () => {
    // THE GUARD RAIL. Room mockups are cropped photographs with no mat, and a
    // pale ceiling is a light flat band. Trimming one would hand the card a box
    // and have it scale an interior as if it were a piece of art. Full-bleed
    // images leave measureArtBox before the trim runs.
    // A pale wall, deliberately clear of MAT_COLOR: the point under test is the
    // full-bleed guard, not the mat scan's own tolerance.
    const room = await sharp({
      create: { width: 900, height: 900, channels: 3, background: { r: 238, g: 236, b: 232 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 900, height: 400, channels: 3, background: { r: 40, g: 60, b: 80 } },
          })
            .png()
            .toBuffer(),
          top: 500,
          left: 0,
        },
      ])
      .webp()
      .toBuffer();
    expect(await measureArtBox(room)).toBeUndefined();
  });
});
