/**
 * Which physical size a poster is shown at.
 *
 * The room is measured in centimetres, so the poster needs a size in
 * centimetres, and it has to be a size the shop actually sells — a rung of
 * the ladder for the art's orientation band, not a number invented here.
 */

import { describe, it, expect } from 'vitest';
import { getSizesForOrientation } from '@chobii/shared';
import {
  parsePosterCm,
  posterSizeForAspect,
  posterSizeToFill,
} from '../../../src/lib/room-mockup/sizing';

const mid = (o: 'square' | 'portrait' | 'landscape' | 'panoramic') => {
  const ladder = getSizesForOrientation(o);
  return ladder[Math.floor(ladder.length / 2)]!;
};

describe('posterSizeForAspect', () => {
  it('portrait art gets the middle portrait rung, short side first', () => {
    const s = posterSizeForAspect(1000, 1400);
    const m = mid('portrait');

    expect(s).toEqual({ widthCm: m.widthCm, heightCm: m.heightCm });
    expect(s.widthCm).toBeLessThan(s.heightCm);
  });

  it('landscape art gets the same ladder turned, so width ≥ height', () => {
    const s = posterSizeForAspect(1400, 1000);
    const m = mid('landscape');

    expect(s).toEqual({ widthCm: m.heightCm, heightCm: m.widthCm });
    expect(s.widthCm).toBeGreaterThan(s.heightCm);
  });

  it('square art gets the square ladder', () => {
    const s = posterSizeForAspect(1000, 1000);

    expect(s.widthCm).toBe(s.heightCm);
    expect(s.widthCm).toBe(mid('square').widthCm);
  });

  it('panoramic art is turned wide', () => {
    const s = posterSizeForAspect(3000, 1000);

    expect(s.widthCm).toBeGreaterThan(s.heightCm * 1.8);
  });

  it('rejects a non-positive dimension', () => {
    expect(() => posterSizeForAspect(0, 10)).toThrow(/dimensions/);
    expect(() => posterSizeForAspect(10, 0)).toThrow(/dimensions/);
  });
});

describe('posterSizeToFill', () => {
  // The room's allowable box, less the frame face on every side, is what the
  // poster may fill. 110 × 130 with a 3.2 cm face leaves 103.6 × 123.6.
  const allowable = { maxWidthCm: 110, maxHeightCm: 130, minMarginCm: 20 };
  const FACE = 3.2;

  it('tall art fills the height and keeps its own aspect', () => {
    const s = posterSizeToFill(633, 1200, FACE, allowable);

    expect(s.heightCm).toBeCloseTo(123.6, 5);
    expect(s.widthCm / s.heightCm).toBeCloseTo(633 / 1200, 5);
    expect(s.widthCm).toBeLessThan(103.6);
  });

  it('wide art fills the width and keeps its own aspect', () => {
    const s = posterSizeToFill(1024, 768, FACE, allowable);

    expect(s.widthCm).toBeCloseTo(103.6, 5);
    expect(s.widthCm / s.heightCm).toBeCloseTo(1024 / 768, 5);
    expect(s.heightCm).toBeLessThan(123.6);
  });

  it('square art is bounded by the shorter side of the box', () => {
    const s = posterSizeToFill(700, 700, FACE, allowable);

    expect(s.widthCm).toBeCloseTo(103.6, 5);
    expect(s.heightCm).toBeCloseTo(103.6, 5);
  });

  it('a frameless poster uses the whole box', () => {
    const s = posterSizeToFill(1024, 768, 0, allowable);

    expect(s.widthCm).toBeCloseTo(110, 5);
    expect(s.heightCm).toBeCloseTo(82.5, 5);
  });

  it('rejects a non-positive dimension', () => {
    expect(() => posterSizeToFill(0, 10, FACE, allowable)).toThrow(/dimensions/);
    expect(() => posterSizeToFill(10, 0, FACE, allowable)).toThrow(/dimensions/);
  });

  it('rejects a face too wide for the box', () => {
    expect(() => posterSizeToFill(10, 10, 60, allowable)).toThrow(/face/);
  });
});

describe('parsePosterCm', () => {
  it('parses WxH', () => {
    expect(parsePosterCm('60x80')).toEqual({ widthCm: 60, heightCm: 80 });
    expect(parsePosterCm('50×70')).toEqual({ widthCm: 50, heightCm: 70 });
    expect(parsePosterCm(' 45.5 X 60 ')).toEqual({ widthCm: 45.5, heightCm: 60 });
  });

  it('rejects garbage, naming the flag', () => {
    expect(() => parsePosterCm('big')).toThrow(/--poster-cm/);
    expect(() => parsePosterCm('0x80')).toThrow(/--poster-cm/);
    expect(() => parsePosterCm('60')).toThrow(/--poster-cm/);
  });
});
