/**
 * ProductImage contract tests
 *
 * The product grid's row alignment rests on one invariant: every stored product
 * image is square. These tests pin the contract that guarantees it, plus the mat
 * constants that the API bakes into pixels and the web CSS mirrors as a token.
 */

import { describe, it, expect } from 'vitest';
import {
  MAT_COLOR,
  MAT_CANVAS,
  MAT_ART_INSET,
  isSquare,
  mainImage,
  sortedImages,
  type ProductImage,
} from '../../src/types/product';

describe('mat constants', () => {
  it('matches the measured mesonart placeholder rgb(250 250 250)', () => {
    expect(MAT_COLOR).toEqual({ r: 250, g: 250, b: 250 });
  });

  it('uses a 1500px master canvas', () => {
    expect(MAT_CANVAS).toBe(1500);
  });

  it('insets art to 88% of the longest side', () => {
    expect(MAT_ART_INSET).toBe(0.88);
  });
});

describe('isSquare', () => {
  const base: ProductImage = {
    id: 'i1',
    url: 'https://cdn/x.webp',
    altText: 'a',
    type: 'main',
    sortOrder: 0,
    width: 1500,
    height: 1500,
    originalKey: 'originals/x.jpg',
  };

  it('accepts an equal-sided image', () => {
    expect(isSquare(base)).toBe(true);
  });

  it('rejects a non-square image', () => {
    expect(isSquare({ ...base, height: 2000 })).toBe(false);
  });
});

describe('sortedImages / mainImage', () => {
  const img = (id: string, type: ProductImage['type'], sortOrder: number) =>
    ({ id, type, sortOrder }) as Pick<ProductImage, 'id' | 'type' | 'sortOrder'>;

  it('puts the main image first regardless of sortOrder', () => {
    const out = sortedImages([
      img('a', 'room-mockup', 0),
      img('b', 'main', 9),
      img('c', 'detail', 1),
    ]);
    expect(out.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('orders the remainder by sortOrder', () => {
    const out = sortedImages([
      img('c', 'detail', 2),
      img('a', 'room-mockup', 0),
      img('b', 'texture', 1),
    ]);
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const input = [img('a', 'detail', 1), img('b', 'main', 0)];
    sortedImages(input);
    expect(input.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('mainImage prefers type main over sort order', () => {
    expect(mainImage([img('a', 'detail', 0), img('b', 'main', 5)])?.id).toBe('b');
  });

  it('mainImage falls back to the lowest sortOrder when no main exists', () => {
    expect(mainImage([img('a', 'detail', 3), img('b', 'texture', 1)])?.id).toBe('b');
  });

  it('mainImage returns undefined for empty, null and undefined', () => {
    expect(mainImage([])).toBeUndefined();
    expect(mainImage(null)).toBeUndefined();
    expect(mainImage(undefined)).toBeUndefined();
  });
});
