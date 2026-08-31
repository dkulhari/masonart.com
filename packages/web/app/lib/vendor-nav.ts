/**
 * Vendor portal shared bits.
 *
 * Deliberately tiny, and deliberately NOT `admin-nav.ts`. The admin navigation
 * module answers "which staff role may see which admin path"; this one answers
 * nothing about permissions at all — the `/vendor` guard does that, and the API
 * scopes every row. What lives here is the handful of constants and formatters
 * the four vendor screens share, so they cannot drift apart.
 *
 * The one rule worth stating: **no formatter here ever substitutes a zero.**
 * `formatVendorAmount` returns null when a value will not parse and the screens
 * print "Unavailable". A confident `₹0.00` over a failed read is #602/#606, and
 * on this surface it means telling a print shop we owe them nothing.
 */

import {
  PRODUCTION_JOB_STATUSES,
  PRODUCTION_TRANSITIONS,
  UNREACHABLE_STATUSES,
  guardFor,
  isTerminalStatus,
  nextStatuses,
  type ProductionJobStatus,
  type TransitionGuard,
} from '@chobii/shared'

/** Rows per page in the vendor job queue. The API's own default. */
export const VENDOR_JOBS_PAGE_SIZE = 20

/** The API clamps here; asking beyond it just gets clamped anyway. */
export const VENDOR_JOBS_MAX_PAGE_SIZE = 100

/**
 * Default search params for `/vendor`.
 *
 * Every `Link` to the queue must carry these. `router.tsx` keeps search values
 * as strings, and the route's `validateSearch` coerces them back — but a link
 * with no search at all navigates to a bare `/vendor`, which is a different URL
 * from the one the screen writes and makes the active-nav state flicker.
 */
export const VENDOR_JOBS_SEARCH = {
  page: 1,
  pageSize: VENDOR_JOBS_PAGE_SIZE,
} as const

/**
 * The job statuses a vendor can ever be looking at, in enum order.
 *
 * DERIVED, and that is the whole point of this block. This used to be a
 * hand-written six-value tuple, and by Phase 5 every one of its problems was
 * live: it carried the RETIRED `sent` (as "Sent back") and had no entry at all
 * for `qc_submitted` or `dispatched` — the two statuses a vendor actually
 * produces. So a vendor who finished their shot list saw their job render a raw
 * enum string through the unknown-pill fallback, under a filter whose only
 * vendor-reachable options were the ones they could no longer reach. The tuple
 * also claimed to be "in the order the work moves" while listing `sent` before
 * `received`, contradicting its own labels four lines below it.
 *
 * The fix is by construction rather than by correction: this is the closure of
 * the shared transition matrix from `assigned`, in `PRODUCTION_JOB_STATUSES`
 * order. Two exclusions fall out of it rather than being asserted here:
 *
 * - **`draft`** — nothing transitions INTO it, and a draft job has no vendor,
 *   so it can never appear in a row-scoped read. Offering it as a filter offers
 *   a view that is empty by construction.
 * - **`sent`** — retired, with zero in-edges and zero out-edges, so the closure
 *   never touches it. It is unreachable and unfilterable here for the same
 *   reason the API refuses to set it, not because this file remembered to say
 *   so.
 *
 * `assigned` is the seed because it is the moment a vendor first holds the job.
 * Everything a job of theirs can subsequently become — including the statuses
 * only WE can move it to, like `qc_passed` — is downstream of it, and a vendor
 * has to be able to read those even though they cannot write them.
 */
function vendorReachableStatuses(): Set<ProductionJobStatus> {
  const seen = new Set<ProductionJobStatus>(['assigned'])
  const queue: ProductionJobStatus[] = ['assigned']

  while (queue.length > 0) {
    const from = queue.shift() as ProductionJobStatus
    // Actor-agnostic on purpose: an admin cancelling or passing a vendor's job
    // changes what that vendor SEES, so their vocabulary has to include it.
    for (const to of Object.keys(PRODUCTION_TRANSITIONS[from]) as ProductionJobStatus[]) {
      if (seen.has(to)) continue
      seen.add(to)
      queue.push(to)
    }
  }

  return seen
}

