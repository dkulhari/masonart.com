/**
 * Four-point perspective mapping.
 *
 * The module carries three decisions worth pinning down:
 *
 *   solveHomography   — the four corner pairs are matched EXACTLY. Anything
 *                       less and the artwork drifts off the aperture it was
 *                       measured into.
 *
 *   assertUsableQuad  — every rejected quad still renders an image if it is
 *                       let through. A mirrored poster in particular looks
 *                       like a perfectly good photograph, so the winding
 *                       check is the one that actually protects the shop.
 *
 *   quadPixelBounds   — the warp samples backwards over this box only, so a
 *                       box that is too small silently clips the artwork.
 */

import { describe, it, expect } from 'vitest';
import {
  applyHomography,
  assertUsableQuad,
  quadPixelBounds,
  solveHomography,
  type Quad,
} from '../../../src/lib/room-mockup/homography';

/** The unit square, wound top-left, top-right, bottom-right, bottom-left. */
const UNIT: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** A wall seen from the left: the far edge is shorter than the near one. */
const TRAPEZOID: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0.8, y: 1 },
  { x: 0.2, y: 1 },
];

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 10);

describe('solveHomography', () => {
  it('maps every corner exactly onto its pair', () => {
    const m = solveHomography(UNIT, TRAPEZOID);

    for (const [i, corner] of UNIT.entries()) {
      const mapped = applyHomography(m, corner);
      near(mapped.x, TRAPEZOID[i]!.x);
      near(mapped.y, TRAPEZOID[i]!.y);
    }
  });

  it('is the identity when source and destination are the same quad', () => {
    const m = solveHomography(UNIT, UNIT);
    const mapped = applyHomography(m, { x: 0.37, y: 0.62 });

    near(mapped.x, 0.37);
    near(mapped.y, 0.62);
  });

  it('sends the square centre to the intersection of the quad diagonals, not its centroid', () => {
    // Lines map to lines under a projective transform, so the centre — where
    // the square's diagonals cross — must land where the quad's diagonals
    // cross. For TRAPEZOID that is (0.5, 0.625). The centroid is (0.5, 0.5),
    // so an affine transform would fail this and a projective one passes it.
    const mapped = applyHomography(solveHomography(UNIT, TRAPEZOID), { x: 0.5, y: 0.5 });

    near(mapped.x, 0.5);
    near(mapped.y, 0.625);
  });

  it('round-trips: the inverse mapping returns the original point', () => {
    const forward = solveHomography(UNIT, TRAPEZOID);
    const back = solveHomography(TRAPEZOID, UNIT);
    const p = { x: 0.31, y: 0.77 };

    const there = applyHomography(forward, p);
    const home = applyHomography(back, there);

    near(home.x, p.x);
    near(home.y, p.y);
  });

  it('handles a first corner at the origin, where an unpivoted solver divides by zero', () => {
    const m = solveHomography(UNIT, TRAPEZOID);
    expect(m.every(Number.isFinite)).toBe(true);
  });

  it('refuses a source quad with three collinear corners', () => {
    const collinear: Quad = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];

    expect(() => solveHomography(collinear, UNIT)).toThrow(/degenerate/i);
  });
});

describe('assertUsableQuad', () => {
  it('accepts a correctly wound quad', () => {
    expect(() => assertUsableQuad(TRAPEZOID, 'nook')).not.toThrow();
  });

  it('rejects a clockwise quad, because it would mirror the artwork', () => {
    const mirrored: Quad = [UNIT[0], UNIT[3], UNIT[2], UNIT[1]];

    expect(() => assertUsableQuad(mirrored, 'nook')).toThrow(/mirror the artwork/);
  });

  it('rejects a bowtie', () => {
    const bowtie: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];

    expect(() => assertUsableQuad(bowtie, 'nook')).toThrow(/self-intersecting/);
  });

  it('rejects three collinear corners before the solver is reached', () => {
    const collinear: Quad = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];

    expect(() => assertUsableQuad(collinear, 'nook')).toThrow(/collinear/);
  });

  it('rejects a corner outside the image and names which one', () => {
    const outside: Quad = [
      { x: 0, y: 0 },
      { x: 1.2, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    expect(() => assertUsableQuad(outside, 'nook')).toThrow(/corner 1 is outside the image/);
  });

  it('names the template in every message, so a failed run says which file to fix', () => {
    const bowtie: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];

    expect(() => assertUsableQuad(bowtie, 'reading-nook')).toThrow(/"reading-nook"/);
  });
});

describe('quadPixelBounds', () => {
  it('covers the whole quad, rounding outward so no edge pixel is clipped', () => {
    const quad: Quad = [
      { x: 0.101, y: 0.201 },
      { x: 0.499, y: 0.202 },
      { x: 0.501, y: 0.799 },
      { x: 0.099, y: 0.801 },
    ];

    expect(quadPixelBounds(quad, 1000, 1000)).toEqual({
      left: 99,
      top: 201,
      right: 502,
      bottom: 802,
    });
  });

  it('clamps to the canvas', () => {
    expect(quadPixelBounds(UNIT, 640, 480)).toEqual({
      left: 0,
      top: 0,
      right: 640,
      bottom: 480,
    });
  });
});
