/**
 * Tests for Review Media Upload Routes
 *
 * - POST /api/reviews/:reviewId/media/presign  - authorise a direct-to-R2 PUT
 * - POST /api/reviews/:reviewId/media/complete - record the uploaded object
 *
 * Both require authentication, and only the review's own author may attach
 * media, and only while the review is still `pending`.
 *
 * Note on the harness: this imports the route module DIRECTLY and mocks its
 * collaborators (db, auth, storage, redis, the transcode queue) rather than
 * booting `src/index.ts` behind a try/catch-into-null. That pattern makes
 * every assertion pass vacuously when the database is unreachable — which is
 * exactly the state a new route's first run is in. Same reasoning as
 * tests/routes/wishlist.test.ts.
 *
 * @see packages/api/src/routes/review-media.ts
 * @see plan/tracker-data/in-progress/feature-review-surfaces-parity/ticket-0481-backend-api-review-media-presi.yaml
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const insertMock = vi.fn();
const transactionMock = vi.fn();
const txSelectMock = vi.fn();
const txInsertMock = vi.fn();
/** Captures the row handed to `tx.insert(...).values(...)`. */
const insertValuesMock = vi.fn();

/**
 * Ordered trace of the database calls one request makes, labelled by role.
 *
 * The cap on media per review is only safe if the count and the insert are in
 * the *same* transaction — two completes racing would otherwise both read four
 * rows and both insert. That is a property of where the calls happen, not of
 * whether they happen, so it takes an ordered trace to assert.
 */
const dbCalls: string[] = [];

/** Lock modes passed to `.for(...)` on the parent review row. */
const lockModes: string[] = [];

interface Tx {
  select: (...args: unknown[]) => unknown;
  insert: (...args: unknown[]) => unknown;
}

/**
 * The transaction handle `db.transaction(cb)` hands its callback.
 *
 * Its select and insert run through their own mocks rather than the outer
 * ones on purpose: presign counts media on `db`, complete counts it on `tx`,
 * and a single shared `mockReturnValueOnce` queue would happily let either
 * path consume the stub queued for the other.
 */
const tx: Tx = {
  select: (...args: unknown[]) => txSelectMock(...args),
  insert: (...args: unknown[]) => txInsertMock(...args),
};

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    // Still mocked although the route no longer writes through it: a
    // regression back to a non-transactional insert must be visible as a
    // called mock, not invisible as a missing one.
    insert: (...args: unknown[]) => insertMock(...args),
    transaction: (fn: (t: Tx) => unknown) => transactionMock(fn),
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const authUser = c.req.header('X-Test-User');
    if (authUser) {
      c.set('user', JSON.parse(authUser));
      return next();
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }),
}));

const presignMock = vi.fn(
  async (key: string) => `https://r2.test.example.com/${key}?signed=1`
);

vi.mock('../../src/lib/storage', async (importOriginal) => {
  // REVIEW_MEDIA_LIMITS / StoragePaths are the real thing on purpose: the
  // caps and the key layout are what these tests are asserting about.
  const actual = await importOriginal<typeof import('../../src/lib/storage')>();
  return {
    ...actual,
    getPresignedUploadUrl: (key: string, contentType: string) =>
      presignMock(key, contentType),
    getPublicUrl: (key: string) => `https://cdn.test.example.com/${key}`,
  };
});

const queueAddMock = vi.fn(async () => ({ id: 'job-1' }));

vi.mock('../../src/queues/review-media', () => ({
  reviewMediaQueue: { add: (...args: unknown[]) => queueAddMock(...args) },
}));

const deleteCachedPatternMock = vi.fn(async () => 0);

vi.mock('../../src/lib/redis', () => ({
  deleteCachedPattern: (...args: unknown[]) => deleteCachedPatternMock(...args),
}));

import reviewMediaApp from '../../src/routes/review-media';
import { readJson } from '../helpers/json';

const app = new Hono();
app.route('/api/reviews', reviewMediaApp);

// ============================================================================
// Fixtures
// ============================================================================

const USER = { id: 'user-123', email: 'author@example.com', name: 'Author' };
const OTHER_USER = { id: 'user-999', email: 'nosy@example.com', name: 'Nosy' };

const AUTH = { 'X-Test-User': JSON.stringify(USER) };
const OTHER_AUTH = { 'X-Test-User': JSON.stringify(OTHER_USER) };

const REVIEW_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const MEDIA_ID = '33333333-3333-4333-8333-333333333333';

const MB = 1024 * 1024;

/** The object key a presign for this review would have handed back. */
const OWNED_KEY = `reviews/${REVIEW_ID}/media/abcd.jpg`;
const OWNED_VIDEO_KEY = `reviews/${REVIEW_ID}/media/abcd.mp4`;

