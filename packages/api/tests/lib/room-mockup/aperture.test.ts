/**
 * Aperture mockups: warping a poster into a room that already has a frame.
 *
 * The bare-wall pipeline draws its own frame and needs a bare wall. When the
 * only room available already has a frame baked into the photograph — as the
 * seed rooms do — there is nothing to draw and nowhere to draw it; the poster
 * is simply resampled into the measured opening. This is the "baked frame"
 * fallback the pipeline doc keeps, and it reuses buildPanel + warpPanelIntoQuad
 * unchanged.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadApertureTemplates,
  renderApertureMockup,
  type ApertureTemplate,
} from '../../../src/lib/room-mockup/aperture';
import { applyHomography, solveHomography, type Quad } from '../../../src/lib/room-mockup/homography';

const W = 800;
const H = 800;

/** A room whose "frame opening" is a known trapezoid; the surround is dark. */
async function roomWithOpening(): Promise<{ path: string; quad: Quad }> {
  const raw = Buffer.alloc(W * H * 3, 40); // dark surround
  const path = join(mkdtempSync(join(tmpdir(), 'aperture-')), 'room.png');
  writeFileSync(path, await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
  const quad: Quad = [
    { x: 0.25, y: 0.2 },
    { x: 0.72, y: 0.24 },
    { x: 0.72, y: 0.78 },
    { x: 0.25, y: 0.82 },
  ];
  return { path, quad };
}

const template = (quad: Quad, over: Partial<ApertureTemplate> = {}): ApertureTemplate => ({
  id: 'living-room-01',
  image: 'room.png',
  imageSize: [W, H],
  quad,
  mat: { color: [244, 242, 237] },
  label: 'Living room',
  ...over,
});

const art = (w: number, h: number, rgb: [number, number, number]) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .png()
    .toBuffer();

const rgbAt = async (img: Buffer, x: number, y: number): Promise<[number, number, number]> => {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  const o = (Math.round(y) * info.width + Math.round(x)) * info.channels;
  return [data[o]!, data[o + 1]!, data[o + 2]!];
};

describe('renderApertureMockup', () => {
  it('returns a JPEG at the room size with the art warped into the opening', async () => {
    const { path, quad } = await roomWithOpening();
    const out = await renderApertureMockup(await art(500, 700, [10, 20, 200]), path, template(quad));

    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([W, H]);

    // The opening's centre lands where the quad's diagonals cross; the art is
    // blue there. Its own mat keeps the very edge off the frame, so probe the
    // centre, not the corner.
    const m = solveHomography(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      quad.map((p) => ({ x: p.x * W, y: p.y * H })) as Quad
    );
    const c = applyHomography(m, { x: 0.5, y: 0.5 });
    const [r, , b] = await rgbAt(out, c.x, c.y);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(60);
  });

  it('leaves the surround untouched', async () => {
    const { path, quad } = await roomWithOpening();
    const out = await renderApertureMockup(await art(500, 700, [10, 20, 200]), path, template(quad));

    // Top-left corner is well outside the opening: still the dark surround.
    expect((await rgbAt(out, 10, 10))[0]).toBeLessThan(60);
  });

  it('shows the mat between the art and the opening edge', async () => {
    const { path, quad } = await roomWithOpening();
    const out = await renderApertureMockup(await art(500, 700, [10, 20, 200]), path, template(quad));

    // A hair inside the top edge, mid-width: the panel's own mat, near white.
    const m = solveHomography(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      quad.map((p) => ({ x: p.x * W, y: p.y * H })) as Quad
    );
    const p = applyHomography(m, { x: 0.5, y: 0.02 });
    const [r, g, b] = await rgbAt(out, p.x, p.y);
    expect(Math.min(r, g, b)).toBeGreaterThan(220);
  });

  it('refuses a room whose pixel size differs from the template', async () => {
    const { path, quad } = await roomWithOpening();

    await expect(
      renderApertureMockup(await art(500, 700, [10, 20, 200]), path, template(quad, { imageSize: [W, H + 1] }))
    ).rejects.toThrow(/imageSize/);
  });
});

describe('loadApertureTemplates', () => {
  const raw = () => ({
    id: 'living-room-01',
    image: 'room.png',
    imageSize: [1024, 1024],
    quad: { tl: [0.3, 0.19], tr: [0.68, 0.15], br: [0.68, 0.84], bl: [0.3, 0.8] },
    mat: { color: [244, 242, 237] },
    label: 'Living room',
  });
  const exists = () => true;

  it('accepts a well-formed template and exposes the quad as points', () => {
    const [t] = loadApertureTemplates([raw()], { imageExists: exists });
    expect(t!.id).toBe('living-room-01');
    expect(t!.quad[0]).toEqual({ x: 0.3, y: 0.19 });
    expect(t!.mat.color).toEqual([244, 242, 237]);
  });

  it('rejects a clockwise (mirrored) quad, naming the template', () => {
    const mirrored = { ...raw().quad, tr: [0.3, 0.8], bl: [0.68, 0.15] };
    expect(() => loadApertureTemplates([{ ...raw(), quad: mirrored }], { imageExists: exists })).toThrow(
      /living-room-01/
    );
  });

  it('rejects a missing image', () => {
    expect(() => loadApertureTemplates([raw()], { imageExists: () => false })).toThrow(/room\.png/);
  });

  it('rejects duplicate ids and an empty set', () => {
    expect(() => loadApertureTemplates([raw(), raw()], { imageExists: exists })).toThrow(/more than once/);
    expect(() => loadApertureTemplates([], { imageExists: exists })).toThrow(/No aperture/);
  });
});
