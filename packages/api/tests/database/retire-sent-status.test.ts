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
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import { retiredStatus, SENT_RETIREMENT } from '../../src/database/retire-sent-status';
import { productionJobStatusEnum } from '../../src/database/schema/production-jobs';

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
    expect(retiredStatus('sent')).toBe('assigned');
  });

  it('is total over the enum, and lands inside it every time', () => {
    // A partial mapping would leave some status undefined the first time a row
    // in it met the script, which is a production crash for a value that was
    // always legal.
    for (const status of ALL_STATUSES) {
      expect(ALL_STATUSES).toContain(retiredStatus(status));
    }
  });

  it('leaves every other status exactly where it is', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'sent')) {
      expect(retiredStatus(status), `${status} was rewritten`).toBe(status);
    }
  });

  it('never produces `sent`, so a completed run leaves none behind', () => {
    // This is the retirement, stated as a property of the function rather than
    // as a claim about one run.
    expect(ALL_STATUSES.map(retiredStatus)).not.toContain('sent');
  });

  it('is idempotent — a second run is a no-op, not a second demotion', () => {
    // The script is an operation, so it WILL be run twice by someone. Applying
    // it to its own output must change nothing.
    for (const status of ALL_STATUSES) {
      expect(retiredStatus(retiredStatus(status))).toBe(retiredStatus(status));
    }
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

  it('writes only the status column', () => {
    const set = source().match(/\.set\(\{[\s\S]*?\}\)/g) ?? [];

    expect(set.length).toBeGreaterThan(0);
    for (const call of set) {
      // updatedAt would be harmless; anything else is the script quietly
      // becoming a second migration.
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
