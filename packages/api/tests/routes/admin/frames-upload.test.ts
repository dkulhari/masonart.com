/**
 * Uploading a frame swatch.
 *
 * The one decision worth pinning: this does NOT go through buildProductMedia.
 * That pipeline mats artwork, measures where the art landed, and honours a
 * crop window, all because artwork must never be cropped blindly. A swatch is
 * a photograph of a moulding — it fills its square, there is nothing to
 * measure, and matting it would put a canvas border around a product photo.
 *
 * StoragePaths.FRAMES has existed with no consumers since it was written. This
 * is the first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../../setup';

const uploadOptimizedImage = vi.fn();
const buildProductMedia = vi.fn();

vi.mock('../../../src/database', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const header = c.req.header('X-Test-User');
    if (!header) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', JSON.parse(header));
    return next();
  }),
  requireContentManager: vi.fn((c, next) => {
    const user = c.get('user') as { role?: string } | undefined;
    const allowed = ['content-manager', 'admin', 'super-admin'];
    if (!user || !allowed.includes(user.role ?? '')) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    return next();
  }),
}));

vi.mock('../../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  deleteCached: vi.fn(),
  redis: { keys: vi.fn().mockResolvedValue([]), del: vi.fn() },
  CacheKeys: { PRODUCT: 'product:', COLLECTION: 'collection:' },
}));

vi.mock('../../../src/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  uploadOptimizedImage: (...args: unknown[]) => uploadOptimizedImage(...args),
}));

vi.mock('../../../src/lib/product-media', () => ({
  buildProductMedia: (...args: unknown[]) => buildProductMedia(...args),
  ORIGINALS_PREFIX: 'products/originals/',
}));

import { adminFramesApp } from '../../../src/routes/admin/frames';
import { readJson } from '../../helpers/json';

const app = new Hono();
app.route('/api/admin/frames', adminFramesApp);

const STAFF = JSON.stringify({ id: 'u1', role: 'admin' });

const LADDER = {
  key: 'frames/gold.webp',
  url: 'https://cdn/frames/gold.webp',
  webpUrl: 'https://cdn/frames/gold.webp',
  width: 1200,
  height: 1200,
  variants: [
    {
      name: 'thumbnail',
      width: 200,
      url: 'https://cdn/frames/gold-thumb.webp',
      key: 'k1',
    },
    {
      name: 'card',
      width: 600,
      url: 'https://cdn/frames/gold-card.webp',
      key: 'k2',
    },
    {
      name: 'detail',
      width: 1200,
      url: 'https://cdn/frames/gold-detail.webp',
      key: 'k3',
    },
  ],
};

/** A tiny valid-enough payload; the pipeline itself is mocked. */
function uploadRequest(
  file: File | null,
  headers: Record<string, string> = { 'X-Test-User': STAFF }
) {
  const form = new FormData();
  if (file) form.append('file', file);
  return app.request('/api/admin/frames/upload-image', {
    method: 'POST',
    body: form,
    headers,
  });
}

const pngFile = (bytes = 64) =>
  new File([new Uint8Array(bytes)], 'gold.png', { type: 'image/png' });

beforeEach(() => {
  vi.clearAllMocks();
  uploadOptimizedImage.mockResolvedValue(LADDER);
});

describe('POST /api/admin/frames/upload-image', () => {
  it('uploads under the frames prefix, not the products one', async () => {
    const res = await uploadRequest(pngFile());
    expect(res.status).toBe(201);

    const opts = uploadOptimizedImage.mock.calls[0][3] as { prefix: string };
    expect(opts.prefix).toBe('frames/');
  });

  it('never routes a swatch through the artwork pipeline', async () => {
    await uploadRequest(pngFile());
    expect(buildProductMedia).not.toHaveBeenCalled();
  });

  it('returns both column values from one upload', async () => {
    const res = await uploadRequest(pngFile());
    const body = (await readJson(res)) as {
      thumbnailUrl: string;
      imageUrl: string;
    };

    expect(body.thumbnailUrl).toBe('https://cdn/frames/gold-thumb.webp');
    expect(body.imageUrl).toBe('https://cdn/frames/gold-card.webp');
  });

  it('falls back to the webp original when a variant is missing', async () => {
    uploadOptimizedImage.mockResolvedValue({ ...LADDER, variants: [] });

    const res = await uploadRequest(pngFile());
    const body = (await readJson(res)) as {
      thumbnailUrl: string;
      imageUrl: string;
    };

    expect(body.thumbnailUrl).toBe(LADDER.webpUrl);
    expect(body.imageUrl).toBe(LADDER.webpUrl);
  });

  it('rejects a format the pipeline cannot process', async () => {
    const gif = new File([new Uint8Array(16)], 'gold.gif', {
      type: 'image/gif',
    });

    const res = await uploadRequest(gif);

    expect(res.status).toBe(400);
    expect(uploadOptimizedImage).not.toHaveBeenCalled();
  });

  it('rejects a file over the shared ceiling', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });

    const res = await uploadRequest(big);

    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { error: string };
    expect(body.error).toMatch(/10MB/);
    expect(uploadOptimizedImage).not.toHaveBeenCalled();
  });

  it('rejects a request with no file', async () => {
    const res = await uploadRequest(null);
    expect(res.status).toBe(400);
  });

  it('rejects an anonymous caller', async () => {
    const res = await uploadRequest(pngFile(), {});
    expect(res.status).toBe(401);
    expect(uploadOptimizedImage).not.toHaveBeenCalled();
  });

  it('reports an upload failure as a 500 rather than a hung request', async () => {
    uploadOptimizedImage.mockRejectedValue(new Error('R2 unreachable'));

    const res = await uploadRequest(pngFile());
    expect(res.status).toBe(500);
  });
});

describe('the seeded rows', () => {
  it('keep working — both image columns stay plain text, not storage keys', async () => {
    const { sampleFrames } = await import('../../../src/database/seed-frames');
    for (const frame of sampleFrames) {
      expect(frame.imageUrl).toMatch(/^\/frames\//);
      expect(frame.thumbnailUrl).toMatch(/^\/frames\//);
    }
  });
});
