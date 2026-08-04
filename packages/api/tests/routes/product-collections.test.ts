/**
 * GET /api/products/collections — the Discover chip carousel's data (§1.3.2).
 *
 * mesonart runs a scrollable rail of circular collection chips above the
 * grid. We had no collection entity at all, so the chips read the style
 * vocabulary in @chobii/shared — the same list the filter sidebar and the
 * API validator already use. A fourth parallel vocabulary here would be the
 * exact disease #395-#399 removed.
 *
 * Imagery has no source of its own either: each chip borrows the main image
 * of a representative product in that style.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { STYLE_OPTIONS } from '@chobii/shared';
import '../setup';

const selectMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { PRODUCT_LIST: 'products:list:', PRODUCT: 'products:' },
}));

import { productsApp } from '../../src/routes/products';

const app = new Hono();
app.route('/api/products', productsApp);

function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'groupBy', 'orderBy', 'limit', 'offset', 'leftJoin']) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

const [firstStyle, secondStyle] = STYLE_OPTIONS;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/products/collections', () => {
  it('is not shadowed by the :slug route', async () => {
    queueSelects([]);
    const res = await app.request('/api/products/collections');
    expect(res.status).toBe(200);
  });

  it('returns id, label, count and image per collection', async () => {
    queueSelects([
      { style: firstStyle.id, count: 12, image: 'https://cdn.test/a.webp' },
    ]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections).toEqual([
      {
        id: firstStyle.id,
        label: firstStyle.label,
        count: 12,
        image: 'https://cdn.test/a.webp',
      },
    ]);
  });

  it('takes labels from the shared vocabulary, not from the database', async () => {
    // The database column holds ids. If a label ever came back from the
    // query instead, the chip row and the filter sidebar would drift apart.
    queueSelects([{ style: secondStyle.id, count: 3, image: null }]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections[0].label).toBe(secondStyle.label);
  });

  it('omits collections with no active products', async () => {
    // A chip leading to an empty grid is worse than no chip.
    queueSelects([{ style: firstStyle.id, count: 4, image: null }]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections).toHaveLength(1);
    expect(body.collections.every((c: { count: number }) => c.count > 0)).toBe(true);
  });

  it('ignores a style value the vocabulary does not contain', async () => {
    // Free text in the column must not become a chip — it has no label and
    // filtering on it would 400.
    queueSelects([
      { style: 'some-legacy-tag', count: 9, image: null },
      { style: firstStyle.id, count: 1, image: null },
    ]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections.map((c: { id: string }) => c.id)).toEqual([firstStyle.id]);
  });

  it('keeps the vocabulary order rather than the query order', async () => {
    queueSelects([
      { style: secondStyle.id, count: 1, image: null },
      { style: firstStyle.id, count: 99, image: null },
    ]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections.map((c: { id: string }) => c.id)).toEqual([
      firstStyle.id,
      secondStyle.id,
    ]);
  });

  it('returns a null image rather than omitting the collection', async () => {
    // The chip falls back to an initial. Dropping the collection because it
    // has no photograph would hide a populated part of the catalogue.
    queueSelects([{ style: firstStyle.id, count: 7, image: null }]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections[0]).toMatchObject({ count: 7, image: null });
  });

  it('returns an empty list, not an error, on an empty catalogue', async () => {
    queueSelects([]);
    const res = await app.request('/api/products/collections');
    expect(res.status).toBe(200);
    expect((await res.json()).collections).toEqual([]);
  });
});
