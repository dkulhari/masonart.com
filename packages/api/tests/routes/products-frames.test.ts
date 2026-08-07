/**
 * GET /api/products/frames now carries the format rung.
 *
 * ## Why this asserts on the SELECTION, not just the response body
 *
 * The suite mocks `db`, and a mocked `select()` hands back whatever rows the
 * test wrote regardless of which columns the route asked for. So a test that
 * only inspects the response passes whether or not the route selects
 * `category` — it is measuring the fixture, not the code. Confirmed the hard
 * way: the first version of this file was green before the column was added.
 *
 * The column list the route passes to `db.select()` is the thing under test,
 * so that is what gets asserted.
 *
 * The cached and fresh paths are checked together for a related reason. A
 * field added to the select but missing from a cached payload gives a frame
 * panel that groups correctly only after the fifteen-minute TTL expires — a
 * bug that reproduces once an hour and reads as a fluke every time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../setup';

const selectMock = vi.fn();
const getCached = vi.fn();
const setCached = vi.fn();

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    query: { products: { findFirst: vi.fn(), findMany: vi.fn() } },
  },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: (...args: unknown[]) => getCached(...args),
  setCached: (...args: unknown[]) => setCached(...args),
  deleteCached: vi.fn(),
  redis: { keys: vi.fn().mockResolvedValue([]), del: vi.fn() },
  CacheKeys: { PRODUCT: 'product:', COLLECTION: 'collection:' },
  CACHE_TTL_FEATURED: 900,
}));

import { productsApp } from '../../src/routes/products';

const app = new Hono();
app.route('/api/products', productsApp);

const FRAME_ROWS = [
  {
    id: 'f1',
    name: 'Rolled Canvas',
    type: 'rolled',
    category: 'rolled',
    description: null,
    material: 'Canvas',
    thickness: null,
    color: 'N/A',
    priceModifier: '1.00',
    priceAddition: '0.00',
    imageUrl: '/frames/rolled.png',
    thumbnailUrl: '/frames/rolled.png',
    availableSizes: null,
    sortOrder: 0,
  },
  {
    id: 'f2',
    name: 'Stretch + Gold Frame',
    type: 'gold',
    category: 'framed',
    description: null,
    material: 'Composite with Gold Leaf',
    thickness: '1.25',
    color: 'Antique Gold',
    priceModifier: '1.40',
    priceAddition: '0.00',
    imageUrl: '/frames/gold.png',
    thumbnailUrl: '/frames/gold.png',
    availableSizes: null,
    sortOrder: 2,
  },
];

function chainReturning(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of ['from', 'where', 'orderBy', 'limit']) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCached.mockResolvedValue(null);
  selectMock.mockImplementation(() => chainReturning(FRAME_ROWS));
});

const CATEGORIES = ['rolled', 'frameless', 'framed'];

describe('GET /api/products/frames', () => {
  it('SELECTS the category column', async () => {
    const res = await app.request('/api/products/frames');
    expect(res.status).toBe(200);

    // The route builds its own column list; this is the only place a missing
    // column is observable while `db` is mocked.
    const selection = selectMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(selection)).toContain('category');
  });

  it('still selects the columns the storefront already depended on', async () => {
    await app.request('/api/products/frames');

    const selection = selectMock.mock.calls[0][0] as Record<string, unknown>;
    for (const column of [
      'id',
      'name',
      'type',
      'priceModifier',
      'priceAddition',
      'thumbnailUrl',
      'sortOrder',
    ]) {
      expect(Object.keys(selection)).toContain(column);
    }
  });

  it('returns each frame with its category', async () => {
    const res = await app.request('/api/products/frames');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: Array<{ category: string }> };
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(CATEGORIES).toContain(item.category);
    }
    expect(body.items[0].category).toBe('rolled');
    expect(body.items[1].category).toBe('framed');
  });

  it('returns the same fields on a cache HIT as on a MISS', async () => {
    const miss = await app.request('/api/products/frames');
    const missBody = (await miss.json()) as { items: Record<string, unknown>[] };

    // Whatever the miss path cached is what a later hit will serve back.
    const cachedPayload = setCached.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >[];
    getCached.mockResolvedValue(cachedPayload);

    const hit = await app.request('/api/products/frames');
    const hitBody = (await hit.json()) as {
      items: Record<string, unknown>[];
      fromCache?: boolean;
    };

    expect(hitBody.fromCache).toBe(true);
    expect(Object.keys(hitBody.items[0]).sort()).toEqual(
      Object.keys(missBody.items[0]).sort()
    );
    expect(hitBody.items[0].category).toBe('rolled');
  });

  it('caches the payload it just built, category included', async () => {
    await app.request('/api/products/frames');

    expect(setCached).toHaveBeenCalled();
    const cached = setCached.mock.calls[0][1] as Array<{ category?: string }>;
    expect(cached[0].category).toBe('rolled');
  });
});

/**
 * The product detail route selects frames SEPARATELY, and that copy is the one
 * the PDP loader maps into FrameSelector. Adding the column to the frames list
 * alone would leave the buy panel — the surface that actually groups by rung —
 * without it.
 */
describe('GET /api/products/:slug — its own frame selection', () => {
  it('selects category too, not just the frames list endpoint', async () => {
    const productsSrc = readFileSync(
      join(__dirname, '../../src/routes/products.ts'),
      'utf8'
    );

    // Both `.from(frames)` selections must name the column. Reading the source
    // is blunt, but the detail route needs a product fixture and a sale
    // context to reach its frame query, and this asserts the one thing that
    // matters without pretending to exercise the rest.
    const frameSelections = productsSrc.split('.from(frames)').length - 1;
    expect(frameSelections).toBe(2);

    const withCategory = productsSrc.split('category: frames.category').length - 1;
    expect(withCategory).toBe(2);
  });
});
