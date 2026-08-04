/**
 * Size ladders — depth, ceiling, dual-unit labels and area pricing.
 *
 * Companion to sizes.test.ts, which covers the original 8/8/4 shape. This file
 * covers what the mesonart parity analysis (§5.2, §5.5, §5.6) asks for: ladders
 * deep enough to read as gallery art rather than posters, a price that tracks
 * area with a volume taper instead of a hand-entered addition per step, and a
 * label that is scannable in inches and cm at once.
 */

import { describe, it, expect } from 'vitest';
import {
  SQUARE_SIZES,
  PORTRAIT_LANDSCAPE_SIZES,
  PANORAMIC_SIZES,
  ALL_SIZES,
  getSizesForOrientation,
  priceForSize,
} from '../../src/constants/sizes';

const area = (s: { widthInches: number; heightInches: number }) =>
  s.widthInches * s.heightInches;

describe('ladder depth and ceiling', () => {
  it('square reaches the measured 72in ceiling', () => {
    expect(SQUARE_SIZES.length).toBeGreaterThanOrEqual(10);
    expect(SQUARE_SIZES.at(-1)!.widthInches).toBe(72);
  });

  it('rectangular reaches 80x60', () => {
    expect(PORTRAIT_LANDSCAPE_SIZES.length).toBeGreaterThanOrEqual(14);
    const last = PORTRAIT_LANDSCAPE_SIZES.at(-1)!;
    expect([last.widthInches, last.heightInches].sort((a, b) => a - b)).toEqual([
      60, 80,
    ]);
  });

  it('panoramic carries more than one ratio', () => {
    // Ours was uniformly 3:1. Theirs mixes 2:1, 3:1 and 8:3 — the ladder is a
    // set of manufacturing steps, not one proportion scaled up.
    const ratios = new Set(
      PANORAMIC_SIZES.map((s) => {
        const [lo, hi] = [s.widthInches, s.heightInches].sort((a, b) => a - b);
        return (hi / lo).toFixed(2);
      })
    );
    expect(ratios.size).toBeGreaterThan(1);
  });

  it('every ladder step is strictly larger by area than the one before', () => {
    for (const ladder of [
      SQUARE_SIZES,
      PORTRAIT_LANDSCAPE_SIZES,
      PANORAMIC_SIZES,
    ]) {
      const areas = ladder.map(area);
      expect(areas).toEqual([...areas].sort((a, b) => a - b));
      expect(new Set(areas).size).toBe(areas.length);
    }
  });

  it('keeps priceTier inside the 1-4 the zod schema allows', () => {
    for (const s of ALL_SIZES) {
      expect(s.priceTier).toBeGreaterThanOrEqual(1);
      expect(s.priceTier).toBeLessThanOrEqual(4);
    }
  });

  it('ids stay unique across the combined ladders', () => {
    expect(new Set(ALL_SIZES.map((s) => s.id)).size).toBe(ALL_SIZES.length);
  });
});

describe('dual-unit labels', () => {
  it('prints inches and cm in one scannable string', () => {
    const size = PORTRAIT_LANDSCAPE_SIZES.find(
      (s) => s.widthInches === 36 && s.heightInches === 48
    )!;
    expect(size).toBeDefined();
    expect(size.displayLabelDual).toBe('36" × 48" / 91 × 122 cm');
  });

  it('every size has one', () => {
    for (const s of ALL_SIZES) {
      expect(s.displayLabelDual).toMatch(/^.+" \/ .+ cm$/);
    }
  });
});

describe('priceForSize — area with a volume taper', () => {
  const BASE = 1000;
  const square = getSizesForOrientation('square');

  it('anchors the smallest step at the product base price', () => {
    // Every card and listing renders `From <basePrice>`. If the entry step
    // stops matching it, the whole catalogue starts quoting a price no variant
    // actually sells at.
    expect(priceForSize(BASE, square[0]!)).toBe(BASE);
  });

  it('rises monotonically with area', () => {
    const prices = square.map((s) => priceForSize(BASE, s));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('tapers — the unit rate falls as the piece gets bigger', () => {
    const rate = (s: (typeof square)[number]) =>
      priceForSize(BASE, s) / area(s);
    expect(rate(square.at(-1)!)).toBeLessThan(rate(square[0]!));
  });

  it('tapers by roughly the measured 30 percent across the ladder', () => {
    const rate = (s: (typeof square)[number]) =>
      priceForSize(BASE, s) / area(s);
    const decline = 1 - rate(square.at(-1)!) / rate(square[0]!);
    expect(decline).toBeGreaterThan(0.2);
    expect(decline).toBeLessThan(0.45);
  });

  it('prices two same-area steps at different ratios identically', () => {
    // §5.5: price tracks area, not proportion. The ladder itself never holds
    // two steps of equal area, so this is asserted on a constructed pair —
    // spread from a real entry so `category` (which selects the ladder the
    // taper is measured against) stays intact.
    const template = PORTRAIT_LANDSCAPE_SIZES[5]!;
    const a = { ...template, widthInches: 48, heightInches: 36 };
    const b = { ...template, widthInches: 36, heightInches: 48 };
    expect(priceForSize(BASE, a)).toBe(priceForSize(BASE, b));
  });

  it('returns whole rupees', () => {
    for (const s of square) {
      expect(Number.isInteger(priceForSize(BASE, s))).toBe(true);
    }
  });
});
