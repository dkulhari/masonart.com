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
  shadowLayer,
  renderRoomMockup,
  orientBuffer,
  orientFile,
} from '../../../src/lib/room-mockup/render';
import type { FrameRender, RoomTemplate } from '../../../src/lib/room-mockup/templates';

const OAK: FrameRender = { widthRatio: 0.05, color: [178, 141, 94], depthRatio: 0.024 };
const FRAMELESS: FrameRender = { widthRatio: 0, color: [0, 0, 0], depthRatio: 0.03 };

/** Solid-colour artwork, clearly distinct from any frame colour. */
const art = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .png()
    .toBuffer();

const roomFile = async (w: number, h: number): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), 'room-mockup-'));
  const path = join(dir, 'room.jpg');
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: 230, g: 226, b: 218 } } })
    .jpeg()
    .toFile(path);
  return path;
};

/**
 * A room photograph stored at w x h but tagged EXIF orientation 6 ("rotate
 * 90° CW to display correctly") — the shape a phone actually writes for a
 * portrait shot. `sharp().metadata()` on this file reports w x h (the STORED
 * dimensions); a viewer, and autoOrient(), show h x w (the DISPLAYED ones).
 */
const rotatedRoomFile = async (w: number, h: number): Promise<string> => {
  const dir = mkdtempSync(join(tmpdir(), 'room-mockup-'));
  const path = join(dir, 'room.jpg');
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: 230, g: 226, b: 218 } } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toFile(path);
  return path;
};

/** Same idea as rotatedRoomFile, but as an in-memory artwork buffer. */
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

const TEMPLATE: RoomTemplate = {
  id: 'test-room',
  file: 'room.jpg',
  placement: { x: 0.2, y: 0.1, w: 0.6, h: 0.6 },
  light: 'left',
  frame: 'oak',
  label: 'Test room',
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

describe('shadowLayer', () => {
  it('produces a canvas-sized RGBA layer', async () => {
    const layer = await shadowLayer(
      800, 600,
      { left: 100, top: 100, width: 200, height: 200 },
      { blurSigma: 5, opacity: 0.5, offsetX: 10, offsetY: 10 }
    );
    const meta = await sharp(layer).metadata();

    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
    expect(meta.channels).toBe(4);
  });

  it('is transparent far from the shape and opaque at its centre', async () => {
    const layer = await shadowLayer(
      400, 400,
      { left: 150, top: 150, width: 100, height: 100 },
      { blurSigma: 2, opacity: 1, offsetX: 0, offsetY: 0 }
    );
    const { data, info } = await sharp(layer).raw().toBuffer({ resolveWithObject: true });

    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];

    expect(alphaAt(5, 5)).toBeLessThan(10);
    expect(alphaAt(200, 200)).toBeGreaterThan(200);
  });

  it('honours opacity', async () => {
    const rect = { left: 150, top: 150, width: 100, height: 100 };
    const read = async (opacity: number) => {
      const layer = await shadowLayer(400, 400, rect, { blurSigma: 2, opacity, offsetX: 0, offsetY: 0 });
      const { data, info } = await sharp(layer).raw().toBuffer({ resolveWithObject: true });
      return data[(200 * info.width + 200) * info.channels + 3];
    };

    expect(await read(0.5)).toBeLessThan(await read(1));
  });
});

describe('renderRoomMockup', () => {
  it('returns a JPEG at the room template dimensions', async () => {
    const room = await roomFile(1200, 1200);

    const out = await renderRoomMockup(await art(500, 800), room, TEMPLATE, OAK);
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1200);
  });

  it('leaves the room untouched outside the placement region', async () => {
    const room = await roomFile(1200, 1200);

    const out = await renderRoomMockup(await art(500, 800), room, TEMPLATE, OAK);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });

    // Bottom-left corner is far from placement {x:0.2,y:0.1,w:0.6,h:0.6}.
    const i = ((info.height - 5) * info.width + 5) * info.channels;
    expect(data[i]).toBeGreaterThan(200);
  });

  it('renders a frameless piece without throwing', async () => {
    const room = await roomFile(1000, 1000);

    const out = await renderRoomMockup(
      await art(600, 600), room, { ...TEMPLATE, frame: 'frameless' }, FRAMELESS
    );

    expect((await sharp(out).metadata()).width).toBe(1000);
  });
});

describe('EXIF orientation', () => {
  // Both fixtures below are STORED at 800x400 (landscape pixels) but tagged
  // orientation 6, the shape a phone writes for a portrait shot: a viewer —
  // and a correct render — DISPLAYS them at 400x800 (portrait). A renderer
  // that reads dimensions before rotating would produce a landscape output
  // from a portrait photo, silently.

  it('auto-orients the room photo before compositing, so a rotated phone photo comes out at its displayed dimensions, not its stored ones', async () => {
    const room = await rotatedRoomFile(800, 400);

    const out = await renderRoomMockup(await art(200, 300), room, TEMPLATE, OAK);
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
