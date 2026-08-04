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

const [firstStyle, secondStyle, thirdStyle] = STYLE_OPTIONS;

/**
 * One shortlisted candidate row, as the window-function query returns it.
 *
 * `productId` matters: the route assigns each product to at most one chip, so
 * a fixture that leaves identities off cannot exercise that at all.
 */
let autoId = 0;
function candidate(overrides: {
  style: string;
  count: number;
  productId?: string;
  rank?: number;
  image?: string | null;
  orientation?: string | null;
}) {
  autoId += 1;
  return {
    productId: `product-${autoId}`,
    rank: 1,
    image: null,
    orientation: 'square',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  autoId = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * A product carries several styles, so the naive "best product per style"
 * pick handed one product every chip it qualified for and the rail showed the
 * same picture two or three times. These pin the assignment that replaced it.
 */
describe('one product, one chip', () => {
  it('never repeats an image while alternatives exist', async () => {
    // `shared` tops both styles; `spare` is second choice for the first.
    queueSelects([
      candidate({ style: firstStyle.id, productId: 'shared', rank: 1, count: 2, image: 'https://cdn.test/shared.webp' }),
      candidate({ style: firstStyle.id, productId: 'spare', rank: 2, count: 2, image: 'https://cdn.test/spare.webp' }),
      candidate({ style: secondStyle.id, productId: 'shared', rank: 1, count: 1, image: 'https://cdn.test/shared.webp' }),
    ]);

    const body = await (await app.request('/api/products/collections')).json();
    const images = body.collections.map((c: { image: string }) => c.image);

    expect(body.collections).toHaveLength(2);
    expect(new Set(images).size).toBe(images.length);
  });

  it('lets the scarcest collection pick first', async () => {
    // The style with one option must take `shared`, or it is left with
    // nothing and falls back to a duplicate. The style with two can absorb
    // losing its first choice.
    queueSelects([
      candidate({ style: firstStyle.id, productId: 'shared', rank: 1, count: 9, image: 'https://cdn.test/shared.webp' }),
      candidate({ style: firstStyle.id, productId: 'spare', rank: 2, count: 9, image: 'https://cdn.test/spare.webp' }),
      candidate({ style: secondStyle.id, productId: 'shared', rank: 1, count: 1, image: 'https://cdn.test/shared.webp' }),
    ]);

    const body = await (await app.request('/api/products/collections')).json();
    const bySlug = Object.fromEntries(
      body.collections.map((c: { id: string; image: string }) => [c.id, c.image])
    );

    expect(bySlug[secondStyle.id]).toBe('https://cdn.test/shared.webp');
    expect(bySlug[firstStyle.id]).toBe('https://cdn.test/spare.webp');
  });

  it('reuses a picture rather than dropping a collection', async () => {
    // Every candidate for the third style is already claimed. A duplicate
    // image is a smaller failure than a collection missing from the rail.
    queueSelects([
      candidate({ style: firstStyle.id, productId: 'only', rank: 1, count: 1, image: 'https://cdn.test/only.webp' }),
      candidate({ style: secondStyle.id, productId: 'only', rank: 1, count: 1, image: 'https://cdn.test/only.webp' }),
      candidate({ style: thirdStyle.id, productId: 'only', rank: 1, count: 1, image: 'https://cdn.test/only.webp' }),
    ]);

    const body = await (await app.request('/api/products/collections')).json();

    expect(body.collections).toHaveLength(3);
  });

  it('counts every product in the style, not just the assigned one', async () => {
    // `count` is a window over the whole partition; the shortlist is capped.
    // If the count ever came from the shortlist, chips would under-report.
    queueSelects([
      candidate({ style: firstStyle.id, productId: 'a', rank: 1, count: 40 }),
      candidate({ style: firstStyle.id, productId: 'b', rank: 2, count: 40 }),
    ]);

    const body = await (await app.request('/api/products/collections')).json();

    expect(body.collections[0].count).toBe(40);
  });

  it('is deterministic across identical requests', async () => {
    // A chip that changes picture between two identical requests reads as a
    // bug. Equal-scarcity styles break the tie on id, not on Map order.
    const rows = [
      candidate({ style: firstStyle.id, productId: 'shared', rank: 1, count: 3, image: 'https://cdn.test/shared.webp' }),
      candidate({ style: firstStyle.id, productId: 'spare-a', rank: 2, count: 3, image: 'https://cdn.test/a.webp' }),
      candidate({ style: secondStyle.id, productId: 'shared', rank: 1, count: 3, image: 'https://cdn.test/shared.webp' }),
      candidate({ style: secondStyle.id, productId: 'spare-b', rank: 2, count: 3, image: 'https://cdn.test/b.webp' }),
    ];

    queueSelects(rows);
    const first = await (await app.request('/api/products/collections')).json();
    queueSelects(rows);
    const second = await (await app.request('/api/products/collections')).json();

    expect(first.collections).toEqual(second.collections);
  });
});

describe('GET /api/products/collections', () => {
  it('is not shadowed by the :slug route', async () => {
    queueSelects([]);
    const res = await app.request('/api/products/collections');
    expect(res.status).toBe(200);
  });

  it('returns id, label, count, image and orientation per collection', async () => {
    queueSelects([
      {
        style: firstStyle.id,
        productId: 'p1',
        rank: 1,
        count: 12,
        image: 'https://cdn.test/a.webp',
        orientation: 'panoramic',
      },
    ]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections).toEqual([
      {
        id: firstStyle.id,
        label: firstStyle.label,
        count: 12,
        image: 'https://cdn.test/a.webp',
        orientation: 'panoramic',
      },
    ]);
  });

  it('carries orientation so the chip knows how deep to crop', async () => {
    // `main` images are matted at a fixed fraction of the LONGEST side, so a
    // panoramic representative needs a far deeper crop than a square one to
    // keep mat out of a circular chip. Without this the two panoramic
    // representatives render with white arcs.
    queueSelects([
      candidate({ style: firstStyle.id, count: 2, orientation: 'square' }),
    ]);

    const body = await (await app.request('/api/products/collections')).json();

    expect(body.collections[0].orientation).toBe('square');
  });

  it('returns a null orientation rather than dropping the collection', async () => {
    queueSelects([
      candidate({ style: firstStyle.id, count: 2, orientation: null }),
    ]);

    const body = await (await app.request('/api/products/collections')).json();

    expect(body.collections[0]).toMatchObject({ orientation: null });
  });

  it('takes labels from the shared vocabulary, not from the database', async () => {
    // The database column holds ids. If a label ever came back from the
    // query instead, the chip row and the filter sidebar would drift apart.
    queueSelects([candidate({ style: secondStyle.id, count: 3 })]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections[0].label).toBe(secondStyle.label);
  });

  it('omits collections with no active products', async () => {
    // A chip leading to an empty grid is worse than no chip.
    queueSelects([candidate({ style: firstStyle.id, count: 4 })]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections).toHaveLength(1);
    expect(body.collections.every((c: { count: number }) => c.count > 0)).toBe(true);
  });

  it('ignores a style value the vocabulary does not contain', async () => {
    // Free text in the column must not become a chip — it has no label and
    // filtering on it would 400.
    queueSelects([
      candidate({ style: 'some-legacy-tag', count: 9 }),
      candidate({ style: firstStyle.id, count: 1 }),
    ]);

    const res = await app.request('/api/products/collections');
    const body = await res.json();

    expect(body.collections.map((c: { id: string }) => c.id)).toEqual([firstStyle.id]);
  });

  it('keeps the vocabulary order rather than the query order', async () => {
    queueSelects([
      candidate({ style: secondStyle.id, count: 1 }),
      candidate({ style: firstStyle.id, count: 99 }),
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
    queueSelects([candidate({ style: firstStyle.id, count: 7 })]);

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
