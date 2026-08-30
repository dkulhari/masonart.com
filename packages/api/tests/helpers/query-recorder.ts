/**
 * A recording drizzle stand-in, shared by the vendor and production-job route
 * suites.
 *
 * These suites do not want a database. They want to assert on *the query* — the
 * table, the PROJECTION, the LIMIT, and the condition rendered through
 * `PgDialect` — while the REAL `requireAuth` / `requireAdmin` / `requireVendor`
 * middleware runs. Every `db.select()` etc. pushes a `RecordedQuery` and
 * resolves to whatever rows the test queued for that `op:table_name` key.
 *
 * **The projection is recorded, and that is not bookkeeping.** The rows come
 * from the test's own fixture, so every assertion about the SHAPE of a response
 * is an assertion about the fixture unless it reads `fields` (or `returning`).
 * A column added to a `.select({...})` in `lib/vendor-scope.ts` changes nothing
 * a body walk can see and changes this.
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
  /**
   * The column names handed to `db.select({...})`. `null` means the projection
   * was WHOLESALE — `db.select()` with no argument, which returns every column
   * of every joined row.
   *
   * Recorded because it is the only place a column-level property is DECIDABLE.
   * A suite that reads the keys off a response body is reading the keys of its
   * own row fixture: the recorder answers whatever was queued, so widening
   * `.select({...})` by one customer column changes nothing a body assertion can
   * see. It changes this.
   */
  fields: string[] | null
  /**
   * The same, for `.returning({...})` — the projection of an INSERT or UPDATE,
   * which is a vendor-facing shape exactly as much as a SELECT's is
   * (`createVendorTransfer` answers straight out of one). `undefined` when
   * `.returning` was never called, `null` when it was called wholesale.
   */
  returning?: string[] | null
  /**
   * True when the query was issued through a TRANSACTION HANDLE — the `tx` the
   * callback was given — and not merely while one happened to be open.
   *
   * The distinction is the whole point and it used to be missing: `inTx` was
   * `tx.depth > 0`, so a `recordAudit` call that dropped its `tx` argument and
   * wrote through the root `db` was still recorded as being "inside the
   * transaction", because a transaction was open somewhere up the stack. That
   * is the exact refactor §8's sharing rule exists to catch, and the flag could
   * not see it.
   */
  inTx: boolean
  /** Which transaction's handle issued it, 1-based. `0` for the root `db`. */
  txId: number
  /**
   * True once the transaction that issued this query has rolled back.
   *
   * The recorder cannot un-write a row, so "the insert went back with
   * everything else" was previously unobservable: the row sat in `queries`
   * forever and `rollbacks` only ever proved the callback threw. This is what
   * makes the difference between issued and SURVIVING assertable — see
   * `survivors` and `failCommit`.
   */
  rolledBack: boolean
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
  /**
   * Make the NEXT `db.transaction` throw at COMMIT — after its callback has run
   * to completion, so every write inside it was issued and every one of them
   * goes back.
   *
   * §8 of the production-pipeline design asks for exactly this: *"run each
   * mutating handler against a `tx` that throws at commit; assert no success row
   * survives and the refusal row does."* Without a commit step there was nothing
   * to throw from, and `rollbacks` only ever proved the callback itself threw.
   */
  failCommit: (times?: number) => void
  /** Clears queries, queued rows, injected failures and the tx counters. */
  reset: () => void
  ops: (op: RecordedQuery['op'], table: unknown) => RecordedQuery[]
  /**
   * The `ops` whose transaction did NOT roll back — the rows that would still
   * be in the table afterwards. `ops` says what was ISSUED; this says what
   * SURVIVED, and the two differ on exactly the paths that matter.
   */
  survivors: (op: RecordedQuery['op'], table: unknown) => RecordedQuery[]
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
  select: (fields?: unknown) => unknown
  insert: (table: unknown) => unknown
  update: (table: unknown) => unknown
  delete: (table: unknown) => unknown
  transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
}

