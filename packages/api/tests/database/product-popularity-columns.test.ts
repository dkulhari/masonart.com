/**
 * Schema support for the curator popularity pin.
 *
 * Shape assertions on the drizzle schema object, matching
 * product-facet-columns.test.ts: the route suites mock `db`, so nothing else
 * in the API catches a column that does not exist (see #387, where
 * `products.isActive` passed 17 green tests against a table that has
 * `status`).
 *
 * The pin is a *reordering* device. It never writes a sales number — the
 * Best-selling sort reads real units from order_items and the pin only lifts
 * a product above that ordering, so an admin can always see the two disagree.
 */

import { describe, it, expect } from 'vitest';
import { products } from '../../src/database/schema/products';
import { orderItems } from '../../src/database/schema/orders';

describe('curator popularity pin columns', () => {
  it('products.isPopular exists', () => {
    expect(products.isPopular).toBeDefined();
  });

  it('products.popularOrder exists', () => {
    expect(products.popularOrder).toBeDefined();
  });

  it('mirrors the isFeatured pair it sits beside', () => {
    // Same shape as featured: a not-null boolean flag plus a nullable
    // integer rank. Divergence here would mean the admin form and the
    // ORDER BY clause each need a second code path.
    expect(products.isPopular.notNull).toBe(products.isFeatured.notNull);
    expect(products.isPopular.hasDefault).toBe(products.isFeatured.hasDefault);
    expect(products.popularOrder.notNull).toBe(products.featuredOrder.notNull);
  });

  it('isPopular defaults to false — a pin is a deliberate act', () => {
    expect(products.isPopular.default).toBe(false);
  });

  it('popularOrder is an integer rank, not text', () => {
    expect(products.popularOrder.columnType).toBe(products.featuredOrder.columnType);
  });
});

describe('sales aggregate join column', () => {
  it('order_items still carries productId', () => {
    // The Best-selling aggregate groups on this. If it ever moves, the sort
    // silently returns zero for everything rather than failing loudly.
    expect(orderItems.productId).toBeDefined();
  });

  it('order_items carries the quantity being summed', () => {
    expect(orderItems.quantity).toBeDefined();
    expect(orderItems.quantity.notNull).toBe(true);
  });
});
