/**
 * The objects `drizzle-kit push` does not create (#663)
 *
 * `tests/database/audit-log-immutability.test.ts` already proves the audit log
 * refuses UPDATE and DELETE. It proves it *behaviourally*, by trying the
 * statements — which is the right test for the trigger's logic, and the wrong
 * test for "was this database provisioned correctly". A behavioural failure
 * reads as `the statement was not refused at all`, which sounds like a broken
 * trigger, and sends the reader to the trigger body rather than to how the
 * database was built.
 *
 * So this suite asserts the same guarantee one level down, in the catalog:
 *
 *   1. **Without a database at all** — every function, trigger and policy any
 *      migration creates is declared in `src/database/raw-sql-objects.ts`.
 *      This is the recurrence guard. The gap was invisible because the raw SQL
 *      lived only in a migration nobody re-reads; a new trigger added next year
 *      now fails this test until it is declared somewhere people look.
 *
 *   2. **Against a real database** — every declared object is actually present.
 *      A push-built database fails here with a message that names `db:push` as
 *      the cause and `db:migrate` as the fix, which is the fact the behavioural
 *      failure does not carry.
 *
 * Verified against two databases built from this same schema:
 *
 *   migrate-built  table=1 trigger=1 function=1   -> passes
 *   push-built     table=1 trigger=0 function=0   -> fails, naming both objects
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

import {
  RAW_SQL_OBJECTS,
  missingRawSqlObjectsMessage,
  type RawSqlObject,
} from '../../src/database/raw-sql-objects';
import {
  connectLiveDb,
  closeLiveDb,
  assertLiveDbReachable,
  type LiveDbConnection,
} from '../helpers/live-db';

const MIGRATIONS_DIR = resolve(__dirname, '../../src/database/migrations');

/**
 * Every function, trigger and policy created anywhere in the migration tree.
 *
 * `CREATE OR REPLACE` and quoted identifiers both appear in the existing SQL,
 * so both are matched. `CREATE TRIGGER x BEFORE ...` puts the name first,
 * which is all we need; the table it hangs off is not part of the identity we
 * check in the catalog.
 */
function rawSqlObjectsInMigrations(): { kind: string; name: string; migration: string }[] {
  const patterns: { kind: string; regex: RegExp }[] = [
    { kind: 'function', regex: /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"?([a-z0-9_]+)"?/gi },
    { kind: 'trigger', regex: /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?([a-z0-9_]+)"?/gi },
    { kind: 'policy', regex: /CREATE\s+POLICY\s+"?([a-z0-9_]+)"?/gi },
  ];

  const found: { kind: string; name: string; migration: string }[] = [];

  for (const migration of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, migration), 'utf8');

    for (const { kind, regex } of patterns) {
      for (const match of sql.matchAll(regex)) {
        const name = match[1];
        if (!found.some((f) => f.kind === kind && f.name === name)) {
          found.push({ kind, name, migration });
        }
      }
    }
  }

  return found;
}

describe('raw-SQL objects are declared, not only migrated', () => {
  it('declares every function, trigger and policy the migrations create', () => {
    const undeclared = rawSqlObjectsInMigrations().filter(
      (object) =>
        !RAW_SQL_OBJECTS.some((known) => known.kind === object.kind && known.name === object.name)
    );

    expect(
      undeclared,
      undeclared.length === 0
        ? ''
        : `These are created by raw SQL in a migration, so \`drizzle-kit push\` will not create them, ` +
            `and nothing currently checks that they exist:\n` +
            undeclared.map((o) => `  - ${o.kind} ${o.name} (${o.migration})`).join('\n') +
            `\n\nDeclare them in src/database/raw-sql-objects.ts so the live-database check below ` +
            `covers them too (#663).`
    ).toEqual([]);
  });

  it('declares nothing that no migration creates', () => {
    const inMigrations = rawSqlObjectsInMigrations();
    const stale = RAW_SQL_OBJECTS.filter(
      (known) =>
        !inMigrations.some((object) => object.kind === known.kind && object.name === known.name)
    );

    expect(
      stale.map((o) => `${o.kind} ${o.name}`),
      'declared in raw-sql-objects.ts but created by no migration — the check below would ' +
        'fail forever against a correctly migrated database'
    ).toEqual([]);
  });
});

describe('a real database has the objects push cannot create', () => {
  let connection: LiveDbConnection;

  beforeAll(async () => {
    connection = await connectLiveDb({ max: 1 });
  });

  afterAll(async () => {
    await closeLiveDb(connection?.client);
  });

  it('is connected to a database at all', () => {
    assertLiveDbReachable(connection.reachable);
  });

  it('has every function and trigger the migrations install', async () => {
    if (!connection.reachable) return;

    const missing: RawSqlObject[] = [];

    for (const object of RAW_SQL_OBJECTS) {
      const [row] = await (object.kind === 'function'
        ? connection.client`SELECT count(*)::int AS n FROM pg_proc WHERE proname = ${object.name}`
        : object.kind === 'trigger'
          ? connection.client`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = ${object.name}`
          : connection.client`SELECT count(*)::int AS n FROM pg_policy WHERE polname = ${object.name}`);

      if (row.n === 0) missing.push(object);
    }

    expect(missing.length === 0 || missingRawSqlObjectsMessage(missing)).toBe(true);
  });
});
