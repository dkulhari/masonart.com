/**
 * A recording drizzle stand-in, shared by the vendor and production-job route
 * suites.
 *
 * These suites do not want a database. They want to assert on *the query* — the
 * table, the LIMIT, and the condition rendered through `PgDialect` — while the
 * REAL `requireAuth` / `requireAdmin` / `requireVendor` middleware runs. Every
 * `db.select()` etc. pushes a `RecordedQuery` and resolves to whatever rows the
 * test queued for that `op:table_name` key.
 *
 * `vi.mock`'s factory is hoisted above every `const` in a test file, so the
 * recorder has to exist before it runs. Create it inside an async `vi.hoisted`:
 *
 * ```ts
 * const rec = await vi.hoisted(async () =>
 *   (await import('../../helpers/query-recorder')).createQueryRecorder()
 * )
 *
 * vi.mock('../../../src/database', () => ({ db: rec.db }))
 * ```
 *
 * @see packages/api/tests/routes/admin/vendors.test.ts
 * @see packages/api/tests/routes/admin/vendor-rates.test.ts
 * @see packages/api/tests/routes/admin/production-jobs.test.ts
 * @see packages/api/tests/routes/vendor/jobs.test.ts
 */

import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

export interface RecordedQuery {
  op: 'select' | 'insert' | 'update' | 'delete'
  table: string | null
  where?: unknown
  orderBy?: unknown
  limit?: number
  offset?: number
  values?: unknown
  /** True when the query was issued inside a `db.transaction` callback. */
  inTx: boolean
}

export interface QueryRecorderOptions {
  /**
   * How a queue of row batches is drained.
   *
   * `consume` (the default) shifts one batch per call and returns `[]` once
   * dry — the right shape when each query in a handler is a distinct step.
   *
   * `repeatLast` keeps returning the final batch, for suites where one lookup
   * (the `vendor_users` scope join, say) is re-issued by every handler under
   * test and queueing it per-call would just be noise.
   */
  rows?: 'consume' | 'repeatLast'
}

export interface QueryRecorder {
  /** Every query issued, in order. Clear with `queries.length = 0`. */
  queries: RecordedQuery[]
  /** Rows to hand back, keyed `op:table_name`. */
  rowQueues: Map<string, unknown[][]>
  /** Keys whose NEXT execution rejects, to reproduce a partway failure. */
  failKeys: Set<string>
  /** Transaction bookkeeping — `commits` and `rollbacks` are assertable. */
  tx: { depth: number; commits: number; rollbacks: number }
  /** Hand this to `vi.mock('../../../src/database', () => ({ db }))`. */
  db: RecorderDb
  tableName: (table: unknown) => string
  queueRows: (rows: Record<string, unknown[][]>) => void
  failNext: (key: string) => void
  /** Clears queries, queued rows, injected failures and the tx counters. */
  reset: () => void
  ops: (op: RecordedQuery['op'], table: unknown) => RecordedQuery[]
  selects: (table: unknown) => RecordedQuery[]
  inserts: (table: unknown) => RecordedQuery[]
  updates: (table: unknown) => RecordedQuery[]
  deletes: (table: unknown) => RecordedQuery[]
  /** The real SQL a captured drizzle condition renders to. */
  render: (condition: unknown) => { sql: string; params: unknown[] }
  /** Just the bound parameters of a captured condition. */
  params: (condition: unknown) => unknown[]
}

export interface RecorderDb {
  select: () => unknown
  insert: (table: unknown) => unknown
  update: (table: unknown) => unknown
  delete: (table: unknown) => unknown
  transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
}

const dialect = new PgDialect()

export function createQueryRecorder(options: QueryRecorderOptions = {}): QueryRecorder {
  const repeatLast = options.rows === 'repeatLast'

  const queries: RecordedQuery[] = []
  const rowQueues = new Map<string, unknown[][]>()
  const failKeys = new Set<string>()
  const tx = { depth: 0, commits: 0, rollbacks: 0 }

  function tableName(table: unknown): string {
    try {
      return getTableConfig(table as never).name
    } catch {
      return 'unknown'
    }
  }

  function nextRows(rec: RecordedQuery): unknown[] {
    const queue = rowQueues.get(`${rec.op}:${rec.table}`)
    if (!queue || queue.length === 0) return []
    if (repeatLast && queue.length === 1) return queue[0] as unknown[]
    return queue.shift() as unknown[]
  }

  function builder(op: RecordedQuery['op'], table?: unknown) {
    const rec: RecordedQuery = {
      op,
      table: table === undefined ? null : tableName(table),
      inTx: tx.depth > 0,
    }
    queries.push(rec)

    const chain = {
      from(t: unknown) {
        rec.table = tableName(t)
        return chain
      },
      leftJoin: () => chain,
      innerJoin: () => chain,
      groupBy: () => chain,
      returning: () => chain,
      orderBy(o: unknown) {
        rec.orderBy = o
        return chain
      },
      where(w: unknown) {
        rec.where = w
        return chain
      },
      limit(n: number) {
        rec.limit = n
        return chain
      },
      offset(n: number) {
        rec.offset = n
        return chain
      },
      set(v: unknown) {
        rec.values = v
        return chain
      },
      values(v: unknown) {
        rec.values = v
        return chain
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        const key = `${rec.op}:${rec.table}`
        if (failKeys.has(key)) {
          failKeys.delete(key)
          return Promise.reject(new Error(`injected failure on ${key}`)).then(resolve, reject)
        }
        return Promise.resolve(nextRows(rec)).then(resolve, reject)
      },
    }

    return chain
  }

  async function runTransaction(fn: (tx: unknown) => Promise<unknown>) {
    tx.depth += 1
    try {
      const result = await fn(makeDb())
      tx.commits += 1
      return result
    } catch (error) {
      tx.rollbacks += 1
      throw error
    } finally {
      tx.depth -= 1
    }
  }

  function makeDb(): RecorderDb {
    return {
      select: () => builder('select'),
      insert: (t: unknown) => builder('insert', t),
      update: (t: unknown) => builder('update', t),
      delete: (t: unknown) => builder('delete', t),
      transaction: runTransaction,
    }
  }

  function ops(op: RecordedQuery['op'], table: unknown): RecordedQuery[] {
    const name = tableName(table)
    return queries.filter((q) => q.op === op && q.table === name)
  }

  return {
    queries,
    rowQueues,
    failKeys,
    tx,
    db: makeDb(),
    tableName,
    queueRows(rows: Record<string, unknown[][]>) {
      for (const [key, batches] of Object.entries(rows)) {
        rowQueues.set(
          key,
          batches.map((b) => [...b])
        )
      }
    },
    failNext(key: string) {
      failKeys.add(key)
    },
    reset() {
      queries.length = 0
      rowQueues.clear()
      failKeys.clear()
      tx.depth = 0
      tx.commits = 0
      tx.rollbacks = 0
    },
    ops,
    selects: (table: unknown) => ops('select', table),
    inserts: (table: unknown) => ops('insert', table),
    updates: (table: unknown) => ops('update', table),
    deletes: (table: unknown) => ops('delete', table),
    render(condition: unknown) {
      const query = dialect.sqlToQuery(condition as SQL)
      return { sql: query.sql, params: query.params as unknown[] }
    },
    params(condition: unknown) {
      return dialect.sqlToQuery(condition as SQL).params as unknown[]
    },
  }
}