/**
 * A list derived from a filter is an array, and `z.enum` needs a non-empty
 * tuple. Narrowing here rather than casting at the call site means a matrix
 * that ever stranded `assigned` fails loudly at module load instead of
 * producing a status filter with no options and no explanation.
 *
 * The same guard, for the same reason, as `routes/admin/production/index.tsx`.
 */
function nonEmpty<T>(values: readonly T[], what: string): [T, ...T[]] {
  const [first, ...rest] = values
  if (first === undefined) throw new Error(`vendor-nav: ${what} derived empty`)
  return [first, ...rest]
}

export const VENDOR_JOB_STATUSES = nonEmpty(
  (() => {
    const reachable = vendorReachableStatuses()
    return PRODUCTION_JOB_STATUSES.filter((status) => reachable.has(status))
  })(),
  'VENDOR_JOB_STATUSES'
)

/**
 * A status a vendor may hold.
 *
 * Structurally `ProductionJobStatus`, because the tuple above is derived at
 * runtime — and honestly so: `GET /api/vendor/jobs` reads a column whose pgEnum
 * still carries `sent`, so a row CAN arrive with a status outside the derived
 * list. The formatters below are what make that safe; a narrower type here
 * would only move the lie from the pill into the type system.
 */
export type VendorJobStatus = (typeof VENDOR_JOB_STATUSES)[number]

/**
 * What each status means to the print shop reading it.
 *
 * Not the schema's words, and specifically **nothing about the goods coming
 * back to us**. They do not: the vendor despatches to the next vendor or to the
 * courier, and "Sent back" was a label for a workflow that stopped existing at
 * §4 of the design. Each label names what is true and who is blocked:
 *
 * - `assigned` — it is yours and priced; work has not started.
 * - `received` — you have everything you need and are making it.
 * - `qc_submitted` — you are finished and it is with US. Nothing to do.
 * - `qc_passed` — we approved it; the next move is despatch.
 * - `qc_failed` — we found something; the piece comes back to your bench, not
 *   to our building.
 * - `dispatched` — it has left your hands. Terminal.
 *
 * Keyed partially and cast, exactly as `routes/admin/production/index.tsx` is:
 * the retired status gets no entry because no vendor view offers it, and
 * `vendorStatusLabel` covers the row that carries it anyway. The exhaustiveness
 * check that buys is a test-time one — `it.each([...VENDOR_JOB_STATUSES])` in
 * `tests/routes/vendor/vendor-screens.test.tsx` — which is the stronger of the
 * two here, because the list is derived at runtime and a `Record` over it could
 * never catch a status the matrix grew after this file was last opened.
 */
export const VENDOR_JOB_STATUS_LABELS = {
  assigned: 'Assigned to you',
  received: 'In production',
  qc_submitted: 'Sent for approval',
  qc_passed: 'Approved — ready to ship',
  qc_failed: 'Changes needed',
  dispatched: 'Handed over',
  cancelled: 'Cancelled',
} as Record<VendorJobStatus, string>

/**
 * Colour follows the same reading. Amber is the vendor's own backlog — the two
 * statuses where the next move is theirs — so scanning the queue for "what do I
 * work on next" is a glance rather than a read.
 */
export const VENDOR_JOB_STATUS_STYLES = {
  assigned: 'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-blue-50 text-blue-700 border-blue-200',
  qc_submitted: 'bg-slate-100 text-slate-700 border-slate-300',
  qc_passed: 'bg-green-50 text-green-700 border-green-200',
  qc_failed: 'bg-red-50 text-red-700 border-red-200',
  dispatched: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  cancelled: 'bg-muted text-muted-foreground border-border line-through',
} as Record<VendorJobStatus, string>

/**
 * What a status this file has no label for gets.
 *
 * There is one today — `sent`, on rows in any environment where
 * `db:retire-sent-status` has not run — and there will be another the moment
 * the enum grows again. Neutral and dashed: legible, and obviously unfamiliar.
 */
