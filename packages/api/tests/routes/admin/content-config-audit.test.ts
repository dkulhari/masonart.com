/**
 * Attribution on the config and content writes.
 *
 * These are the `config` and `content` halves of the same gap the catalogue
 * suite covers: an action declared in `AUDIT_ACTIONS` that no route emitted, so
 * the only trace was the middleware's `admin.request` floor row — a method, a
 * path and an actor.
 *
 * Two of them are worse than the usual case, and that is why they are here
 * rather than left to the floor:
 *
 * - **`vendor_rate.updated`** is filed under `config`, but the rate card is what
 *   we PAY a supplier. An unlogged band edit changes what a production job is
 *   worth, and the job records the amount that was live when it was assigned —
 *   so the disagreement surfaces months later with nothing to explain it.
 * - **`review.deleted` and `review_media.deleted`** hard-delete their rows. The
 *   audit row is the only surviving description of what was removed, so the
 *   delta is INVERTED from the usual shape: the removed row's identifying
 *   fields go in `before`, and `after` is null. A row that says only "deleted"
 *   cannot answer whether the right review was taken down.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

const recordAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../../src/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/audit')>()),
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

vi.mock('../../../src/middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/middleware/auth')>()),
  requireAuth: vi.fn((c: any, next: any) => {
    c.set('user', { id: 'admin-1', email: 'admin@chobii.art', role: 'admin' });
    return next();
  }),
  requireAdmin: vi.fn((_c: any, next: any) => next()),
  requireContentManager: vi.fn((_c: any, next: any) => next()),
}));

vi.mock('../../../src/lib/redis', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    deleteCached: vi.fn().mockResolvedValue(undefined),
    deleteCachedPattern: vi.fn().mockResolvedValue(undefined),
    purgeProductResponseCache: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, deleteFile: vi.fn().mockResolvedValue(undefined) };
});

/**
 * The moderation route delegates to the service, which opens its own dynamic
 * `import('../database')` — a second module graph the db mock above does not
 * reach. Replacing the service keeps this suite about the audit row the ROUTE
 * writes; what the service does to the generation is `tests/services/
 * ai-moderation.test.ts`.
 */
const approveGeneration = vi.hoisted(() => vi.fn());
const rejectGeneration = vi.hoisted(() => vi.fn());
const flagGeneration = vi.hoisted(() => vi.fn());
const bulkApprove = vi.hoisted(() => vi.fn());
const bulkReject = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/ai-moderation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  approveGeneration: (...a: unknown[]) => approveGeneration(...a),
  rejectGeneration: (...a: unknown[]) => rejectGeneration(...a),
  flagGeneration: (...a: unknown[]) => flagGeneration(...a),
  bulkApprove: (...a: unknown[]) => bulkApprove(...a),
  bulkReject: (...a: unknown[]) => bulkReject(...a),
}));

const { adminVendorRatesApp } = await import(
  '../../../src/routes/admin/vendor-rates'
);
const { adminVendorsApp } = await import('../../../src/routes/admin/vendors');
const { adminReviewsApp } = await import('../../../src/routes/admin/reviews');
const { adminModerationApp } = await import(
  '../../../src/routes/admin/ai-moderation'
);

const VENDOR_ID = '11111111-1111-4111-8111-111111111111';
const RATE_ID = '44444444-4444-4444-8444-444444444444';
const REVIEW_ID = '00000000-0000-0000-0000-0000000000a1';
const MEDIA_ID = '00000000-0000-0000-0000-0000000000a2';
const PRODUCT_ID = '00000000-0000-0000-0000-0000000000a3';
const GENERATION_ID = '00000000-0000-0000-0000-0000000000b1';
const GENERATION_ID_2 = '00000000-0000-0000-0000-0000000000b2';

const CHAIN = [
  'from',
  'where',
  'limit',
  'offset',
  'innerJoin',
  'leftJoin',
  'set',
  'values',
  'returning',
  'orderBy',
  'groupBy',
];

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN) chain[key] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

function queue(mock: typeof selectMock, ...results: unknown[][]) {
  let call = 0;
  mock.mockImplementation(() => thenable(results[call++] ?? []));
}

