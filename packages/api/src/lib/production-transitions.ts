/**
 * The production job state machine.
 *
 * `production_job_status` (schema/production-jobs.ts) is a *vocabulary*. This
 * module is the grammar over it, and the single place that decides whether a
 * job may move. Routes ask; they do not decide.
 *
 * ## Why here and not a database trigger
 *
 * A trigger cannot express the guards this workflow actually has. Shot-list
 * completeness and the despatch gate read *other rows*, and under READ
 * COMMITTED a check that reads other rows is a race dressed up as enforcement.
 * A trigger also costs a RAW_SQL_OBJECTS entry and produces a database that
 * silently lacks it after `db:push`. So: a code chokepoint, kept honest by the
 * fact that there is exactly one of it.
 *
 * ## What this module does and does not decide
 *
 * It decides **shape**: may this actor move a job from A to B at all. It does
 * not decide **circumstance** — whether the shot list is complete, whether a
 * transfer is open, whether the row is already settled, or whether two writers
 * are racing. Those are per-request facts the routes read from the database.
 * The `guard` on an edge *names* the circumstance a route still has to check,
 * so the checklist lives beside the edge instead of only in a design document.
 *
 * Concurrency is likewise not here: the `FOR UPDATE` read, the predicate
 * repeated in the UPDATE's WHERE, and the row-count mismatch that rolls back
 * are the caller's (see `routes/admin/vendor-payables.ts`). A pure function
 * cannot serialise anything, and pretending otherwise would be worse than not
 * trying.
 *
 * ## Totality
 *
 * `PRODUCTION_TRANSITIONS` is a mapped type over every enum value, so a status
 * added to the enum without a row here is a *compile* error, and the anti-drift
 * test makes it a test failure too. This matters more than it looks: a partial
 * map would answer "no" for the new status, which reads exactly like a working
 * state machine while the new state is bricked.
 *
 * ## `sent` is retired by having no edges
 *
 * Dropping an enum value means recreating the type and rewriting every
 * dependent column, and rows still carry `sent` until #675's backfill runs. So
 * it stays in the vocabulary and is retired *here*, with zero in-edges and zero
 * out-edges. Nothing can enter it and nothing can leave it.
 */

import { productionJobStatusEnum } from '../database/schema/production-jobs'

export type ProductionJobStatus = (typeof productionJobStatusEnum.enumValues)[number]

/**
 * Who is asking.
 *
 * `system` has no edge anywhere, deliberately. The one thing the system does on
 * its own — creating a job in `draft` alongside its items — has no `from`, so
 * it is not a transition and is not expressible here. Giving `system` a blanket
 * grant "for jobs" would be a hole with no caller.
 */
export type TransitionActor = 'admin' | 'vendor' | 'system'

export const TRANSITION_ACTORS: readonly TransitionActor[] = ['admin', 'vendor', 'system']

/**
 * A circumstance the route must still verify before it writes.
 *
 * Naming them in the matrix keeps the list of things-to-check attached to the
 * edge that needs them, so a new edge cannot quietly arrive without one.
 *
 * - `priced-from-rate-card` — the job's amount is (re)computed from the rate
 *   card live at that instant. Reassignment re-prices; the old vendor's rate
 *   must not follow the job to the new one.
 * - `shot-list-complete` — every `required` shot-list slot has a live photo.
 * - `review-verdict-pass` / `review-verdict-fail` — reachable only through
 *   `POST /:jobId/reviews`, because a verdict with no review row is a verdict
 *   with no evidence. `review-verdict-fail` additionally requires ≥1 defect.
 * - `open-transfer-or-order-label` — the piece is on an open transfer to the
 *   next vendor, or the order already has a shipping label.
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

/** Total by construction: every enum value is a key, or this does not compile. */
export type TransitionMatrix = { readonly [From in ProductionJobStatus]: TransitionRow }

/**
 * The matrix. Rows are in enum order so this file and the enum read the same
 * way top to bottom, and so `Object.keys` can be compared against the enum
 * directly.
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

const STATUS_VALUES = productionJobStatusEnum.enumValues as readonly ProductionJobStatus[]

function assertKnownStatus(status: ProductionJobStatus, role: 'from' | 'to'): void {
  if (!STATUS_VALUES.includes(status)) {
    throw new Error(
      `production-transitions: unknown status '${status}' as ${role}. ` +
        `Known statuses are ${STATUS_VALUES.join(', ')}.`
    )
  }
}

function edgeFor(
  from: ProductionJobStatus,
  to: ProductionJobStatus
): TransitionEdge | undefined {
  return PRODUCTION_TRANSITIONS[from][to]
}

/**
 * Whether `actor` may move a job from `from` to `to`.
 *
 * Throws — rather than returning `false` — for a status outside the enum. An
 * unknown status is a bug in the caller, and answering "not allowed" would bury
 * it as an ordinary refusal.
 */
export function isTransitionAllowed(
  from: ProductionJobStatus,
  to: ProductionJobStatus,
  actor: TransitionActor
): boolean {
  assertKnownStatus(from, 'from')
  assertKnownStatus(to, 'to')
  return edgeFor(from, to)?.actors.includes(actor) ?? false
}

/**
 * The statuses `actor` may move a job in `from` to, in enum order.
 *
 * Enum order is not cosmetic: the admin queue and the vendor portal both render
 * their actions from this list, and two screens listing the same actions in
 * different orders is a bug report waiting to happen. Returns a fresh array;
 * callers sort and splice it.
 *
 * Includes self-edges — `assigned` appears for an admin looking at an
 * `assigned` job, because reassignment is a real action, not a no-op.
 */
