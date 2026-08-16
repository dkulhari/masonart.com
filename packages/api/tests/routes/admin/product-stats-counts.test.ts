/**
 * GET /api/admin/products/stats — the counts, against real rows (#602).
 *
 * The sibling suite (product-stats.test.ts) mocks the driver and can only
 * prove the handler asks a question. What broke on the dashboard was the
 * *answer*: four numbers that looked plausible and were fabricated. A mocked
 * query chain cannot tell a correct GROUP BY from an incorrect one, so the
 * classification rules — which product counts as low stock, which as out of
 * stock, which statuses are in scope — are pinned here against rows that
 * actually go through Postgres.
 *
 * This suite is additive, not destructive: it inserts its own `T602-` rows and
 * deletes them again, and asserts DELTAS rather than absolute totals so it is
 * correct against a dev database that already holds a catalogue (and against
 * a sibling agent inserting rows at the same time).
 *
 * It skips loudly when the database is unreachable. A skip is not a pass —
 * see the ticket's verification note for the run that actually exercised it.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Hono } from 'hono';
import { inArray, like } from 'drizzle-orm';
import '../../setup';

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireContentManager: async (_c: unknown, next: () => Promise<void>) => next(),
  optionalAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { db } from '../../../src/database';
import {
  products,
  productVariants,
} from '../../../src/database/schema/products';
import { adminProductsApp } from '../../../src/routes/admin/products';

const app = new Hono();
app.route('/api/admin/products', adminProductsApp);

interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

/** SKU/slug prefix that makes this suite's rows identifiable and reapable. */
const PREFIX = 'T602-';

type Fixture = {
  key: string;
  status: 'draft' | 'active' | 'archived';
  /** [stockQuantity, lowStockThreshold, isActive] per variant. */
  variants: Array<[number, number, boolean]>;
};

/**
 * Each fixture pins one classification rule. The comment on each is the rule.
 */
const FIXTURES: Fixture[] = [
  // Healthy: well above its threshold, counts only toward total + active.
  { key: 'healthy', status: 'active', variants: [[50, 5, true]] },
  // Low: below threshold with stock left to sell.
  { key: 'low', status: 'active', variants: [[3, 5, true]] },
  // Out: every sellable variant at zero.
  { key: 'out', status: 'active', variants: [[0, 5, true], [0, 5, true]] },
  // Draft: not sellable, so not an active-catalogue stock alarm.
  { key: 'draft-low', status: 'draft', variants: [[1, 5, true]] },
  // Archived: same, and it must not inflate the alarms either.
  { key: 'archived-out', status: 'archived', variants: [[0, 5, true]] },
  // Boundary, above: threshold + 1 is NOT low.
  { key: 'above-threshold', status: 'active', variants: [[6, 5, true]] },
  // Boundary, at: stock EQUAL to the threshold IS low ("5 left, threshold 5"
  // is the moment to reorder, not the moment after).
  { key: 'at-threshold', status: 'active', variants: [[5, 5, true]] },
  // One size nearly gone, another full: the product is low. A size customers
  // are about to be unable to buy is actionable even if the range is stocked.
  { key: 'mixed', status: 'active', variants: [[2, 5, true], [100, 5, true]] },
  // Inactive variants are invisible to both alarms: this product's only
  // *sellable* variant is healthy.
  {
    key: 'inactive-variant-low',
    status: 'active',
    variants: [[0, 5, false], [40, 5, true]],
  },
];

/** What the fixtures above must move each counter by. */
const EXPECTED_DELTA: ProductStats = {
  totalProducts: 9,
  activeProducts: 7,
  lowStockProducts: 3, // low, at-threshold, mixed
  outOfStockProducts: 1, // out
};

let databaseAvailable = false;
let insertedProductIds: string[] = [];

async function fetchStats(): Promise<ProductStats> {
  const res = await app.request('/api/admin/products/stats');
  expect(res.status).toBe(200);
  return (await res.json()) as ProductStats;
}

let baseline: ProductStats | null = null;