function app() {
  const instance = new Hono();
  instance.route('/api/admin/vendors', adminVendorRatesApp);
  instance.route('/api/admin/vendors', adminVendorsApp);
  instance.route('/api/admin/reviews', adminReviewsApp);
  instance.route('/api/admin/ai-moderation', adminModerationApp);
  return instance;
}

const send = (path: string, method: string, body?: unknown) =>
  app().request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const auditCalls = () =>
  recordAudit.mock.calls.map((call) => call[1] as Record<string, any>);
const auditArgs = () => auditCalls()[0];

/** A rate band as drizzle hands one back: `amount` is a STRING. */
const rateRow = (overrides: Record<string, unknown> = {}) => ({
  id: RATE_ID,
  vendorId: VENDOR_ID,
  kind: 'print',
  finish: null,
  longestEdgeMinInches: 0,
  longestEdgeMaxInches: 24,
  amount: '450.00',
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  effectiveTo: null,
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
  queue(selectMock, []);
  queue(updateMock, []);
  queue(insertMock, []);
  queue(deleteMock, []);
});

// ============================================================================
// config — the rate card that prices every production job
// ============================================================================

describe('POST /api/admin/vendors/:id/rates', () => {
  it('records the new band, and the amount it supersedes', async () => {
    queue(
      selectMock,
      [{ id: VENDOR_ID }],
      [rateRow()] // the card as it stands: one open band at ₹450
    );
    queue(updateMock, [rateRow({ effectiveTo: new Date() })]);
    queue(insertMock, [rateRow({ id: 'new-rate', amount: '600.00' })]);

    const res = await send(`/api/admin/vendors/${VENDOR_ID}/rates`, 'POST', {
      kind: 'print',
      longestEdgeMinInches: 0,
      longestEdgeMaxInches: 24,
      amount: '600.00',
    });

    expect(res.status).toBe(201);
    expect(auditArgs()).toMatchObject({
      action: 'vendor_rate.updated',
      entityType: 'vendor_rate',
      entityId: 'new-rate',
    });
    // The supersession is the whole point: a band was closed and another
    // opened, and only together do they explain what we now pay.
    expect(auditArgs().before).toMatchObject({ amount: '450.00' });
    expect(auditArgs().after).toMatchObject({ amount: '600.00' });
  });

  it('records the band with no before when nothing priced it before', async () => {
    queue(selectMock, [{ id: VENDOR_ID }], []);
    queue(insertMock, [rateRow({ id: 'first-rate', amount: '600.00' })]);

    const res = await send(`/api/admin/vendors/${VENDOR_ID}/rates`, 'POST', {
      kind: 'print',
      longestEdgeMinInches: 0,
      longestEdgeMaxInches: 24,
      amount: '600.00',
    });

    expect(res.status).toBe(201);
    expect(auditArgs()).toMatchObject({ action: 'vendor_rate.updated' });
    expect(auditArgs().before ?? null).toBeNull();
  });

  it('writes no row when the band is refused for overlapping', async () => {
    queue(
      selectMock,
      [{ id: VENDOR_ID }],
      [rateRow({ longestEdgeMinInches: 0, longestEdgeMaxInches: 48 })]
    );

    const res = await send(`/api/admin/vendors/${VENDOR_ID}/rates`, 'POST', {
      kind: 'print',
      longestEdgeMinInches: 12,
      longestEdgeMaxInches: 36,
      amount: '600.00',
      effectiveFrom: '2026-06-01T00:00:00.000Z',
    });

    expect(res.status).toBe(422);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/vendors/:id/rates/:rateId', () => {
  it('records only the fields of the band that moved', async () => {
    queue(selectMock, [{ id: VENDOR_ID }], [rateRow()]);
    queue(updateMock, [rateRow({ amount: '525.00' })]);

    const res = await send(
      `/api/admin/vendors/${VENDOR_ID}/rates/${RATE_ID}`,
      'PATCH',
      { amount: '525.00' }
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'vendor_rate.updated',
      entityType: 'vendor_rate',
      entityId: RATE_ID,
    });
    expect(auditArgs().before).toEqual({ amount: '450.00' });
    expect(auditArgs().after).toEqual({ amount: '525.00' });
  });
});

describe('POST /api/admin/vendors/:id/rates/:rateId/close', () => {
  it('records the closure as the end date it set', async () => {
    const endsAt = new Date('2026-07-01T00:00:00Z');
    queue(selectMock, [{ id: VENDOR_ID }], [rateRow()]);
    queue(updateMock, [rateRow({ effectiveTo: endsAt })]);

    const res = await send(
      `/api/admin/vendors/${VENDOR_ID}/rates/${RATE_ID}/close`,
      'POST',
      { effectiveTo: endsAt.toISOString() }
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'vendor_rate.updated',
      entityType: 'vendor_rate',
      entityId: RATE_ID,
    });
    // A Date at the call site; `redactAuditPayload` is what turns it into an
    // ISO string on the way into jsonb, and that is `lib/audit`'s test.
    expect(auditArgs().before).toEqual({ effectiveTo: null });
    expect(auditArgs().after).toEqual({ effectiveTo: endsAt });
  });
});