const ownReview = (overrides: Record<string, unknown> = {}) => ({
  id: REVIEW_ID,
  userId: USER.id,
  productId: PRODUCT_ID,
  status: 'pending',
  ...overrides,
});

/**
 * Stub every select the two handlers make, on both paths at once.
 *
 * presign:  review lookup, then the media count — both on the outer `db`.
 * complete: review lookup on the outer `db`, then, inside the transaction, a
 *           `FOR UPDATE` lock on the parent review and only then the count.
 *
 * The outer and transactional queues are separate, so arming both costs
 * nothing and neither path can be answered by the other's stub.
 */
function givenReview(
  review: Record<string, unknown> | null,
  mediaCount = 0
): void {
  selectMock
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => {
            dbCalls.push('db:review');
            return Promise.resolve(review ? [review] : []);
          },
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => {
          dbCalls.push('db:count');
          return Promise.resolve([{ count: mediaCount }]);
        },
      }),
    });

  txSelectMock
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          for: (mode: string) => {
            dbCalls.push('tx:lock');
            lockModes.push(mode);
            return Promise.resolve(review ? [{ id: review.id }] : []);
          },
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => {
          dbCalls.push('tx:count');
          return Promise.resolve([{ count: mediaCount }]);
        },
      }),
    });
}

