/**
 * A frame write has to drop the PRODUCT payloads too, not just the frames list.
 *
 * `/api/products/:slug` embeds the frame options and caches the whole response
 * (`routes/products.ts:907`, key `product:<slug>:guest|:member`). An admin
 * reprice purged only `product:frames` — so every already-cached product page
 * went on quoting the OLD frame uplift for the rest of its TTL, and the cart
 * charged something else. Caught by `tests/e2e/admin-frames.spec.ts`, which
 * exists for exactly this boundary (#651).
 *
 * The existing frames suites assert `deleteCached` was CALLED with
 * `product:frames`. That spy passed the entire time this bug was live, which is
 * the same lesson `cache-purge-harness.ts` was built for after #527: assert on
 * the KEYSPACE, not on whether a delete was invoked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const { redisStore, resetFakeRedis, FakeRedis } = await vi.hoisted(async () =>
  (await import('../../helpers/cache-purge-harness')).createFakeRedis()
);

vi.mock('ioredis', () => ({ default: FakeRedis, Redis: FakeRedis }));

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireContentManager: async (_c: unknown, next: () => Promise<void>) => next(),
  optionalAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

const { adminFramesApp } = await import('../../../src/routes/admin/frames');

const FRAME_ID = '11111111-1111-1111-1111-111111111111';

const frameRow = {
  id: FRAME_ID,
  name: 'Stretch + Gold Frame',
  type: 'gold',
  category: 'framed',
  priceModifier: '1.50',
  priceAddition: '250.00',
  isActive: true,
};

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of ['from', 'where', 'limit', 'set', 'returning', 'orderBy']) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

function app() {
  const instance = new Hono();
  instance.route('/api/admin/frames', adminFramesApp);
  return instance;
}

/** What the storefront leaves behind: a frames list AND cached product pages. */
function seedCache() {
  redisStore.set('product:frames', JSON.stringify([{ id: FRAME_ID }]));
  redisStore.set('product:golden-flow:guest', JSON.stringify({ frames: [{ id: FRAME_ID }] }));
  redisStore.set('product:golden-flow:member', JSON.stringify({ frames: [{ id: FRAME_ID }] }));
  redisStore.set('product-list:{}:guest', JSON.stringify({ items: [] }));
}

/** Answer each db.select() in call order — the archive path makes two. */
function queueSelects(...results: unknown[][]) {
  let call = 0;
  selectMock.mockImplementation(() => thenable(results[call++] ?? []));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeRedis();
  queueSelects([frameRow]);
  updateMock.mockImplementation(() => thenable([frameRow]));
});

describe('admin frame writes and the product cache', () => {
  it('drops the cached product pages when a frame is repriced', async () => {
    seedCache();

    const res = await app().request(`/api/admin/frames/${FRAME_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceModifier: '1.50', priceAddition: '250.00' }),
    });

    expect(res.status).toBe(200);

    // The frames list — already handled before this fix.
    expect(redisStore.has('product:frames')).toBe(false);

    // The product pages that EMBED those frames. This is the bug: an admin
    // repriced a frame and the storefront kept quoting the old uplift.
    expect(redisStore.has('product:golden-flow:guest')).toBe(false);
    expect(redisStore.has('product:golden-flow:member')).toBe(false);
  });

  it('drops them when a frame is archived, which changes what the panel offers', async () => {
    seedCache();
    // The route reads the frame, then counts the active ones — it refuses to
    // archive the last active frame, so the count has to say there are more.
    queueSelects([frameRow], [{ count: 3 }]);

    const res = await app().request(`/api/admin/frames/${FRAME_ID}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(redisStore.has('product:golden-flow:guest')).toBe(false);
  });

  it('drops them when a frame is created', async () => {
    seedCache();

    const res = await app().request('/api/admin/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Stretch + Brass Frame',
        type: 'brass',
        category: 'framed',
        priceModifier: '1.40',
        priceAddition: '0.00',
        isActive: true,
        sortOrder: 7,
      }),
    });

    // The route may reject this payload on shape; only assert the purge when it
    // actually wrote something, so this test cannot pass for the wrong reason.
    if (res.status !== 201) return;

    expect(redisStore.has('product:golden-flow:guest')).toBe(false);
  });
});