export const VENDOR_UNKNOWN_STATUS_STYLE =
  'border-dashed border-border bg-muted text-muted-foreground'

/**
 * A status in words, for any status at all.
 *
 * The fallback is not defensive padding. `sent` is retired in the MATRIX, which
 * is a statement about which transitions exist — it is not gone from the pgEnum
 * and it is not gone from the rows, because dropping an enum value means
 * recreating the type and rewriting every dependent column. So a vendor can
 * still open a job carrying it, and a blank pill on that job reads as a
 * rendering fault rather than as a status. The same humanised fallback covers
 * the next value the enum grows, which is why it is a transform rather than a
 * second table naming `sent`.
 */
export function vendorStatusLabel(status: ProductionJobStatus): string {
  return (
    VENDOR_JOB_STATUS_LABELS[status] ??
    status.replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase())
  )
}

/** The pill's classes, with the same fallback and for the same reason. */
export function vendorStatusStyle(status: ProductionJobStatus): string {
  return VENDOR_JOB_STATUS_STYLES[status] ?? VENDOR_UNKNOWN_STATUS_STYLE
}

// ============================================================================
// The actions — the matrix, in the vendor's words
// ============================================================================

/**
 * What this screen knows about the circumstances the API will still check.
 *
 * `true` means the screen has read the evidence and it is there; `false` means
 * it has read it and it is not. **Absent means unknown**, and unknown must not
 * disable a button: the API evaluates every guard itself, and a screen that
 * greys out a legal move because it has not loaded the evidence yet is worse
 * than one that spends a round trip finding out.
 *
 * Exactly ONE guard is ever supplied today, and that is a statement about what
 * a vendor's browser can see rather than about unfinished work.
 * `shot-list-complete` is answered from the photographs already on the job
 * screen, in both directions. `open-transfer-or-order-label` is answered by
 * nobody: it is a disjunction over an OPEN TRANSFER or a label on the ORDER, and
 * the client can observe neither end of it — probing the label route both signs
 * a customer's address and writes a `production_job.label_issued` audit row, and
 * `GET /transfers` withholds the order a parcel belongs to on purpose (R1). So
 * that guard stays absent, which leaves the move live and the API deciding,
 * which is the correct answer rather than a placeholder for a better one.
 */
export type VendorGuardState = Partial<Record<TransitionGuard, boolean>>

export interface VendorJobAction {
  /** The status this action moves the job to. */
  to: VendorJobStatus
  /** The button. */
  label: string
  /** The inline two-step question. Never a native dialog. */
  question: string
  /** `data-testid` on the button; `-confirm` and `-cancel` hang off it. */
  testId: string
  /** The circumstance the API will check, if the matrix names one on the edge. */
  guard?: TransitionGuard
  /** Set only when `guards` says the named guard is NOT satisfied. */
  blockedReason?: string
}

/**
 * The words for each move, keyed on where it LANDS.
 *
 * Copy, not vocabulary — the set of moves comes from the matrix and this table
 * only says them out loud, so a target with no entry here is a bug the tests
 * catch rather than a silently missing button.
 *
 * `received` is reached from two places — `assigned` (start) and `qc_failed`
 * (rework in place) — and takes one wording deliberately: "everything you need
 * to start" is as true of a second attempt as of a first, and the QC history
 * directly below already says which one this is.
 *
 * The question on `received` is the one that changed. It used to be "Confirm
 * you have this job in hand?", which described a physical parcel arriving from
 * us. §4 re-meant the status: it is now "the vendor has everything needed to
 * start" — artwork for a print job, the transferred sheet for a frame job — so
 * the question asks about readiness, not about receipt.
 */
const VENDOR_ACTION_COPY: Record<string, { label: string; question: string }> = {
  received: {
    label: 'Mark received',
    question: 'Confirm you have everything you need to start?',
  },
  qc_submitted: {
    label: 'Send for approval',
    question: 'Confirm the work is finished and ready for us to check?',
  },
  dispatched: {
    label: 'Mark handed over',
    question: 'Confirm this job has left your hands?',
  },
}

