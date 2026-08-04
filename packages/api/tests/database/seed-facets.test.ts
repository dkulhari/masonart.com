/**
 * Deterministic facet assignment for the seed.
 *
 * The vocabularies expanded in #395–#397, but every seeded product still
 * carries the old ad-hoc values (`minimalist` rather than `minimalist-art`),
 * and the five new columns are null. Until this lands, filtering by the new
 * vocabulary matches nothing and the sidebar renders twelve Aesthetic options
 * all reading zero.
 */

import { describe, it, expect } from 'vitest';
import {
  STYLE_OPTIONS,
  SUBJECT_OPTIONS,
  COLOR_OPTIONS,
  ROOM_OPTIONS,
  VIBE_OPTIONS,
  AESTHETIC_OPTIONS,
  MEDIUM_OPTIONS,
  UNIQUENESS_OPTIONS,
  AVAILABILITY_OPTIONS,
} from '@chobii/shared';
import { facetsForProduct } from '../../src/database/seed-facets';

const SAMPLE = Array.from({ length: 41 }, (_, i) => `SKU-${i + 1}`);

describe('determinism', () => {
  it('gives the same product the same facets every time', () => {
    // A reseed must reproduce the catalogue. Otherwise facet counts move
    // between runs and nothing downstream is reproducible.
    for (const sku of SAMPLE.slice(0, 5)) {
      expect(facetsForProduct(sku)).toEqual(facetsForProduct(sku));
    }
  });

  it('gives different products different facets', () => {
    const first = JSON.stringify(facetsForProduct('SKU-1'));
    const different = SAMPLE.slice(1).some(
      (sku) => JSON.stringify(facetsForProduct(sku)) !== first
    );
    expect(different).toBe(true);
  });
});

describe('values come from the vocabularies, never invented', () => {
  const ids = (options: readonly { id: string }[]) =>
    new Set(options.map((o) => o.id));

  const vocabularies: Array<[string, Set<string>, boolean]> = [
    ['styles', ids(STYLE_OPTIONS), true],
    ['subjects', ids(SUBJECT_OPTIONS), true],
    ['colors', ids(COLOR_OPTIONS), true],
    ['rooms', ids(ROOM_OPTIONS), true],
    ['vibe', ids(VIBE_OPTIONS), true],
    ['aesthetic', ids(AESTHETIC_OPTIONS), true],
    ['medium', ids(MEDIUM_OPTIONS), true],
    ['uniqueness', ids(UNIQUENESS_OPTIONS), false],
    ['availability', ids(AVAILABILITY_OPTIONS), false],
  ];

  for (const [facet, vocabulary, isMulti] of vocabularies) {
    it(`${facet} only ever uses known ids`, () => {
      for (const sku of SAMPLE) {
        const assigned = facetsForProduct(sku)[
          facet as keyof ReturnType<typeof facetsForProduct>
        ];
        const values = isMulti ? (assigned as string[]) : [assigned as string];
        for (const value of values) {
          expect(vocabulary.has(value), `${facet}: ${value} is not in the vocabulary`).toBe(true);
        }
      }
    });
  }
});

describe('coverage', () => {
  const collect = (facet: string, isMulti: boolean) => {
    const seen = new Set<string>();
    for (const sku of SAMPLE) {
      const assigned = facetsForProduct(sku)[
        facet as keyof ReturnType<typeof facetsForProduct>
      ];
      for (const value of isMulti ? (assigned as string[]) : [assigned as string]) {
        seen.add(value);
      }
    }
    return seen;
  };

  const cases: Array<[string, readonly { id: string }[], boolean]> = [
    ['styles', STYLE_OPTIONS, true],
    ['subjects', SUBJECT_OPTIONS, true],
    ['colors', COLOR_OPTIONS, true],
    ['rooms', ROOM_OPTIONS, true],
    ['vibe', VIBE_OPTIONS, true],
    ['aesthetic', AESTHETIC_OPTIONS, true],
    ['medium', MEDIUM_OPTIONS, true],
  ];

  for (const [facet, options, isMulti] of cases) {
    it(`every ${facet} option is carried by at least one product`, () => {
      // An option no product carries is a dead row in the sidebar: it renders
      // with a count of 0 and can never be anything else.
      const seen = collect(facet, isMulti);
      const missing = options.map((o) => o.id).filter((id) => !seen.has(id));
      expect(missing, `unreachable ${facet} options: ${missing.join(', ')}`).toEqual([]);
    });
  }
});

describe('shape', () => {
  it('assigns at least one value to every multi facet', () => {
    for (const sku of SAMPLE) {
      const facets = facetsForProduct(sku);
      for (const key of ['styles', 'subjects', 'colors', 'rooms', 'vibe', 'aesthetic', 'medium'] as const) {
        expect(facets[key].length, `${sku} has no ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('never repeats a value within one facet', () => {
    for (const sku of SAMPLE) {
      const facets = facetsForProduct(sku);
      for (const key of ['styles', 'subjects', 'colors', 'rooms', 'vibe', 'aesthetic', 'medium'] as const) {
        expect(new Set(facets[key]).size).toBe(facets[key].length);
      }
    }
  });
});