const dialect = new PgDialect()

/** The keys of a drizzle projection object, or `null` for a wholesale read. */
function projectionOf(fields: unknown): string[] | null {
  return fields && typeof fields === 'object' ? Object.keys(fields as object) : null
}

export function createQueryRecorder(options: QueryRecorderOptions = {}): QueryRecorder {
  const repeatLast = options.rows === 'repeatLast'

  const queries: RecordedQuery[] = []
  const rowQueues = new Map<string, unknown[][]>()
  const failKeys = new Set<string>()
  const tx = { depth: 0, commits: 0, rollbacks: 0 }
  /** 1-based transaction ids. */
  let txSeq = 0
  let commitFailures = 0

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

  function builder(
    writerTx: number,
    op: RecordedQuery['op'],
    table?: unknown,
    fields?: unknown
  ) {
    const rec: RecordedQuery = {
      op,
      table: table === undefined ? null : tableName(table),
      fields: projectionOf(fields),
      // The WRITER, not the ambient depth. A query issued through the root `db`
      // while a transaction is open is not in that transaction, and saying so
      // is what makes "this row shares the transaction it describes" a real
      // assertion rather than a restatement of "a transaction was running".
      inTx: writerTx > 0,
      txId: writerTx,
      rolledBack: false,
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
      returning(f?: unknown) {
        rec.returning = projectionOf(f)
        return chain
      },
      /**
       * `FOR UPDATE`. Recorded as a no-op link rather than a flag: a mock
       * cannot serialise anything, so a suite proves the lock the only way a
       * mock can — the read happens inside the transaction, before the write,
       * and the write repeats the predicate (see
       * `tests/routes/admin/transfers.test.ts`).
       */
      for: () => chain,
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

  /**
   * A transaction with a COMMIT in it, and a rollback that is visible.
   *
   * Two things were missing and both were load-bearing. There was no commit
   * step, so `failCommit` had nothing to fail — the only way to make
   * `rollbacks` move was for the callback itself to throw, which is the case
   * that was already obvious from the response. And a rollback removed nothing,
   * so a test could assert that a write was ISSUED and never that it went back:
   * "the insert goes back with everything else" was a comment nothing could
   * read.
   */
  async function runTransaction(fn: (tx: unknown) => Promise<unknown>) {
    txSeq += 1
    const id = txSeq
    tx.depth += 1
    try {
      const result = await fn(makeDb(id))
      if (commitFailures > 0) {
        commitFailures -= 1
        throw new Error('injected failure at COMMIT')
      }
      tx.commits += 1
      return result
    } catch (error) {
      tx.rollbacks += 1
      // Everything this transaction issued goes back with it, including a
      // write that had already "succeeded" against the mock.
      for (const q of queries) if (q.txId === id) q.rolledBack = true
      throw error
    } finally {
      tx.depth -= 1
    }
  }

  /**
   * `writerTx` is 0 for the root `db` and the transaction's own id for the
   * handle a callback is given, so every query records WHICH writer issued it.
   */
  function makeDb(writerTx = 0): RecorderDb {
    return {
      select: (fields?: unknown) => builder(writerTx, 'select', undefined, fields),
      insert: (t: unknown) => builder(writerTx, 'insert', t),
      update: (t: unknown) => builder(writerTx, 'update', t),
      delete: (t: unknown) => builder(writerTx, 'delete', t),
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
    failCommit(times = 1) {
      commitFailures += times
    },
    reset() {
      queries.length = 0
      rowQueues.clear()
      failKeys.clear()
      tx.depth = 0
      tx.commits = 0
      tx.rollbacks = 0
      txSeq = 0
      commitFailures = 0
    },
    ops,
    survivors: (op: RecordedQuery['op'], table: unknown) =>
      ops(op, table).filter((q) => !q.rolledBack),
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
