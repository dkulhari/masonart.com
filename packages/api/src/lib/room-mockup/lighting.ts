/**
 * Stage 5 primitives: everything that makes a warped panel belong to the
 * photograph it lands in.
 *
 * Each one is a multiply or a masked add on a raw RGBA canvas layer. Nothing
 * here touches the artwork except by uniform tone — the wall's own light,
 * a shadow beside it, the room's grain over it. That is the whole
 * difference between a mockup and a sticker, and none of it is generative.
 *
 * Determinism: the only stochastic step is the grain, and its generator is
 * seeded from a key the caller passes (sku + scene id), so a re-import is
 * byte-identical.
 */

import sharp from 'sharp';
import type { Quad } from './homography';
import { warpPanelIntoQuad } from './warp';

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/** Inclusive-exclusive pixel bounds; the same shape `quadPixelBounds` returns. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export async function readRaw(input: Buffer, channels: 3 | 4): Promise<RawImage> {
  const pipeline = channels === 4 ? sharp(input).ensureAlpha() : sharp(input).removeAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** FNV-1a, 32-bit. Stable across runs and machines, which Math.random is not. */
export function seedFromKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A small, fast, seedable PRNG; plenty for film grain. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function unionBounds(a: Bounds, b: Bounds | null): Bounds {
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/**
 * The wall's own light inside the placement area, as a field of ratios to
 * its mean. Sampled from the room BEFORE anything is composited, so it is
 * bare plaster — a clean gradient. Blurred first so the wall's grain does not
 * come through as texture on the poster.
 *
 * This is the Photoshop mockup Multiply-layer trick: the poster darkens
 * toward the same corner the wall does, and stops looking pasted on.
 */
export async function wallLuminanceField(
  room: RawImage,
  bounds: Bounds,
  sigma: number
): Promise<Float32Array> {
  const bw = bounds.right - bounds.left;
  const bh = bounds.bottom - bounds.top;

  const { data } = await sharp(room.data, {
    raw: { width: room.width, height: room.height, channels: room.channels as 3 | 4 },
  })
    .extract({ left: bounds.left, top: bounds.top, width: bw, height: bh })
    .removeAlpha()
    .toColourspace('b-w')
    .blur(Math.max(0.5, sigma))
    .raw()
    .toBuffer({ resolveWithObject: true });

  const field = new Float32Array(bw * bh);
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    field[i] = data[i]!;
    sum += data[i]!;
  }
  const mean = sum / field.length || 1;
  for (let i = 0; i < field.length; i++) field[i] = field[i]! / mean;

  return field;
}

/** Multiply the field onto the layer at `strength`, only where the layer is opaque. */
export function applyLuminance(
  layer: Buffer,
  W: number,
  _H: number,
  field: Float32Array,
  bounds: Bounds,
  strength: number
): void {
  if (strength === 0) return;
  const bw = bounds.right - bounds.left;

  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) {
      const o = (y * W + x) * 4;
      if (layer[o + 3] === 0) continue;

      const L = field[(y - bounds.top) * bw + (x - bounds.left)]!;
      // Clamped: a scene with a lamp in the placement area would otherwise
      // blow the poster out, and that is a scene-authoring error to notice,
      // not one to hide with a white rectangle.
      const f = Math.min(1.4, Math.max(0.6, 1 + strength * (L - 1)));

      layer[o] = Math.min(255, Math.round(layer[o]! * f));
      layer[o + 1] = Math.min(255, Math.round(layer[o + 1]! * f));
      layer[o + 2] = Math.min(255, Math.round(layer[o + 2]! * f));
    }
  }
}

/**
 * Anti-aliased coverage of the quads, as one alpha channel: a 2×2 white
 * panel warped into each, union by max. Reusing the warp means the mask's
 * edges land exactly where the panel's do.
 */
export async function quadMask(quads: Quad[], W: number, H: number): Promise<Buffer> {
  const white = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  const mask = Buffer.alloc(W * H, 0);
  for (const q of quads) {
    const layer = await warpPanelIntoQuad(white, 2, 2, q, W, H);
    for (let i = 0; i < W * H; i++) {
      const a = layer[i * 4 + 3]!;
      if (a > mask[i]!) mask[i] = a;
    }
  }
  return mask;
}

/**
 * Black at `opacity` where the blurred mask is full, fading with the blur.
 * sharp has no "composite this layer at 40%", so opacity is baked into the
 * alpha channel with linear() before the mask becomes one.
 */
export async function shadowLayer(
  mask: Buffer,
  W: number,
  H: number,
  blurSigma: number,
  opacity: number
): Promise<Buffer> {
  // A 1-channel raw input comes back out of sharp as 3-channel sRGB unless
  // the colourspace is pinned; joinChannel would then read the first third
  // of an RGB buffer as the whole mask.
  const alpha = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .blur(Math.max(0.4, blurSigma))
    .linear(opacity, 0)
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  return sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

/**
 * How grainy the wall is: the standard deviation of luminance minus its 3×3
 * box mean over the bounds. A smooth gradient scores ~0; generated rooms
 * score a few levels; a resampled poster scores lower than either, which is
 * exactly the seam the eye catches.
 */
export function wallGrainAmplitude(room: RawImage, bounds: Bounds): number {
  const c = room.channels;
  const L = (x: number, y: number) => {
    const o = (y * room.width + x) * c;
    return lum(room.data[o]!, room.data[o + 1]!, room.data[o + 2]!);
  };

  let sum = 0;
  let sq = 0;
  let n = 0;

  for (let y = bounds.top + 1; y < bounds.bottom - 1; y++) {
    for (let x = bounds.left + 1; x < bounds.right - 1; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) m += L(x + dx, y + dy);
      }
      const d = L(x, y) - m / 9;
      sum += d;
      sq += d * d;
      n++;
    }
  }

  if (n === 0) return 0;
  return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
}

/** Gaussian grain (Box–Muller) at `amplitude`, only where the layer is opaque. */
export function addGrain(layer: Buffer, W: number, H: number, amplitude: number, seed: number): void {
  if (amplitude <= 0) return;
  const rnd = mulberry32(seed);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (layer[o + 3] === 0) continue;

      const u1 = Math.max(1e-12, rnd());
      const u2 = rnd();
      const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * amplitude;

      for (let ch = 0; ch < 3; ch++) {
        layer[o + ch] = Math.max(0, Math.min(255, Math.round(layer[o + ch]! + n)));
      }
    }
  }
}
