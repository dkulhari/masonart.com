/**
 * GET /api/collections/:slug — a collection resolved to a page of products.
 *
 * The real resolver runs here; only `db` and redis are mocked. That is
 * deliberate: the behaviour worth protecting is the intersection rule from
 * #463 reaching the SQL, and mocking the resolver would test the mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

const selectMock = vi.fn();

vi.mock('../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn(),
  CacheKeys: { PRODUCT: 'product:', COLLECTION: 'collection:' },
}));

import { collectionsApp } from '../../src/routes/collections';
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/collections', collectionsApp);

/**
 * Queue results for successive `db.select()` calls. Anything past the end of
 * the queue resolves empty, so a test only has to name the calls it cares
 * about — the ten facet queries at the tail do not need spelling out.
 */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  const captured: { where: unknown[]; orderBy: unknown[] } = {
    where: [],
    orderBy: [],
  };

  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'groupBy', 'limit', 'offset', 'leftJoin', 'innerJoin']) {
      chain[key] = () => chain;
    }
    chain.where = (arg: unknown) => {
      captured.where.push(arg);
      return chain;
    };
    chain.orderBy = (...args: unknown[]) => {
      captured.orderBy.push(...args);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });

  return captured;
}

const popArt = {
  id: 'id-pop',
  slug: 'pop-art',
  title: 'Pop Art',
  subtitle: 'Bold and loud',
  description: 'Work in the pop tradition.',
  kind: 'rule',
  rule: { styles: ['pop-art'] },
  imageUrl: null,
  isActive: true,
  showInDiscover: true,
  discoverOrder: 4,
  sortOrder: 4,
  seoTitle: 'Pop Art prints',
  seoDescription: 'Buy pop art',
};

const product = (id: string) => ({
  id,
  sku: `SKU-${id}`,
  title: `Product ${id}`,
  slug: `product-${id}`,
  basePrice: '2500.00',
  styles: ['pop-art'],
  subjects: [],
  colors: [],
  orientation: 'square',
  images: [],
  isFeatured: false,
  isAiGenerated: false,
  averageRating: null,
  reviewCount: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the collection itself', () => {
  it('returns the collection alongside its products', async () => {
    queueSelects([popArt], [{ count: 2 }], [product('a'), product('b')]);

    const res = await app.request('/api/collections/pop-art');
    expect(res.status).toBe(200);

    const body = (await readJson(res)) as {
      collection: { slug: string; title: string; description: string };
      items: unknown[];
      total: number;
    };
    expect(body.collection.slug).toBe('pop-art');
    expect(body.collection.title).toBe('Pop Art');
    expect(body.collection.description).toBe('Work in the pop tradition.');
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('carries the SEO fields the page head needs', async () => {
    queueSelects([popArt], [{ count: 0 }], []);

    const body = (await readJson(await app.request('/api/collections/pop-art'))) as {
      collection: { seoTitle: string; seoDescription: string };
    };
    expect(body.collection.seoTitle).toBe('Pop Art prints');
    expect(body.collection.seoDescription).toBe('Buy pop art');
  });

  it('404s an unknown slug', async () => {
    queueSelects([]);
    const res = await app.request('/api/collections/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('404s an inactive collection rather than rendering it', async () => {
    // findActiveCollectionBySlug filters on isActive, so an inactive row comes
    // back empty. Guessing the URL must not reach an unpublished page.
    queueSelects([]);
    const res = await app.request('/api/collections/hidden');
    expect(res.status).toBe(404);
  });
});

describe('shopper facets narrow within the collection', () => {
  it('returns an empty page when the shopper filters outside it', async () => {
    // The intersection rule, end to end: pop-art collection, ukiyo-e filter.
    // An empty grid is true; the whole catalogue would be a lie.
    queueSelects([popArt]);

    const body = (await readJson(
      await app.request('/api/collections/pop-art?styles=ukiyo-e-art')
    )) as { items: unknown[]; total: number };

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('does not even query for products when the answer is known', async () => {
    queueSelects([popArt]);
    await app.request('/api/collections/pop-art?styles=ukiyo-e-art');
    // One call: the collection lookup. No count, no items.
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('still queries when the shopper narrows inside the collection', async () => {
    queueSelects([popArt], [{ count: 1 }], [product('a')]);

    const body = (await readJson(
      await app.request('/api/collections/pop-art?styles=pop-art')
    )) as { total: number };

    expect(body.total).toBe(1);
  });

  it('rejects a facet value outside the vocabulary', async () => {
    queueSelects([popArt]);
    const res = await app.request('/api/collections/pop-art?styles=not-a-style');
    expect(res.status).toBe(400);
  });

  /**
   * `?colors=blue&colors=white` is what `URLSearchParams` writes by default,
   * and hono hands zod an array for it. `facetList` used to start at
   * `z.string()`, so the repeated form 400d on every array facet on both this
   * route and /api/products while the comma-joined form the storefront sends
   * worked — the two shapes now resolve to the same list.
   */
  it('accepts a facet repeated rather than comma-joined', async () => {
    queueSelects([popArt], [{ count: 1 }], [product('a')]);

    const res = await app.request(
      '/api/collections/pop-art?colors=blue&colors=white'
    );

    expect(res.status).toBe(200);
  });
});

describe('pagination', () => {
  it('reports the page shape the grid pages against', async () => {
    queueSelects([popArt], [{ count: 50 }], [product('a')]);

    const body = (await readJson(
      await app.request('/api/collections/pop-art?page=2&pageSize=24')
    )) as {
      page: number;
      pageSize: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(24);
    expect(body.totalPages).toBe(3);
    expect(body.hasNextPage).toBe(true);
    expect(body.hasPreviousPage).toBe(true);
  });
});

describe('manual collections', () => {
  const manual = {
    ...popArt,
    slug: 'staff-picks',
    kind: 'manual',
    rule: null,
  };

  it('resolves through its member list', async () => {
    queueSelects(
      [manual],
      [{ productId: 'p3' }, { productId: 'p1' }],
      [{ count: 2 }],
      [product('p3'), product('p1')]
    );

    const body = (await readJson(
      await app.request('/api/collections/staff-picks')
    )) as { items: { id: string }[] };

    expect(body.items.map((i) => i.id)).toEqual(['p3', 'p1']);
  });

  it('renders an empty page for a collection with no members', async () => {
    queueSelects([manual], []);

    const body = (await readJson(
      await app.request('/api/collections/staff-picks')
    )) as { items: unknown[]; total: number };

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('facet counts', () => {
  it('are present so the sidebar can be scoped to the collection', async () => {
    // Catalogue-wide counts would offer a shopper filters that return nothing
    // inside this collection — which is the same lie an unfiltered grid is.
    queueSelects(
      [popArt],
      [{ count: 2 }],
      [product('a')],
      [{ value: 'pop-art', count: 2 }]
    );

    const body = (await readJson(await app.request('/api/collections/pop-art'))) as {
      facets: Record<string, { value: string; count: number }[]>;
    };

    expect(body.facets).toBeDefined();
    expect(body.facets.styles).toEqual([{ value: 'pop-art', count: 2 }]);
  });
});
