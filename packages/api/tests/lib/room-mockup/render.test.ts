/**
 * Room mockup rendering.
 *
 * Deliberately NOT pixel-diffed. Comparing rendered images across sharp and
 * libvips versions is flaky and slow, and it would gate the build on a
 * judgement no assertion can make. These tests check structure — dimensions,
 * channels, and a handful of sampled pixels — and the visual judgement is a
 * human looking at the contact sheet.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  frameArtwork,
  orientBuffer,
  orientFile,
  renderSceneMockup,
} from '../../../src/lib/room-mockup/render';
import type { FrameRender } from '../../../src/lib/room-mockup/templates';
import { applyHomography } from '../../../src/lib/room-mockup/homography';
import { posterSizeForAspect } from '../../../src/lib/room-mockup/sizing';
import { centredRectCm, wallHomography } from '../../../src/lib/room-mockup/wall';
import { makeRoom } from './fixtures/synthetic-room';

const OAK: FrameRender = { widthRatio: 0.05, color: [178, 141, 94], depthRatio: 0.024, widthCm: 3.2, depthCm: 3 };
const FRAMELESS: FrameRender = { widthRatio: 0, color: [0, 0, 0], depthRatio: 0.03, widthCm: 0, depthCm: 3.8 };

/** Solid-colour artwork, clearly distinct from any frame colour. */
const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();

/** Artwork stored at w x h but tagged EXIF orientation 6 ("rotate 90° CW"), the shape a phone writes for a portrait shot. */
const rotatedArt = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

/**
 * Photographic noise, not a flat colour. A flat-colour JPEG compresses to
 * nearly the same byte size regardless of quality, so it cannot tell "quietly
 * re-encoded at a different quality" apart from "passed through untouched" —
 * exactly the distinction these tests need to make. Random per-pixel noise
 * makes JPEG's quantisation step (and therefore its quality setting) visible
 * in the output size.
 */
const noisyJpeg = (w: number, h: number, quality: number, orientation?: number) => {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  const img = sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality });
  return (orientation === undefined ? img : img.withMetadata({ orientation })).toBuffer();
};

describe('frameArtwork', () => {
  it('returns the artwork untouched when the frame is frameless', async () => {
    const source = await art(400, 600);

    const framed = await frameArtwork(source, FRAMELESS);

    expect(framed.equals(source)).toBe(true);
  });

  it('grows the artwork symmetrically on all four sides', async () => {
    const framed = await frameArtwork(await art(400, 600), OAK);
    const meta = await sharp(framed).metadata();

    // face = round(400 * 0.05) = 20; bevel = round(20 * 0.12) = 2. Both sides.
    expect(meta.width).toBe(400 + 2 * (20 + 2));
    expect(meta.height).toBe(600 + 2 * (20 + 2));
  });

  it('sizes the frame face off the short edge, so a panoramic poster is not over-framed', async () => {
    const wide = await sharp(await frameArtwork(await art(2000, 400), OAK)).metadata();

    // Short edge is 400, so face = 20 — not 100.
    expect(wide.width).toBe(2000 + 2 * (20 + 2));
  });

  it('paints the outer border in the frame colour', async () => {
    const framed = await frameArtwork(await art(400, 600), OAK);
    const { data } = await sharp(framed).raw().toBuffer({ resolveWithObject: true });

    // Top-left corner pixel is frame face.
    expect([data[0], data[1], data[2]]).toEqual([178, 141, 94]);
  });
});

const BLACK: FrameRender = { widthRatio: 0.028, color: [26, 26, 28], depthRatio: 0.022, widthCm: 2, depthCm: 3 };
const RW = 1000;
const RH = 800;
const WALL = { widthCm: 320, heightCm: 260 };
const CENTRE = { x: 0.5 * WALL.widthCm, y: 0.42 * WALL.heightCm };

const rgbAt = async (img: Buffer, x: number, y: number): Promise<[number, number, number]> => {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  const o = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[o]!, data[o + 1]!, data[o + 2]!];
};

/** The outer (frame) rectangle the renderer must have placed for this art. */
const outerFor = (aw: number, ah: number, faceCm: number) => {
  const poster = posterSizeForAspect(aw, ah);
  return centredRectCm(CENTRE, {
    widthCm: poster.widthCm + 2 * faceCm,
    heightCm: poster.heightCm + 2 * faceCm,
  });
};

