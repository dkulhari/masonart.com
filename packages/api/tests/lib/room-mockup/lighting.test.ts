/**
 * Stage 5 primitives.
 *
 * Each is a multiply or a masked add on a raw buffer. They are asserted on
 * small synthetic images where the right answer is known by construction:
 * a wall that darkens to the right, a grey layer with a known alpha region.
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import type { Quad } from '../../../src/lib/room-mockup/homography';
import {
  addGrain,
  applyLuminance,
  mulberry32,
  quadMask,
  readRaw,
  seedFromKey,
  shadowLayer,
  unionBounds,
  wallGrainAmplitude,
  wallLuminanceField,
} from '../../../src/lib/room-mockup/lighting';

const W = 200;
const H = 100;

/** A wall that darkens left to right: 240 at x=0 down to 160 at x=W-1. */
async function gradientRoom() {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.round(240 - (80 * x) / (W - 1));
      const o = (y * W + x) * 3;
      raw[o] = raw[o + 1] = raw[o + 2] = v;
    }
  }
  const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return readRaw(png, 3);
}

/** A full-canvas RGBA layer: mid-grey and opaque inside [50,150)×[20,80), else clear. */
function greyLayer() {
  const buf = Buffer.alloc(W * H * 4, 0);
  for (let y = 20; y < 80; y++) {
    for (let x = 50; x < 150; x++) {
      const o = (y * W + x) * 4;
      buf[o] = buf[o + 1] = buf[o + 2] = 128;
      buf[o + 3] = 255;
    }
  }
  return buf;
}

const bounds = { left: 50, top: 20, right: 150, bottom: 80 };

describe('readRaw', () => {
  it('returns the requested channel count', async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    expect((await readRaw(png, 3)).channels).toBe(3);
    expect((await readRaw(png, 4)).channels).toBe(4);
  });
});