const presign = (body: unknown, headers: Record<string, string> = AUTH) =>
  app.request(`/api/reviews/${REVIEW_ID}/media/presign`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const complete = (body: unknown, headers: Record<string, string> = AUTH) =>
  app.request(`/api/reviews/${REVIEW_ID}/media/complete`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * No media row was written by either route into the database — neither the
 * transactional insert the handler uses nor the bare `db.insert` it must never
 * fall back to.
 */
function expectNoMediaInserted(): void {
  expect(txInsertMock).not.toHaveBeenCalled();
  expect(insertMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockReset, not clear: the helpers queue `mockReturnValueOnce` chains and a
  // leftover entry from a previous test would answer the next test's lookup.
  selectMock.mockReset();
  insertMock.mockReset();
  transactionMock.mockReset();
  txSelectMock.mockReset();
  txInsertMock.mockReset();
  dbCalls.length = 0;
  lockModes.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Runs the callback inline against `tx` and brackets it in the trace, so a
  // call can be placed inside or outside the transaction.
  transactionMock.mockImplementation(async (fn: (t: Tx) => unknown) => {
    dbCalls.push('tx:begin');
    try {
      return await fn(tx);
    } finally {
      dbCalls.push('tx:end');
    }
  });

  txInsertMock.mockReturnValue({
    values: (row: Record<string, unknown>) => {
      dbCalls.push('tx:insert');
      insertValuesMock(row);
      return { returning: async () => [{ id: MEDIA_ID, ...row }] };
    },
  });
});

// ============================================================================
// Schema and infrastructure assumptions the routes depend on
// ============================================================================

describe('schema assumptions', () => {
  /**
   * `db` is mocked in every test below, so a reference to a column that does
   * not exist executes nowhere and every assertion still passes. These are
   * the only defence against that.
   */
  it('reviewMedia carries the columns the routes write', async () => {
    const { reviewMedia } = await import(
      '../../src/database/schema/review-media'
    );
    expect(reviewMedia.reviewId).toBeDefined();
    expect(reviewMedia.mediaType).toBeDefined();
    expect(reviewMedia.processingStatus).toBeDefined();
    expect(reviewMedia.sortOrder).toBeDefined();
    expect(reviewMedia.url).toBeDefined();
  });

  it('reviews carries userId and status', async () => {
    const { reviews } = await import('../../src/database/schema/reviews');
    expect(reviews.userId).toBeDefined();
    expect(reviews.status).toBeDefined();
  });
});

// ============================================================================
// Auth
// ============================================================================

describe('authentication', () => {
  const paths = [
    `/api/reviews/${REVIEW_ID}/media/presign`,
    `/api/reviews/${REVIEW_ID}/media/complete`,
  ];

  for (const path of paths) {
    it(`POST ${path} is 401 without a session`, async () => {
      const res = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  }
});

// ============================================================================
// POST /:reviewId/media/presign
// ============================================================================

describe('POST /api/reviews/:reviewId/media/presign', () => {
  it('returns an upload url and key for an image', async () => {
    givenReview(ownReview());

    const res = await presign({
      contentType: 'image/jpeg',
      sizeBytes: 2 * MB,
      filename: 'photo.jpg',
    });
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.key).toMatch(
      new RegExp(`^reviews/${REVIEW_ID}/media/[0-9a-f-]{36}\\.jpg$`)
    );
    expect(body.uploadUrl).toContain(body.key);
    expect(body.mediaType).toBe('image');
    expect(presignMock).toHaveBeenCalledWith(body.key, 'image/jpeg');
  });

  it('returns an upload url and key for a video', async () => {
    givenReview(ownReview());

    const res = await presign({
      contentType: 'video/mp4',
      sizeBytes: 40 * MB,
      filename: 'clip.mp4',
    });
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.key).toMatch(
      new RegExp(`^reviews/${REVIEW_ID}/media/[0-9a-f-]{36}\\.mp4$`)
    );
    expect(body.mediaType).toBe('video');
  });

  it('keys an iPhone .mov under its own extension', async () => {
    // The worker recomputes derivative keys from the source key, so the
    // extension has to survive the round trip rather than collapse to .mp4.
    givenReview(ownReview());

    const res = await presign({
      contentType: 'video/quicktime',
      sizeBytes: 40 * MB,
      filename: 'IMG_0042.MOV',
    });
    expect(res.status).toBe(200);
    expect((await readJson(res)).key).toMatch(/\.mov$/);
  });

  it('is 404 for a review that does not exist', async () => {
    givenReview(null);

    const res = await presign({
      contentType: 'image/jpeg',
      sizeBytes: MB,
      filename: 'photo.jpg',
    });
    expect(res.status).toBe(404);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('is 403 when the caller is not the review author', async () => {
    givenReview(ownReview());

    const res = await presign(
      { contentType: 'image/jpeg', sizeBytes: MB, filename: 'photo.jpg' },
      OTHER_AUTH
    );
    expect(res.status).toBe(403);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('is 409 once the review has left pending', async () => {
    // Media may not be bolted onto an already-approved review — it would go
    // live without ever passing moderation.
    givenReview(ownReview({ status: 'approved' }));

    const res = await presign({
      contentType: 'image/jpeg',
      sizeBytes: MB,
      filename: 'photo.jpg',
    });
    expect(res.status).toBe(409);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('is 400 for a disallowed mime type', async () => {
    givenReview(ownReview());

    const res = await presign({
      contentType: 'application/pdf',
      sizeBytes: MB,
      filename: 'invoice.pdf',
    });
    expect(res.status).toBe(400);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('is 400 for an image over the 10MB image cap', async () => {
    givenReview(ownReview());

    const res = await presign({
      contentType: 'image/png',
      sizeBytes: 11 * MB,
      filename: 'huge.png',
    });
    expect(res.status).toBe(400);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('is 400 for a video over the 200MB video cap', async () => {
    givenReview(ownReview());

    const res = await presign({
      contentType: 'video/mp4',
      sizeBytes: 201 * MB,
      filename: 'huge.mp4',
    });
    expect(res.status).toBe(400);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('applies the video cap to video, not the image cap', async () => {
    // A 40MB clip is well over the image limit and well under the video one.
    givenReview(ownReview());

    const res = await presign({
      contentType: 'video/mp4',
      sizeBytes: 40 * MB,
      filename: 'clip.mp4',
    });
    expect(res.status).toBe(200);
  });

  it('is 409 on the sixth media for one review', async () => {
    givenReview(ownReview(), 5);

    const res = await presign({
      contentType: 'image/jpeg',
      sizeBytes: MB,
      filename: 'sixth.jpg',
    });
    expect(res.status).toBe(409);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('still presigns the fifth', async () => {
    givenReview(ownReview(), 4);

    const res = await presign({
      contentType: 'image/jpeg',
      sizeBytes: MB,
      filename: 'fifth.jpg',
    });
    expect(res.status).toBe(200);
  });

  it('is 400 for a malformed review id', async () => {
    const res = await app.request('/api/reviews/not-a-uuid/media/presign', {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: 'image/jpeg',
        sizeBytes: MB,
        filename: 'photo.jpg',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('is 400 when sizeBytes is missing', async () => {
    givenReview(ownReview());

    const res = await presign({
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
    });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /:reviewId/media/complete
// ============================================================================

describe('POST /api/reviews/:reviewId/media/complete', () => {
  it('records an image as ready and enqueues nothing', async () => {
    givenReview(ownReview());

    const res = await complete({
      key: OWNED_KEY,
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(201);

    const row = insertValuesMock.mock.calls[0]![0];
    expect(row.mediaType).toBe('image');
    expect(row.processingStatus).toBe('ready');
    expect(row.reviewId).toBe(REVIEW_ID);
    expect(row.url).toBe(`https://cdn.test.example.com/${OWNED_KEY}`);

    expect(queueAddMock).not.toHaveBeenCalled();

    const body = await readJson(res);
    expect(body.media.id).toBe(MEDIA_ID);
    expect(body.media.processingStatus).toBe('ready');
  });

  it('records a video as processing and enqueues exactly one transcode', async () => {
    givenReview(ownReview());

    const res = await complete({
      key: OWNED_VIDEO_KEY,
      contentType: 'video/mp4',
    });
    expect(res.status).toBe(201);

    const row = insertValuesMock.mock.calls[0]![0];
    expect(row.mediaType).toBe('video');
    expect(row.processingStatus).toBe('processing');

    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock).toHaveBeenCalledWith(
      'transcode',
      expect.objectContaining({
        mediaId: MEDIA_ID,
        sourceKey: OWNED_VIDEO_KEY,
      })
    );
  });

  it('honours an explicit sortOrder', async () => {
    givenReview(ownReview());

    await complete({
      key: OWNED_KEY,
      contentType: 'image/jpeg',
      sortOrder: 3,
    });
    expect(insertValuesMock.mock.calls[0]![0].sortOrder).toBe(3);
  });

  it('invalidates the review caches', async () => {
    givenReview(ownReview());

    await complete({ key: OWNED_KEY, contentType: 'image/jpeg' });
    expect(deleteCachedPatternMock).toHaveBeenCalled();
    const patterns = deleteCachedPatternMock.mock.calls.map(
      (call) => call[0] as string
    );
    expect(patterns.some((p) => p.includes(PRODUCT_ID))).toBe(true);
  });

  it('is 404 for a review that does not exist', async () => {
    givenReview(null);

    const res = await complete({ key: OWNED_KEY, contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
    expectNoMediaInserted();
  });

  it("is 403 for someone else's review", async () => {
    givenReview(ownReview());

    const res = await complete(
      { key: OWNED_KEY, contentType: 'image/jpeg' },
      OTHER_AUTH
    );
    expect(res.status).toBe(403);
    expectNoMediaInserted();
  });

  it('is 409 once the review has left pending', async () => {
    givenReview(ownReview({ status: 'approved' }));

    const res = await complete({ key: OWNED_KEY, contentType: 'image/jpeg' });
    expect(res.status).toBe(409);
    expectNoMediaInserted();
  });

  it('rejects a key belonging to another review', async () => {
    // The key is client-supplied. Without this the caller can point a media
    // row at any object in the bucket, including another customer's upload.
    givenReview(ownReview());

    const res = await complete({
      key: 'reviews/99999999-9999-4999-8999-999999999999/media/stolen.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(400);
    expectNoMediaInserted();
  });

  it('rejects a key that escapes the media prefix entirely', async () => {
    givenReview(ownReview());

    const res = await complete({
      key: 'products/hero.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(400);
    expectNoMediaInserted();
  });

  it('is 400 for a disallowed mime type', async () => {
    givenReview(ownReview());

    const res = await complete({
      key: `reviews/${REVIEW_ID}/media/invoice.pdf`,
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(400);
    expectNoMediaInserted();
  });

  it('is 409 on the sixth media for one review', async () => {
    givenReview(ownReview(), 5);

    const res = await complete({ key: OWNED_KEY, contentType: 'image/jpeg' });
    expect(res.status).toBe(409);
    expectNoMediaInserted();
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('counts and inserts inside one transaction, behind a row lock', async () => {
    // The cap is only real if these two are atomic. Two completes arriving at
    // once would otherwise both read four rows, both pass `< 5`, and both
    // insert — six media on a five-media review. Checking that the count
    // merely precedes the insert would not catch that; what has to hold is
    // that the count, the check and the insert are in the same transaction,
    // and that the transaction takes the parent review's row lock first so
    // the second caller waits rather than reading stale rows.
    givenReview(ownReview(), 4);

    const res = await complete({ key: OWNED_KEY, contentType: 'image/jpeg' });
    expect(res.status).toBe(201);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(dbCalls).toEqual([
      'db:review',
      'tx:begin',
      'tx:lock',
      'tx:count',
      'tx:insert',
      'tx:end',
    ]);
    expect(lockModes).toEqual(['update']);
  });

  it('is 400 when key is missing', async () => {
    givenReview(ownReview());

    const res = await complete({ contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Mounting
// ============================================================================

describe('mounting', () => {
  /**
   * Asserted against the source text rather than by booting `src/index.ts`:
   * importing the app opens a database pool and a redis connection, which is
   * exactly the dependency this suite exists without.
   */
  const indexSource = readFileSync(
    join(__dirname, '../../src/index.ts'),
    'utf8'
  );

  it('imports the media router in src/index.ts', () => {
    expect(indexSource).toMatch(
      /import\s+reviewMediaApp\s+from\s+["']\.\/routes\/review-media["']/
    );
  });

  it('mounts the media router under /api/reviews', () => {
    expect(indexSource).toMatch(
      /app\.route\(\s*["']\/api\/reviews["']\s*,\s*reviewMediaApp\s*\)/
    );
  });
});