describe('renderSceneMockup (angled room)', () => {
  it.each([
    ['portrait', 600, 800],
    ['square', 700, 700],
    ['panoramic', 1500, 500],
  ])('%s: JPEG at room size, art at the centre, wall untouched far away', async (_n, aw, ah) => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(aw, ah), path, scene, BLACK, { seedKey: 'sku-1' });
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([RW, RH]);

    // Centre of the poster: the art's colour, changed by tone only.
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);
    const c = applyHomography(h, CENTRE);
    const [r, g, b] = await rgbAt(out, c.x, c.y);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(60);
    expect(g).toBeLessThan(70);

    // Far from the wall rectangle the room is the room (JPEG-level tolerance).
    const room = await sharp(path).toBuffer();
    const before = await rgbAt(room, 20, 20);
    const after = await rgbAt(out, 20, 20);
    for (let i = 0; i < 3; i++) expect(Math.abs(after[i]! - before[i]!)).toBeLessThanOrEqual(3);
  });

  it('paints the frame face in the frame colour on the ring', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);
    const outer = outerFor(600, 800, BLACK.widthCm);

    // 1 cm inside the left edge, mid-height: on the 2 cm face.
    const p = applyHomography(h, { x: outer.x + 1, y: outer.y + outer.h / 2 });
    const [r, g, b] = await rgbAt(out, p.x, p.y);
    expect(Math.max(r, g, b)).toBeLessThan(60);
  });

  it('casts a shadow: the wall just right of and below the frame is darker than before', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const room = await sharp(path).toBuffer();
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);
    const outer = outerFor(600, 800, BLACK.widthCm);

    const p = applyHomography(h, { x: outer.x + outer.w + 1.5, y: outer.y + outer.h + 1.5 });
    const [after] = await rgbAt(out, p.x, p.y);
    const [before] = await rgbAt(room, p.x, p.y);
    expect(after).toBeLessThan(before - 8);
  });

  it('draws the side face outside the near (left) edge', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const room = await sharp(path).toBuffer();
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);
    const outer = outerFor(600, 800, BLACK.widthCm);

    // The strip is 3·sin25° ≈ 1.27 cm wide; probe its middle.
    const p = applyHomography(h, { x: outer.x - 0.6, y: outer.y + outer.h / 2 });
    const [after] = await rgbAt(out, p.x, p.y);
    const [before] = await rgbAt(room, p.x, p.y);
    expect(after).toBeLessThan(before - 60);
  });

  it('is byte-identical on a re-render with the same seed key, and differs with another', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const a = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const b = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const c = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-2' });

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('honours an explicit poster size', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);
    const small = await renderSceneMockup(await art(600, 800), path, scene, BLACK, {
      seedKey: 's',
      posterCm: { widthCm: 30, heightCm: 40 },
    });
    const big = await renderSceneMockup(await art(600, 800), path, scene, BLACK, {
      seedKey: 's',
      posterCm: { widthCm: 90, heightCm: 120 },
    });
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);

    // 30 cm left of centre: inside the 90 cm poster's art, but bare wall
    // beside the 30 cm one. The art is nearly black in red; the wall is not.
    const p = applyHomography(h, { x: CENTRE.x - 30, y: CENTRE.y });
    const [rSmall] = await rgbAt(small, p.x, p.y);
    const [rBig] = await rgbAt(big, p.x, p.y);
    expect(rBig).toBeLessThan(60);
    expect(rSmall).toBeGreaterThan(150);
  });

  it('renders gallery-wrap (no face) without throwing, art to the edge', async () => {
    const wrap: FrameRender = { ...BLACK, widthRatio: 0, widthCm: 0, depthCm: 3.8 };
    const { path, scene } = await makeRoom('angled', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, wrap, { seedKey: 'sku-1' });
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);
    const outer = outerFor(600, 800, 0);

    const p = applyHomography(h, { x: outer.x + 1.5, y: outer.y + outer.h / 2 });
    const [r, , b] = await rgbAt(out, p.x, p.y);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(60);
  });

  it('refuses a room whose pixel size differs from the scene', async () => {
    const { path, scene } = await makeRoom('angled', RW, RH);

    await expect(
      renderSceneMockup(await art(600, 800), path, { ...scene, imageSize: [RW, RH + 1] }, BLACK, {
        seedKey: 's',
      })
    ).rejects.toThrow(/imageSize/);
  });
});

describe('renderSceneMockup (straight-on room, Box path)', () => {
  it('places the poster axis-aligned with no side face', async () => {
    const { path, scene } = await makeRoom('straight', RW, RH);
    const out = await renderSceneMockup(await art(600, 800), path, scene, BLACK, { seedKey: 'sku-1' });
    const room = await sharp(path).toBuffer();
    const h = wallHomography(scene.wall.quad, WALL.widthCm, WALL.heightCm, RW, RH);
    const outer = outerFor(600, 800, BLACK.widthCm);

    const c = applyHomography(h, CENTRE);
    expect((await rgbAt(out, c.x, c.y))[2]).toBeGreaterThan(150);

    // 2 cm left of the outer edge: the shadow falls the other way and there
    // is no side face, so the wall is barely changed.
    const p = applyHomography(h, { x: outer.x - 2, y: outer.y + outer.h / 2 });
    const [after] = await rgbAt(out, p.x, p.y);
    const [before] = await rgbAt(room, p.x, p.y);
    expect(Math.abs(after - before)).toBeLessThan(12);

    // And the frame's left edge is vertical: the face colour at the same x, two heights.
    const top = applyHomography(h, { x: outer.x + 1, y: outer.y + 5 });
    const bottom = applyHomography(h, { x: outer.x + 1, y: outer.y + outer.h - 5 });
    expect(Math.abs(top.x - bottom.x)).toBeLessThan(0.01);
    expect(Math.max(...(await rgbAt(out, top.x, top.y)))).toBeLessThan(60);
    expect(Math.max(...(await rgbAt(out, bottom.x, bottom.y)))).toBeLessThan(60);
  });
});

