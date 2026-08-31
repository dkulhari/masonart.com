/**
 * The production job state machine, as DATA.
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §4
 *
 * ## Why the matrix is here and the grammar is not
 *
 * `packages/api/src/lib/production-transitions.ts` is still the state machine:
 * `assertTransition`, `ProductionTransitionError`, the guard lookup, the derived
 * sets, and — the part that cannot move — the totality assertion against the
 * live `production_job_status` pgEnum. This module holds only the *table* that
 * module reads, and it holds it because of a constraint the design did not have
 * to face until the admin UI arrived:
 *
 * > "the admin and vendor UIs render actions **from the matrix** rather than
 * > from a hardcoded list that can drift"  — §4
 *
 * `packages/web` cannot import from `packages/api`: it is not a dependency, and
 * `production-transitions.ts` value-imports the drizzle schema, which would drag
 * `drizzle-orm/pg-core` into a browser bundle. So a UI rendering "from the
 * matrix" has exactly two options — a second copy of the table in web, or one
 * copy somewhere both packages can read. This is that one copy.
 *
 * **Nothing here is a mirror.** The API does not restate this table; it imports
 * it and asserts it against the enum. A status added to the pgEnum without a row
 * below is a compile error over there, and the anti-drift test makes it a test
 * failure too. That check is why the table can live outside the package that
 * owns the enum without the two silently parting company.
 *
 * ## `sent` is retired by having no edges
 *
 * Dropping an enum value means recreating the type and rewriting every dependent
 * column, and rows still carry `sent`. So it stays in the vocabulary and is
 * retired *here*, with zero in-edges and zero out-edges.
 */

/**
 * Mirrors `production_job_status` in `packages/api/src/database/schema/
 * production-jobs.ts`, in enum order.
 *
 * The pgEnum stays the authority — the API asserts this list against it — but
 * the enum cannot be imported here: `schema/` is drizzle-kit's input and this
 * package is ESM-only, which `schema/shipping.ts` records as breaking
 * `drizzle-kit generate` outright. So the order matters: `nextStatuses` returns
 * its answer in it, and two screens listing the same actions in different orders
 * is a bug report waiting to happen.
 */
export const PRODUCTION_JOB_STATUSES = [
  'draft',
  'assigned',
  'sent',
  'received',
  'qc_submitted',
  'qc_passed',
  'qc_failed',
  'dispatched',
  'cancelled',
] as const

export type ProductionJobStatus = (typeof PRODUCTION_JOB_STATUSES)[number]

/**
 * Who is asking.
 *
 * `system` has no edge anywhere, deliberately. The one thing the system does on
 * its own — creating a job in `draft` alongside its items — has no `from`, so it
 * is not a transition and is not expressible here.
 */
export type TransitionActor = 'admin' | 'vendor' | 'system'

export const TRANSITION_ACTORS: readonly TransitionActor[] = ['admin', 'vendor', 'system']

/**
 * A circumstance the route must still verify before it writes. Naming them on
 * the edge keeps the list of things-to-check attached to the edge that needs
 * them — and lets a UI say *why* an action it can see is not one it can take.
 */
export type TransitionGuard =
  | 'priced-from-rate-card'
  | 'shot-list-complete'
  | 'review-verdict-pass'
  | 'review-verdict-fail'
  | 'open-transfer-or-order-label'

export interface TransitionEdge {
  /** Every actor permitted to take this edge. Order is not significant. */
  readonly actors: readonly TransitionActor[]
  /** The circumstance a route must verify. Absent means the edge is unguarded. */
  readonly guard?: TransitionGuard
}

/** The targets legal from one status. Absent target ⇒ no edge. */
export type TransitionRow = Readonly<Partial<Record<ProductionJobStatus, TransitionEdge>>>

/** Total by construction: every status is a key, or this does not compile. */
export type TransitionMatrix = { readonly [From in ProductionJobStatus]: TransitionRow }

/**
 * The matrix. Rows are in enum order so this file and the enum read the same way
 * top to bottom, and so `Object.keys` can be compared against the enum directly.
 */
