/**
 * Database objects that ONLY a migration can create (#663)
 *
 * Drizzle's schema DSL describes tables, columns, enums, indexes and
 * constraints. It cannot describe a function, a trigger or a row-level
 * security policy. So `drizzle-kit push`, which diffs the DSL against the
 * live database, creates none of them — silently, with no warning, because
 * from push's point of view there is nothing missing.
 *
 * `drizzle-kit migrate` replays the migration SQL, so it creates all of them.
 *
 * That difference is invisible until something depends on it. It was found
 * when a push-built database accepted an UPDATE and a DELETE against
 * `admin_audit_log` — the table exists, the append-only guarantee does not.
 * An audit row recording a privilege action was rewritten to look benign and
 * then deleted, with no error.
 *
 * This manifest is the list of those objects. It exists so that:
 *
 *   1. `tests/database/raw-sql-objects.test.ts` can assert, against a real
 *      database, that every one of them is actually present — which is a
 *      direct test for "this database was built with push".
 *   2. That same suite scans every migration for raw-SQL object creation and
 *      fails when it finds one that is not declared here. Adding a trigger in
 *      a future migration and forgetting about this file is not possible; the
 *      test names the object and points back at this comment.
 *
 * ## If you are adding a function, trigger or policy
 *
 * Write it in the migration as normal, then add an entry below. The entry is
 * not documentation — the test reads it.
 */

/** The kinds of object the drizzle DSL cannot express. */
export type RawSqlObjectKind = 'function' | 'trigger' | 'policy';

export interface RawSqlObject {
  kind: RawSqlObjectKind;
  /** The object's name in the Postgres catalog, exactly as created. */
  name: string;
  /** The migration file that creates it, for the failure message. */
  migration: string;
  /** What breaks, concretely, when this object is absent. */
  consequence: string;
}

export const RAW_SQL_OBJECTS: readonly RawSqlObject[] = [
  {
    kind: 'function',
    name: 'admin_audit_log_immutable',
    migration: '0021_admin_audit_log.sql',
    consequence:
      'admin_audit_log stops being append-only: anyone with database access can rewrite or erase an audit row.',
  },
  {
    kind: 'trigger',
    name: 'admin_audit_log_immutable_trg',
    migration: '0021_admin_audit_log.sql',
    consequence:
      'admin_audit_log stops being append-only: UPDATE and DELETE are accepted instead of refused.',
  },
];

/**
 * What to tell someone whose database is missing these.
 *
 * Named rather than inlined because the same sentence is the right answer in
 * a test failure and in an operational check, and the two must not drift.
 */
export function missingRawSqlObjectsMessage(missing: readonly RawSqlObject[]): string {
  const lines = missing.map(
    (object) => `  - ${object.kind} ${object.name} (${object.migration}) — ${object.consequence}`
  );

  return [
    `This database is missing ${missing.length} object(s) that only a migration creates:`,
    ...lines,
    '',
    'That is the signature of a database built with `drizzle-kit push` (`bun run db:push`).',
    'Push diffs the drizzle schema DSL, which cannot express a function or a trigger, so it',
    'creates the tables and none of their guarantees.',
    '',
    'Rebuild it with `bun run db:migrate`. See src/database/raw-sql-objects.ts (#663).',
  ].join('\n');
}
