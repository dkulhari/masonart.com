/**
 * Which physical size a poster is shown at.
 *
 * The room is measured in centimetres, so the poster needs a size in
 * centimetres, and it has to be a size the shop actually sells — a rung of
 * the ladder for the art's orientation band, not a number invented here.
 */

import { describe, it, expect } from 'vitest';
import { getSizesForOrientation } from '@chobii/shared';
import { parsePosterCm, posterSizeForAspect } from '../../../src/lib/room-mockup/sizing';

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
