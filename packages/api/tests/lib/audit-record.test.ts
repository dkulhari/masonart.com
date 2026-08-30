/**
 * `recordAudit` — the precise half of the audit trail.
 *
 * Three properties are load-bearing and each has a test here:
 *
 * 1. **It never throws.** A refund that already left the building must not be
 *    rolled back because an INSERT into the audit table failed. The failure is
 *    logged and alerted, not raised.
 * 2. **The actor is snapshotted.** email and role are copied at write time, so
 *    history survives the account and records the role held *then*.
 * 3. **It claims the request.** Setting `audited` on the context is what stops
 *    the middleware floor writing a second, coarser row for the same action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertValues = vi.fn().mockResolvedValue(undefined);
const insert = vi.fn((..._args: unknown[]) => ({ values: insertValues }));

vi.mock('../../src/database', () => ({
  db: { insert: (...args: unknown[]) => insert(...args) },
}));

const alertCritical = vi.fn();
vi.mock('../../src/lib/alerts', () => ({
  alertCritical: (...args: unknown[]) => alertCritical(...args),
}));

const logError = vi.fn();
vi.mock('../../src/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => logError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
  createChildLogger: vi.fn(),
}));

const { recordAudit } = await import('../../src/lib/audit');

/** Minimal stand-in for the Hono context recordAudit reads. */
function contextStub(
  overrides: {
    user?: Record<string, unknown> | null;
    headers?: Record<string, string>;
    requestId?: string;
    vendorId?: string;
    method?: string;
    path?: string;
  } = {}
) {
  const store = new Map<string, unknown>();
  if (overrides.user !== undefined) store.set('user', overrides.user);
  if (overrides.requestId) store.set('requestId', overrides.requestId);
  // What `requireVendor` puts on a real vendor request.
  if (overrides.vendorId) store.set('vendorId', overrides.vendorId);

  const headers = overrides.headers ?? {};

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: {
      method: overrides.method ?? 'POST',
      path: overrides.path ?? '/api/admin/returns/r1/approve',
      header: (name: string) => headers[name.toLowerCase()],
    },
  } as never;
}

const row = () => insertValues.mock.calls[0]?.[0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  insertValues.mockResolvedValue(undefined);
});

