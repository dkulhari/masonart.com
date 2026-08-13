/**
 * Orientation derived from the pixels rather than typed by hand.
 *
 * The bug this exists to prevent is #545: `products.orientation` described an
 * invented product while the artwork came from somebody else's photograph, and
 * 27 of 41 rows disagreed with their own picture. Nothing measured, so nothing
 * noticed — the storefront crops from this column, so the chips simply rendered
 * wrong and looked plausible.
 */

import { describe, it, expect } from 'vitest';
import {
  ORIENTATION_RATIO_BREAKS,
  PANEL_COUNT_ORIENTATIONS,
  orientationFromRatio,
  orientationFromArtBox,
  orientationContradictingArt,
} from '../../src/constants/orientation';

describe('orientationFromRatio', () => {
  it('names each band at its own boundary', () => {
    expect(orientationFromRatio(ORIENTATION_RATIO_BREAKS.panoramic)).toBe(
      'panoramic'
    );
    expect(orientationFromRatio(ORIENTATION_RATIO_BREAKS.landscape)).toBe(
      'landscape'
    );
    expect(orientationFromRatio(ORIENTATION_RATIO_BREAKS.square)).toBe('square');
  });

  it('calls anything narrower than the square band portrait', () => {
    expect(orientationFromRatio(ORIENTATION_RATIO_BREAKS.square - 0.001)).toBe(
      'portrait'
    );
  });

  it('reproduces the catalogue measurements that #545 was filed over', () => {
    // colorful-art: declared panoramic, measured 0.52. The example in the
    // ticket body.
    expect(orientationFromRatio(0.52)).toBe('portrait');
    // cosmic-harmony, once the wall behind the canvas is trimmed off.
    expect(orientationFromRatio(0.51)).toBe('portrait');
    // create-every-day — portrait, but only just.
    expect(orientationFromRatio(0.78)).toBe('portrait');
    // A true 3:1 panorama.
    expect(orientationFromRatio(3)).toBe('panoramic');
  });

  it('refuses a ratio that cannot describe a picture', () => {
    expect(orientationFromRatio(0)).toBeUndefined();
    expect(orientationFromRatio(-1)).toBeUndefined();
    expect(orientationFromRatio(Number.NaN)).toBeUndefined();
    expect(orientationFromRatio(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('orientationFromArtBox', () => {
  it('measures the box rather than the canvas it sits on', () => {
    // cosmic-harmony's stored artBox. The canvas is square; the art is not.
    expect(
      orientationFromArtBox({ x: 0.293, y: 0.077, w: 0.416, h: 0.819 })
    ).toBe('portrait');
  });

  it('has no answer without a box', () => {
    expect(orientationFromArtBox(undefined)).toBeUndefined();
    expect(orientationFromArtBox({ x: 0, y: 0, w: 0.5, h: 0 })).toBeUndefined();
  });
});

describe('orientationContradictingArt', () => {
  it('returns the measured value when the column disagrees with the picture', () => {
    expect(
      orientationContradictingArt('square', {
        x: 0.293,
        y: 0.077,
        w: 0.416,
        h: 0.819,
      })
    ).toBe('portrait');
  });

  it('stays quiet when the column and the picture agree', () => {
    expect(
      orientationContradictingArt('portrait', {
        x: 0.293,
        y: 0.077,
        w: 0.416,
        h: 0.819,
      })
    ).toBeUndefined();
  });

  it('exempts orientations that count panels rather than describe a shape', () => {
    // paper-layers is two panels with a wall gutter between them. Measured as
    // one rectangle it reads 2.08 — panoramic — and it is not.
    for (const orientation of PANEL_COUNT_ORIENTATIONS) {
      expect(
        orientationContradictingArt(orientation, {
          x: 0.1,
          y: 0.3,
          w: 0.8,
          h: 0.385,
        })
      ).toBeUndefined();
    }
  });

  it('exempts round, which no bounding box can confirm', () => {
    expect(
      orientationContradictingArt('round', { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    ).toBeUndefined();
  });

  it('stays quiet when there is nothing to measure', () => {
    expect(orientationContradictingArt('square', undefined)).toBeUndefined();
  });
});