export const PRODUCTION_TRANSITIONS: TransitionMatrix = {
  draft: {
    assigned: { actors: ['admin'], guard: 'priced-from-rate-card' },
    cancelled: { actors: ['admin'] },
  },

  assigned: {
    // A self-edge, and a legal no-op rather than a refusal: this is
    // reassignment before work starts, which re-prices from the rate card.
    assigned: { actors: ['admin'], guard: 'priced-from-rate-card' },
    received: { actors: ['vendor'] },
    cancelled: { actors: ['admin'] },
  },

  // RETIRED (#675). Zero in-edges, zero out-edges. This empty row is the
  // enforcement — see the module header before adding anything to it.
  sent: {},

  received: {
    qc_submitted: { actors: ['vendor'], guard: 'shot-list-complete' },
    cancelled: { actors: ['admin'] },
  },

  qc_submitted: {
    qc_passed: { actors: ['admin'], guard: 'review-verdict-pass' },
    qc_failed: { actors: ['admin'], guard: 'review-verdict-fail' },
    cancelled: { actors: ['admin'] },
  },

  qc_passed: {
    // A second review may still fail a job before it leaves.
    qc_failed: { actors: ['admin'], guard: 'review-verdict-fail' },
    dispatched: { actors: ['vendor', 'admin'], guard: 'open-transfer-or-order-label' },
    cancelled: { actors: ['admin'] },
  },

  qc_failed: {
    received: { actors: ['vendor'] }, // rework in place
    assigned: { actors: ['admin'], guard: 'priced-from-rate-card' }, // rework elsewhere
    cancelled: { actors: ['admin'] },
  },

  // Terminal. A lost transfer creates a NEW job; it never resurrects this one.
  dispatched: {},

  // Terminal. Cancellation always wins a race, because it has no out-edge for
  // anything to move on to.
  cancelled: {},
}

function edgeFor(
  from: ProductionJobStatus,
  to: ProductionJobStatus
): TransitionEdge | undefined {
  return PRODUCTION_TRANSITIONS[from]?.[to]
}

/**
 * Whether `actor` may move a job from `from` to `to`.
 *
 * Answers `false` — rather than throwing — for a status outside the vocabulary,
 * because the API's `isTransitionAllowed` wraps this with the throw. A UI
 * holding a status the enum has since grown should render no action, not crash
 * the screen it is on.
 */
export function isTransitionAllowed(
  from: ProductionJobStatus,
  to: ProductionJobStatus,
  actor: TransitionActor
): boolean {
  return edgeFor(from, to)?.actors.includes(actor) ?? false
}

/**
 * The statuses `actor` may move a job in `from` to, in enum order.
 *
 * Enum order is not cosmetic: the admin queue, the job screen and the vendor
 * portal all render their actions from this list. Returns a fresh array;
 * callers sort and splice it.
 *
 * Includes self-edges — `assigned` appears for an admin looking at an
 * `assigned` job, because reassignment is a real action, not a no-op.
 */
export function nextStatuses(
  from: ProductionJobStatus,
  actor: TransitionActor
): ProductionJobStatus[] {
  return PRODUCTION_JOB_STATUSES.filter(
    (to) => edgeFor(from, to)?.actors.includes(actor) ?? false
  )
}

/** The guard a route must still evaluate for this edge, if any. */
export function guardFor(
  from: ProductionJobStatus,
  to: ProductionJobStatus
): TransitionGuard | undefined {
  return edgeFor(from, to)?.guard
}

function hasOutEdges(status: ProductionJobStatus): boolean {
  return Object.keys(PRODUCTION_TRANSITIONS[status]).length > 0
}

function hasInEdges(status: ProductionJobStatus): boolean {
  return PRODUCTION_JOB_STATUSES.some((from) => edgeFor(from, status) !== undefined)
}

/**
 * Statuses a job can enter and never leave.
 *
 * Derived as "reachable, with nowhere to go" rather than listed, which is what
 * separates them from `sent`: `sent` also has no way out, but it has no way in
 * either, so it is retired rather than terminal.
 */
export const TERMINAL_STATUSES: readonly ProductionJobStatus[] =
  PRODUCTION_JOB_STATUSES.filter((status) => hasInEdges(status) && !hasOutEdges(status))

/**
 * Statuses with no edges at all — nothing reaches them, nothing leaves them.
 * Today: `sent`.
 */
export const UNREACHABLE_STATUSES: readonly ProductionJobStatus[] =
  PRODUCTION_JOB_STATUSES.filter((status) => !hasInEdges(status) && !hasOutEdges(status))

/** Whether a job in this status has nowhere left to go, for anyone. */
export function isTerminalStatus(status: ProductionJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * The two verdicts, and the reason a transition control must never offer them.
 *
 * `qc_passed` and `qc_failed` are reachable only through
 * `POST /api/admin/production/:jobId/reviews`: a verdict with no review row is a
 * verdict with no evidence. `PATCH /:jobId` does not even parse them. So the
 * matrix lists the edges — they are real, and the queue has to know they exist —
 * while any control built over `nextStatuses` subtracts these, because pressing
 * them would spend a round trip on a 409 the client could have predicted.
 */
export const VERDICT_ONLY_STATUSES: readonly ProductionJobStatus[] = [
  'qc_passed',
  'qc_failed',
]

/**
 * What a status control may offer: the matrix, minus the verdicts that belong to
 * the review route.
 *
 * Derived by subtraction rather than listed, so an edge added to the matrix
 * appears in the UI without anyone remembering to add it here.
 */
export function patchableNextStatuses(
  from: ProductionJobStatus,
  actor: TransitionActor
): ProductionJobStatus[] {
  return nextStatuses(from, actor).filter((to) => !VERDICT_ONLY_STATUSES.includes(to))
}
