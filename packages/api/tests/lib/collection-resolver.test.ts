/**
 * Collection resolver — merging a stored rule with what the shopper asked for.
 *
 * The rule the whole file exists to enforce: **a shopper narrowing inside a
 * collection must never widen out of it.** Facets on a collection page are a
 * refinement of the collection, not a fresh query, so every group intersects.
 * Get this wrong in the union direction and "Pop Art" starts showing wabi-sabi
 * the moment somebody ticks a second style.
 *
 * The empty intersection is a real answer, not an error: a shopper who filters
 * a style-scoped collection down to a style it does not contain should see an
 * empty grid, which is true, rather than the whole catalogue, which is a lie.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeCollectionFilters,
  resolveCollectionSort,
  IMPOSSIBLE,
} from '../../src/lib/collection-resolver';

describe('array facets intersect', () => {
  it('takes the rule alone when the shopper asked for nothing', () => {
    const merged = mergeCollectionFilters({ styles: ['pop-art'] }, {});
    expect(merged).not.toBe(IMPOSSIBLE);
    expect(merged && merged.styles).toEqual(['pop-art']);
  });

  it('takes the shopper alone when the rule constrains nothing', () => {
    const merged = mergeCollectionFilters({}, { styles: ['pop-art'] });
    expect(merged && merged.styles).toEqual(['pop-art']);
  });

  it('narrows to the overlap when both name the same group', () => {
    const merged = mergeCollectionFilters(
      { styles: ['pop-art', 'graffiti-art', 'bohemian-art'] },
      { styles: ['graffiti-art', 'bohemian-art'] }
    );
    expect(merged && merged.styles).toEqual(['graffiti-art', 'bohemian-art']);
  });

  it('is IMPOSSIBLE when the overlap is empty — never the union', () => {
    // The bug this test exists to prevent: a shopper ticking a style the
    // collection does not carry, and being shown that style anyway.
    const merged = mergeCollectionFilters(
      { styles: ['pop-art'] },
      { styles: ['ukiyo-e-art'] }
    );
    expect(merged).toBe(IMPOSSIBLE);
  });

  it('ANDs across different groups rather than intersecting them', () => {
    const merged = mergeCollectionFilters(
      { styles: ['pop-art'] },
      { colors: ['blue'] }
    );
    expect(merged && merged.styles).toEqual(['pop-art']);
    expect(merged && merged.colors).toEqual(['blue']);
  });

  it('intersects every multi-valued group, not just styles', () => {
    const merged = mergeCollectionFilters(
      { subjects: ['abstract', 'city'], rooms: ['bedroom', 'kitchen'] },
      { subjects: ['city'], rooms: ['kitchen'] }
    );
    expect(merged && merged.subjects).toEqual(['city']);
    expect(merged && merged.rooms).toEqual(['kitchen']);
  });
});

describe('scalar facets agree or the query is impossible', () => {
  it('keeps the rule value when the shopper repeats it', () => {
    const merged = mergeCollectionFilters(
      { orientation: 'panoramic' },
      { orientation: 'panoramic' }
    );
    expect(merged && merged.orientation).toBe('panoramic');
  });

  it('is IMPOSSIBLE when they disagree', () => {
    const merged = mergeCollectionFilters(
      { orientation: 'panoramic' },
      { orientation: 'square' }
    );
    expect(merged).toBe(IMPOSSIBLE);
  });

  it('applies the same rule to the boolean flags', () => {
    expect(
      mergeCollectionFilters({ isAiGenerated: false }, { isAiGenerated: true })
    ).toBe(IMPOSSIBLE);
    const agreed = mergeCollectionFilters(
      { isFeatured: true },
      { isFeatured: true }
    );
    expect(agreed && agreed.isFeatured).toBe(true);
  });
});

describe('price ranges intersect', () => {
  it('takes the tighter bound from each side', () => {
    const merged = mergeCollectionFilters(
      { priceMin: 1000, priceMax: 90000 },
      { priceMin: 5000, priceMax: 50000 }
    );
    expect(merged && merged.priceMin).toBe(5000);
    expect(merged && merged.priceMax).toBe(50000);
  });

  it('is IMPOSSIBLE when the ranges do not overlap', () => {
    const merged = mergeCollectionFilters(
      { priceMax: 1000 },
      { priceMin: 5000 }
    );
    expect(merged).toBe(IMPOSSIBLE);
  });
});

describe('sort', () => {
  it('falls back to the platform default when neither says', () => {
    expect(resolveCollectionSort({}, {})).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it("uses the collection's sort when the shopper has not chosen", () => {
    // This is Best Sellers: the collection IS a sort, and arriving at it must
    // apply that sort without the shopper touching the dropdown.
    expect(
      resolveCollectionSort({ sortBy: 'salesCount', sortOrder: 'desc' }, {})
    ).toEqual({ sortBy: 'salesCount', sortOrder: 'desc' });
  });

  it('lets an explicit shopper sort win', () => {
    expect(
      resolveCollectionSort(
        { sortBy: 'salesCount', sortOrder: 'desc' },
        { sortBy: 'basePrice', sortOrder: 'asc' }
      )
    ).toEqual({ sortBy: 'basePrice', sortOrder: 'asc' });
  });

  it('is not a facet — a sort-only rule constrains nothing', () => {
    // Latest Work and Best Sellers carry no facets at all. The merge must not
    // invent one.
    const merged = mergeCollectionFilters(
      { sortBy: 'salesCount', sortOrder: 'desc' },
      {}
    );
    expect(merged).not.toBe(IMPOSSIBLE);
    expect(merged && merged.styles).toBeUndefined();
    expect(merged && Object.keys(merged)).not.toContain('sortBy');
  });
});

describe('the empty rule', () => {
  it('means every product, not no products', () => {
    const merged = mergeCollectionFilters({}, {});
    expect(merged).not.toBe(IMPOSSIBLE);
    expect(merged).toEqual({});
  });
});
