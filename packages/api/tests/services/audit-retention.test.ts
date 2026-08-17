/**
 * Audit log retention.
 *
 * India's DPDP Act applies: these rows carry customer emails and staff identity
 * for every admin action, so "keep forever" is not a policy, it is an omission.
 * The window is 400 days — comfortably past a financial year plus the disputes
 * that trail it.
 *
 * The purge is the ONLY code path permitted to delete an audit row, and it earns
 * that by opting in explicitly inside its own transaction. Everything here is
 * about that boundary: it deletes what is old, leaves what is not, and cannot
 * work by accident.
 *
 * The trigger side of the same contract is asserted against a live database in
 * tests/database/audit-log-immutability.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const transaction = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: (...args: unknown[]) => execute(...args) })
  )
);

vi.mock('../../src/database', () => ({
  db: { transaction: (...args: unknown[]) => transaction(...args) },
}));

const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/logger', () => ({
  logger: { info: logInfo, error: logError, warn: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createChildLogger: vi.fn(),
  REDACTED_LOG_PATHS: [],
}));

const { purgeExpiredAuditRows, auditRetentionDays, AUDIT_RETENTION_DEFAULT_DAYS } =
  await import('../../src/queues/audit-retention');

/** Every statement the purge ran, rendered to comparable text. */
const statements = () =>
  execute.mock.calls.map((call) => {
    const fragment = call[0] as { queryChunks?: unknown[] };
    return JSON.stringify(fragment?.queryChunks ?? fragment);
  });

beforeEach(() => {
  vi.clearAllMocks();
  execute.mockResolvedValue([]);
  delete process.env.AUDIT_RETENTION_DAYS;
});

describe('auditRetentionDays', () => {
  it('defaults to 400 days — a financial year plus the disputes behind it', () => {
    expect(auditRetentionDays()).toBe(AUDIT_RETENTION_DEFAULT_DAYS);
    expect(AUDIT_RETENTION_DEFAULT_DAYS).toBe(400);
  });

  it('honours AUDIT_RETENTION_DAYS', () => {
    process.env.AUDIT_RETENTION_DAYS = '90';
    expect(auditRetentionDays()).toBe(90);
  });

  it('ignores a nonsensical value rather than deleting everything', () => {
    // A typo'd env var must not become "retain for 0 days". The whole table is
    // one bad deploy away otherwise, and it cannot be restored from anywhere.
    for (const value of ['0', '-5', 'forever', '']) {
      process.env.AUDIT_RETENTION_DAYS = value;
      expect(auditRetentionDays()).toBe(AUDIT_RETENTION_DEFAULT_DAYS);
    }
  });
});

describe('purgeExpiredAuditRows', () => {
  it('opts in to deletion inside the transaction, before deleting anything', async () => {
    await purgeExpiredAuditRows();

    const ran = statements();
    expect(ran.length).toBeGreaterThanOrEqual(2);
    // Order matters: the trigger reads the setting on every row, so a DELETE
    // issued before the SET is simply refused.
    expect(ran[0]).toMatch(/chobii\.audit_purge/);
    expect(ran[1]).toMatch(/delete/i);
  });

  it('uses SET LOCAL, so the opt-in dies with the transaction', async () => {
    await purgeExpiredAuditRows();

    expect(statements()[0]).toMatch(/SET LOCAL/i);
  });

  it('deletes by age rather than by count', async () => {
    await purgeExpiredAuditRows();

    expect(statements()[1]).toMatch(/created_at/i);
  });

  it('runs everything in one transaction', async () => {
    await purgeExpiredAuditRows();

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('reports how many rows it removed', async () => {
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

    const removed = await purgeExpiredAuditRows();

    expect(removed).toBe(2);
    expect(logInfo).toHaveBeenCalled();
  });

  it('logs and returns rather than throwing when the purge fails', async () => {
    // It runs on a timer with nobody watching; an unhandled rejection there
    // takes down the process that also serves the API.
    transaction.mockRejectedValueOnce(new Error('connection reset'));

    await expect(purgeExpiredAuditRows()).resolves.toBe(0);
    expect(logError).toHaveBeenCalled();
  });
});
