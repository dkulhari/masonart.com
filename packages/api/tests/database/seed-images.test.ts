/**
 * Seed image helper tests
 *
 * Storage is mocked; these assert the seed produces contract-shaped records and
 * that the download cache actually caches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { MAT_CANVAS } from '@chobii/shared';

vi.mock('../../src/lib/storage', () => ({
  StoragePaths: { PRODUCTS: 'products/' },
  uploadOptimizedImage: vi.fn(async () => ({
    url: 'http://localhost:9000/poster-app-dev/products/seed.webp',
    key: 'products/seed.webp',
    bucket: 'poster-app-dev',
    webpUrl: 'http://localhost:9000/poster-app-dev/products/seed.webp',
    variants: [{ name: 'card', width: 400, url: 'http://localhost:9000/c.webp', key: 'c' }],
    width: MAT_CANVAS,
    height: MAT_CANVAS,
  })),
  uploadFile: vi.fn(async (_b: Buffer, key: string) => ({
    url: `http://localhost:9000/poster-app-dev/${key}`,
    key,
    bucket: 'poster-app-dev',
  })),
  getPublicUrl: (k: string) => `http://localhost:9000/poster-app-dev/${k}`,
}));

const { buildSeedImage, fetchCached } = await import('../../src/database/seed-images');

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 90, g: 60, b: 40 } } })
    .jpeg()
    .toBuffer();

describe('buildSeedImage', () => {
  it('produces a contract-shaped record', async () => {
    const img = await buildSeedImage(await jpeg(800, 600), 'p.jpg', 'Alt text', 0);
    expect(img).toMatchObject({
      altText: 'Alt text',
      type: 'main',
      sortOrder: 0,
      width: MAT_CANVAS,
      height: MAT_CANVAS,
    });
    expect(img.originalKey).toContain('originals/');
  });

  it('carries no legacy keys', async () => {
    const img = await buildSeedImage(await jpeg(800, 800), 'p.jpg', 'a', 0);
    expect(img).not.toHaveProperty('isPrimary');
    expect(img).not.toHaveProperty('alt');
  });

  it('squares an off-ratio source', async () => {
    const img = await buildSeedImage(await jpeg(800, 600), 'p.jpg', 'a', 0);
    expect(img.width).toBe(img.height);
  });

  it('honours a non-main type and sort order', async () => {
    const img = await buildSeedImage(await jpeg(800, 600), 'r.jpg', 'room', 2, 'room-mockup');
    expect(img.type).toBe('room-mockup');
    expect(img.sortOrder).toBe(2);
  });
});

describe('fetchCached', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('downloads once and serves the second call from disk', async () => {
    const body = await jpeg(64, 64);
    const spy = vi.fn(async () => new Response(body, { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const url = `https://example.test/seed-${Date.now()}.jpg`;
    const a = await fetchCached(url);
    const b = await fetchCached(url);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(a.equals(b)).toBe(true);
  });

  it('throws a useful message on a failed fetch', async () => {
    globalThis.fetch = (async () =>
      new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(
      fetchCached(`https://example.test/missing-${Date.now()}.jpg`)
    ).rejects.toThrow(/404/);
  });
});