beforeAll(async () => {
  /**
   * Probe the DRIVER, not the endpoint.
   *
   * The first cut of this wrapped the baseline `/stats` request in the same
   * try/catch, so a missing route read as "database unreachable" and the whole
   * suite skipped itself green against exactly the bug it was written for. The
   * connectivity check has to touch nothing but the connection.
   */
  try {
    await db.select({ id: products.id }).from(products).limit(1);
    databaseAvailable = true;
  } catch (error) {
    console.warn(
      `⏭️  Skipping #602 stats count assertions: database unreachable (${(error as Error).message}). ` +
        'Run with DATABASE_URL pointed at the chobii Postgres to exercise them.'
    );
    return;
  }

  // Reap anything a previously killed run left behind before measuring the
  // baseline, or its rows land in the "before" numbers and the deltas lie.
  await db.delete(products).where(like(products.sku, `${PREFIX}%`));

  baseline = await fetchStats();

  for (const fixture of FIXTURES) {
    const [row] = await db
      .insert(products)
      .values({
        sku: `${PREFIX}${fixture.key}`,
        title: `#602 fixture ${fixture.key}`,
        slug: `${PREFIX}${fixture.key}`.toLowerCase(),
        basePrice: '1999.00',
        orientation: 'portrait',
        status: fixture.status,
      })
      .returning({ id: products.id });

    insertedProductIds.push(row.id);

    await db.insert(productVariants).values(
      fixture.variants.map(([stockQuantity, lowStockThreshold, isActive], i) => ({
        productId: row.id,
        sizeLabel: `${12 + i}x${16 + i} inches`,
        widthInches: 12 + i,
        heightInches: 16 + i,
        price: '1999.00',
        stockQuantity,
        lowStockThreshold,
        isInStock: stockQuantity > 0,
        isActive,
        sortOrder: i,
      }))
    );
  }
}, 30000);

afterAll(async () => {
  if (insertedProductIds.length > 0) {
    // Variants cascade on product delete.
    await db.delete(products).where(inArray(products.id, insertedProductIds));
    insertedProductIds = [];
  }
});

describe('GET /api/admin/products/stats — counts against seeded rows', () => {
  it('counts every product row in totalProducts', async () => {
    if (!databaseAvailable || !baseline) return;

    const stats = await fetchStats();

    expect(stats.totalProducts - baseline.totalProducts).toBe(
      EXPECTED_DELTA.totalProducts
    );
  });

  it('counts only status=active in activeProducts', async () => {
    if (!databaseAvailable || !baseline) return;

    const stats = await fetchStats();

    expect(stats.activeProducts - baseline.activeProducts).toBe(
      EXPECTED_DELTA.activeProducts
    );
  });

  it('lands a product with stock below its threshold in lowStockProducts', async () => {
    if (!databaseAvailable || !baseline) return;

    const stats = await fetchStats();

    expect(stats.lowStockProducts - baseline.lowStockProducts).toBe(
      EXPECTED_DELTA.lowStockProducts
    );
  });

  it('counts a product whose sellable variants are all at zero as out of stock', async () => {
    if (!databaseAvailable || !baseline) return;

    const stats = await fetchStats();

    expect(stats.outOfStockProducts - baseline.outOfStockProducts).toBe(
      EXPECTED_DELTA.outOfStockProducts
    );
  });

  it('counts a multi-variant product once, not once per variant', async () => {
    if (!databaseAvailable || !baseline) return;

    // `mixed` has two variants and one of them is low. Counting rows rather
    // than products would push the low delta past 3.
    const stats = await fetchStats();

    expect(stats.lowStockProducts - baseline.lowStockProducts).toBeLessThanOrEqual(
      EXPECTED_DELTA.lowStockProducts
    );
  });

  it('never counts a product as both low and out of stock', async () => {
    if (!databaseAvailable || !baseline) return;

    const stats = await fetchStats();
    const low = stats.lowStockProducts - baseline.lowStockProducts;
    const out = stats.outOfStockProducts - baseline.outOfStockProducts;

    // `out` has two zero variants; if zero counted as "below threshold" too it
    // would appear in both tiles and an operator would double-count the work.
    expect(low + out).toBe(
      EXPECTED_DELTA.lowStockProducts + EXPECTED_DELTA.outOfStockProducts
    );
  });
});
