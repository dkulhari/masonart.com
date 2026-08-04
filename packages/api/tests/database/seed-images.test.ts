/**
 * Seed image helper tests
 *
 * Storage is mocked; these assert the seed produces contract-shaped records and
 * that the download cache actually caches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const { buildSeedImage, fetchCached, localSeedMediaSet, buildSeedImageFromFile } =
  await import('../../src/database/seed-images');

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

describe('localSeedMediaSet', () => {
  // The local reference set is machine-local and gitignored, so every
  // assertion here builds its own directory rather than reading the real one.
  const scratch = async (files: string[]) => {
    const dir = await mkdtemp(join(tmpdir(), 'seed-media-'));
    const body = await jpeg(32, 32);
    for (const f of files) await writeFile(join(dir, f), body);
    return dir;
  };

  it('is empty when the directory does not exist', () => {
    // A clone without the local set must seed from the declared URLs, not die.
    expect(localSeedMediaSet('tx462', join(tmpdir(), 'absent-seed-media'))).toEqual([]);
  });

  it('is empty when only room mockups are present', async () => {
    // Rooms without the artwork would make slide 0 somebody's living room.
    const dir = await scratch(['tx462-room-0.webp', 'tx462-room-1.webp']);
    expect(localSeedMediaSet('tx462', dir)).toEqual([]);
  });

  it('puts the artwork first and the rooms after it, in file order', async () => {
    const dir = await scratch([
      'tx462-room-1.webp',
      'tx462-main.webp',
      'tx462-room-0.webp',
    ]);
    expect(localSeedMediaSet('tx462', dir)).toEqual([
      { file: 'tx462-main.webp', type: 'main' },
      { file: 'tx462-room-0.webp', type: 'room-mockup' },
      { file: 'tx462-room-1.webp', type: 'room-mockup' },
    ]);
  });

  it('does not bleed one prefix into another', async () => {
    // tx45 must not swallow tx450 — a plain startsWith on the bare prefix would.
    const dir = await scratch([
      'tx45-main.webp',
      'tx45-room-0.webp',
      'tx450-main.webp',
      'tx450-room-0.webp',
    ]);
    expect(localSeedMediaSet('tx45', dir).map((m) => m.file)).toEqual([
      'tx45-main.webp',
      'tx45-room-0.webp',
    ]);
  });

  it('builds a matted record from a local file', async () => {
    const dir = await scratch(['tx462-main.webp']);
    const img = await buildSeedImageFromFile(
      'tx462-main.webp',
      'tx462-0.webp',
      'Local artwork',
      0,
      'main',
      dir
    );
    expect(img).toMatchObject({ altText: 'Local artwork', type: 'main' });
    expect(img.width).toBe(img.height);
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
