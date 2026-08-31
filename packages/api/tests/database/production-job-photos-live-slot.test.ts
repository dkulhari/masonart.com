/**
 * The partial unique index, against a real Postgres (#674).
 *
 * `tests/database/production-job-photos.test.ts` asserts the drizzle objects:
 * the index is unique, spans `(job_id, slot)`, and carries a `where`. That is
 * the right test for "the DSL says what we meant" and the wrong test for "the
 * database does what we meant" — `config.where` being *defined* says nothing
 * about the predicate being `superseded_at IS NULL` rather than something that
 * happens to compile. The split mirrors audit-log-schema.test.ts (shape) beside
 * audit-log-immutability.test.ts (behaviour), and the reasoning is written up
 * in tests/database/raw-sql-objects.test.ts.
 *
 * Three properties, and each one fails differently if the predicate is wrong:
 *
 *   - Two LIVE photos cannot share a slot. Without the index at all, two racing
 *     uploads both land and the shot list reads complete twice over.
 *   - A reshoot after supersession IS accepted. With a BLANKET unique instead
 *     of a partial one, this is refused — and the reshoot after a failed
 *     inspection is the single moment this table exists to record.
 *   - The superseded row survives. Nothing here is an UPDATE-in-place; the
 *     history is the point.
 *
 * Every row is created inside a transaction that always rolls back, so this
 * suite adds nothing to whatever database it is pointed at — including the
 * shared dev one.
 *
 * Reachability is checked inside each body rather than with `it.runIf`: the
 * modifier is evaluated at COLLECTION time, before `beforeAll` has connected,
 * so every test would report as skipped no matter what database is running.
 * The first `it` below is what makes an unreachable database loud.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

import { liveDbUrl, assertLiveDbReachable } from '../helpers/live-db';

/**
 * What `sql.begin(cb)` actually hands the callback.
 *
 * postgres.js declares `TransactionSql` as `Omit<Sql, …>`, and `Omit` is a
 * mapped type — it erases call signatures. So the exported name cannot be used
 * as a template tag even though the runtime object is exactly that. Recombining
 * the callable `Sql` with the one method the transaction adds is what makes
 * `tx\`SELECT …\`` and `tx.savepoint(…)` both typecheck.
 */
type Tx = postgres.Sql & Pick<postgres.TransactionSql, 'savepoint'>;

const DATABASE_URL = liveDbUrl();

let client: ReturnType<typeof postgres>;
let reachable = false;

/** Marks the throwaway order, though the rollback is what actually removes it. */
const MARKER = `pjp-live-slot-${process.pid}`;

