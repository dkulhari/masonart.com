/**
 * Attribution on privilege changes and gift-card tender.
 *
 * Role assignment was the starkest hole in the trail: `customers.ts` read the
 * current user only to block self-demotion and then stored nobody, so an account
 * promoted to admin left no record of who promoted it. That is the one event an
 * intrusion investigation starts from.
 *
 * Gift cards are money that can be created from nothing, so issue, disable,
 * enable and adjust all land rows — with one hard constraint asserted below: the
 * plaintext code exists once, in the admin's response, and must never reach the
 * audit table, which every admin can read for the next 400 days.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const selectMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
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
    c.set('user', { id: 'admin-1', email: 'admin@chobii.art', role: 'super-admin' });
    return next();
  }),
  requireAdmin: vi.fn((_c: any, next: any) => next()),
  requireContentManager: vi.fn((_c: any, next: any) => next()),
}));

const issueGiftCard = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/gift-card', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/gift-card')>()),
  issueGiftCard: (...args: unknown[]) => issueGiftCard(...args),
}));

const { adminCustomersApp } = await import('../../../src/routes/admin/customers');
const { adminGiftCardsApp } = await import('../../../src/routes/admin/gift-cards');

const CHAIN = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'set', 'returning', 'orderBy'];

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
  instance.route('/api/admin/customers', adminCustomersApp);
  instance.route('/api/admin/gift-cards', adminGiftCardsApp);
  return instance;
}

const json = (path: string, method: string, body?: unknown) =>
  app().request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const auditArgs = () => recordAudit.mock.calls[0]?.[1] as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  recordAudit.mockResolvedValue(undefined);
  queue(updateMock, []);
});

describe('PUT /api/admin/customers/:id/role', () => {
  it('records who promoted whom, and from what', async () => {
    queue(selectMock, [{ id: 'u2', role: 'customer' }]);

    const res = await json('/api/admin/customers/u2/role', 'PUT', {
      role: 'content-manager',
    });

    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(auditArgs()).toMatchObject({
      action: 'user.role_changed',
      entityType: 'user',
      entityId: 'u2',
    });
    expect(auditArgs().before).toMatchObject({ role: 'customer' });
    expect(auditArgs().after).toMatchObject({ role: 'content-manager' });
  });

  it('records a refused attempt on a super-admin, which is the interesting one', async () => {
    queue(selectMock, [{ id: 'u3', role: 'super-admin' }]);

    const res = await json('/api/admin/customers/u3/role', 'PUT', { role: 'customer' });

    expect(res.status).toBe(403);
    expect(auditArgs()).toMatchObject({
      action: 'user.role_changed',
      outcome: 'failure',
      entityId: 'u3',
    });
  });

  it('records a refused self-demotion', async () => {
    queue(selectMock, [{ id: 'admin-1', role: 'admin' }]);

    const res = await json('/api/admin/customers/admin-1/role', 'PUT', { role: 'customer' });

    expect(res.status).toBe(403);
    expect(auditArgs()).toMatchObject({ outcome: 'failure', entityId: 'admin-1' });
  });
});

describe('gift card tender', () => {
  it('records an issue without ever carrying the plaintext code', async () => {
    issueGiftCard.mockResolvedValue({
      card: {
        id: 'gc-1',
        last4: '4242',
        balancePaise: 100000,
        initialBalancePaise: 100000,
        currency: 'INR',
        disabledAt: null,
        expiresAt: null,
        createdAt: new Date(),
      },
      code: 'ABCD-EFGH-IJKL-MNOP',
    });

    const res = await json('/api/admin/gift-cards', 'POST', {
      amountPaise: 100000,
      reason: 'Goodwill for a late delivery',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'gift_card.issued',
      entityType: 'gift_card',
      entityId: 'gc-1',
    });

    // The code exists once, in the response above. An audit row is readable by
    // every admin for 400 days; a bearer instrument must not be in it.
    expect(JSON.stringify(recordAudit.mock.calls[0])).not.toContain('ABCD');
  });

  it('records a disable against the card', async () => {
    queue(updateMock, [
      {
        id: 'gc-1',
        last4: '4242',
        balancePaise: 100000,
        initialBalancePaise: 100000,
        currency: 'INR',
        disabledAt: new Date(),
        expiresAt: null,
        createdAt: new Date(),
      },
    ]);

    const res = await json('/api/admin/gift-cards/gc-1/disable', 'POST');

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'gift_card.disabled',
      entityType: 'gift_card',
      entityId: 'gc-1',
    });
  });

  it('records an enable, since re-enabling a card is re-issuing tender', async () => {
    queue(updateMock, [
      {
        id: 'gc-1',
        last4: '4242',
        balancePaise: 100000,
        initialBalancePaise: 100000,
        currency: 'INR',
        disabledAt: null,
        expiresAt: null,
        createdAt: new Date(),
      },
    ]);

    const res = await json('/api/admin/gift-cards/gc-1/enable', 'POST');

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({ action: 'gift_card.enabled', entityId: 'gc-1' });
  });

  it('records a balance adjustment with the mandatory reason', async () => {
    transactionMock.mockImplementation(async (fn: any) =>
      fn({
        execute: async () => [{ balance_paise: 100000 }],
        update: () =>
          thenable([
            {
              id: 'gc-1',
              last4: '4242',
              balancePaise: 150000,
              initialBalancePaise: 100000,
              currency: 'INR',
              disabledAt: null,
              expiresAt: null,
              createdAt: new Date(),
            },
          ]),
        insert: () => ({ values: async () => undefined }),
      })
    );

    const res = await json('/api/admin/gift-cards/gc-1/adjust', 'POST', {
      amountPaise: 50000,
      reason: 'Undercredited on refund CH-9',
    });

    expect(res.status).toBe(200);
    expect(auditArgs()).toMatchObject({
      action: 'gift_card.adjusted',
      entityType: 'gift_card',
      entityId: 'gc-1',
    });
    expect(String(auditArgs().summary)).toContain('Undercredited on refund CH-9');
    expect(auditArgs().after).toMatchObject({ balancePaise: 150000 });
  });
});