/**
 * Why a guard the screen has evidence against is not satisfied yet.
 *
 * The remedy, in the vendor's words — a disabled button with no sentence beside
 * it is a screen telling someone to guess.
 *
 * One entry, because one guard is all this portal can ever answer `false` for.
 * There was a second — `open-transfer-or-order-label` — and it was dead copy
 * from the day it was written: the only chain that fed that guard set it `true`
 * and never `false` (a label the vendor just downloaded), and `false` is not
 * observable from a browser at all, so the sentence could not render. Copy for a
 * state the code cannot reach reads, to the next person, as proof the state
 * happens. A guard with no entry here still gets a sentence, from the fallback
 * below, so deleting this one cannot silently un-disable a button.
 */
const VENDOR_GUARD_UNMET: Partial<Record<TransitionGuard, string>> = {
  'shot-list-complete':
    'Every required photo has to be uploaded first — the approval is judged on the shot list.',
}

/**
 * The sentence for a known-unsatisfied guard this file has no words for.
 *
 * `blockedReason` is what makes a button render disabled, so a guard with no
 * copy must not fall through to `undefined` — that would turn "we know this
 * will be refused" back into a live button, which is the defect class the
 * upload window and the parcel strip were both fixed for. Generic and honest:
 * it says something is outstanding and points at the one party who can see
 * what, rather than guessing on the vendor's behalf.
 */
const VENDOR_GUARD_UNMET_FALLBACK =
  'Something this move needs is not in place yet. Ask us what is outstanding rather than trying again.'

/**
 * Every move a vendor may make on a job in `status`, and nothing else.
 *
 * Read off `nextStatuses(status, 'vendor')` — the same table
 * `packages/api/src/lib/production-transitions.ts` builds
 * `VENDOR_SETTABLE_STATUSES` from and the route's `z.enum` narrows to — so the
 * buttons on this screen cannot disagree with what the API will accept. That is
 * the entire reason the matrix moved to `@chobii/shared`: this file WAS the
 * second copy, and a third would be worse than the first.
 *
 * Three things therefore need no rule here, because the matrix already says
 * them: a vendor is never offered `qc_passed` or `qc_failed` (those edges name
 * `admin`, and a verdict with no review row is a verdict with no evidence),
 * never offered `cancelled` (ours), and never offered `sent` (retired, no
 * edges at all).
 */
export function nextVendorActions(
  status: ProductionJobStatus,
  guards: VendorGuardState = {}
): VendorJobAction[] {
  return nextStatuses(status, 'vendor').map((to) => {
    const copy = VENDOR_ACTION_COPY[to]
    const guard = guardFor(status, to)
    // Only an explicit `false` blocks. `undefined` is "not read yet", and the
    // API is the authority either way.
    const unmet = guard !== undefined && guards[guard] === false

    return {
      to,
      label: copy?.label ?? `Move to ${vendorStatusLabel(to).toLowerCase()}`,
      question: copy?.question ?? `Confirm this job is ${vendorStatusLabel(to).toLowerCase()}?`,
      testId: `vendor-job-mark-${to}`,
      ...(guard ? { guard } : {}),
      ...(unmet && guard
        ? { blockedReason: VENDOR_GUARD_UNMET[guard] ?? VENDOR_GUARD_UNMET_FALLBACK }
        : {}),
    }
  })
}

/**
 * Why this job has no button on it.
 *
 * Every status where `nextVendorActions` is empty needs a sentence, because an
 * action strip that simply vanishes is indistinguishable from one that failed
 * to render. There are four such states and they are four different messages:
 * waiting on us, finished, cancelled, and the retired value a backfill has not
 * reached yet.
 */
