/**
 * Schema support for the expanded facet set.
 *
 * These are schema-shape assertions rather than query tests on purpose: the
 * route suites mock `db`, so nothing else in the API catches a column that
 * does not exist (see #387, where `products.isActive` passed 17 green tests).
 */

import { describe, it, expect } from 'vitest';
import { products, orientationEnum } from '../../src/database/schema/products';
import {
  VIBE_OPTIONS,
  AESTHETIC_OPTIONS,
  MEDIUM_OPTIONS,
  ORIENTATION_OPTIONS,
} from '@chobii/shared';

describe('multi-valued facet columns', () => {
  for (const column of ['vibe', 'aesthetic', 'medium'] as const) {
    it(`products.${column} exists`, () => {
      expect(products[column]).toBeDefined();
    });
  }

  it('they are arrays, like the facet columns that came before them', () => {
    for (const column of ['vibe', 'aesthetic', 'medium'] as const) {
      expect(products[column].dataType).toBe('array');
    }
  });
});

describe('single-valued facet columns', () => {
  for (const column of ['uniqueness', 'availability'] as const) {
    it(`products.${column} exists`, () => {
      expect(products[column]).toBeDefined();
    });

    it(`products.${column} is scalar, not an array`, () => {
      // A product has ONE edition type and ONE availability. Modelling those
      // as text[] invites a row that is both open and limited edition.
      expect(products[column].dataType).not.toBe('array');
    });
  }
});

describe('orientation enum', () => {
  it('carries every orientation the facet vocabulary offers', () => {
    for (const option of ORIENTATION_OPTIONS) {
      expect(
        orientationEnum.enumValues,
        `${option.id} is offered as a filter but is not a storable value`
      ).toContain(option.id);
    }
  });

  it('still carries the values the size ladders depend on', () => {
    // #386 keys getSizesForOrientation off these. Losing one silently gives
    // every product of that orientation the portrait fallback ladder.
    for (const value of ['square', 'portrait', 'landscape', 'panoramic']) {
      expect(orientationEnum.enumValues).toContain(value);
    }
  });
});

describe('the vocabularies the columns are meant to store', () => {
  it('are non-empty, so a migration cannot land against nothing', () => {
    expect(VIBE_OPTIONS.length).toBeGreaterThan(0);
    expect(AESTHETIC_OPTIONS.length).toBeGreaterThan(0);
    expect(MEDIUM_OPTIONS.length).toBeGreaterThan(0);
  });
});
