/**
 * `production_job_photos` — the QC shot list, as rows (#674).
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §7
 *
 * Shape assertions on the drizzle objects, matching audit-log-schema.test.ts
 * and promotions-schema.test.ts: the route and lib suites mock `db`, so nothing
 * else in the API catches a column that does not exist.
 *
 * Five properties are asserted here rather than left to a comment, because each
 * one is a decision that a later edit could quietly undo:
 *
 * 1. **`object_key`, never a URL.** `approval_photos.url` is the counter-example
 *    this must not copy. A stored URL cannot be re-signed, and it puts the
 *    object outside the signing allow-list — the URL becomes the capability.
 * 2. **`superseded_at` + a partial unique index.** Exactly one LIVE photo per
 *    slot, with the whole history kept. Append-only, like
 *    `production_job_reviews`. A plain unique index would forbid a resubmission;
 *    no index at all would let two live photos claim the same slot.
 * 3. **The index predicate touches no enum.** `WHERE superseded_at IS NULL` is
 *    a timestamp test. #673 added `qc_submitted`, `dispatched` and `fulfilment`
 *    in the same pending batch, and `drizzle-kit migrate` replays the batch in
 *    ONE transaction, so any use of a new value — including in an index
 *    predicate — fails a fresh database with "unsafe use of new value".
 * 4. **`slot` is `text`, not a `pgEnum`.** `schema/shipping.ts` records that a
 *    value import from the ESM-only `@chobii/shared` inside `schema/` breaks
 *    `drizzle-kit generate` outright, so the vocabulary cannot live beside the
 *    table. It lives in `@chobii/shared/schemas/production-qc` and is checked
 *    by `qcSlotSchema` at the route layer.
 * 5. **No CHECK constraint.** Zero exist in this repo, and
 *    `tests/database/raw-sql-objects.test.ts` scans migrations only for
 *    FUNCTION|TRIGGER|POLICY — so one added here would be silently absent from
 *    any database built with `db:push`, which is the exact shape of #663.
 */

import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import {
  productionJobPhotos,
  productionJobs,
  productionJobReviews,
  productionJobStageEnum,
} from '../../src/database/schema/production-jobs';
import { QC_SHOT_LIST, QC_STAGES, QC_SHOT_SLOTS } from '@chobii/shared';

const MIGRATIONS_DIR = resolve(__dirname, '../../src/database/migrations');
const MIGRATION = '0024_production_job_photos.sql';

describe('production_job_photos table', () => {
  it('is named production_job_photos', () => {
    expect(getTableConfig(productionJobPhotos).name).toBe('production_job_photos');
  });

  it('belongs to a job, and dies with it', () => {
    const fk = getTableConfig(productionJobPhotos).foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'job_id')
    );

    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(productionJobs);
    // Cascade, unlike production_jobs.orderId which is restrict: a photograph
    // of a job is not a financial record and means nothing without it. The R2
    // objects it leaves behind are the retention sweep's problem — it calls
    // deleteByPrefix BEFORE deleting rows, precisely because cascade cannot.
    expect(fk!.onDelete).toBe('cascade');
  });

  it('records who uploaded it, and keeps the photo when that account goes', () => {
    const fk = getTableConfig(productionJobPhotos).foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'uploaded_by')
    );

    expect(fk).toBeDefined();
    // set null, never cascade: deleting a vendor user must not delete the
    // evidence of the work they photographed.
    expect(fk!.onDelete).toBe('set null');
    expect(productionJobPhotos.uploadedBy.notNull).toBe(false);
  });

  it('stamps the review that judged it, nullable until one does', () => {
    const fk = getTableConfig(productionJobPhotos).foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'review_id')
    );

    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(productionJobReviews);
    // The whole point of the column is that a dispute can say WHICH shots were
    // approved. A photo uploaded and not yet judged has none, so it is
    // nullable; losing the review must not delete the photo.
    expect(fk!.onDelete).toBe('set null');
    expect(productionJobPhotos.reviewId.notNull).toBe(false);
  });

  it('stores the object KEY and offers nowhere to put a URL (#674 vs approval_photos.url)', () => {
    expect(productionJobPhotos.objectKey).toBeDefined();
    expect(productionJobPhotos.objectKey.notNull).toBe(true);

    const columns = getTableConfig(productionJobPhotos).columns.map((c) => c.name);
    // A stored URL cannot be re-signed and defeats the signing-scope
    // allow-list. There must be no column that tempts anyone to write one.
    expect(columns).not.toContain('url');
    expect(columns.some((name) => name.includes('url'))).toBe(false);
  });

  it('keeps slot as text, so schema/ never value-imports the ESM-only shared package', () => {
    expect(productionJobPhotos.slot.getSQLType()).toBe('text');
    expect(productionJobPhotos.slot.notNull).toBe(true);
    // A pgEnum column would expose enumValues here. It must not.
    expect((productionJobPhotos.slot as unknown as { enumValues?: unknown }).enumValues)
      .toBeUndefined();
  });

  it('records what was uploaded, so `complete` can re-validate minutes later', () => {
    expect(productionJobPhotos.contentType).toBeDefined();
    expect(productionJobPhotos.contentType.notNull).toBe(true);
    expect(productionJobPhotos.sizeBytes).toBeDefined();
    expect(productionJobPhotos.sizeBytes.getSQLType()).toBe('integer');
  });

  it('timestamps the upload, and leaves supersession null until it happens', () => {
    expect(productionJobPhotos.uploadedAt.notNull).toBe(true);
    expect(productionJobPhotos.uploadedAt.hasDefault).toBe(true);
    expect(productionJobPhotos.supersededAt.notNull).toBe(false);
    expect(productionJobPhotos.supersededAt.hasDefault).toBe(false);
  });

  it('carries no updated_at — the row is append-only, like production_job_reviews', () => {
    const columns = getTableConfig(productionJobPhotos).columns.map((c) => c.name);
    expect(columns).not.toContain('updated_at');
  });

  it('carries no CHECK constraint (#663 — db:push would silently omit it)', () => {
    expect(getTableConfig(productionJobPhotos).checks).toHaveLength(0);
  });
});

