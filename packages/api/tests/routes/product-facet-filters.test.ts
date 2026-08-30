/**
 * Validated facet filters.
 *
 * Before this, every array filter was `z.string().optional()` and each value
 * was interpolated into a postgres ARRAY literal by `sql.raw` with hand-rolled
 * quote escaping. Validating against the closed vocabularies in
 * @chobii/shared makes that structurally safe and turns a typo into a 400
 * rather than an unfiltered grid the shopper believes was filtered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/products', productsApp);

function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of [
      'from', 'where', 'groupBy', 'orderBy', 'limit', 'offset', 'leftJoin',
    ]) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  queueSelects([{ count: 0 }], []);
});

describe('the new facet filters are accepted', () => {
  const cases: Array<[string, string]> = [
    ['vibe', 'tranquility-and-zen'],
    ['aesthetic', 'japandi-essence'],
    ['medium', 'giclee-canvas'],
    ['uniqueness', 'open-edition'],
    ['availability', 'made-to-order'],
  ];

  for (const [param, value] of cases) {
    it(`accepts ${param}=${value}`, async () => {
      const res = await app.request(`/api/products?${param}=${value}`);
      expect(res.status).toBe(200);
    });
  }

  it('accepts several comma-separated values on a multi facet', () => {
    return app
      .request('/api/products?vibe=tranquility-and-zen,warmth-and-cozy')
      .then((res) => expect(res.status).toBe(200));
  });

  it('still accepts the original comma-separated shape for styles', async () => {
    const res = await app.request(
      '/api/products?styles=wabi-sabi-art,minimalist-art'
    );
    expect(res.status).toBe(200);
  });
});

describe('unknown values are rejected, not ignored', () => {
  const cases: Array<[string, string]> = [
    ['vibe', 'vibes'],
    ['aesthetic', 'not-an-aesthetic'],
    ['medium', 'oil'],
    ['uniqueness', 'sort-of-unique'],
    ['availability', 'maybe'],
    ['styles', 'not-a-style'],
    ['colors', 'grey'],
  ];

  for (const [param, value] of cases) {
    it(`rejects ${param}=${value}`, async () => {
      // Silently ignoring it is worse than failing: the shopper sees an
      // unfiltered grid and believes it was filtered.
      const res = await app.request(`/api/products?${param}=${value}`);
      expect(res.status).toBe(400);
    });
  }

  it('rejects a partly-valid comma list rather than filtering on the good half', async () => {
    const res = await app.request(
      '/api/products?styles=wabi-sabi-art,not-a-style'
    );
    expect(res.status).toBe(400);
  });

  it('rejects set-of-2-3 nowhere — it is a real orientation now', async () => {
    const res = await app.request('/api/products?orientation=set-of-2-3');
    expect(res.status).toBe(200);
  });
});

describe('facets endpoint covers the new groups', () => {
  it('returns a group per facet', async () => {
    queueSelects([], [], [], [], [], [], [], [], []);

    const res = await app.request('/api/products/facets');
    expect(res.status).toBe(200);

    const body = await readJson(res);
    for (const key of [
      'styles', 'subjects', 'colors', 'rooms', 'orientation',
      'vibe', 'aesthetic', 'medium', 'uniqueness', 'availability',
    ]) {
      expect(body, `missing facet group: ${key}`).toHaveProperty(key);
    }
  });
});

describe('safety of the array filter construction', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/routes/products.ts'),
    'utf8'
  );

  it('validates array params against the shared vocabularies', () => {
    expect(src).toContain('@chobii/shared');
    expect(src).toMatch(/styleSchema|STYLE_OPTIONS/);
  });

  it('does not widen the cache key problem — facets key reflects its shape', () => {
    // Adding groups changes the payload; a stale entry under the old key
    // would serve the old shape after deploy.
    expect(src).toMatch(/facets:v\d|facets-v\d/);
  });
});
