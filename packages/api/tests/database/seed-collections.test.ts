/**
 * The collections the storefront ships with.
 *
 * The rail stops reading `STYLE_OPTIONS` in #469. If nothing has been seeded by
 * then, every chip disappears on deploy — so these fourteen rows are what makes
 * the storefront change not also a content change.
 *
 * Twelve of them are the styles, derived from the vocabulary rather than
 * retyped. The other two are the point of the whole feature: Latest Work and
 * Best Sellers are a date window and a sort, and no facet vocabulary — ours or
 * mesonart's — can name them.
 */

import { describe, it, expect } from 'vitest';
import { buildSeedCollections } from '../../src/database/seed-collections';
import { STYLE_OPTIONS, collectionRuleSchema } from '@chobii/shared';

const seeded = buildSeedCollections();
const bySlug = (slug: string) => seeded.find((c) => c.slug === slug);

describe('what gets seeded', () => {
  it('is one per style plus the two merchandising collections', () => {
    expect(seeded).toHaveLength(STYLE_OPTIONS.length + 2);
  });

  it('derives the style collections from the vocabulary, not a retyped list', () => {
    // A hardcoded copy here restarts the drift #395 ended.
    for (const style of STYLE_OPTIONS) {
      const collection = bySlug(style.id);
      expect(collection, `no collection for ${style.id}`).toBeDefined();
      expect(collection!.title).toBe(style.label);
    }
  });

  it('gives every collection a unique slug', () => {
    const slugs = seeded.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('the style collections', () => {
  it('carry a rule naming exactly their own style', () => {
    for (const style of STYLE_OPTIONS) {
      expect(bySlug(style.id)!.rule).toEqual({ styles: [style.id] });
    }
  });

  it('are all in the Discover rail, in vocabulary order', () => {
    const orders = STYLE_OPTIONS.map((s) => bySlug(s.id)!.discoverOrder);
    expect(orders).toEqual(STYLE_OPTIONS.map((_, index) => index));
    expect(STYLE_OPTIONS.every((s) => bySlug(s.id)!.showInDiscover)).toBe(true);
  });
});

describe('the two collections no facet can express', () => {
  it('Latest Work is a sort with no facets at all', () => {
    const latest = bySlug('new');
    expect(latest).toBeDefined();
    expect(latest!.rule).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('Best Sellers is a sort with no facets at all', () => {
    const best = bySlug('best-selling');
    expect(best).toBeDefined();
    expect(best!.rule).toEqual({ sortBy: 'salesCount', sortOrder: 'desc' });
  });

  it('places them after the styles rather than interleaved', () => {
    expect(bySlug('new')!.discoverOrder).toBe(STYLE_OPTIONS.length);
    expect(bySlug('best-selling')!.discoverOrder).toBe(STYLE_OPTIONS.length + 1);
  });
});

describe('every seeded rule is valid', () => {
  it('parses under the shared contract', () => {
    // The seed is the first consumer of collectionRuleSchema. If it can emit a
    // rule the schema rejects, the admin form will be able to as well.
    for (const collection of seeded) {
      const result = collectionRuleSchema.safeParse(collection.rule);
      expect(result.success, `${collection.slug}: ${JSON.stringify(collection.rule)}`).toBe(true);
    }
  });

  it('is a rule collection, never manual', () => {
    expect(seeded.every((c) => c.kind === 'rule')).toBe(true);
  });

  it('is active', () => {
    expect(seeded.every((c) => c.isActive)).toBe(true);
  });
});

describe('determinism', () => {
  it('produces the same rows every call', () => {
    // A reseed must reproduce the same rail. seed-facets.ts makes the same
    // promise for the same reason: counts are asserted in tests and eyeballed
    // in the UI, and both are meaningless if the input moves.
    expect(buildSeedCollections()).toEqual(buildSeedCollections());
  });
});