describe('recordAudit', () => {
  it('writes one row carrying the action, the derived category and the entity', async () => {
    await recordAudit(contextStub({ user: { id: 'u1', email: 'a@chobii.art', role: 'admin' } }), {
      action: 'return.refund_processed',
      entityType: 'return',
      entityId: 'r1',
      summary: 'Refunded 1240 on return r1',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({
      action: 'return.refund_processed',
      // Derived from the action registry, never passed in — two callers
      // disagreeing about the category would make every filter a lie.
      category: 'money',
      outcome: 'success',
      entityType: 'return',
      entityId: 'r1',
    });
  });

  it('snapshots the actor email and role alongside the id', async () => {
    await recordAudit(
      contextStub({ user: { id: 'u1', email: 'admin@chobii.art', role: 'super-admin' } }),
      { action: 'user.role_changed', entityType: 'user', entityId: 'u2' }
    );

    expect(row()).toMatchObject({
      actorUserId: 'u1',
      actorEmail: 'admin@chobii.art',
      actorRole: 'super-admin',
    });
  });

  it('takes the client IP from cf-connecting-ip, not the forgeable first hop', async () => {
    await recordAudit(
      contextStub({
        user: { id: 'u1', email: 'a@b.c', role: 'admin' },
        headers: {
          'cf-connecting-ip': '203.0.113.9',
          'x-forwarded-for': '10.0.0.1, 203.0.113.9',
          'user-agent': 'Mozilla/5.0',
        },
      }),
      { action: 'order.cancelled', entityType: 'order', entityId: 'o1' }
    );

    expect(row()).toMatchObject({ ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0' });
  });

  it('carries the request id, so a log line and an audit row join', async () => {
    await recordAudit(
      contextStub({ user: { id: 'u1', email: 'a@b.c', role: 'admin' }, requestId: 'req_42' }),
      { action: 'order.status_changed', entityType: 'order', entityId: 'o1' }
    );

    expect(row()).toMatchObject({ requestId: 'req_42' });
  });

  it('records the route in metadata even when the caller passes none', async () => {
    await recordAudit(
      contextStub({
        user: { id: 'u1', email: 'a@b.c', role: 'admin' },
        method: 'PUT',
        path: '/api/admin/customers/u2/role',
      }),
      { action: 'user.role_changed', entityType: 'user', entityId: 'u2' }
    );

    expect(row().metadata).toMatchObject({
      method: 'PUT',
      path: '/api/admin/customers/u2/role',
    });
  });

  it('redacts the payload it is handed', async () => {
    await recordAudit(contextStub({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } }), {
      action: 'gift_card.issued',
      entityType: 'gift_card',
      entityId: 'g1',
      after: { last4: '4242', token: 'plaintext-code' },
    });

    expect(row().after).toMatchObject({ last4: '4242', token: '[redacted]' });
  });

  it('records a refusal as outcome failure rather than dropping the row', async () => {
    await recordAudit(contextStub({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } }), {
      action: 'user.role_changed',
      entityType: 'user',
      entityId: 'u2',
      outcome: 'failure',
      summary: 'Refused: cannot change your own role',
    });

    expect(row()).toMatchObject({ outcome: 'failure' });
  });

  it('claims the request so the middleware floor does not double-write', async () => {
    const c = contextStub({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } });

    await recordAudit(c, { action: 'order.cancelled', entityType: 'order', entityId: 'o1' });

    expect((c as unknown as { get: (k: string) => unknown }).get('audited')).toBe(true);
  });

  it('writes an unauthenticated action with a null actor rather than skipping it', async () => {
    await recordAudit(contextStub({ user: null }), {
      action: 'admin.request',
      entityType: 'order',
      entityId: 'o1',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({ actorUserId: null, actorEmail: null });
  });

  it('swallows a database failure — an audit write must not fail the request', async () => {
    insertValues.mockRejectedValueOnce(new Error('deadlock detected'));

    await expect(
      recordAudit(contextStub({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } }), {
        action: 'return.refund_processed',
        entityType: 'return',
        entityId: 'r1',
      })
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalled();
    expect(alertCritical).toHaveBeenCalled();
  });

  it('writes through a caller-supplied transaction when atomicity is wanted', async () => {
    const txValues = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn(() => ({ values: txValues })) };

    await recordAudit(
      contextStub({ user: { id: 'u1', email: 'a@b.c', role: 'admin' } }),
      { action: 'wallet.adjusted', entityType: 'wallet', entityId: 'w1' },
      tx as never
    );

    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });
});

/**
 * The vendor a row was written FOR — #679.
 *
 * `requireVendor` has always called `c.set('vendorId', …)` and nothing has ever
 * read it, so a vendor's writes carried their user identity but not which shop
 * they represented: two users at one shop were indistinguishable in a dispute
 * *with that shop*.
 *
 * It is read HERE rather than passed by each call site, for the same reason the
 * category is derived and the ip, user agent, request id, method and path are
 * captured: a caller cannot get a context fact wrong if a caller never supplies
 * it. Per-call-site means the first vendor route added next year forgets.
 */
describe('recordAudit — the vendor a row was written for', () => {
  it('carries the context vendorId into metadata without the caller passing it', async () => {
    await recordAudit(
      contextStub({
        user: { id: 'vu1', email: 'printer@shop.example', role: 'vendor' },
        vendorId: 'vendor_9',
        method: 'POST',
        path: '/api/vendor/jobs/j1/transition',
      }),
      { action: 'production_job.transitioned', entityType: 'production_job', entityId: 'j1' }
    );

    expect(row().metadata).toMatchObject({
      method: 'POST',
      path: '/api/vendor/jobs/j1/transition',
      vendorId: 'vendor_9',
    });
  });

  /**
   * Merged AFTER the caller's metadata, so a handler that happens to spread a
   * request body — or that means a different vendor by the same key — cannot
   * make the row claim it was written for a shop it was not.
   */
  it('refuses to let a caller overwrite the vendor it was actually written for', async () => {
    await recordAudit(
      contextStub({
        user: { id: 'vu1', email: 'printer@shop.example', role: 'vendor' },
        vendorId: 'vendor_9',
      }),
      {
        action: 'production_transfer.dispatched',
        entityType: 'production_transfer',
        entityId: 't1',
        metadata: { vendorId: 'vendor_impostor', toVendorId: 'vendor_4' },
      }
    );

    expect((row().metadata as Record<string, unknown>).vendorId).toBe('vendor_9');
    // The rest of the caller's metadata still lands — this is a merge, not a veto.
    expect(row().metadata).toMatchObject({ toVendorId: 'vendor_4' });
  });

  /**
   * An admin acts for nobody. Writing `vendorId: null` on every admin row would
   * make "has a vendorId" stop meaning "was written for a vendor", which is the
   * only question the field exists to answer.
   */
  it('adds no vendorId at all when the context has none', async () => {
    await recordAudit(
      contextStub({ user: { id: 'a1', email: 'admin@chobii.art', role: 'admin' } }),
      { action: 'production_job.assigned', entityType: 'production_job', entityId: 'j1' }
    );

    expect(Object.keys(row().metadata as Record<string, unknown>)).not.toContain('vendorId');
  });

  /**
   * The middleware floor gets it for free: `vendor.request` rows written before
   * a handler claimed the request now say which shop made the request.
   */
  it('retro-improves the vendor.request floor row', async () => {
    await recordAudit(
      contextStub({
        user: { id: 'vu1', email: 'printer@shop.example', role: 'vendor' },
        vendorId: 'vendor_9',
      }),
      { action: 'vendor.request' }
    );

    expect(row().metadata).toMatchObject({ vendorId: 'vendor_9' });
  });

  /**
   * `AuditContext` is structural on purpose — a queue worker or a script hands
   * over a stub rather than faking a whole Hono request. Reading one more key
   * must not turn it into `Pick<Context, …>`, which would also refuse every
   * route that declares its own Variables map.
   */
  it('still accepts a plain object with get/set/req — no Hono involved', async () => {
    const store = new Map<string, unknown>([['vendorId', 'vendor_stub']]);
    const stub = {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
      req: {
        method: 'POST',
        path: '/internal/queue/reprint',
        header: (_name: string) => undefined,
      },
    };

    await recordAudit(stub, {
      action: 'production_job.created',
      entityType: 'production_job',
      entityId: 'j2',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({ category: 'fulfilment', actorUserId: null });
    expect(row().metadata).toMatchObject({ vendorId: 'vendor_stub' });
    expect(store.get('audited')).toBe(true);
  });

  /**
   * Reading one more context key must not have made the writer throwable. A
   * production transition that already committed must not be rolled back
   * because the audit INSERT deadlocked.
   */
  it('still swallows a database failure on a vendor row', async () => {
    insertValues.mockRejectedValueOnce(new Error('deadlock detected'));
    const c = contextStub({
      user: { id: 'vu1', email: 'printer@shop.example', role: 'vendor' },
      vendorId: 'vendor_9',
    });

    await expect(
      recordAudit(c, {
        action: 'production_job.photos_submitted',
        entityType: 'production_job',
        entityId: 'j1',
      })
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalled();
    expect(alertCritical).toHaveBeenCalled();
    // Claimed BEFORE the insert: a failed insert must not let the middleware
    // write a misleading floor row in its place. A missing row beats a lie.
    expect((c as unknown as { get: (k: string) => unknown }).get('audited')).toBe(true);
  });
});