export function vendorNoActionReason(status: ProductionJobStatus): string {
  switch (status) {
    case 'qc_submitted':
      return 'This is with us for checking. Nothing to do here until we come to you — you will see the result under Quality checks below.'
    case 'dispatched':
      return 'This job has left your hands, which is the end of it for you. If a parcel goes missing we raise a new job rather than reopening this one.'
    case 'cancelled':
      return 'This job was cancelled, so there is nothing left to do on it. Stop work on this piece and check your queue for the current one.'
    default:
      // `sent`, and anything the enum grows before this file is opened again.
      return 'There is no action for you on a job in this state. If that looks wrong to you, raise it with us rather than working around it.'
  }
}

/**
 * The statuses in which a vendor may still change a job's shot list.
 *
 * DERIVED from the guard, not listed — the same computation
 * `QC_PHOTO_UPLOAD_STATUSES` in `packages/api/src/lib/production-transitions.ts`
 * makes over the same shared table, and for the same reason. A QC photograph
 * exists for exactly one purpose, satisfying `shot-list-complete`, so the window
 * for uploading, replacing or withdrawing one is precisely the set of statuses a
 * vendor can take that guarded edge FROM.
 *
 * Repeating the answer here as `['received']` would be the third copy of the
 * matrix, and #684 is the standing lesson on what those cost: `routes/vendor.ts`
 * held `['sent', 'received']` as a literal and the RETIRED `sent` stayed in a
 * vendor's public vocabulary for two phases after the rows stopped using it.
 * A guard moved to a different edge moves this window with it.
 */
export const VENDOR_PHOTO_UPLOAD_STATUSES: readonly ProductionJobStatus[] =
  PRODUCTION_JOB_STATUSES.filter((from) =>
    PRODUCTION_JOB_STATUSES.some((to) => {
      const edge = PRODUCTION_TRANSITIONS[from][to]
      return edge?.guard === 'shot-list-complete' && edge.actors.includes('vendor')
    })
  )

/**
 * May this vendor still add, replace or withdraw a shot on a job in `status`?
 *
 * The portal asks this to decide whether to render a picker at all. Outside the
 * window the API answers 409, and a control whose only possible outcome is a
 * refusal is a support ticket rather than an affordance.
 */
export function vendorMayUploadPhotos(status: ProductionJobStatus): boolean {
  return VENDOR_PHOTO_UPLOAD_STATUSES.includes(status)
}

/**
 * Is this job still in play — for the vendor, for us, for anybody?
 *
 * The screens use it for sentences in the PRESENT TENSE. "In production since
 * the 3rd" is a claim about now, and a job that has been handed over or
 * cancelled makes it false rather than merely stale; on a job that was never
 * received it has nothing to print at all and renders as an em dash under a
 * label, which reads as a broken field.
 *
 * Both halves come off the shared matrix and neither is listed here.
 * `isTerminalStatus` is "reachable, with nowhere to go" — `dispatched` and
 * `cancelled` today. `UNREACHABLE_STATUSES` is "no edges in either direction" —
 * the retired `sent`, where what moves the job next is a backfill rather than a
 * workshop, so a sentence about production is not true of it either. Writing
 * the three out here instead would be the third copy of the state machine, and
 * `sent` is the standing proof of what those cost.
 */
export function vendorJobIsOpen(status: ProductionJobStatus): boolean {
  return !isTerminalStatus(status) && !UNREACHABLE_STATUSES.includes(status)
}

export const VENDOR_JOB_STAGES = ['print', 'frame'] as const
export type VendorJobStage = (typeof VENDOR_JOB_STAGES)[number]

/**
 * Rupees, or null.
 *
 * Null rather than `₹0.00` when the string will not parse: the caller renders
 * "Unavailable", because a wrong zero beside "we owe you" is worse than a gap.
 */
export function formatVendorAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount)) return null
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** A date, or an em dash. Never "Invalid Date", never today's date as a stand-in. */
export function formatVendorDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Whole days until `dueAt`, or null when there is no due date.
 *
 * Negative means overdue. Returned as a number so the caller decides the
 * wording — "2 days late" and "due in 2 days" are the same arithmetic.
 */
export function daysUntil(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return null
  const MS_PER_DAY = 86_400_000
  const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const startOfNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((startOfDue - startOfNow) / MS_PER_DAY)
}
