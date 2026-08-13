/**
 * The admin write path measures the artwork before it trusts the column.
 *
 * #545: `products.orientation` disagreed with the actual picture on 27 of 41
 * rows, and the storefront crops from that column — `chipArtScale` on the
 * Discover rail, `tileArtScale` on the popular tiles — so every wrong row drew
 * a wrong window into its own painting. The seed was corrected, but nothing
 * stopped it recurring: an admin could type any orientation over any photograph
 * and no code compared the two.
 *
 * `measureArtBox` already knows the artwork's exact box at upload time. These
 * tests are the wiring that stops it being thrown away.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../../setup';

const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireContentManager: async (_c: unknown, next: () => Promise<void>) =>
    next(),
  optionalAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/redis', () => ({
  deleteCached: vi.fn().mockResolvedValue(undefined),
  purgeProductResponseCache: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { PRODUCT: 'products:', PRODUCT_LIST: 'products:list:' },
}));

import { adminProductsApp } from '../../../src/routes/admin/products';

const app = new Hono();
app.route('/api/admin/products', adminProductsApp);

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

/** cosmic-harmony's real measurement: 0.416 / 0.819 = 0.51, portrait. */
const PORTRAIT_ART_BOX = { x: 0.293, y: 0.077, w: 0.416, h: 0.819 };

const mainImage = (artBox?: Record<string, number>) => ({
  id: 'img-1',
  url: 'https://cdn.example.com/a.webp',
  altText: 'artwork',
  type: 'main' as const,
  sortOrder: 0,
  width: 1500,
  height: 1500,
  originalKey: 'products/originals/a.webp',
  ...(artBox ? { artBox } : {}),
});

const createBody = (over: Record<string, unknown> = {}) => ({
  sku: 'SKU-1',
  title: 'A piece',
  slug: 'a-piece',
  basePrice: '1999.00',
  orientation: 'square',
  images: [mainImage(PORTRAIT_ART_BOX)],
  ...over,
});

/** Queues successive db.select() results; every chain method is fluent. */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => {
    const rows = results[call++] ?? [];
    const chain: Record<string, unknown> = {};
    for (const key of [
      'from',
      'where',
      'groupBy',
      'orderBy',
      'limit',
      'offset',
      'leftJoin',
      'innerJoin',
    ]) {
      chain[key] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows);
    return chain;
  });
}

let insertedValues: Record<string, unknown> | undefined;
let updatedValues: Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  insertedValues = undefined;
  updatedValues = undefined;

  insertMock.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => {
      insertedValues = v;
      return { returning: async () => [{ id: PRODUCT_ID, ...v }] };
    },
  }));

  updateMock.mockImplementation(() => ({
    set: (v: Record<string, unknown>) => {
      updatedValues = v;
      return {
        where: () => ({ returning: async () => [{ id: PRODUCT_ID, ...v }] }),
      };
    },
  }));

  // No SKU clash, no slug clash.
  queueSelects([], []);
});

describe('POST /api/admin/products — orientation against the artwork', () => {
  it('refuses an orientation the uploaded artwork contradicts', async () => {
    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody()),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      declared?: string;
      measured?: string;
    };
    // Naming the measurement is the point — an admin who cannot see what the
    // picture measures cannot tell a typo from a disagreement.
    expect(body.measured).toBe('portrait');
    expect(body.declared).toBe('square');
    expect(insertedValues).toBeUndefined();
  });

  it('accepts the orientation the artwork actually measures', async () => {
    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody({ orientation: 'portrait' })),
    });

    expect(res.status).toBe(201);
    expect(insertedValues?.orientation).toBe('portrait');
  });

  it('persists the measured box rather than stripping it', async () => {
    // The upload endpoint returns `artBox` and the admin posts it straight
    // back. A schema that quietly drops unknown keys loses the only
    // measurement the storefront cannot retake.
    await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody({ orientation: 'portrait' })),
    });

    const images = insertedValues?.images as Array<Record<string, unknown>>;
    expect(images[0]?.artBox).toEqual(PORTRAIT_ART_BOX);
  });

  it('lets a deliberate override through, and says so', async () => {
    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody({ orientationOverride: true })),
    });

    expect(res.status).toBe(201);
    expect(insertedValues?.orientation).toBe('square');
    // The override is not a column — it decides this write only.
    expect(insertedValues).not.toHaveProperty('orientationOverride');
  });

  it('accepts set-of-2-3, which counts panels rather than proportion', async () => {
    // paper-layers and digital-cosmos are two panels with a wall gutter. As one
    // rectangle they measure wide; that does not make them panoramic, and the
    // admin enum has to be able to express them at all.
    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        createBody({
          orientation: 'set-of-2-3',
          images: [mainImage({ x: 0.1, y: 0.3, w: 0.8, h: 0.385 })],
        })
      ),
    });

    expect(res.status).toBe(201);
    expect(insertedValues?.orientation).toBe('set-of-2-3');
  });

  it('says nothing when there is no measurement to say it with', async () => {
    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBody({ images: [mainImage()] })),
    });

    expect(res.status).toBe(201);
  });

  it('ignores a room mockup, which is cropped rather than matted', async () => {
    const res = await app.request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        createBody({
          images: [{ ...mainImage(PORTRAIT_ART_BOX), type: 'room-mockup' }],
        })
      ),
    });

    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/admin/products/:id — orientation against the artwork', () => {
  it('refuses an orientation the stored artwork contradicts', async () => {
    queueSelects([
      {
        id: PRODUCT_ID,
        slug: 'a-piece',
        sku: 'SKU-1',
        orientation: 'portrait',
        images: [mainImage(PORTRAIT_ART_BOX)],
      },
    ]);

    const res = await app.request(`/api/admin/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orientation: 'panoramic' }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).measured).toBe('portrait');
    expect(updatedValues).toBeUndefined();
  });

  it('measures the incoming images when the write replaces them', async () => {
    queueSelects([
      {
        id: PRODUCT_ID,
        slug: 'a-piece',
        sku: 'SKU-1',
        orientation: 'square',
        images: [],
      },
    ]);

    const res = await app.request(`/api/admin/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orientation: 'portrait',
        images: [mainImage(PORTRAIT_ART_BOX)],
      }),
    });

    expect(res.status).toBe(200);
    expect(updatedValues?.orientation).toBe('portrait');
  });

  it('catches a new photograph that contradicts the untouched column', async () => {
    // The orientation is not in the payload at all — the picture changed under
    // it. This is exactly how the catalogue drifted in the first place.
    queueSelects([
      {
        id: PRODUCT_ID,
        slug: 'a-piece',
        sku: 'SKU-1',
        orientation: 'square',
        images: [],
      },
    ]);

    const res = await app.request(`/api/admin/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ images: [mainImage(PORTRAIT_ART_BOX)] }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).measured).toBe('portrait');
  });

  it('leaves an unrelated edit alone', async () => {
    queueSelects([
      {
        id: PRODUCT_ID,
        slug: 'a-piece',
        sku: 'SKU-1',
        orientation: 'square',
        images: [mainImage(PORTRAIT_ART_BOX)],
      },
    ]);

    // A title edit on a row that was already wrong must not become a 400 —
    // fixing the data is a separate job from typing a new caption.
    const res = await app.request(`/api/admin/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'A better name' }),
    });

    expect(res.status).toBe(200);
  });
});
