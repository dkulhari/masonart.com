/**
 * No migration may USE an enum value that a migration ADDED (#673)
 *
 * This is a pure filesystem check — no database, no drizzle-kit. It exists
 * because the failure it guards against cannot be reproduced on any machine
 * that already has the value: it only appears on a FRESH database, which is
 * every CI run and every new developer.
 *
 * ## The rule
 *
 * `drizzle-kit migrate` wraps the entire pending batch in ONE transaction. So
 * on a fresh database, `0001` and `0023` execute inside the same transaction,
 * and Postgres refuses:
 *
 *     ERROR: unsafe use of new value "gift_card" of enum type order_type
 *
 * `check_safe_enum_use` fires on any value whose `pg_enum` row was written by
 * `ALTER TYPE … ADD VALUE` in the current transaction. Note what it does NOT
 * cover: values from `CREATE TYPE … AS ENUM(…)` are never blacklisted, which is
 * why brand-new types can use their own values freely in the same batch.
 *
 * The consequence that keeps catching people out is that **splitting the
 * `ADD VALUE` and its first use across two migration FILES does not help.**
 * Both files are in the same batch on a fresh database. #580 was exactly this,
 * and `0018:1-12` is the write-up.
 *
 * ## The escape hatch, and why it is spelled `::text`
 *
 * `0014:10-14` mentions `'rolled'` and `'frameless'` — both added by
 * `ALTER TYPE … ADD VALUE` back in `0004` — and is safe, because the operand is
 * cast first:
 *
 *     UPDATE frames SET category = CASE "type"::text WHEN 'rolled' THEN …
 *
 * With the cast the comparison is text-to-text and never resolves to the enum
 * type at all, so `check_safe_enum_use` is never reached. Without it, the
 * literal is coerced to the enum and a fresh database dies.
 *
 * So the exemption below is not a loophole — it is the one construction that is
 * actually safe, and requiring it to be written explicitly means the author had
 * to think about the cast. Anything else fails here until it is either removed
 * or cast.
 *
 * The exemption is scoped to the whole statement, which is coarse: a statement
 * that casts one operand and not another passes. Narrowing it means parsing
 * SQL, and the guard would then fail for reasons nobody could read. It catches
 * the case that actually happens — a bare literal in an UPDATE, a DEFAULT or an
 * index predicate — and it is a backstop, not the reason to think.
 *
 * A backfill that cannot be expressed with a text cast is not a migration. It
 * is a script, run after the batch commits — which is what #675 does for the
 * `sent` retirement.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../src/database/migrations');

/** `ALTER TYPE "public"."x" ADD VALUE 'v'`, with or without BEFORE/AFTER. */
const ADD_VALUE =
  /ALTER\s+TYPE\s+[^\s]+\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi;

/** `CREATE TYPE … AS ENUM(…)` — a new type; its own values are always safe. */
const CREATE_ENUM = /CREATE\s+TYPE\s+[^\s]+\s+AS\s+ENUM\s*\([^)]*\)/gi;

interface Statement {
  migration: string;
  line: number;
  sql: string;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

/** Comments carry prose about these values on purpose; they execute nothing. */
const stripComments = (sql: string) => sql.replace(/--(?!> statement-breakpoint).*$/gm, '');

/**
 * One entry per executable statement, with the line it starts on so a failure
 * names a place rather than a file.
 */
function statements(): Statement[] {
  const out: Statement[] = [];

  for (const migration of migrationFiles()) {
    const text = readFileSync(join(MIGRATIONS_DIR, migration), 'utf-8');
    let line = 1;

    for (const chunk of text.split('--> statement-breakpoint')) {
      out.push({ migration, line, sql: stripComments(chunk) });
      line += chunk.split('\n').length - 1;
    }
  }

  return out;
}

/** Every value any migration introduces with ADD VALUE, and where. */
function addedEnumValues(): Map<string, string> {
  const added = new Map<string, string>();

  for (const migration of migrationFiles()) {
    const text = readFileSync(join(MIGRATIONS_DIR, migration), 'utf-8');
    for (const match of stripComments(text).matchAll(ADD_VALUE)) {
      if (!added.has(match[1]!)) added.set(match[1]!, migration);
    }
  }

  return added;
}

describe('migration enum literals (#673, #580)', () => {
  it('finds the ADD VALUE statements at all — the scan is not vacuous', () => {
    const added = addedEnumValues();

    // If this ever empties, every assertion below passes for the wrong reason.
    expect(added.size).toBeGreaterThan(0);
    expect(added.has('gift_card')).toBe(true);
    expect(added.get('gift_card')).toMatch(/^0011_/);
  });

  it('registers the production-pipeline values, each added by exactly one migration', () => {
    const added = addedEnumValues();

    for (const value of ['qc_submitted', 'dispatched', 'fulfilment']) {
      expect(added.has(value)).toBe(true);
    }

    // Added twice is added once in the wrong transaction: the second ADD VALUE
    // fails outright on a database that already applied the first.
    const source = readAllMigrations();
    for (const value of ['qc_submitted', 'dispatched', 'fulfilment']) {
      const occurrences = [...source.matchAll(ADD_VALUE)].filter((m) => m[1] === value);
      expect(occurrences).toHaveLength(1);
    }
  });

  it('never uses an ADD VALUE-added value as a literal in any migration', () => {
    const added = addedEnumValues();

    const violations: string[] = [];

    for (const statement of statements()) {
      // The ADD VALUE statement itself is the definition, not a use. Same for
      // a CREATE TYPE list: a type created in this transaction is never
      // blacklisted, so its own values are safe.
      const scanned = statement.sql
        .replace(ADD_VALUE, '')
        .replace(CREATE_ENUM, '');

      // An explicit text cast takes the comparison off the enum type entirely.
      // See 0014:10 — the one safe way to mention these values.
      if (/::\s*text/i.test(scanned)) continue;

      for (const [value, origin] of added) {
        if (!new RegExp(`'${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(scanned)) {
          continue;
        }

        violations.push(
          `${statement.migration}:~${statement.line} uses '${value}', added by ${origin}. ` +
            `drizzle-kit replays the whole pending batch in ONE transaction, so a fresh ` +
            `database raises "unsafe use of new value". Cast the operand to ::text (0014:10), ` +
            `or move the work into a script that runs after the batch commits (#675).`
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

function readAllMigrations(): string {
  return migrationFiles()
    .map((name) => stripComments(readFileSync(join(MIGRATIONS_DIR, name), 'utf-8')))
    .join('\n');
}