// ============================================================================
// config — the supplier directory itself (#670's explicit decision)
// ============================================================================

describe('POST /api/admin/vendors', () => {
  it('records the creation, naming the supplier', async () => {
    queue(insertMock, [
      { id: VENDOR_ID, name: 'Nashik Print Works', status: 'active' },
    ]);

    const res = await send('/api/admin/vendors', 'POST', {
      name: 'Nashik Print Works',
    });

    expect(res.status).toBe(201);
    expect(auditArgs()).toMatchObject({
      action: 'vendor.created',
      entityType: 'vendor',
      entityId: VENDOR_ID,
    });
    expect(auditArgs().before ?? null).toBeNull();
    expect(String(auditArgs().summary)).toContain('Nashik Print Works');
  });
});

describe('PATCH /api/admin/vendors/:id', () => {
  /**
   * `vendor_status` is active | inactive | suspended — there is no archived
   * arm, which is why #670 declares no `vendor.archived`. Suspending a supplier
   * is an UPDATE, and the delta is what says which way it went.
   */
  it('records a suspension as the status change it is', async () => {
    queue(selectMock, [
      { id: VENDOR_ID, name: 'Nashik Print Works', status: 'active', city: 'Nashik' },
    ]);
    queue(updateMock, [
      { id: VENDOR_ID, name: 'Nashik Print Works', status: 'suspended', city: 'Nashik' },
    ]);

    const res = await send(`/api/admin/vendors/${VENDOR_ID}`, 'PATCH', {
      status: 'suspended',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'vendor.updated',
      entityType: 'vendor',
      entityId: VENDOR_ID,
    });
    expect(auditArgs().before).toEqual({ status: 'active' });
    expect(auditArgs().after).toEqual({ status: 'suspended' });
  });

  it('writes no row for a vendor that is not there', async () => {
    queue(selectMock, []);

    const res = await send(`/api/admin/vendors/${VENDOR_ID}`, 'PATCH', {
      status: 'inactive',
    });

    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

// ============================================================================
// content — hard deletes, where the row is the only surviving description
// ============================================================================

describe('DELETE /api/admin/reviews/:reviewId', () => {
  it('puts the removed review in before and leaves after null', async () => {
    queue(selectMock, [
      {
        id: REVIEW_ID,
        productId: PRODUCT_ID,
        rating: 1,
        title: 'Terrible',
        content: 'The frame arrived cracked',
        status: 'approved',
        orderItemId: 'order-item-1',
        moderatorId: null,
      },
    ]);

    const res = await send(`/api/admin/reviews/${REVIEW_ID}`, 'DELETE');

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'review.deleted',
      entityType: 'review',
      entityId: REVIEW_ID,
    });
    // Inverted delta. Without these fields the row cannot answer whether the
    // RIGHT review was removed — the row itself is gone.
    expect(auditArgs().before).toMatchObject({
      productId: PRODUCT_ID,
      rating: 1,
      status: 'approved',
      content: 'The frame arrived cracked',
      // Present or null, it is what says whether a verified purchaser was the
      // one silenced — the review row itself is gone.
      orderItemId: 'order-item-1',
    });
    expect(auditArgs().after ?? null).toBeNull();
  });

  it('writes no row when the review is already gone', async () => {
    queue(selectMock, []);

    const res = await send(`/api/admin/reviews/${REVIEW_ID}`, 'DELETE');

    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/reviews/:reviewId/media/:mediaId', () => {
  it('records the URL that was stripped, because the object is gone too', async () => {
    queue(selectMock, [
      {
        id: MEDIA_ID,
        reviewId: REVIEW_ID,
        url: 'https://cdn/review-media/one.jpg',
        thumbnailUrl: 'https://cdn/review-media/one-thumb.jpg',
        posterUrl: null,
        productId: PRODUCT_ID,
      },
    ]);

    const res = await send(
      `/api/admin/reviews/${REVIEW_ID}/media/${MEDIA_ID}`,
      'DELETE'
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'review_media.deleted',
      entityType: 'review_media',
      entityId: MEDIA_ID,
    });
    expect(auditArgs().before).toMatchObject({
      reviewId: REVIEW_ID,
      url: 'https://cdn/review-media/one.jpg',
    });
    expect(auditArgs().after ?? null).toBeNull();
  });
});

// ============================================================================
// content — AI moderation
// ============================================================================

describe('PATCH /api/admin/ai-moderation/:id', () => {
  it('records the moderation decision with the status it moved from', async () => {
    queue(selectMock, [
      { id: GENERATION_ID, moderationStatus: 'pending_review', userId: 'u1' },
    ]);
    rejectGeneration.mockResolvedValue({
      success: true,
      generationId: GENERATION_ID,
      newStatus: 'rejected',
      reviewId: 'review-1',
    });

    const res = await send(
      `/api/admin/ai-moderation/${GENERATION_ID}`,
      'PATCH',
      { action: 'rejected', reason: 'Nudity', category: 'nsfw' }
    );

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'ai_generation.moderated',
      entityType: 'ai_generation',
      entityId: GENERATION_ID,
    });
    expect(auditArgs().before).toEqual({ moderationStatus: 'pending_review' });
    expect(auditArgs().after).toMatchObject({ moderationStatus: 'rejected' });
    // Duplicating what ai_generation_reviews already holds is deliberate: one
    // table answers "who did what", always.
    expect(auditArgs().metadata).toMatchObject({ reason: 'Nudity' });
  });

  it('writes no row when the generation is not there', async () => {
    queue(selectMock, []);

    const res = await send(
      `/api/admin/ai-moderation/${GENERATION_ID}`,
      'PATCH',
      { action: 'approved' }
    );

    expect(res.status).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/ai-moderation/bulk-approve', () => {
  it('records one row per generation that actually moved', async () => {
    queue(
      selectMock,
      [
        { id: GENERATION_ID, moderationStatus: 'pending_review' },
        { id: GENERATION_ID_2, moderationStatus: 'flagged' },
      ],
      [
        { id: GENERATION_ID, moderationStatus: 'approved' },
        // The second one failed inside the bulk loop and did not move, so it
        // must not get a row saying it was approved.
        { id: GENERATION_ID_2, moderationStatus: 'flagged' },
      ]
    );
    bulkApprove.mockResolvedValue({ approved: 1, failed: 1 });

    const res = await send('/api/admin/ai-moderation/bulk-approve', 'POST', {
      generationIds: [GENERATION_ID, GENERATION_ID_2],
    });

    expect(res.status).toBe(200);
    expect(auditCalls()).toHaveLength(1);
    expect(auditArgs()).toMatchObject({
      action: 'ai_generation.moderated',
      entityType: 'ai_generation',
      entityId: GENERATION_ID,
    });
    expect(auditArgs().before).toEqual({ moderationStatus: 'pending_review' });
    expect(auditArgs().after).toEqual({ moderationStatus: 'approved' });
  });
});