beforeAll(async () => {
  if (!DATABASE_URL) return;

  try {
    client = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
    await client`SELECT 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
});

afterAll(async () => {
  if (client) await client.end();
});

/**
 * Run `body` against a job that exists only for the duration of the call.
 *
 * The order and job are built here rather than borrowed from seed data: a
 * disposable `*_test` database has no seed rows, and a suite that quietly
 * skips when it finds none is the failure mode #580 was about.
 */
async function withThrowawayJob<T>(
  body: (tx: Tx, jobId: string) => Promise<T>
): Promise<T> {
  let result!: T;

  try {
    await client.begin(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const [order] = await tx`
        INSERT INTO orders (order_number, shipping_address, subtotal, total)
        VALUES (${MARKER}, ${tx.json({ marker: MARKER })}, 0, 0)
        RETURNING id
      `;
      const [job] = await tx`
        INSERT INTO production_jobs (order_id, stage) VALUES (${order!.id}, 'print')
        RETURNING id
      `;

      result = await body(tx, job!.id as string);

      // Never commit. The assertions have already run against a real index.
      throw new Error('__rollback__');
    });
  } catch (error) {
    if ((error as Error).message !== '__rollback__') throw error;
  }

  return result;
}

/** Insert one photo, reporting the constraint that refused it rather than throwing. */
async function insertPhoto(
  tx: Tx,
  jobId: string,
  slot: string,
  filename: string
): Promise<{ id?: string; refusedBy?: string }> {
  try {
    let inserted: string | undefined;

    await tx.savepoint(async (rawSp) => {
      const sp = rawSp as unknown as Tx;
      const [row] = await sp`
        INSERT INTO production_job_photos (job_id, slot, object_key, content_type, size_bytes)
        VALUES (
          ${jobId}, ${slot}, ${`production-qc/${jobId}/${slot}/${filename}`}, 'image/jpeg', 1024
        )
        RETURNING id
      `;
      inserted = row!.id as string;
    });

    return { id: inserted };
  } catch (error) {
    const pg = error as { code?: string; constraint_name?: string };
    return { refusedBy: pg.constraint_name ?? pg.code ?? String(error) };
  }
}

describe('production_job_photos live-slot index', () => {
  it('has a database to assert against', () => {
    assertLiveDbReachable(reachable);
  });

  it('refuses a second LIVE photo in the same slot', async () => {
    if (!reachable) return;
    const refusal = await withThrowawayJob(async (tx, jobId) => {
      const first = await insertPhoto(tx, jobId, 'print_full', 'a.jpg');
      expect(first.id).toBeDefined();

      return insertPhoto(tx, jobId, 'print_full', 'b.jpg');
    });

    // Named, not merely "some error": a NOT NULL or FK violation would also
    // throw, and would pass a test that only asserted failure.
    expect(refusal.refusedBy).toBe('production_job_photos_live_slot_unique');
  });

  it('allows a reshoot once the first is superseded', async () => {
    if (!reachable) return;
    const outcome = await withThrowawayJob(async (tx, jobId) => {
      const first = await insertPhoto(tx, jobId, 'print_full', 'a.jpg');
      await tx`UPDATE production_job_photos SET superseded_at = now() WHERE id = ${first.id!}`;

      const reshoot = await insertPhoto(tx, jobId, 'print_full', 'b.jpg');
      const [{ n }] = await tx`
        SELECT count(*)::int AS n FROM production_job_photos WHERE job_id = ${jobId}
      `;

      return { reshoot, rows: n as number };
    });

    // A blanket unique index refuses this, which is why the predicate exists.
    expect(outcome.reshoot.refusedBy).toBeUndefined();
    expect(outcome.reshoot.id).toBeDefined();
    // Both rows kept: superseding is not deleting, and the history is the point.
    expect(outcome.rows).toBe(2);
  });

  it('lets different slots on one job coexist', async () => {
    if (!reachable) return;
    const outcome = await withThrowawayJob(async (tx, jobId) => {
      const full = await insertPhoto(tx, jobId, 'print_full', 'a.jpg');
      const raking = await insertPhoto(tx, jobId, 'print_raking_light', 'b.jpg');
      return { full, raking };
    });

    expect(outcome.full.id).toBeDefined();
    expect(outcome.raking.refusedBy).toBeUndefined();
  });

  it('scopes the slot to one job, not globally', async () => {
    if (!reachable) return;
    // `(job_id, slot)`, not `(slot)` — otherwise the second job in the system
    // could never upload its first shot.
    const refusedBy = await withThrowawayJob(async (tx, jobId) => {
      await insertPhoto(tx, jobId, 'print_full', 'a.jpg');

      const [order] = await tx`
        INSERT INTO orders (order_number, shipping_address, subtotal, total)
        VALUES (${`${MARKER}-2`}, ${tx.json({ marker: MARKER })}, 0, 0)
        RETURNING id
      `;
      const [other] = await tx`
        INSERT INTO production_jobs (order_id, stage) VALUES (${order!.id}, 'print')
        RETURNING id
      `;

      return (await insertPhoto(tx, other!.id as string, 'print_full', 'a.jpg')).refusedBy;
    });

    expect(refusedBy).toBeUndefined();
  });

  it('leaves nothing behind — every row above was rolled back', async () => {
    if (!reachable) return;
    const [{ n }] = await client`
      SELECT count(*)::int AS n FROM orders WHERE order_number LIKE ${`${MARKER}%`}
    `;
    expect(n).toBe(0);
  });
});
