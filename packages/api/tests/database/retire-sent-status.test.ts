/**
 * The `sent`-retirement backfill (#675).
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §9,
 * and decision 9 in §3.
 *
 * ## Why this is a script and not a migration
 *
 * `drizzle-kit migrate` replays the whole pending batch in ONE transaction, and
 * 0023 added `qc_submitted`, `dispatched` and `fulfilment` with
 * `ALTER TYPE … ADD VALUE`. Postgres refuses any use of a value added in the
 * current transaction — `unsafe use of new value` — and splitting the ADD VALUE
 * and its first use across two migration FILES does not help, because on a
 * fresh database both files are in the same batch. That is #580.
 *
 * `'sent'` itself is an old value and would survive the batch, but the batch is
 * also the wrong place on its own terms: a data rewrite that must run once,
 * after the type is settled, against whatever rows an environment happens to
 * hold, is an operation, not a schema change. So it is a script that runs after
 * the batch commits — which is what §9 says in as many words, and what
 * `migration-enum-literals.test.ts` closes with.
 *
 * `sent` STAYS in the Postgres type either way. Dropping an enum value means
 * recreating the type and rewriting every dependent column, which is
 * disproportionate to deleting a word. Its retirement is enforced by the
 * transition matrix giving it zero in-edges and zero out-edges (#676).
 *
 * ## Why `assigned` and not `received`
 *
 * `sent` meant "we posted the material to the vendor". The re-meant `received`
 * means "the vendor has everything needed to start" — a VENDOR-ATTESTED fact.
 * Promoting a `sent` row to `received` would fabricate an attestation that
 * never happened, and `received` is a precondition the QC queue and the label
 * gate both read. `assigned` records only what we actually know: assigned, not
 * yet started. `assigned → received` is a legal vendor edge in the new matrix,
 * so a retired row resumes normally the moment the vendor confirms.
 *
 * Nothing is lost by the demotion: `production_jobs.sent_at` still holds the
 * date the material went out, and this script does not touch it.
 *
 * ## Why the mapping is asserted against a real database
 *
 * This suite used to prove those properties — total over the enum, idempotent,
 * never produces `sent`, leaves everything else alone — against a pure
 * `retiredStatus(status)` helper that `retireSentStatus()` never called. Every
 * one of them held while saying nothing about the statement that ships: delete
 * the helper and the script behaved identically. They are now asserted where
 * the behaviour actually lives, against a seeded row in a real Postgres, with
 * every row created inside a transaction that always rolls back — so this suite
 * adds nothing to whatever database it is pointed at, including the shared dev
 * one.
 *
 * Reachability is checked inside the bodies rather than with `it.runIf`, for
 * the reason written up in production-job-photos-live-slot.ts: the modifier is
 * evaluated at COLLECTION time, before `beforeAll` has connected, so every test
 * would report as skipped no matter what database is running.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import { retireSentStatus, SENT_RETIREMENT } from '../../src/database/retire-sent-status';
import {
  productionJobs,
  productionJobStatusEnum,
  type ProductionJobStatus,
} from '../../src/database/schema/production-jobs';
import { orders, type OrderShippingAddress } from '../../src/database/schema/orders';
import {
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from '../helpers/live-db';

const API_ROOT = resolve(__dirname, '../..');
const SCRIPT = join(API_ROOT, 'src/database/retire-sent-status.ts');
const MIGRATIONS_DIR = join(API_ROOT, 'src/database/migrations');

const source = () => readFileSync(SCRIPT, 'utf-8');
const ALL_STATUSES = productionJobStatusEnum.enumValues;

describe('the retirement mapping', () => {
  it('retires `sent` to `assigned`, not to `received`', () => {
    // `received` is a vendor-attested fact under the new vocabulary. Promoting
    // a `sent` row would invent an attestation, and both the QC queue and the
    // label gate read `received` as a precondition.
    expect(SENT_RETIREMENT.from).toBe('sent');
    expect(SENT_RETIREMENT.to).toBe('assigned');
  });

  it('targets a status that predates the pending batch', () => {
    // `assigned` was in the type long before 0023. That means the script is
    // replayable against any database, including one that has not yet applied
    // the production-pipeline batch — it can never be the thing that trips
    // "unsafe use of new value".
    const added = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .flatMap((f) => [
        ...readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')
          .replace(/--(?!> statement-breakpoint).*$/gm, '')
          .matchAll(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi),
      ])
      .map((m) => m[1]);

    expect(added).not.toContain(SENT_RETIREMENT.to);
  });
});

describe('the script itself', () => {
  it('is importable without running — the entry point is guarded', () => {
    // If it called main() at module scope, importing it here would open a
    // connection and rewrite the dev database from a test run. Same guard as
    // src/database/init-super-admin.ts.
    expect(source()).toMatch(/if\s*\(\s*import\.meta\.main\s*\)/);
  });

  it('imports with no DATABASE_URL set, and so opens no pool on import', async () => {
    // The guard above only covers main(). A STATIC `import { db } from
    // './index'` runs before it: that module builds a twenty-connection pool
    // and throws "DATABASE_URL environment variable is not set" while being
    // evaluated, so every test in this file — including the ones that need no
    // database at all — died on import in any environment without one, and the
    // pool it did open was never end()ed. The connection is now pulled in
    // inside retireSentStatus() and inside the entry-point guard, so the import
    // costs nothing. Re-adding a static import fails right here.
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      vi.resetModules();
      const fresh = await import('../../src/database/retire-sent-status');
      expect(fresh.SENT_RETIREMENT.to).toBe('assigned');
    } finally {
      process.env.DATABASE_URL = original;
      vi.resetModules();
    }
  });

  it('names only `status` in its `.set()` — the `updated_at` beside it is drizzle’s', () => {
    // This greps the SOURCE, so it pins what the script ASKS FOR, not what
    // Postgres receives: `productionJobs.updatedAt` carries `.$onUpdate(() =>
    // new Date())`, so the emitted statement is `SET "status" = $1,
    // "updated_at" = $2` no matter what this assertion says. That extra column
    // is the schema's own bookkeeping and is expected. What it catches is the
    // script naming a second column itself — quietly becoming a migration.
    // The columns actually written are pinned below, against a real database.
    const set = source().match(/\.set\(\{[\s\S]*?\}\)/g) ?? [];

    expect(set.length).toBeGreaterThan(0);
    for (const call of set) {
      const keys = [...call.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
      expect(keys).toEqual(['status']);
    }
  });

  it('never clears sent_at — the date the material went out is the evidence', () => {
    // The demotion to `assigned` is only defensible because this fact survives
    // it. A row retired by this script can still say when we posted the work.
    expect(source()).not.toMatch(/sentAt\s*:/);
    expect(source()).not.toMatch(/sent_at\s*=\s*NULL/i);
  });

  it('offers a dry run, because it rewrites rows in a live database', () => {
    // Precedent: backfill-art-box.ts. An operator has to be able to see the
    // count before committing to it.
    expect(source()).toMatch(/dry-run/);
  });

  it('is wired into package.json with the repo’s env-file shape', () => {
    const pkg = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };

    const script = pkg.scripts['db:retire-sent-status'];
    expect(script, 'no db:retire-sent-status script').toBeDefined();
    // Same shape as `seed` and `backfill:art-box`: the root .env is the single
    // place DATABASE_URL is configured, and it points at :5440.
    expect(script).toContain('--env-file=../../.env');
    expect(script).toContain('src/database/retire-sent-status.ts');
  });
});

/** The transaction handle `db.transaction(cb)` hands its callback. */
type Tx = Parameters<Parameters<LiveDbConnection['db']['transaction']>[0]>[0];

