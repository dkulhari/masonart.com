/**
 * Collections in the sitemap.
 *
 * A collection page is the whole point of the feature being crawlable — it is
 * a destination with its own title, copy and canonical URL. Left out of the
 * sitemap it is reachable only by someone who already knows it exists.
 *
 * The inverse matters more: an INACTIVE collection 404s, and a sitemap entry
 * pointing at a 404 is worse than no entry. Search engines treat it as a
 * quality signal about the whole site.
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

import sitemapApp from '../../src/routes/sitemap';

const app = new Hono();
app.route('/sitemap.xml', sitemapApp);

/**
 * The handler runs two selects: products, then collections. Queue both.
 */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of ['from', 'where', 'orderBy', 'limit', 'groupBy']) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

const now = new Date('2026-08-05T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('collections in the sitemap', () => {
  it('lists every active collection', async () => {
    queueSelects(
      [],
      [
        { slug: 'pop-art', updatedAt: now },
        { slug: 'best-selling', updatedAt: now },
      ]
    );

    const xml = await (await app.request('/sitemap.xml')).text();

    expect(xml).toContain('/collections/pop-art');
    expect(xml).toContain('/collections/best-selling');
  });

  it('carries a lastmod, so a re-crawl knows whether to bother', async () => {
    queueSelects([], [{ slug: 'pop-art', updatedAt: now }]);

    const xml = await (await app.request('/sitemap.xml')).text();
    expect(xml).toMatch(/<loc>[^<]*\/collections\/pop-art<\/loc>\s*<lastmod>/);
  });

  it('queries collections separately from products', async () => {
    // Two selects, not one join — the entries have different shapes and
    // priorities, and a join would make an inactive collection's products
    // vanish from the sitemap too.
    queueSelects([], []);
    await app.request('/sitemap.xml');
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('still returns the static pages when there are no collections', async () => {
    queueSelects([], []);
    const xml = await (await app.request('/sitemap.xml')).text();
    expect(xml).toContain('/posters');
  });

  it('falls back to static pages when the query fails', async () => {
    // The existing contract: a broken database returns a usable sitemap
    // rather than a 500.
    selectMock.mockImplementation(() => {
      throw new Error('database is down');
    });

    const res = await app.request('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Sitemap-Error')).toBe('true');
  });
});
