/**
 * The audit log against a real Postgres.
 *
 * Everything here is a database property, so a mocked `db` could only assert
 * that the words were written:
 *
 *   - The trigger refuses UPDATE, always.
 *   - The trigger refuses DELETE unless the transaction has opted in, which is
 *     what confines pruning to the retention job.
 *   - Deleting a user does NOT fail and does NOT touch the audit row (#649). The
 *     first version of this table had an ON DELETE SET NULL foreign key, which
 *     Postgres implements as an UPDATE — so the trigger refused it and every
 *     user deletion started failing from inside a `delete from "user"`.
 *
 * Rows created here are deleted through the guarded path at the end, which
 * doubles as proof that the guard works.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';

import { adminAuditLog } from '../../src/database/schema/audit-log';
import { users } from '../../src/database/schema/users';
import * as schema from '../../src/database/schema';
import { liveDbUrl, assertLiveDbReachable } from '../helpers/live-db';

const DATABASE_URL = liveDbUrl();

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let reachable = false;

const ACTOR_ID = `test-audit-actor-${process.pid}`;
const ACTOR_EMAIL = `audit-actor-${process.pid}@example.com`;
const MARKER = `immutability-suite-${process.pid}`;

beforeAll(async () => {
  if (!DATABASE_URL) return;

  try {
    client = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
    await client`SELECT 1`;
    db = drizzle(client, { schema });
    reachable = true;
  } catch {
    reachable = false;
  }

  if (!reachable) return;

  await db.insert(users).values({
    id: ACTOR_ID,
    name: 'Audit Actor',
    email: ACTOR_EMAIL,
    emailVerified: true,
    role: 'admin',
  });
});

afterAll(async () => {
  if (reachable) {
    // The only sanctioned way to remove an audit row — and the reason the
    // retention job can work at all.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL chobii.audit_purge = 'on'`);
      await tx.delete(adminAuditLog).where(eq(adminAuditLog.summary, MARKER));
    });

    await db.delete(users).where(eq(users.id, ACTOR_ID));
  }

  if (client) await client.end();
});

/**
 * Assert a statement was refused by the trigger.
 *
 * Drizzle wraps a Postgres error and puts its own "Failed query: …" text on
 * `message`, so matching the top-level message only ever proves the statement
 * failed — not why. The trigger's own words live on `cause`, so walk the chain.
 */
async function expectRefusedAsAppendOnly(run: Promise<unknown>) {
  let thrown: unknown;
  try {
    await run;
  } catch (error) {
    thrown = error;
  }

  expect(thrown, 'the statement was not refused at all').toBeDefined();

  const messages: string[] = [];
  let current: unknown = thrown;
  while (current instanceof Error) {
    messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }

  expect(messages.join(' | ')).toMatch(/append-only/i);
}

async function insertRow() {
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      actorUserId: ACTOR_ID,
      actorEmail: ACTOR_EMAIL,
      actorRole: 'admin',
      action: 'user.role_changed',
      category: 'privilege',
      outcome: 'success',
      summary: MARKER,
      entityType: 'user',
      entityId: 'someone-else',
      before: { role: 'customer' },
      after: { role: 'admin' },
    })
    .returning();

  return row!;
}

describe('admin_audit_log immutability', () => {
  it('has a database to assert against', () => {
    assertLiveDbReachable(reachable);
  });

  it('accepts an insert', async () => {
    if (!reachable) return;

    const row = await insertRow();
    expect(row.id).toBeTruthy();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('refuses an UPDATE, so the audited cannot edit the audit', async () => {
    if (!reachable) return;

    const row = await insertRow();

    await expectRefusedAsAppendOnly(
      db.update(adminAuditLog).set({ summary: 'tampered' }).where(eq(adminAuditLog.id, row.id))
    );
  });

  it('refuses a DELETE from an ordinary transaction', async () => {
    if (!reachable) return;

    const row = await insertRow();

    await expectRefusedAsAppendOnly(
      db.delete(adminAuditLog).where(eq(adminAuditLog.id, row.id))
    );
  });

  it('permits a DELETE only inside a transaction that opted in', async () => {
    if (!reachable) return;

    const row = await insertRow();

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL chobii.audit_purge = 'on'`);
      await tx.delete(adminAuditLog).where(eq(adminAuditLog.id, row.id));
    });

    const remaining = await db
      .select({ id: adminAuditLog.id })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.id, row.id));

    expect(remaining).toHaveLength(0);
  });

  it('survives its actor being deleted, and keeps the snapshot (#649)', async () => {
    if (!reachable) return;

    const doomedId = `test-audit-doomed-${process.pid}`;
    const doomedEmail = `audit-doomed-${process.pid}@example.com`;

    await db.insert(users).values({
      id: doomedId,
      name: 'Doomed Actor',
      email: doomedEmail,
      emailVerified: true,
      role: 'admin',
    });

    const [row] = await db
      .insert(adminAuditLog)
      .values({
        actorUserId: doomedId,
        actorEmail: doomedEmail,
        actorRole: 'admin',
        action: 'user.role_changed',
        category: 'privilege',
        summary: MARKER,
      })
      .returning();

    // This is the assertion that matters: with the old FK this line threw
    // "admin_audit_log is append-only: UPDATE is not permitted" from inside a
    // user delete, and no account could be removed once it had acted.
    await expect(db.delete(users).where(eq(users.id, doomedId))).resolves.toBeDefined();

    const [after] = await db
      .select({
        actorUserId: adminAuditLog.actorUserId,
        actorEmail: adminAuditLog.actorEmail,
        actorRole: adminAuditLog.actorRole,
      })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.id, row!.id));

    // The id is left dangling on purpose. The row must still answer "who acted"
    // when the account is gone, which is what the snapshot columns are for.
    expect(after?.actorUserId).toBe(doomedId);
    expect(after?.actorEmail).toBe(doomedEmail);
    expect(after?.actorRole).toBe('admin');
  });
});
