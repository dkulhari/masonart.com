/**
 * Inter-vendor transfers, order consolidation, and the job lifecycle columns
 * that close phase 1 of production-pipeline (#675).
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
 *
 * Shape assertions on the drizzle objects plus the migration text, matching
 * production-job-photos.test.ts and audit-log-schema.test.ts: the route and lib
 * suites mock `db`, so nothing else in the API notices a column that is not
 * there or a foreign key that behaves differently from the one in the comment.
 *
 * The properties pinned here are each a decision a later edit could quietly
 * undo, and every one of them is load-bearing:
 *
 * 1. **The transfer is its own entity.** "A's job dispatched, B's job received"
 *    provably cannot express it: in the consolidation case the rolled poster has
 *    `frame_id NULL`, so vendor B has NO JOB for it at all. Also one parcel
 *    carries several jobs, freight money has nowhere to sit, and "lost" is a
 *    gap in the record with no docket to chase.
 * 2. **No transfer status enum.** State derives from `dispatched_at` /
 *    `received_at` / `lost_at`, mirroring `production_jobs`' own date-driven
 *    shape. Given this repo's enum hazard (#580/#673), a fourth transfer state
 *    later then costs a nullable timestamp instead of a migration.
 * 3. **A job is on at most one transfer, EVER** — a unique index on `job_id`
 *    ALONE, not merely the composite primary key. The composite alone would
 *    happily put one job on two parcels. A lost transfer produces a replacement
 *    job, so the original never needs a second leg.
 * 4. **`order_consolidation` is its own table, not a column on `orders`**, so a
 *    supplier foreign key stays off the customer table and out of every
 *    wholesale `select()` of orders.
 * 5. **`cost_amount` is decimal(10,2) INR**, matching orders/products/
 *    vendor_rates. Not paise, not whole rupees — the 100x hazard this repo has
 *    already been bitten by.
 * 6. **Every NEW column is `timestamptz`.** `admin_audit_log.created_at`
 *    already is; `production_jobs`' pre-existing five are not, and a server
 *    timezone change a year from now makes the two incomparable. Converting the
 *    existing five is recorded debt and deliberately NOT done here — pinned
 *    below so a sweep has to be deliberate rather than accidental.
 * 7. **`settlement_id` is `restrict`.** It was `set null`, which means deleting
 *    a settlement silently un-settles every job it paid for: the payables query
 *    keys on `settlement_id IS NULL`, so the money reappears as owed.
 * 8. **No CHECK constraints.** Zero exist in this repo, and
 *    `tests/database/raw-sql-objects.test.ts` scans migrations only for
 *    FUNCTION|TRIGGER|POLICY — one added here would be silently absent from any
 *    database built with `db:push`, the exact shape of #663.
 */

import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

import {
  productionTransfers,
  productionTransferJobs,
  orderConsolidation,
} from '../../src/database/schema/production-transfers';
import { productionJobs, productionJobPhotos } from '../../src/database/schema/production-jobs';
import { orders } from '../../src/database/schema/orders';
import { vendors } from '../../src/database/schema/vendors';
import { users } from '../../src/database/schema/users';

const MIGRATIONS_DIR = resolve(__dirname, '../../src/database/migrations');
const MIGRATION = '0025_production_transfers.sql';

const TIMESTAMPTZ = 'timestamp with time zone';

/** The three values #673 added with ADD VALUE, unusable as literals in any migration. */
const BATCH_ENUM_VALUES = ['qc_submitted', 'dispatched', 'fulfilment'];

const fkOn = (table: Parameters<typeof getTableConfig>[0], column: string) =>
  getTableConfig(table).foreignKeys.find((f) =>
    f.reference().columns.some((c) => c.name === column)
  );

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).columns.map((c) => c.name);

