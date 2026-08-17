/**
 * A `db.select()` stand-in that both records what the handler built and answers
 * it, shared by the two reviews-read suites.
 *
 * Those suites mock the database rather than seeding one because
 * `reviews.order_item_id` is NOT NULL behind an FK — a single real review needs
 * a whole order chain. That makes a mocked payload easy to fake, so the tests
 * read the *query* back instead of trusting the response: the WHERE clause is
 * rendered through `PgDialect` to prove `approved`-only and `ready`-only
 * filtering survives, and the recorded joins are what the N+1 guard inspects.
 *
 * ```ts
 * const selectMock = vi.hoisted(() => vi.fn())
 * vi.mock('../../src/database', () => ({
 *   db: { select: (...args: unknown[]) => selectMock(...args) },
 * }))
 *
 * const { selects, queueSelects, render, argsFor, joinSql, reset } =
 *   createSelectQueue(selectMock)
 * ```
 *
 * @see packages/api/tests/routes/review-feed.test.ts
 * @see packages/api/tests/routes/review-card-shape.test.ts
 */

import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { Mock } from 'vitest'

export interface RecordedSelect {
  fields: unknown
  ops: Array<{ method: string; args: unknown[] }>
}

export interface SelectQueue {
  /** Every `db.select()` since the last `reset()`, in call order. */
  selects: RecordedSelect[]
  /** Queue one result array per `db.select()` call, in call order. */
  queueSelects: (...results: unknown[][]) => void
  /** Render a recorded drizzle fragment down to `{ sql, params }`. */
  render: (fragment: unknown) => { sql: string; params: unknown[] }
  /** The arguments a recorded select passed to `method`, or undefined. */
  argsFor: (select: RecordedSelect, method: string) => unknown[] | undefined
  /** Every join a recorded select made, rendered down to SQL. */
  joinSql: (select: RecordedSelect) => string[]
  /** Empties the recording. Call from `beforeEach`. */
  reset: () => void
}

/** Chain methods a reviews read can walk before the select is awaited. */
const CHAIN_METHODS = [
  'from',
  'where',
  'groupBy',
  'orderBy',
  'limit',
  'offset',
  'leftJoin',
  'innerJoin',
]

const dialect = new PgDialect()

export function createSelectQueue(selectMock: Mock): SelectQueue {
  const selects: RecordedSelect[] = []

  function render(fragment: unknown): { sql: string; params: unknown[] } {
    const { sql, params } = dialect.sqlToQuery(fragment as SQL)
    return { sql, params: params as unknown[] }
  }

  return {
    selects,
    queueSelects(...results: unknown[][]) {
      let call = 0
      selectMock.mockImplementation((fields: unknown) => {
        const rows = results[call++] ?? []
        const record: RecordedSelect = { fields, ops: [] }
        selects.push(record)

        const chain: Record<string, unknown> = {}
        for (const method of CHAIN_METHODS) {
          chain[method] = (...args: unknown[]) => {
            record.ops.push({ method, args })
            return chain
          }
        }
        chain.then = (resolve: (v: unknown) => void) => resolve(rows)
        return chain
      })
    },
    render,
    argsFor(select: RecordedSelect, method: string) {
      return select.ops.find((op) => op.method === method)?.args
    },
    joinSql(select: RecordedSelect) {
      return select.ops
        .filter((op) => op.method === 'leftJoin' || op.method === 'innerJoin')
        .map((op) => render(op.args[1]).sql)
    },
    reset() {
      selects.length = 0
    },
  }
}
