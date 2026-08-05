/**
 * Schema support for curated collections.
 *
 * Schema-shape assertions rather than query tests, for the reason
 * product-facet-columns.test.ts records: the route suites mock `db`, so nothing
 * else in the API catches a column that does not exist (#387, where
 * `products.isActive` passed 17 green tests).
 */

import { describe, it, expect } from 'vitest';
import {
  collections,
  collectionProducts,
  collectionKindEnum,
} from '../../src/database/schema/collections';
import { products } from '../../src/database/schema/products';

describe('collections table', () => {
  for (const column of [
    'id',
    'slug',
    'title',
    'subtitle',
    'description',
    'kind',
    'rule',
    'imageUrl',
    'isActive',
    'showInDiscover',
    'discoverOrder',
    'sortOrder',
    'seoTitle',
    'seoDescription',
    'createdAt',
    'updatedAt',
  ] as const) {
    it(`collections.${column} exists`, () => {
      expect(collections[column]).toBeDefined();
    });
  }

  it('stores the rule as json, not as text', () => {
    // The rule is a structured filter payload the resolver reads field by
    // field. Stored as text it would be parsed at every call site, and one of
    // them would eventually forget.
    expect(collections.rule.dataType).toBe('json');
  });

  it('carries the membership kind as a closed enum', () => {
    expect(collectionKindEnum.enumValues).toEqual(['rule', 'manual']);
  });

  it('makes the slug unique — it is the URL', () => {
    expect(collections.slug.isUnique).toBe(true);
  });

  it('requires a slug, a title and a kind', () => {
    expect(collections.slug.notNull).toBe(true);
    expect(collections.title.notNull).toBe(true);
    expect(collections.kind.notNull).toBe(true);
  });

  it('leaves rule, image and discoverOrder nullable', () => {
    // A manual collection has no rule, an un-illustrated one falls back to a
    // representative product, and a collection outside the rail has no place
    // in its order.
    expect(collections.rule.notNull).toBe(false);
    expect(collections.imageUrl.notNull).toBe(false);
    expect(collections.discoverOrder.notNull).toBe(false);
  });

  it('defaults a new collection to active and out of the rail', () => {
    expect(collections.isActive.hasDefault).toBe(true);
    expect(collections.showInDiscover.hasDefault).toBe(true);
  });
});

describe('collection_products join', () => {
  for (const column of ['collectionId', 'productId', 'position'] as const) {
    it(`collectionProducts.${column} exists`, () => {
      expect(collectionProducts[column]).toBeDefined();
    });
  }

  it('requires a position — the order IS the data', () => {
    // Without it a manual collection is a set, and "these six, in this order"
    // is the only thing a rule cannot express.
    expect(collectionProducts.position.notNull).toBe(true);
  });

  it('points at both parents', () => {
    expect(collectionProducts.collectionId.notNull).toBe(true);
    expect(collectionProducts.productId.notNull).toBe(true);
  });

  it('uses the same id type products does, so the FK can exist at all', () => {
    expect(collectionProducts.productId.columnType).toBe(products.id.columnType);
  });
});
