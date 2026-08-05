/**
 * Collection contracts — the vocabulary a curated collection is written in.
 *
 * What these tests are guarding is the reason the feature exists. Measured on
 * mesonart 2026-08-05, their Discover chips are collection links spanning
 * style, subject and orientation, plus two entries — Latest Work and
 * Bestseller — that are a date window and a sort with no facet to name at all.
 * A collection therefore cannot be a facet value; it has to carry its own
 * filter payload, and that payload has to be the one the product API already
 * validates or the two will disagree about what a style is.
 */

import { describe, it, expect } from 'vitest';
import {
  collectionKindSchema,
  collectionRuleSchema,
  curatedCollectionSchema,
  createCollectionSchema,
  updateCollectionSchema,
} from '../../src/schemas/collection';
import { STYLE_OPTIONS, SUBJECT_OPTIONS } from '../../src/constants/facets';

const RULE_COLLECTION = {
  id: '3f6d0b3a-4f4f-4a9e-9a41-6f5a4c2c9d01',
  slug: 'wabi-sabi-art',
  title: 'Wabi-Sabi Art',
  subtitle: 'Imperfect, weathered, quiet',
  description: 'Work that finds beauty in wear.',
  kind: 'rule' as const,
  rule: { styles: ['wabi-sabi-art'] },
  imageUrl: null,
  isActive: true,
  showInDiscover: true,
  discoverOrder: 0,
  sortOrder: 0,
  seoTitle: null,
  seoDescription: null,
  createdAt: new Date('2026-08-05T00:00:00.000Z'),
  updatedAt: new Date('2026-08-05T00:00:00.000Z'),
};

describe('collectionKindSchema', () => {
  it('admits exactly the two membership kinds', () => {
    expect(collectionKindSchema.safeParse('rule').success).toBe(true);
    expect(collectionKindSchema.safeParse('manual').success).toBe(true);
    expect(collectionKindSchema.safeParse('smart').success).toBe(false);
  });
});

describe('collectionRuleSchema', () => {
  it('accepts facet values drawn from the shared vocabularies', () => {
    const result = collectionRuleSchema.safeParse({
      styles: [STYLE_OPTIONS[0].id],
      subjects: [SUBJECT_OPTIONS[0].id],
      orientation: 'panoramic',
      priceMin: 1000,
      priceMax: 50000,
      isFeatured: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a style that is not in the vocabulary', () => {
    // A rule naming a style nothing can be tagged with is a rule that renders
    // an empty page. Catch it at authoring time, not on the storefront.
    expect(
      collectionRuleSchema.safeParse({ styles: ['neo-brutalist-art'] }).success
    ).toBe(false);
  });

  it('carries a sort with no facets at all', () => {
    // This is Latest Work and Bestseller — the two mesonart chips no facet
    // vocabulary can express, and the reason a rule is not just a facet id.
    expect(
      collectionRuleSchema.safeParse({ sortBy: 'createdAt', sortOrder: 'desc' })
        .success
    ).toBe(true);
    expect(
      collectionRuleSchema.safeParse({ sortBy: 'salesCount', sortOrder: 'desc' })
        .success
    ).toBe(true);
  });

  it('rejects a sort field the product API cannot order by', () => {
    // The rule is executed through the existing list query. A field it does
    // not know is a 500 at request time instead of a 400 at save time.
    expect(collectionRuleSchema.safeParse({ sortBy: 'relevance' }).success).toBe(
      false
    );
  });

  it('accepts the empty rule — every active product, default order', () => {
    expect(collectionRuleSchema.safeParse({}).success).toBe(true);
  });
});

describe('curatedCollectionSchema', () => {
  it('accepts a well-formed rule collection', () => {
    expect(curatedCollectionSchema.safeParse(RULE_COLLECTION).success).toBe(true);
  });

  it('accepts a manual collection carrying no rule', () => {
    const manual = { ...RULE_COLLECTION, kind: 'manual' as const, rule: null };
    expect(curatedCollectionSchema.safeParse(manual).success).toBe(true);
  });

  it('rejects a rule collection with no rule', () => {
    const broken = { ...RULE_COLLECTION, rule: null };
    expect(curatedCollectionSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a manual collection that also carries a rule', () => {
    // Two sources of membership is one too many: whichever the resolver picks,
    // the other is a lie the admin can still see and edit.
    const broken = { ...RULE_COLLECTION, kind: 'manual' as const };
    expect(curatedCollectionSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects slugs that are not url-safe kebab-case', () => {
    for (const slug of ['Wabi Sabi', 'Wabi-Sabi', 'wabi_sabi', '']) {
      expect(
        curatedCollectionSchema.safeParse({ ...RULE_COLLECTION, slug }).success
      ).toBe(false);
    }
  });

  it('allows discoverOrder to be absent when the collection is not in the rail', () => {
    const hidden = {
      ...RULE_COLLECTION,
      showInDiscover: false,
      discoverOrder: null,
    };
    expect(curatedCollectionSchema.safeParse(hidden).success).toBe(true);
  });
});

describe('createCollectionSchema', () => {
  it('defaults the flags a new collection does not have to state', () => {
    const result = createCollectionSchema.safeParse({
      slug: 'best-selling',
      title: 'Best Sellers',
      kind: 'rule',
      rule: { sortBy: 'salesCount', sortOrder: 'desc' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.showInDiscover).toBe(false);
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('applies the same kind/rule agreement as the full schema', () => {
    expect(
      createCollectionSchema.safeParse({
        slug: 'staff-picks',
        title: 'Staff Picks',
        kind: 'rule',
      }).success
    ).toBe(false);

    expect(
      createCollectionSchema.safeParse({
        slug: 'staff-picks',
        title: 'Staff Picks',
        kind: 'manual',
        rule: { styles: ['pop-art'] },
      }).success
    ).toBe(false);
  });

  it('rejects a create with no title', () => {
    expect(
      createCollectionSchema.safeParse({ slug: 'x', title: '', kind: 'manual' })
        .success
    ).toBe(false);
  });
});

describe('updateCollectionSchema', () => {
  it('accepts a partial patch', () => {
    expect(updateCollectionSchema.safeParse({ title: 'Renamed' }).success).toBe(
      true
    );
  });

  it('still refuses a rule on a patch that turns the collection manual', () => {
    expect(
      updateCollectionSchema.safeParse({
        kind: 'manual',
        rule: { styles: ['pop-art'] },
      }).success
    ).toBe(false);
  });

  it('accepts clearing the rule when switching to manual', () => {
    expect(
      updateCollectionSchema.safeParse({ kind: 'manual', rule: null }).success
    ).toBe(true);
  });
});