/** One seeded job per status, so "leaves the others alone" has others to leave. */
type SeededJobs = Record<ProductionJobStatus, string>;

let client: LiveDbConnection['client'];
let db: LiveDbConnection['db'];
let reachable = false;

/** Marks the throwaway order, though the rollback is what actually removes it. */
const MARKER = `retire-sent-${process.pid}`;
let orderCounter = 0;

/**
 * Far enough in the past that `updated_at` moving is unmistakable.
 *
 * Seeding with the column's `now()` default instead would leave the before and
 * after timestamps a fraction of a millisecond apart — same transaction — and
 * the assertion that drizzle rewrote it would be a coin toss.
 */
const SEEDED_AT = new Date('2020-01-01T00:00:00.000Z');

const ADDRESS: OrderShippingAddress = {
  fullName: 'Retirement Fixture',
  phone: '0000000000',
  addressLine1: '1 Rollback Lane',
  city: 'Nowhere',
  state: 'Nowhere',
  postalCode: '000000',
  countryCode: 'IN',
};

beforeAll(async () => {
  ({ client, db, reachable } = await connectLiveDb());
});

afterAll(async () => {
  // The pool is the suite's, so ending it is the suite's job — a leaked one
  // holds connections on a machine several agents share.
  await closeLiveDb(client);
});

/**
 * Seed one job per status inside a transaction that never commits.
 *
 * The order and jobs are built here rather than borrowed from seed data: a
 * disposable `*_test` database has no seed rows, and a suite that quietly skips
 * when it finds none is the failure mode #580 was about.
 */
