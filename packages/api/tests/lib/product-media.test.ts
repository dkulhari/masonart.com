/**
 * buildProductMedia tests
 *
 * The orchestrator that turns one uploaded file into one ProductImage
 * satisfying the square contract. Branches on image type:
 *   main  -> matToSquare (contained, never cropped)
 *   other -> cropToSquare (human-chosen window, fills the frame)
 *
 * Storage is mocked — this tests the orchestration and the returned record,
 * not S3 itself (tests/lib/storage.test.ts covers that).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { MAT_CANVAS } from '@chobii/shared';

const uploadOptimizedImage = vi.fn();
const uploadFile = vi.fn();

vi.mock('../../src/lib/storage', () => ({
  StoragePaths: {
    PRODUCTS: 'products/',
    AI_GENERATIONS: 'ai-generations/',
    AI_REFERENCE_IMAGES: 'ai-reference-images/',
    USER_UPLOADS: 'user-uploads/',
    AVATARS: 'avatars/',
    FRAMES: 'frames/',
    TEMP: 'temp/',
  },
  uploadOptimizedImage: (...args: unknown[]) => uploadOptimizedImage(...args),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));

const { buildProductMedia } = await import('../../src/lib/product-media');

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 9, g: 40, b: 90 } } })
    .png()
    .toBuffer();

beforeEach(() => {
  vi.clearAllMocks();
  uploadOptimizedImage.mockResolvedValue({
    url: 'https://cdn.test/products/123-abc-art.webp',
    key: 'products/123-abc-art.webp',
    bucket: 'test',
    webpUrl: 'https://cdn.test/products/123-abc-art.webp',
    variants: [
      { name: 'card', width: 400, url: 'https://cdn.test/c.webp', key: 'c.webp' },
      { name: 'detail', width: 800, url: 'https://cdn.test/d.webp', key: 'd.webp' },
    ],
    width: MAT_CANVAS,
    height: MAT_CANVAS,
  });
  uploadFile.mockResolvedValue({
    url: 'https://cdn.test/products/originals/123-abc-art.png',
    key: 'products/originals/123-abc-art.png',
    bucket: 'test',
  });
});

describe('buildProductMedia', () => {
  it("mats a 'main' image and leaves crop undefined", async () => {
    const r = await buildProductMedia(await png(1400, 2100), 'art.png', 'image/png', {
      type: 'main',
      altText: 'Wabi-sabi wall art',
    });
    expect(r.type).toBe('main');
    expect(r.crop).toBeUndefined();
    expect(r.altText).toBe('Wabi-sabi wall art');
  });

  it('records the crop window for a photographic type', async () => {
    const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    const r = await buildProductMedia(await png(1600, 900), 'room.png', 'image/png', {
      type: 'room-mockup',
      altText: 'In a living room',
      crop,
    });
    expect(r.type).toBe('room-mockup');
    expect(r.crop).toEqual(crop);
  });

  it('ignores a crop supplied for a main image (artwork is never cropped)', async () => {
    const r = await buildProductMedia(await png(1400, 2100), 'art.png', 'image/png', {
      type: 'main',
      altText: 'a',
      crop: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
    });
    expect(r.crop).toBeUndefined();
  });

  it('satisfies the square contract for every type', async () => {
    for (const type of ['main', 'room-mockup', 'detail', 'texture', 'frame-preview'] as const) {
      const r = await buildProductMedia(await png(1600, 900), 'x.png', 'image/png', {
        type,
        altText: 't',
      });
      expect(r.width).toBe(r.height);
      expect(r.width).toBe(MAT_CANVAS);
    }
  });

  it('always returns an originalKey so the crop stays revisable', async () => {
    const r = await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'detail',
      altText: 'd',
    });
    expect(r.originalKey).toBe('products/originals/123-abc-art.png');
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it('stores the untouched source, not the squared buffer, as the original', async () => {
    const source = await png(1600, 900);
    await buildProductMedia(source, 'x.png', 'image/png', { type: 'detail', altText: 'd' });
    const storedBuffer = uploadFile.mock.calls[0]![0] as Buffer;
    expect(storedBuffer.equals(source)).toBe(true);
  });

  it('files the original under an originals/ prefix', async () => {
    await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'detail',
      altText: 'd',
    });
    const key = uploadFile.mock.calls[0]![1] as string;
    expect(key).toContain('products/originals/');
  });

  it('passes a genuinely squared buffer to the variant pipeline', async () => {
    await buildProductMedia(await png(1600, 900), 'x.png', 'image/png', {
      type: 'main',
      altText: 'a',
    });
    const squared = uploadOptimizedImage.mock.calls[0]![0] as Buffer;
    const m = await sharp(squared).metadata();
    expect(m.width).toBe(MAT_CANVAS);
    expect(m.height).toBe(MAT_CANVAS);
  });

  it('carries the variants through from the upload result', async () => {
    const r = await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'main',
      altText: 'a',
    });
    expect(r.variants).toHaveLength(2);
    expect(r.variants?.[0]?.name).toBe('card');
  });

  it('defaults sortOrder to 0 and honours an explicit value', async () => {
    const a = await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'main',
      altText: 'a',
    });
    expect(a.sortOrder).toBe(0);
    const b = await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'detail',
      altText: 'b',
      sortOrder: 3,
    });
    expect(b.sortOrder).toBe(3);
  });

  it('generates a unique id per call', async () => {
    const a = await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'main',
      altText: 'a',
    });
    const b = await buildProductMedia(await png(800, 800), 'x.png', 'image/png', {
      type: 'main',
      altText: 'a',
    });
    expect(a.id).not.toBe(b.id);
  });

  /**
   * The artBox this returns is what the orientation guard in
   * routes/admin/products.ts weighs the admin's declared `orientation`
   * against, and what backfill-art-box.ts audits the column with. A phone
   * photograph stored landscape under `orientation: 6` therefore reaches the
   * guard as whatever this measures — so if the upload path read the stored
   * rectangle, the guard built to catch orientation drift would refuse a
   * correct `portrait` declaration and accept a wrong `landscape` one, on
   * exactly the inputs it exists to police. #716.
   */
  it('measures the artBox on the displayed rectangle of an EXIF-tagged source', async () => {
    const tagged = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: { r: 9, g: 40, b: 90 } },
    })
      .withMetadata({ orientation: 6 }) // rotate 90 CW to display: 800x1600
      .jpeg({ quality: 100 })
      .toBuffer();

    const image = await buildProductMedia(tagged, 'phone.jpg', 'image/jpeg', {
      type: 'main',
      altText: 'a',
    });

    expect(image.artBox).toBeDefined();
    expect(image.artBox!.h).toBeGreaterThan(image.artBox!.w);
  });
});
