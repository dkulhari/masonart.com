/**
 * GET /api/collections — the Discover rail's data.
 *
 * Supersedes `GET /api/products/collections`, which derived the rail from
 * `STYLE_OPTIONS` and so could only ever describe styles. Measured on mesonart
 * 2026-08-05, their rail also carries subjects, an orientation, and two
 * entries that are a date window and a sort. This endpoint reads the
 * `collections` table instead, so all of those are expressible.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

const listDiscoverCollections = vi.fn();
const countCollection = vi.fn();
const representativesFor = vi.fn();
const getCached = vi.fn();
const setCached = vi.fn();

vi.mock('../../src/lib/collection-resolver', () => ({
  listDiscoverCollections: (...args: unknown[]) => listDiscoverCollections(...args),
  countCollection: (...args: unknown[]) => countCollection(...args),
}));

vi.mock('../../src/lib/collection-imagery', () => ({
  representativesFor: (...args: unknown[]) => representativesFor(...args),
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: (...args: unknown[]) => getCached(...args),
  setCached: (...args: unknown[]) => setCached(...args),
  deleteCached: vi.fn(),
  CacheKeys: { PRODUCT: 'products:', COLLECTION: 'collections:' },
}));

import { collectionsApp } from '../../src/routes/collections';

const app = new Hono();
app.route('/api/collections', collectionsApp);

const collection = (overrides: Record<string, unknown> = {}) => ({
  id: 'id-pop',
  slug: 'pop-art',
  title: 'Pop Art',
  subtitle: null,
  description: null,
  kind: 'rule',
  rule: { styles: ['pop-art'] },
  imageUrl: null,
  isActive: true,
  showInDiscover: true,
  discoverOrder: 0,
  sortOrder: 0,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockResolvedValue(null);
  setCached.mockResolvedValue(undefined);
  representativesFor.mockResolvedValue(new Map());
});

describe('GET /api/collections', () => {
  it('returns the discover collections in the order the admin chose', async () => {
    listDiscoverCollections.mockResolvedValue([
      collection({ id: 'a', slug: 'first', title: 'First', discoverOrder: 0 }),
      collection({ id: 'b', slug: 'second', title: 'Second', discoverOrder: 1 }),
    ]);
    countCollection.mockResolvedValue(5);

    const res = await app.request('/api/collections?discover=true');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { collections: { slug: string }[] };
    expect(body.collections.map((c) => c.slug)).toEqual(['first', 'second']);
  });

  it('carries the resolved product count on each chip', async () => {
    listDiscoverCollections.mockResolvedValue([collection()]);
    countCollection.mockResolvedValue(11);

    const body = (await (
      await app.request('/api/collections?discover=true')
    ).json()) as { collections: { count: number }[] };

    expect(body.collections[0].count).toBe(11);
  });

  it('drops collections that resolve to nothing', async () => {
    // A chip leading to an empty grid is worse than no chip — #406's rule.
    listDiscoverCollections.mockResolvedValue([
      collection({ id: 'a', slug: 'full' }),
      collection({ id: 'b', slug: 'empty' }),
    ]);
    countCollection.mockImplementation(async (c: { slug: string }) =>
      c.slug === 'full' ? 3 : 0
    );

    const body = (await (
      await app.request('/api/collections?discover=true')
    ).json()) as { collections: { slug: string }[] };

    expect(body.collections.map((c) => c.slug)).toEqual(['full']);
  });
});

describe('chip imagery', () => {
  it("prefers the admin's image and reports it as unmatted", async () => {
    // The distinction is not cosmetic. Product `main` images are matted at a
    // fixed fraction of the longest side and the chip compensates by scaling
    // past the mat; an admin upload is not matted, and the same scale crops
    // into it.
    listDiscoverCollections.mockResolvedValue([
      collection({ imageUrl: 'https://cdn.example/curated.jpg' }),
    ]);
    countCollection.mockResolvedValue(4);
    representativesFor.mockResolvedValue(
      new Map([['id-pop', { productId: 'p1', image: 'p1.jpg', orientation: 'square' }]])
    );

    const body = (await (
      await app.request('/api/collections?discover=true')
    ).json()) as {
      collections: { image: string; imageIsMatted: boolean; orientation: string | null }[];
    };

    expect(body.collections[0].image).toBe('https://cdn.example/curated.jpg');
    expect(body.collections[0].imageIsMatted).toBe(false);
    expect(body.collections[0].orientation).toBeNull();
  });

  it('falls back to a representative product and reports it as matted', async () => {
    listDiscoverCollections.mockResolvedValue([collection({ imageUrl: null })]);
    countCollection.mockResolvedValue(4);
    representativesFor.mockResolvedValue(
      new Map([
        ['id-pop', { productId: 'p1', image: 'p1.jpg', orientation: 'panoramic' }],
      ])
    );

    const body = (await (
      await app.request('/api/collections?discover=true')
    ).json()) as {
      collections: { image: string; imageIsMatted: boolean; orientation: string | null }[];
    };

    expect(body.collections[0].image).toBe('p1.jpg');
    expect(body.collections[0].imageIsMatted).toBe(true);
    // The chip crops by aspect, so the orientation must describe the product
    // the image came from — not the collection.
    expect(body.collections[0].orientation).toBe('panoramic');
  });

  it('renders a chip with no image at all rather than a broken one', async () => {
    listDiscoverCollections.mockResolvedValue([collection({ imageUrl: null })]);
    countCollection.mockResolvedValue(4);
    representativesFor.mockResolvedValue(new Map());

    const body = (await (
      await app.request('/api/collections?discover=true')
    ).json()) as { collections: { image: string | null; imageIsMatted: boolean }[] };

    expect(body.collections[0].image).toBeNull();
    expect(body.collections[0].imageIsMatted).toBe(false);
  });
});

describe('caching', () => {
  it('serves a cached payload without touching the database', async () => {
    getCached.mockResolvedValue({ collections: [{ slug: 'cached' }] });

    const body = (await (
      await app.request('/api/collections?discover=true')
    ).json()) as { fromCache: boolean };

    expect(body.fromCache).toBe(true);
    expect(listDiscoverCollections).not.toHaveBeenCalled();
  });

  it('stores the payload it built', async () => {
    listDiscoverCollections.mockResolvedValue([collection()]);
    countCollection.mockResolvedValue(2);

    await app.request('/api/collections?discover=true');
    expect(setCached).toHaveBeenCalled();
  });
});