describe('production_transfers table', () => {
  it('is named production_transfers', () => {
    expect(getTableConfig(productionTransfers).name).toBe('production_transfers');
  });

  it('belongs to an order, and refuses to be cascaded away with it', () => {
    const fk = fkOn(productionTransfers, 'order_id');

    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(orders);
    // restrict, like production_jobs.orderId: a transfer carries cost_amount
    // and a carrier docket, so it is a freight record. Deleting an order with
    // goods in transit against it should be blocked and dealt with deliberately.
    expect(fk!.onDelete).toBe('restrict');
    expect(productionTransfers.orderId.notNull).toBe(true);
  });

  it('names BOTH ends of the leg, each a restricted vendor reference', () => {
    for (const column of ['from_vendor_id', 'to_vendor_id']) {
      const fk = fkOn(productionTransfers, column);

      expect(fk, `${column} has no foreign key`).toBeDefined();
      expect(fk!.reference().foreignTable).toBe(vendors);
      // Deleting a vendor must not erase the record of a parcel they sent or
      // received; the row is who-owed-whom-what evidence.
      expect(fk!.onDelete).toBe('restrict');
    }

    expect(productionTransfers.fromVendorId.notNull).toBe(true);
    expect(productionTransfers.toVendorId.notNull).toBe(true);
    // Two columns, not one: a leg has direction. A single vendor_id would make
    // "who do I chase" unanswerable, which is half the reason the table exists.
    expect(productionTransfers.fromVendorId.name).not.toBe(productionTransfers.toVendorId.name);
  });

  it('carries the carrier and the A→B docket, both optional at creation', () => {
    expect(productionTransfers.carrier.getSQLType()).toBe('text');
    expect(productionTransfers.reference.getSQLType()).toBe('text');
    // A vendor books the courier after creating the row as often as before it,
    // so neither is required up front. The docket is what an admin chases with.
    expect(productionTransfers.carrier.notNull).toBe(false);
    expect(productionTransfers.reference.notNull).toBe(false);
  });

  it('counts pieces, defaulting to one', () => {
    expect(productionTransfers.pieceCount.getSQLType()).toBe('integer');
    expect(productionTransfers.pieceCount.notNull).toBe(true);
    // One parcel is the overwhelming case; making it the default keeps the
    // vendor form to the fields a vendor actually knows.
    expect(productionTransfers.pieceCount.hasDefault).toBe(true);
  });

  it('holds freight money as decimal(10,2) INR — not paise, not whole rupees', () => {
    // Matches orders, products and vendor_rates. This repo has been bitten by
    // the 100x before; a bare integer here would be a paise column pretending
    // to be a rupee one, and nothing would notice until a settlement was wrong.
    expect(productionTransfers.costAmount.getSQLType()).toBe('numeric(10, 2)');
    // We choose the routing, so the amount is not known when the leg is created
    // and never comes from the vendor. It is also NOT a payable — cost_amount
    // must never enter sumPayable.
    expect(productionTransfers.costAmount.notNull).toBe(false);

    const money = columnNames(productionTransfers).filter((n) => /amount|cost|price|paise/.test(n));
    expect(money).toEqual(['cost_amount']);
  });

  it('derives its state from three nullable timestamps and holds NO status enum', () => {
    for (const column of [
      productionTransfers.dispatchedAt,
      productionTransfers.receivedAt,
      productionTransfers.lostAt,
    ]) {
      expect(column.getSQLType()).toBe(TIMESTAMPTZ);
      // NULL is meaningful for every one of them: not yet dispatched, not yet
      // received, not lost. That is the whole state machine.
      expect(column.notNull).toBe(false);
      expect(column.hasDefault).toBe(false);
    }

    const names = columnNames(productionTransfers);
    expect(names).not.toContain('status');
    expect(names).not.toContain('state');

    // Nor by any other name: a pgEnum column exposes enumValues. None may.
    for (const column of getTableConfig(productionTransfers).columns) {
      expect(
        (column as unknown as { enumValues?: unknown }).enumValues,
        `${column.name} is an enum column — transfer state derives from timestamps`
      ).toBeUndefined();
    }
  });

  it('promises a delivery date and records why a parcel vanished', () => {
    expect(productionTransfers.expectedBy.getSQLType()).toBe(TIMESTAMPTZ);
    expect(productionTransfers.expectedBy.notNull).toBe(false);
    // Free text, because "what the carrier finally said" has no vocabulary.
    expect(productionTransfers.lostNote.getSQLType()).toBe('text');
    expect(productionTransfers.lostNote.notNull).toBe(false);
  });

  it('records who created the leg, and keeps the leg when that account goes', () => {
    const fk = fkOn(productionTransfers, 'created_by');

    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(users);
    expect(fk!.onDelete).toBe('set null');
    expect(productionTransfers.createdBy.notNull).toBe(false);
  });

  it('timestamps itself in timestamptz, like admin_audit_log and unlike production_jobs', () => {
    for (const column of [productionTransfers.createdAt, productionTransfers.updatedAt]) {
      expect(column.getSQLType()).toBe(TIMESTAMPTZ);
      expect(column.notNull).toBe(true);
      expect(column.hasDefault).toBe(true);
    }
  });

  it('carries no CHECK constraint (#663 — db:push would silently omit it)', () => {
    expect(getTableConfig(productionTransfers).checks).toHaveLength(0);
  });

  it('indexes the reads that exist: by order, and by each end of the leg', () => {
    const names = getTableConfig(productionTransfers).indexes.map((i) => i.config.name);

    // The readiness gate asks "did every dispatched job ride a received
    // transfer to the consolidator", which is a lookup by order.
    expect(names).toContain('production_transfers_order_id_idx');
    // Vendor B's inbound list, and vendor A's outbound one.
    expect(names).toContain('production_transfers_to_vendor_id_idx');
    expect(names).toContain('production_transfers_from_vendor_id_idx');
  });
});