describe('seeded randomness', () => {
  it('seedFromKey is stable and distinguishes keys', () => {
    expect(seedFromKey('a:room-01')).toBe(seedFromKey('a:room-01'));
    expect(seedFromKey('a:room-01')).not.toBe(seedFromKey('b:room-01'));
    expect(seedFromKey('a:room-01')).not.toBe(seedFromKey('a:room-02'));
  });

  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);

    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('unionBounds', () => {
  it('returns the first when the second is null, else the enclosing box', () => {
    expect(unionBounds(bounds, null)).toEqual(bounds);
    expect(unionBounds(bounds, { left: 10, top: 30, right: 60, bottom: 90 })).toEqual({
      left: 10,
      top: 20,
      right: 150,
      bottom: 90,
    });
  });
});

describe('wallLuminanceField + applyLuminance', () => {
  it('normalises to mean 1 and follows the wall gradient', async () => {
    const field = await wallLuminanceField(await gradientRoom(), bounds, 2);

    expect(field.length).toBe(100 * 60);
    const mean = field.reduce((s, v) => s + v, 0) / field.length;
    expect(mean).toBeCloseTo(1, 2);
    expect(field[30 * 100 + 5]!).toBeGreaterThan(field[30 * 100 + 95]!);
  });

  it('darkens the layer toward the side the wall darkens, by strength, only under alpha', async () => {
    const field = await wallLuminanceField(await gradientRoom(), bounds, 2);
    const layer = greyLayer();
    applyLuminance(layer, W, H, field, bounds, 0.5);

    const at = (x: number) => layer[(50 * W + x) * 4]!;
    expect(at(55)).toBeGreaterThan(at(145));

    // Wall at x=55 is ~218 against a bounds mean of ~200: ratio 1.09, so at
    // strength 0.5 the layer gains ~4.5%: 128 → ~134.
    expect(at(55)).toBeGreaterThan(128);
    expect(at(55)).toBeLessThan(140);

    expect(layer[(10 * W + 10) * 4]).toBe(0);
  });

  it('strength 0 leaves the layer untouched', async () => {
    const field = await wallLuminanceField(await gradientRoom(), bounds, 2);
    const layer = greyLayer();
    applyLuminance(layer, W, H, field, bounds, 0);

    expect(layer.equals(greyLayer())).toBe(true);
  });
});

describe('quadMask + shadowLayer', () => {
  const q: Quad = [
    { x: 0.25, y: 0.2 },
    { x: 0.75, y: 0.2 },
    { x: 0.75, y: 0.8 },
    { x: 0.25, y: 0.8 },
  ];

  it('covers the quad and nothing else', async () => {
    const m = await quadMask([q], W, H);

    expect(m.length).toBe(W * H);
    expect(m[50 * W + 100]).toBe(255);
    expect(m[5 * W + 5]).toBe(0);
  });

  it('unions two quads', async () => {
    const q2: Quad = [
      { x: 0.8, y: 0.2 },
      { x: 0.9, y: 0.2 },
      { x: 0.9, y: 0.8 },
      { x: 0.8, y: 0.8 },
    ];
    const m = await quadMask([q, q2], W, H);

    expect(m[50 * W + 100]).toBe(255);
    expect(m[50 * W + 170]).toBe(255);
    expect(m[50 * W + 155]).toBe(0);
  });

  it('shadowLayer is black with alpha = opacity at the centre and 0 far away', async () => {
    const m = await quadMask([q], W, H);
    const png = await shadowLayer(m, W, H, 1, 0.4);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });

    expect(info.channels).toBe(4);
    expect([info.width, info.height]).toEqual([W, H]);

    const c = (50 * W + 100) * 4;
    expect(data[c]).toBe(0);
    expect(data[c + 3]).toBeGreaterThanOrEqual(100);
    expect(data[c + 3]).toBeLessThanOrEqual(104);
    expect(data[(5 * W + 5) * 4 + 3]).toBe(0);
  });

  it('a larger blur softens the edge further', async () => {
    const m = await quadMask([q], W, H);
    const tight = await sharp(await shadowLayer(m, W, H, 1, 1)).raw().toBuffer();
    const soft = await sharp(await shadowLayer(m, W, H, 6, 1)).raw().toBuffer();

    // Just outside the left edge (x = 0.25·200 = 50): the soft shadow reaches further.
    const o = (50 * W + 44) * 4 + 3;
    expect(soft[o]!).toBeGreaterThan(tight[o]!);
  });
});

describe('grain', () => {
  it('measures near-zero amplitude on a smooth gradient and more on a noisy wall', async () => {
    const smooth = wallGrainAmplitude(await gradientRoom(), bounds);
    expect(smooth).toBeLessThan(1);

    const noisy = await gradientRoom();
    const rnd = mulberry32(1);
    for (let i = 0; i < noisy.data.length; i++) {
      noisy.data[i] = Math.max(0, Math.min(255, noisy.data[i]! + Math.round((rnd() - 0.5) * 20)));
    }
    expect(wallGrainAmplitude(noisy, bounds)).toBeGreaterThan(3);
  });

  it('adds seeded noise of the requested amplitude only under alpha, deterministically', () => {
    const a = greyLayer();
    const b = greyLayer();
    addGrain(a, W, H, 6, 123);
    addGrain(b, W, H, 6, 123);
    expect(a.equals(b)).toBe(true);

    let sum = 0;
    let sq = 0;
    let n = 0;
    for (let y = 20; y < 80; y++) {
      for (let x = 50; x < 150; x++) {
        const v = a[(y * W + x) * 4]! - 128;
        sum += v;
        sq += v * v;
        n++;
      }
    }
    const sd = Math.sqrt(sq / n - (sum / n) ** 2);
    expect(sd).toBeGreaterThan(4.5);
    expect(sd).toBeLessThan(7.5);

    expect(a[(10 * W + 10) * 4]).toBe(0);

    const c = greyLayer();
    addGrain(c, W, H, 6, 124);
    expect(a.equals(c)).toBe(false);
  });

  it('amplitude 0 is a no-op', () => {
    const a = greyLayer();
    addGrain(a, W, H, 0, 1);
    expect(a.equals(greyLayer())).toBe(true);
  });
});
