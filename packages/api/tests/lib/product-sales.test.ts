/**
 * The units-sold correlated subquery, checked at the level of the SQL it emits.
 *
 * `unitsSoldSql()` is only ever exercised through route suites that mock `db`,
 * and a mocked `db` accepts any query object at all — it never renders one, let
 * alone sends it to Postgres. So the one thing that can actually be wrong here,
 * the text of the subquery, was unasserted anywhere: the admin product list
 * answered 500 on every request for as long as the helper had existed, and
 * every unit test still passed (#657).
 *
 * The trap is specific to drizzle. `PgDialect.buildSelection` takes an
 * `isSingleTable` flag — true whenever the select has no joins — and under it
 * rewrites EVERY `Column` chunk of a selected `sql` template to a bare
 * identifier, dropping the table qualifier. That is right for a top-level
 * column reference and catastrophic inside a correlated subquery: `${products.id}`
 * becomes `"id"`, which no longer names the outer row but whatever `id` the
 * subquery's own FROM happens to expose.
 *
 * Hence the assertions below are on rendered text rather than on results. The
 * qualifier is the invariant; a passing route test is not evidence of it.
 *
 * @see packages/api/src/lib/product-sales.ts
 * @see packages/api/src/routes/admin/products.ts
 */

import { describe, it, expect } from 'vitest';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { unitsSoldSql, VOIDED_ORDER_STATUSES } from '../../src/lib/product-sales';
import { products } from '../../src/database/schema/products';

/** Render the helper the way the admin list uses it: selected, no joins. */
function renderInSingleTableSelect(): string {
  return new QueryBuilder()
    .select({ unitsSold: unitsSoldSql() })
    .from(products)
    .toSQL().sql;
}

/** Render it the way the storefront uses it: inside ORDER BY, with a join. */
function renderInJoinedSelect(): string {
  return new QueryBuilder()
    .select({ id: products.id })
    .from(products)
    .orderBy(unitsSoldSql())
    .toSQL().sql;
}

describe('unitsSoldSql', () => {
  it('assumes the schema it correlates against', () => {
    // If either of these ever moves, the raw SQL below is silently wrong and
    // no mocked `db` will say so.
    expect(products.id).toBeDefined();
    expect(products.id.name).toBe('id');
    expect(
      (products as unknown as Record<symbol, unknown>)[Symbol.for('drizzle:Name')]
    ).toBe('products');
  });

  it('correlates against a table-qualified products.id when selected without joins', () => {
    const rendered = renderInSingleTableSelect();

    expect(rendered).toContain('order_items.product_id = "products"."id"');
  });

  it('never emits a bare "id" that the subquery FROM would capture', () => {
    // The actual #657 failure: `where order_items.product_id = "id"`, which
    // Postgres rejects as `column reference "id" is ambiguous` (42702) because
    // both `order_items` and `orders` expose an `id`. Had only one of them, it
    // would have resolved to the wrong table and returned wrong numbers in
    // silence instead.
    for (const rendered of [renderInSingleTableSelect(), renderInJoinedSelect()]) {
      expect(rendered).not.toMatch(/order_items\.product_id\s*=\s*"id"/);
    }
  });

  it('keeps the correlation qualified in a joined query too', () => {
    expect(renderInJoinedSelect()).toContain(
      'order_items.product_id = "products"."id"'
    );
  });

  it('binds every voided status as its own parameter', () => {
    const { sql: text, params } = new QueryBuilder()
      .select({ unitsSold: unitsSoldSql() })
      .from(products)
      .toSQL();

    expect(text).toContain('orders.status not in (');
    for (const status of VOIDED_ORDER_STATUSES) {
      expect(params).toContain(status);
    }
  });
});