async function withSeededJobs<T>(body: (tx: Tx, jobs: SeededJobs) => Promise<T>): Promise<T> {
  class Rollback extends Error {}
  let result!: T;

  try {
    await db.transaction(async (tx) => {
      // Whatever this environment happens to hold at `sent` is retired first,
      // inside the same doomed transaction, so the counts asserted below are
      // exact rather than "at least". It also covers the empty case: on a
      // database with nothing to retire, the script reports zero and writes
      // nothing.
      const empty = await retireSentStatus({ db: tx });
      expect(empty.updated).toBe(empty.found);

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: `${MARKER}-${orderCounter++}`,
          shippingAddress: ADDRESS,
          subtotal: '0.00',
          total: '0.00',
        })
        .returning({ id: orders.id });

      const rows = await tx
        .insert(productionJobs)
        .values(
          ALL_STATUSES.map((status) => ({
            orderId: order!.id,
            stage: 'print' as const,
            status,
            // Every job carries one, so "never clears sent_at" is checked on a
            // row that has something to lose.
            sentAt: SEEDED_AT,
            updatedAt: SEEDED_AT,
          }))
        )
        .returning({ id: productionJobs.id, status: productionJobs.status });

      const jobs = Object.fromEntries(rows.map((r) => [r.status, r.id])) as SeededJobs;
      result = await body(tx, jobs);

      // Never commit. The assertions have already run against the real UPDATE.
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  return result;
}

/** The whole row, comparable by value — timestamps included. */
async function readJob(tx: Tx, id: string): Promise<Record<string, unknown>> {
  const [row] = await tx.select().from(productionJobs).where(eq(productionJobs.id, id));
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
}

/** Which columns differ between two snapshots of the same row. */
function changedColumns(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(before)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
}

describe('the retirement, against a live database', () => {
  it('has a database to assert against', () => {
    assertLiveDbReachable(reachable);
  });

  it('moves a `sent` job to `assigned`, and says so', async () => {
    if (!reachable) return;

    await withSeededJobs(async (tx, jobs) => {
      const result = await retireSentStatus({ db: tx });

      // Exactly the one seeded `sent` row: the environment's own were cleared
      // inside this transaction before it was seeded.
      expect(result).toEqual({ found: 1, updated: 1 });
      expect((await readJob(tx, jobs.sent)).status).toBe('assigned');
    });
  });

  it('leaves every other status exactly where it is', async () => {
    if (!reachable) return;

    await withSeededJobs(async (tx, jobs) => {
      const others = ALL_STATUSES.filter((s) => s !== 'sent');
      const before = Object.fromEntries(
        await Promise.all(others.map(async (s) => [s, await readJob(tx, jobs[s])] as const))
      );

      await retireSentStatus({ db: tx });

      for (const status of others) {
        const after = await readJob(tx, jobs[status]);
        expect(changedColumns(before[status]!, after), `${status} was rewritten`).toEqual([]);
      }
    });
  });

  it('never produces `sent` — a completed run leaves none behind', async () => {
    if (!reachable) return;

    await withSeededJobs(async (tx) => {
      await retireSentStatus({ db: tx });

      const left = await tx
        .select({ id: productionJobs.id })
        .from(productionJobs)
        .where(eq(productionJobs.status, SENT_RETIREMENT.from));

      expect(left).toEqual([]);
    });
  });

  it('is idempotent — the second run finds nothing and rewrites nothing', async () => {
    if (!reachable) return;

    await withSeededJobs(async (tx, jobs) => {
      await retireSentStatus({ db: tx });
      const afterFirst = await readJob(tx, jobs.sent);

      // The script is an operation, so it WILL be run twice by someone. The
      // second run must not demote the row it already demoted.
      const second = await retireSentStatus({ db: tx });

      expect(second).toEqual({ found: 0, updated: 0 });
      expect(changedColumns(afterFirst, await readJob(tx, jobs.sent))).toEqual([]);
    });
  });

  it('writes the status column and drizzle’s updated_at — and nothing else', async () => {
    if (!reachable) return;

    await withSeededJobs(async (tx, jobs) => {
      const before = await readJob(tx, jobs.sent);
      await retireSentStatus({ db: tx });
      const after = await readJob(tx, jobs.sent);

      // The emitted statement is `SET "status" = $1, "updated_at" = $2`: the
      // second column comes from `$onUpdate` on the schema, not from the
      // script. Anything beyond these two is the script quietly becoming a
      // second migration — and `sent_at` in particular is the evidence the
      // demotion to `assigned` depends on.
      expect(changedColumns(before, after)).toEqual(['status', 'updatedAt']);
      expect(after.sentAt).toBe(before.sentAt);
      expect(before.updatedAt).toBe(SEEDED_AT.toISOString());
      expect(new Date(after.updatedAt as string).getTime()).toBeGreaterThan(SEEDED_AT.getTime());
    });
  });

  it('rewrites nothing under --dry-run, however many it finds', async () => {
    if (!reachable) return;

    await withSeededJobs(async (tx, jobs) => {
      const before = await readJob(tx, jobs.sent);
      const result = await retireSentStatus({ db: tx, dryRun: true });

      // An operator has to be able to see the count before committing to it,
      // so the count has to be real while the write is not.
      expect(result).toEqual({ found: 1, updated: 0 });
      expect(changedColumns(before, await readJob(tx, jobs.sent))).toEqual([]);
    });
  });

  it('leaves nothing behind — every row above was rolled back', async () => {
    if (!reachable) return;

    const [{ n }] = await client`
      SELECT count(*)::int AS n FROM orders WHERE order_number LIKE ${`${MARKER}%`}
    `;
    expect(n).toBe(0);
  });
});