export function nextStatuses(
  from: ProductionJobStatus,
  actor: TransitionActor
): ProductionJobStatus[] {
  assertKnownStatus(from, 'from')
  return STATUS_VALUES.filter((to) => edgeFor(from, to)?.actors.includes(actor) ?? false)
}

/** The guard a route must still evaluate for this edge, if any. */
export function guardFor(
  from: ProductionJobStatus,
  to: ProductionJobStatus
): TransitionGuard | undefined {
  assertKnownStatus(from, 'from')
  assertKnownStatus(to, 'to')
  return edgeFor(from, to)?.guard
}

/**
 * A refused transition.
 *
 * **409, not 422.** In this router 422 already means "your payload names things
 * that do not line up" — `missingOrderItemIds`, `unpriced` — which the caller
 * fixes by editing the body. A transition conflict is not that: the body is
 * fine, the world moved. Conflating the two teaches clients to retry the wrong
 * thing.
 *
 * `allowed` is scoped to the *asking* actor, so the response is a remedy the
 * caller can act on rather than a list of moves someone else could make.
 */
export class ProductionTransitionError extends Error {
  /** The status a route should answer with. */
  readonly httpStatus = 409 as const
  readonly code = 'ILLEGAL_TRANSITION' as const
  readonly from: ProductionJobStatus
  readonly to: ProductionJobStatus
  readonly actor: TransitionActor
  readonly allowed: readonly ProductionJobStatus[]

  constructor(
    from: ProductionJobStatus,
    to: ProductionJobStatus,
    actor: TransitionActor,
    allowed: readonly ProductionJobStatus[]
  ) {
    super(
      allowed.length > 0
        ? `Cannot move a production job from '${from}' to '${to}' as ${actor}. ` +
            `From '${from}' this actor may move it to: ${allowed.join(', ')}.`
        : `Cannot move a production job from '${from}' to '${to}' as ${actor}. ` +
            `A job in '${from}' cannot be moved by this actor at all.`
    )
    this.name = 'ProductionTransitionError'
    this.from = from
    this.to = to
    this.actor = actor
    this.allowed = allowed
  }

  /**
   * The 409 body. Carries the remedy so the UI re-renders its buttons without a
   * second round trip.
   */
  toResponseBody(): {
    error: string
    code: 'ILLEGAL_TRANSITION'
    from: ProductionJobStatus
    to: ProductionJobStatus
    allowed: ProductionJobStatus[]
  } {
    return {
      error: this.message,
      code: this.code,
      from: this.from,
      to: this.to,
      allowed: [...this.allowed],
    }
  }
}

/**
 * Permit the move or throw. The one call every write path makes.
 *
 * A self-edge is permitted and is a no-op for the caller — `assigned →
 * assigned` is reassignment. Callers write no audit row for a transition where
 * `from === to`: one row per *transition*, not per request.
 */
export function assertTransition(
  from: ProductionJobStatus,
  to: ProductionJobStatus,
  actor: TransitionActor
): void {
  if (isTransitionAllowed(from, to, actor)) return
  throw new ProductionTransitionError(from, to, actor, nextStatuses(from, actor))
}

// ============================================================================
// Derived sets — computed FROM the matrix, so nothing can drift out of step
// with it. None of these is written down twice.
// ============================================================================

function hasOutEdges(status: ProductionJobStatus): boolean {
  return Object.keys(PRODUCTION_TRANSITIONS[status]).length > 0
}

function hasInEdges(status: ProductionJobStatus): boolean {
  return STATUS_VALUES.some((from) => edgeFor(from, status) !== undefined)
}

function nonEmpty(
  statuses: readonly ProductionJobStatus[],
  what: string
): readonly [ProductionJobStatus, ...ProductionJobStatus[]] {
  const [first, ...rest] = statuses
  if (first === undefined) throw new Error(`production-transitions: ${what} derived empty`)
  return [first, ...rest]
}

/**
 * The statuses a vendor may set, derived from the vendor edges.
 *
 * `routes/vendor.ts` used to hold this as a hardcoded `['sent', 'received']`
 * literal — wrong on both counts, since `sent` is retired and a vendor also
 * submits QC and despatches. #684 deleted that literal; the route's `z.enum`
 * now reads THIS, which is why the tuple is typed non-empty.
 */
export const VENDOR_SETTABLE_STATUSES = nonEmpty(
  STATUS_VALUES.filter((to) => STATUS_VALUES.some((from) => edgeFor(from, to)?.actors.includes('vendor') ?? false)),
  'VENDOR_SETTABLE_STATUSES'
)

/**
 * Statuses a job can enter and never leave.
 *
 * Derived as "reachable, with nowhere to go" rather than listed, which is what
 * separates them from `sent`: `sent` also has no way out, but it has no way in
 * either, so it is retired rather than terminal.
 */
export const TERMINAL_STATUSES: readonly ProductionJobStatus[] = STATUS_VALUES.filter(
  (status) => hasInEdges(status) && !hasOutEdges(status)
)

/**
 * Statuses with no edges at all — nothing reaches them, nothing leaves them.
 *
 * Today: `sent`. If a second value ever lands here it is either newly retired
 * or someone forgot to wire it up, and both are worth noticing.
 */
export const UNREACHABLE_STATUSES: readonly ProductionJobStatus[] = STATUS_VALUES.filter(
  (status) => !hasInEdges(status) && !hasOutEdges(status)
)
