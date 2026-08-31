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
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { frameArtwork, shadowLayer, renderRoomMockup } from '../../../src/lib/room-mockup/render';
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