describe('production_transfer_jobs join', () => {
  const config = () => getTableConfig(productionTransferJobs);

  it('is named production_transfer_jobs', () => {
    expect(config().name).toBe('production_transfer_jobs');
  });

  it('is keyed on the pair, so one parcel carries many jobs', () => {
    const pk = config().primaryKeys[0];

    expect(pk, 'no composite primary key').toBeDefined();
    expect(pk!.columns.map((c) => c.name)).toEqual(['transfer_id', 'job_id']);
  });

  it('dies with its transfer but never takes the job with it', () => {
    const transferFk = fkOn(productionTransferJobs, 'transfer_id');
    expect(transferFk).toBeDefined();
    expect(transferFk!.reference().foreignTable).toBe(productionTransfers);
    // A join row really is meaningless without its transfer.
    expect(transferFk!.onDelete).toBe('cascade');

    const jobFk = fkOn(productionTransferJobs, 'job_id');
    expect(jobFk).toBeDefined();
    expect(jobFk!.reference().foreignTable).toBe(productionJobs);
    // restrict, NOT cascade: the job is a financial record carrying
    // amount_expected, amount_actual and settlement_id. Deleting a transfer
    // must never be able to reach through this row and destroy a payable.
    expect(jobFk!.onDelete).toBe('restrict');
  });

  it('puts a job on at most ONE transfer, ever — unique on job_id ALONE', () => {
    const index = config().indexes.find(
      (i) => i.config.name === 'production_transfer_jobs_job_id_unique'
    );

    expect(index, 'no unique index on job_id').toBeDefined();
    expect(index!.config.unique).toBe(true);
    // The composite primary key does NOT give this. (t1, j) and (t2, j) are
    // two distinct pairs, so without this index one job rides two parcels and
    // the readiness gate can no longer say which leg it actually took. A lost
    // transfer produces a REPLACEMENT job, so the original never needs a second.
    expect(index!.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual(['job_id']);
    expect(index!.config.where).toBeUndefined();
  });

  it('carries no CHECK constraint (#663)', () => {
    expect(config().checks).toHaveLength(0);
  });
});

describe('order_consolidation table', () => {
  it('is named order_consolidation', () => {
    expect(getTableConfig(orderConsolidation).name).toBe('order_consolidation');
  });

  it('is keyed on the order itself, so one order has exactly one consolidator', () => {
    // The primary key IS the constraint. Absence of the row is meaningful —
    // "not yet decided" — and the gate reads it as a blocker.
    expect(orderConsolidation.orderId.primary).toBe(true);

    const fk = fkOn(orderConsolidation, 'order_id');
    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(orders);
    // cascade, unlike production_transfers.orderId: this row is a routing
    // decision, not a financial record. Nothing is owed on the strength of it.
    expect(fk!.onDelete).toBe('cascade');
  });

  it('names the consolidating vendor, restricted', () => {
    const fk = fkOn(orderConsolidation, 'vendor_id');

    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(vendors);
    expect(fk!.onDelete).toBe('restrict');
    expect(orderConsolidation.vendorId.notNull).toBe(true);
  });

  it('leaves decided_by NULL to mean "system default"', () => {
    const fk = fkOn(orderConsolidation, 'decided_by');

    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(users);
    expect(fk!.onDelete).toBe('set null');
    // Case 1 of §5 — one vendor holds every job — is written automatically at
    // first assignment with no admin involved, so NULL is a real value here and
    // not an omission.
    expect(orderConsolidation.decidedBy.notNull).toBe(false);
    expect(orderConsolidation.decidedAt.getSQLType()).toBe(TIMESTAMPTZ);
    expect(orderConsolidation.decidedAt.notNull).toBe(true);
    expect(orderConsolidation.decidedAt.hasDefault).toBe(true);
  });

  it('keeps the supplier foreign key OFF the customer table', () => {
    // The whole reason this is a table and not a column. `orders` is selected
    // wholesale all over the storefront and the admin; a vendor_id there would
    // ride along in every one of those reads.
    const orderColumns = columnNames(orders);

    expect(orderColumns).not.toContain('vendor_id');
    expect(orderColumns).not.toContain('consolidator_vendor_id');
    expect(orderColumns.filter((n) => /vendor|consolidat/.test(n))).toEqual([]);
  });

  it('carries no CHECK constraint (#663)', () => {
    expect(getTableConfig(orderConsolidation).checks).toHaveLength(0);
  });
});

describe('production_jobs lifecycle columns', () => {
  it('stamps qc_submitted_at and dispatched_at in timestamptz, both nullable', () => {
    for (const column of [productionJobs.qcSubmittedAt, productionJobs.dispatchedAt]) {
      expect(column.getSQLType()).toBe(TIMESTAMPTZ);
      // A job that has not reached the state has no timestamp for it.
      expect(column.notNull).toBe(false);
      expect(column.hasDefault).toBe(false);
    }
  });

  it('links a replacement job back to the one that vanished', () => {
    const fk = fkOn(productionJobs, 'replaces_job_id');

    expect(fk).toBeDefined();
    // Self-referential: a lost transfer creates one replacement per lost job.
    // Without this column two print jobs for one order item read as a
    // duplicate-entry mistake rather than as a re-print of lost goods.
    expect(fk!.reference().foreignTable).toBe(productionJobs);
    // set null, never cascade: deleting the original must not delete the work
    // that replaced it — and the original KEEPS its payable, because we owe A
    // for work they genuinely did. The parcel is what vanished, not the work.
    expect(fk!.onDelete).toBe('set null');
    expect(productionJobs.replacesJobId.notNull).toBe(false);
    expect(productionJobs.replacesJobId.getSQLType()).toBe('uuid');
  });

  it('restricts settlement deletion instead of silently un-settling every job', () => {
    const fk = fkOn(productionJobs, 'settlement_id');

    expect(fk).toBeDefined();
    // Was `set null`. The payables query is
    //   SUM(COALESCE(amount_actual, amount_expected)) WHERE settlement_id IS NULL
    // so a deleted settlement did not merely lose a pointer — every job it paid
    // for reappeared as owed, with nothing in the record to say why.
    expect(fk!.onDelete).toBe('restrict');
  });

  it('leaves the five pre-existing date columns bare — named debt, not this ticket', () => {
    // Pinned so that converting them is a deliberate act with a failing test to
    // update, rather than something a later generate quietly sweeps in. Every
    // NEW column above is timestamptz; these are the ones that are not.
    for (const column of [
      productionJobs.assignedAt,
      productionJobs.sentAt,
      productionJobs.dueAt,
      productionJobs.receivedAt,
    ]) {
      expect(column.getSQLType()).toBe('timestamp');
    }
  });
});

describe('production_job_photos timestamps (corrects #674)', () => {
  it('records upload and supersession in timestamptz, like every other new column', () => {
    // #674 landed these as bare `timestamp`, which the feature design forbids:
    // admin_audit_log.created_at is timestamptz, and an audit row and a photo
    // row must still be comparable after a server timezone change. The table is
    // new and empty, so 0025 alters the type outright.
    expect(productionJobPhotos.uploadedAt.getSQLType()).toBe(TIMESTAMPTZ);
    expect(productionJobPhotos.supersededAt.getSQLType()).toBe(TIMESTAMPTZ);

    expect(productionJobPhotos.uploadedAt.notNull).toBe(true);
    expect(productionJobPhotos.uploadedAt.hasDefault).toBe(true);
    expect(productionJobPhotos.supersededAt.notNull).toBe(false);
  });
});

describe('migration 0025', () => {
  const sql = () => readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf-8');

  it('exists, so a fresh database gets all of this (never db:push — #663)', () => {
    expect(existsSync(join(MIGRATIONS_DIR, MIGRATION))).toBe(true);
  });

  it('creates all three tables', () => {
    const text = sql();

    for (const table of ['production_transfers', 'production_transfer_jobs', 'order_consolidation']) {
      expect(text).toMatch(new RegExp(`CREATE TABLE (IF NOT EXISTS )?"${table}"`, 'i'));
    }
  });

  it('creates the unique index on job_id alone', () => {
    expect(sql()).toMatch(
      /CREATE UNIQUE INDEX "production_transfer_jobs_job_id_unique" ON "production_transfer_jobs"[^;]*\("job_id"\)/i
    );
  });

  it('adds the three lifecycle columns to production_jobs', () => {
    const text = sql();

    for (const column of ['qc_submitted_at', 'dispatched_at', 'replaces_job_id']) {
      expect(text).toMatch(
        new RegExp(`ALTER TABLE "production_jobs" ADD COLUMN "${column}"`, 'i')
      );
    }
  });

  it('drops the settlement foreign key and re-adds it as restrict', () => {
    const text = sql();

    expect(text).toMatch(/DROP CONSTRAINT "production_jobs_settlement_id_vendor_settlements_id_fk"/i);
    expect(text).toMatch(
      /ADD CONSTRAINT "production_jobs_settlement_id_vendor_settlements_id_fk"[^;]*ON DELETE restrict/i
    );
    // A re-add that forgot the clause would silently restore `set null`.
    expect(text).not.toMatch(
      /ADD CONSTRAINT "production_jobs_settlement_id_vendor_settlements_id_fk"[^;]*ON DELETE set null/i
    );
  });

  it('corrects the two #674 photo columns to timestamptz', () => {
    const text = sql();

    for (const column of ['uploaded_at', 'superseded_at']) {
      expect(text).toMatch(
        new RegExp(
          `ALTER TABLE "production_job_photos" ALTER COLUMN "${column}" SET DATA TYPE timestamp with time zone`,
          'i'
        )
      );
    }
  });

  it('declares every timestamp column it creates WITH time zone', () => {
    const bare = sql()
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .filter((line) => /"[a-z_]+" timestamp\b/i.test(line))
      .filter((line) => !/timestamp with time zone/i.test(line));

    expect(bare).toEqual([]);
  });

  it('uses no enum value that a migration ADDED (#580/#673 — same transaction)', () => {
    // drizzle-kit replays the whole pending batch in ONE transaction, so on a
    // fresh database a literal here dies with "unsafe use of new value" even
    // though 0023 is a different file. This is why the `sent` retirement is a
    // script. migration-enum-literals.test.ts is the general guard; this pins
    // the specific file.
    //
    // Comments are stripped first, exactly as that guard does it: the header of
    // 0025 names these three values in prose precisely so the next author knows
    // not to use them, and prose executes nothing.
    const text = sql().replace(/--(?!> statement-breakpoint).*$/gm, '');

    for (const value of BATCH_ENUM_VALUES) {
      expect(text.includes(`'${value}'`), `0025 uses the literal '${value}'`).toBe(false);
    }
  });

  it('adds no CHECK constraint (raw-sql-objects.test.ts would not notice one)', () => {
    expect(sql()).not.toMatch(/\bCHECK\s*\(/i);
  });

  it('never rewrites production_jobs.status — that is a script, not a migration', () => {
    // The whole reason the `sent` retirement is a script: the batch is one
    // transaction, and `'sent'` compared against the enum type in it would need
    // the ::text escape hatch at best. No migration in the repo may do it.
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
      const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8').replace(/--.*$/gm, '');
      expect(
        /UPDATE\s+"?production_jobs"?[\s\S]*?SET\s+"?status"?/i.test(text),
        `${file} backfills production_jobs.status in a migration`
      ).toBe(false);
    }
  });
});

describe('migration bookkeeping', () => {
  const journal = () =>
    JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf-8')) as {
      entries: { idx: number; tag: string; version: string; when: number }[];
    };

  it('registers 0025 in the journal at idx 25', () => {
    const entry = journal().entries.find((e) => e.idx === 25);

    expect(entry, 'no journal entry at idx 25').toBeDefined();
    expect(entry!.tag).toBe('0025_production_transfers');
  });

  it('keeps the journal contiguous from 0, and later than the entry before it', () => {
    const entries = journal().entries;

    expect(entries.map((e) => e.idx)).toEqual(entries.map((_, i) => i));
    const [previous, last] = entries.slice(-2);
    expect(last!.when).toBeGreaterThan(previous!.when);
  });

  it('keeps the snapshot chain unbroken 0000 → 0025', () => {
    const entries = journal().entries;

    let previousId: string | null = null;
    for (const entry of entries) {
      const file = join(MIGRATIONS_DIR, 'meta', `${String(entry.idx).padStart(4, '0')}_snapshot.json`);
      expect(existsSync(file), `missing snapshot for ${entry.tag}`).toBe(true);

      const snapshot = JSON.parse(readFileSync(file, 'utf-8')) as { id: string; prevId: string };
      if (previousId !== null) {
        // A broken chain is how drizzle-kit ends up regenerating a migration
        // that already ran, which on this repo means re-issuing CREATE TABLE.
        expect(snapshot.prevId, `${entry.tag} does not follow its predecessor`).toBe(previousId);
      }
      previousId = snapshot.id;
    }
  });

  it('has 0025 describing all three new tables', () => {
    const snapshot = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, 'meta/0025_snapshot.json'), 'utf-8')
    ) as { tables: Record<string, unknown> };

    for (const table of ['production_transfers', 'production_transfer_jobs', 'order_consolidation']) {
      expect(Object.keys(snapshot.tables)).toContain(`public.${table}`);
    }
  });
});