describe('EXIF orientation', () => {
  // Both fixtures below are STORED at 800x400 (landscape pixels) but tagged
  // orientation 6, the shape a phone writes for a portrait shot: a viewer —
  // and a correct render — DISPLAYS them at 400x800 (portrait). A renderer
  // that reads dimensions before rotating would produce a landscape output
  // from a portrait photo, silently.

  it('auto-orients the room photo before compositing, so a rotated phone photo comes out at its displayed dimensions, not its stored ones', async () => {
    // Stored 800x400, tagged orientation 6: displays as 400x800, and the
    // scene was measured against the displayed image.
    const { path, scene } = await makeRoom('angled', 800, 400, { rotated: true });

    const out = await renderSceneMockup(await art(200, 300), path, scene, BLACK, { seedKey: 'sku-1' });
    const meta = await sharp(out).metadata();

    // Displayed (correct): 400x800. Stored (bug): 800x400 — exactly swapped,
    // so this also fails loudly rather than passing by coincidence.
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(800);
  });

  it('auto-orients the artwork before framing, so a rotated portrait photo is not framed as a landscape', async () => {
    const source = await rotatedArt(800, 400);

    const framed = await frameArtwork(source, OAK);
    const meta = await sharp(framed).metadata();

    // shortEdge is 400 either way (min(800,400) === min(400,800)), so this
    // is not sensitive to the frame math — only to which axis the frame face
    // was added to. face = round(400 * 0.05) = 20; bevel = round(20*0.12) = 2.
    // Displayed (correct): 400x800 art -> 444x844 framed.
    // Stored (bug): 800x400 art -> 844x444 framed — exactly swapped.
    expect(meta.width).toBe(444);
    expect(meta.height).toBe(844);
  });
});

describe('orientation correction does not silently re-encode', () => {
  // Regression: autoOrient().toBuffer() with no format call re-encodes
  // JPEG/WebP input at sharp's own default quality, unconditionally — even
  // for the overwhelming majority of images that carry no orientation tag
  // and need no rotation. That silent re-encode happened BEFORE the
  // pipeline's one deliberate lossy step, so the quality it threw away could
  // never be recovered downstream.

  it('passes an untagged JPEG through byte-identical — no sharp round trip at all', async () => {
    const source = await noisyJpeg(256, 256, 95);

    const result = await orientBuffer(source);

    expect(result.equals(source)).toBe(true);
  });

  it('passes an untagged JPEG room file through byte-identical', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'room-mockup-'));
    const path = join(dir, 'room.jpg');
    const source = await noisyJpeg(256, 256, 95);
    writeFileSync(path, source);

    const result = await orientFile(path);

    expect(result.equals(source)).toBe(true);
  });

  it('frameArtwork returns a frameless, untagged JPEG byte-identical, not just dimension-identical', async () => {
    // A dimensions-only check would not have caught the regression: the
    // buggy re-encode preserves width/height while silently discarding
    // quality. This is the assertion that actually falsifies it.
    const source = await noisyJpeg(256, 256, 95);

    const framed = await frameArtwork(source, FRAMELESS);

    expect(framed.equals(source)).toBe(true);
  });

  it('still corrects a tagged image (orientation swap still holds)', async () => {
    const source = await noisyJpeg(800, 400, 92, 6);

    const result = await orientBuffer(source);
    const meta = await sharp(result).metadata();

    expect(meta.width).toBe(400);
    expect(meta.height).toBe(800);
  });

  it('materialises a genuinely rotated image losslessly (PNG), never re-encoded to a lossy format at an unspecified quality', async () => {
    const source = await noisyJpeg(256, 256, 95, 6);

    const result = await orientBuffer(source);
    const meta = await sharp(result).metadata();

    expect(meta.format).toBe('png');
  });

  it('the lossless rotation is not degraded to sharp default-quality JPEG size', async () => {
    const source = await noisyJpeg(256, 256, 95, 6);

    // The old, buggy behaviour this replaces: autoOrient().toBuffer() with
    // no format call, re-encoding at sharp's own default JPEG quality.
    const defaultQualityReencode = await sharp(source).autoOrient().toBuffer();

    const result = await orientBuffer(source);

    // A lossless PNG of photographic noise is reliably much larger than a
    // default-quality lossy JPEG re-encode of the same pixels — a cheap,
    // format-agnostic way to prove no lossy default snuck back in.
    expect(result.length).toBeGreaterThan(defaultQualityReencode.length);
  });
});
