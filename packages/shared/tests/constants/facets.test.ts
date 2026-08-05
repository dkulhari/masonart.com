/**
 * Facet vocabularies.
 *
 * The counts below are mesonart's, measured in analysis §1.3 and adopted
 * verbatim by owner decision on 2026-08-04. They are asserted because the
 * whole point of this module is that one list feeds the schema, the API
 * validation, the seed and the sidebar — a silent edit in any direction is
 * the drift it exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import {
  STYLE_OPTIONS,
  SUBJECT_OPTIONS,
  ORIENTATION_OPTIONS,
  COLOR_OPTIONS,
  VIBE_OPTIONS,
  ROOM_OPTIONS,
  AESTHETIC_OPTIONS,
  MEDIUM_OPTIONS,
  UNIQUENESS_OPTIONS,
  AVAILABILITY_OPTIONS,
  FACET_GROUPS,
  styleSchema,
  vibeSchema,
  orientationSchema,
} from '../../src/constants/facets';

describe('vocabulary sizes match the measured §1.3 lists', () => {
  const cases: Array<[string, readonly unknown[], number]> = [
    ['Style', STYLE_OPTIONS, 12],
    // 17 measured on mesonart + `typography`, which is ours (#452). The home
    // page has carried a Typography category tile since before the facet
    // rework and there was nothing in the vocabulary for it to mean, so the
    // tile linked to a filter the API rejects.
    ['Subject', SUBJECT_OPTIONS, 18],
    ['Orientation', ORIENTATION_OPTIONS, 6],
    ['Vibe', VIBE_OPTIONS, 4],
    ['Room', ROOM_OPTIONS, 12],
    ['Aesthetic', AESTHETIC_OPTIONS, 12],
    ['Medium', MEDIUM_OPTIONS, 4],
  ];

  for (const [name, options, expected] of cases) {
    it(`${name} has ${expected} options`, () => {
      expect(options).toHaveLength(expected);
    });
  }

  it('carries typography, which mesonart does not (#452)', () => {
    // Deliberately ours. The home page offers a Typography category; a tile
    // is only allowed to link at a value the vocabulary knows, and the tile
    // stays hidden until a product actually carries it.
    expect(SUBJECT_OPTIONS.map((option) => option.id)).toContain('typography');
  });

  it('Color has 13, not the 14 they list — Gray and Grey are one colour', () => {
    // Carrying both would let a shopper tick two options that can never
    // intersect, and split the count for the same paint.
    expect(COLOR_OPTIONS).toHaveLength(13);
    const ids = COLOR_OPTIONS.map((option) => option.id);
    expect(ids).toContain('gray');
    expect(ids).not.toContain('grey');
  });

  it('Uniqueness and Availability each carry their single value', () => {
    expect(UNIQUENESS_OPTIONS.length).toBeGreaterThanOrEqual(1);
    expect(AVAILABILITY_OPTIONS.length).toBeGreaterThanOrEqual(1);
  });
});

describe('shape', () => {
  const everyOption = [
    ...STYLE_OPTIONS,
    ...SUBJECT_OPTIONS,
    ...ORIENTATION_OPTIONS,
    ...COLOR_OPTIONS,
    ...VIBE_OPTIONS,
    ...ROOM_OPTIONS,
    ...AESTHETIC_OPTIONS,
    ...MEDIUM_OPTIONS,
    ...UNIQUENESS_OPTIONS,
    ...AVAILABILITY_OPTIONS,
  ];

  it('every id is kebab-case', () => {
    for (const option of everyOption) {
      expect(option.id, `${option.id} is not kebab-case`).toMatch(
        /^[a-z0-9]+(-[a-z0-9]+)*$/
      );
    }
  });

  it('every option has a human label', () => {
    for (const option of everyOption) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique within each vocabulary', () => {
    for (const options of [
      STYLE_OPTIONS,
      SUBJECT_OPTIONS,
      ORIENTATION_OPTIONS,
      COLOR_OPTIONS,
      VIBE_OPTIONS,
      ROOM_OPTIONS,
      AESTHETIC_OPTIONS,
      MEDIUM_OPTIONS,
    ]) {
      const ids = options.map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every colour carries a swatch', () => {
    for (const color of COLOR_OPTIONS) {
      expect(color.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('taxonomy quirks kept on purpose', () => {
  it('Colorful Art is both a Style and a Subject, as on their storefront', () => {
    expect(STYLE_OPTIONS.map((o) => o.id)).toContain('colorful-art');
    expect(SUBJECT_OPTIONS.map((o) => o.id)).toContain('colorful-art');
  });

  it('Subject keeps both Sea and Sea & Beach despite the overlap', () => {
    const ids = SUBJECT_OPTIONS.map((o) => o.id);
    expect(ids).toContain('sea');
    expect(ids).toContain('sea-and-beach');
  });
});

describe('orientation maps onto the stored enum', () => {
  it('keeps our stored ids rather than renaming to their labels', () => {
    // Renaming portrait -> vertical would churn the size ladders, the seed and
    // the grid E2E for a caption.
    const ids = ORIENTATION_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      'square',
      'portrait',
      'landscape',
      'panoramic',
      'round',
      'set-of-2-3',
    ]);
  });

  it('shows mesonart labels over those ids', () => {
    const byId = new Map(ORIENTATION_OPTIONS.map((o) => [o.id, o.label]));
    expect(byId.get('portrait')).toBe('Vertical');
    expect(byId.get('landscape')).toBe('Horizontal');
    expect(byId.get('round')).toBe('Circle');
  });
});

describe('zod enums', () => {
  it('accept a known value', () => {
    expect(styleSchema.safeParse('wabi-sabi-art').success).toBe(true);
    expect(vibeSchema.safeParse('tranquility-and-zen').success).toBe(true);
    expect(orientationSchema.safeParse('portrait').success).toBe(true);
  });

  it('reject an unknown value, so a typo is a 400 not a silent empty grid', () => {
    expect(styleSchema.safeParse('not-a-style').success).toBe(false);
    expect(vibeSchema.safeParse('vibes').success).toBe(false);
  });
});

describe('FACET_GROUPS', () => {
  it('describes all nine groups for the sidebar to render', () => {
    expect(FACET_GROUPS.length).toBe(10);
  });

  it('marks which facets are single-valued', () => {
    const byKey = new Map(FACET_GROUPS.map((g) => [g.key, g]));
    // One edition type, one availability, one orientation per product.
    expect(byKey.get('uniqueness')?.multi).toBe(false);
    expect(byKey.get('availability')?.multi).toBe(false);
    expect(byKey.get('orientation')?.multi).toBe(false);
    expect(byKey.get('styles')?.multi).toBe(true);
  });
});