describe('one live photo per slot', () => {
  const liveSlotIndex = () =>
    getTableConfig(productionJobPhotos).indexes.find(
      (index) => index.config.name === 'production_job_photos_live_slot_unique'
    );

  it('is a UNIQUE index on (job_id, slot), not a plain one', () => {
    const index = liveSlotIndex();

    expect(index).toBeDefined();
    // Non-unique would let two racing uploads both land live on one slot, and
    // the QC queue would then show a shot list that is complete twice over.
    expect(index!.config.unique).toBe(true);
    expect(index!.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual([
      'job_id',
      'slot',
    ]);
  });

  it('is PARTIAL, so a resubmitted shot supersedes rather than being refused', () => {
    // Without the predicate this is a blanket unique, and the second upload to
    // a slot fails instead of replacing the first — which destroys the rework
    // history the append-only design exists to keep.
    expect(liveSlotIndex()!.config.where).toBeDefined();
  });

  it('indexes job_id on its own, for the read that lists a job’s shots', () => {
    const names = getTableConfig(productionJobPhotos).indexes.map((i) => i.config.name);
    expect(names).toContain('production_job_photos_job_id_idx');
  });
});

describe('migration 0024', () => {
  const sql = () => readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf-8');

  it('exists, so a fresh database gets the table (never db:push — #663)', () => {
    expect(sql()).toContain('production_job_photos');
  });

  it('creates the partial unique index with a predicate that touches no enum', () => {
    const text = sql();

    // The predicate is a timestamp test. #673 added qc_submitted, dispatched
    // and fulfilment in the same pending batch, and drizzle-kit replays the
    // batch in ONE transaction: any use of a new enum value here — even from a
    // different migration file — dies with "unsafe use of new value" on a
    // fresh database. tests/database/migration-enum-literals.test.ts is the
    // general guard; this pins the specific predicate.
    expect(text).toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    // drizzle qualifies the column: `WHERE "production_job_photos"."superseded_at"`.
    expect(text).toMatch(/WHERE\s+[^;]*"superseded_at"\s+IS\s+NULL/i);

    for (const value of ['qc_submitted', 'dispatched', 'fulfilment']) {
      expect(text.includes(`'${value}'`)).toBe(false);
    }
  });

  it('adds no CHECK constraint (raw-sql-objects.test.ts would not notice one)', () => {
    expect(sql()).not.toMatch(/\bCHECK\s*\(/i);
  });
});

describe('the shot list and the table agree', () => {
  it('covers every stage the job record can hold', () => {
    // A stage the API knows and the shot list does not is a job whose required
    // slot set is empty, and empty passes completeness vacuously.
    expect([...QC_STAGES].sort()).toEqual([...productionJobStageEnum.enumValues].sort());
    for (const stage of productionJobStageEnum.enumValues) {
      expect(QC_SHOT_LIST[stage].length).toBeGreaterThan(0);
    }
  });

  it('keeps every slot short enough and plain enough for a text column and a key segment', () => {
    for (const slot of QC_SHOT_SLOTS) {
      expect(slot).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(slot.length).toBeLessThanOrEqual(64);
    }
  });
});
