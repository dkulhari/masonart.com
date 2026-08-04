/**
 * Seed variants derive from the shared ladder.
 *
 * Before this, `seed.ts` carried a hand-written `variantsByOrientation` table —
 * 4 steps per orientation with numbers that did not match the shared ladder in
 * @chobii/shared (seed square was 12/18/24/36; the ladder was
 * 12/16/20/24/30/36/40/48). Nothing reconciled them, and the ladder lost
 * because nothing read it.
 *
 * The last assertion here is the one that keeps it that way.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSizesForOrientation, priceForSize } from '@chobii/shared';
import { buildVariantsForOrientation } from '../../src/database/seed-variants';

describe('seed variants derive from the shared ladder', () => {
  it('emits one variant per ladder step', () => {
    for (const orientation of [
      'square',
      'portrait',
      'landscape',
      'panoramic',
    ] as const) {
      expect(buildVariantsForOrientation(orientation, 1000)).toHaveLength(
        getSizesForOrientation(orientation).length
      );
    }
  });

  it('emits far more than the 4 hand-seeded steps it replaced', () => {
    expect(
      buildVariantsForOrientation('square', 1000).length
    ).toBeGreaterThanOrEqual(10);
  });

  it('prices each step through priceForSize', () => {
    const ladder = getSizesForOrientation('square');
    const variants = buildVariantsForOrientation('square', 1000);
    variants.forEach((variant, i) => {
      expect(variant.price).toBe(priceForSize(1000, ladder[i]!).toFixed(2));
    });
  });

  it('starts the ladder at exactly the product base price', () => {
    // `From <basePrice>` on every card has to name a price something sells at.
    expect(buildVariantsForOrientation('square', 1499)[0]!.price).toBe(
      '1499.00'
    );
  });

  it('labels each variant dual-unit', () => {
    for (const variant of buildVariantsForOrientation('square', 1000)) {
      expect(variant.sizeLabel).toMatch(/^.+" \/ .+ cm$/);
    }
  });

  it('numbers sortOrder from 1 in ladder order', () => {
    const variants = buildVariantsForOrientation('portrait', 1000);
    expect(variants.map((v) => v.sortOrder)).toEqual(
      variants.map((_, i) => i + 1)
    );
  });

  it('carries cm alongside inches on every row', () => {
    for (const variant of buildVariantsForOrientation('panoramic', 1000)) {
      expect(variant.widthCm).toBeGreaterThan(0);
      expect(variant.heightCm).toBeGreaterThan(0);
    }
  });

  it('swaps width and height for landscape against portrait', () => {
    // One ladder, two labellings — the same numbers with the long side moved,
    // exactly as mesonart shares rect-14 between Vertical and Horizontal.
    const portrait = buildVariantsForOrientation('portrait', 1000);
    const landscape = buildVariantsForOrientation('landscape', 1000);
    expect(landscape).toHaveLength(portrait.length);
    portrait.forEach((p, i) => {
      expect(landscape[i]!.widthInches).toBe(p.heightInches);
      expect(landscape[i]!.heightInches).toBe(p.widthInches);
      expect(landscape[i]!.price).toBe(p.price);
    });
  });

  it('returns an empty ladder for an unknown orientation rather than throwing', () => {
    expect(
      buildVariantsForOrientation('round' as 'square', 1000)
    ).toHaveLength(0);
  });

  it('leaves no hand-written variant table behind in the seed', () => {
    const seed = readFileSync(
      join(process.cwd(), 'src/database/seed.ts'),
      'utf8'
    );
    expect(seed).not.toContain('variantsByOrientation');
    expect(seed).toContain('buildVariantsForOrientation');
  });
});
