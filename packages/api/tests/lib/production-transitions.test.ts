/**
 * The production job state machine (#676).
 *
 * `production_job_status` is a vocabulary; this module is the grammar. Every
 * assertion below exists because the alternative failure is silent:
 *
 * - **Totality.** The matrix answers for all 9x9x3 triples, and the allowed
 *   subset is pinned as a literal. Adding an edge therefore costs an edit
 *   *here*, in a file a reviewer reads as a spec, rather than passing unnoticed
 *   inside a nested object literal.
 * - **Anti-drift.** The matrix's key set deep-equals the enum's values. A tenth
 *   status added to the enum with no matrix row must fail this suite; a matrix
 *   that quietly denied it would look like a working state machine while
 *   bricking the new state.
 * - **`sent` is retired by having no edges**, not by being removed from the
 *   enum (dropping an enum value means recreating the type). Zero in-edges and
 *   zero out-edges is the whole enforcement, so it is asserted from both sides.
 * - **Reachability**, not just adjacency: `qc_passed` unreachable except
 *   through `qc_submitted` is a property of every path, and a future edge that
 *   routed around QC would satisfy an edge-by-edge test while defeating the
 *   point of one.
 *
 * The module is pure — no database, no Hono — so this suite needs no fixtures
 * and no mocks.
 */

import { describe, it, expect } from 'vitest'

import { PRODUCTION_JOB_STATUSES as SHARED_PRODUCTION_JOB_STATUSES } from '@chobii/shared'

import { productionJobStatusEnum } from '../../src/database/schema/production-jobs'
import {
  PRODUCTION_TRANSITIONS,
  TRANSITION_ACTORS,
  VENDOR_SETTABLE_STATUSES,
  TERMINAL_STATUSES,
  UNREACHABLE_STATUSES,
  ProductionTransitionError,
  assertTransition,
  isTransitionAllowed,
  nextStatuses,
  type ProductionJobStatus,
  type TransitionActor,
} from '../../src/lib/production-transitions'

const STATUSES = productionJobStatusEnum.enumValues as readonly ProductionJobStatus[]
const ACTORS: readonly TransitionActor[] = ['admin', 'vendor', 'system']

/**
 * Every legal move, spelled out. This is the specification; the matrix is the
 * implementation of it. Seventeen triples out of 243 possible ones.
 */
const ALLOWED_TRIPLES = [
  'draft -> assigned (admin)',
  'draft -> cancelled (admin)',
  'assigned -> assigned (admin)',
  'assigned -> received (vendor)',
  'assigned -> cancelled (admin)',
  'received -> qc_submitted (vendor)',
  'received -> cancelled (admin)',
  'qc_submitted -> qc_passed (admin)',
  'qc_submitted -> qc_failed (admin)',
  'qc_submitted -> cancelled (admin)',
  'qc_failed -> received (vendor)',
  'qc_failed -> assigned (admin)',
  'qc_failed -> cancelled (admin)',
  'qc_passed -> qc_failed (admin)',
  'qc_passed -> dispatched (vendor)',
  'qc_passed -> dispatched (admin)',
  'qc_passed -> cancelled (admin)',
]

const triple = (from: string, to: string, actor: string) => `${from} -> ${to} (${actor})`

/** Adjacency over every actor — the graph a job can traverse at all. */
function edgesFrom(from: ProductionJobStatus): ProductionJobStatus[] {
  return STATUSES.filter((to) => ACTORS.some((actor) => isTransitionAllowed(from, to, actor)))
}

function edgesInto(to: ProductionJobStatus): ProductionJobStatus[] {
  return STATUSES.filter((from) => ACTORS.some((actor) => isTransitionAllowed(from, to, actor)))
}

/**
 * Breadth-first reachability, optionally with some nodes cut out of the graph.
 *
 * Exclusion deletes the node, it does not merely skip it as a destination — so
 * a walk that *starts* on an excluded node reaches nothing. Without that, "can
 * you reach qc_passed without qc_submitted" answers yes when you begin standing
 * on qc_submitted, which is the one path the question is not asking about.
 */
function reachableFrom(
  start: ProductionJobStatus,
  excluded: readonly ProductionJobStatus[] = []
): Set<ProductionJobStatus> {
  const seen = new Set<ProductionJobStatus>()
  if (excluded.includes(start)) return seen
  const queue: ProductionJobStatus[] = [start]
  while (queue.length > 0) {
    const node = queue.shift() as ProductionJobStatus
    for (const next of edgesFrom(node)) {
      if (excluded.includes(next) || seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

describe('the transition matrix is total', () => {
  it('answers exactly one of allow/deny for every (from, to, actor) triple', () => {
    const allowed: string[] = []
    let answered = 0

    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          const verdict = isTransitionAllowed(from, to, actor)
          expect(typeof verdict).toBe('boolean')
          answered += 1
          if (verdict) allowed.push(triple(from, to, actor))
        }
      }
    }

    expect(answered).toBe(STATUSES.length * STATUSES.length * ACTORS.length)
    expect(allowed.sort()).toEqual([...ALLOWED_TRIPLES].sort())
  })

  it('deep-equals the enum on its key set, so a new status cannot be silently denied', () => {
    expect(Object.keys(PRODUCTION_TRANSITIONS)).toEqual([...productionJobStatusEnum.enumValues])
  })

  /**
   * The table itself lives in `@chobii/shared` so that `packages/web` can render
   * actions FROM the matrix (design §4) rather than from a second copy of it —
   * web cannot import this package, and the enum below cannot leave it. That
   * makes THIS the seam, and `PRODUCTION_JOB_STATUSES` the part of it a type
   * cannot check: `nextStatuses` over there iterates that list, so a status
   * missing from it is an action the admin screen silently never offers, while
   * the API goes on allowing the move. Only equality with the enum catches it.
   */
  it('is ordered by a shared status list that still matches the enum exactly', () => {
    expect([...SHARED_PRODUCTION_JOB_STATUSES]).toEqual([
      ...productionJobStatusEnum.enumValues,
    ])
  })

  it('names every target it allows as a real status', () => {
    for (const from of STATUSES) {
      for (const to of Object.keys(PRODUCTION_TRANSITIONS[from])) {
        expect(STATUSES).toContain(to)
      }
    }
  })

  it('exports the three actors the matrix is written against', () => {
    expect([...TRANSITION_ACTORS]).toEqual(['admin', 'vendor', 'system'])
  })

  it('refuses a status it has never heard of rather than denying it quietly', () => {
    const bogus = 'shipped_maybe' as ProductionJobStatus
    expect(() => isTransitionAllowed(bogus, 'cancelled', 'admin')).toThrow(/unknown status/i)
    expect(() => isTransitionAllowed('draft', bogus, 'admin')).toThrow(/unknown status/i)
    expect(() => nextStatuses(bogus, 'admin')).toThrow(/unknown status/i)
    expect(() => assertTransition(bogus, 'cancelled', 'admin')).toThrow(/unknown status/i)
  })
})

describe('`sent` is retired by having no edges', () => {
  it('has zero in-edges', () => {
    expect(edgesInto('sent')).toEqual([])
  })

  it('has zero out-edges', () => {
    expect(edgesFrom('sent')).toEqual([])
    expect(PRODUCTION_TRANSITIONS.sent).toEqual({})
  })

  it('offers no next status to any actor', () => {
    for (const actor of ACTORS) {
      expect(nextStatuses('sent', actor)).toEqual([])
    }
  })

  it('is the only status unreachable from anywhere', () => {
    expect([...UNREACHABLE_STATUSES]).toEqual(['sent'])
    const everythingReachable = new Set<ProductionJobStatus>()
    for (const from of STATUSES) {
      for (const to of reachableFrom(from)) everythingReachable.add(to)
    }
    expect(everythingReachable.has('sent')).toBe(false)
  })
})

describe('terminal statuses', () => {
  it('are exactly dispatched and cancelled', () => {
    expect([...TERMINAL_STATUSES]).toEqual(['dispatched', 'cancelled'])
  })

  it('have zero out-edges', () => {
    for (const terminal of TERMINAL_STATUSES) {
      expect(edgesFrom(terminal)).toEqual([])
      for (const actor of ACTORS) {
        expect(nextStatuses(terminal, actor)).toEqual([])
      }
    }
  })

  it('are still reachable — a terminal state with no in-edges would be dead code', () => {
    for (const terminal of TERMINAL_STATUSES) {
      expect(edgesInto(terminal).length).toBeGreaterThan(0)
    }
  })

  it('never resurrect: a lost dispatch creates a new job, it does not reopen this one', () => {
    for (const to of STATUSES) {
      for (const actor of ACTORS) {
        expect(isTransitionAllowed('dispatched', to, actor)).toBe(false)
        expect(isTransitionAllowed('cancelled', to, actor)).toBe(false)
      }
    }
  })
})

describe('every live status can be cancelled', () => {
  const live = STATUSES.filter(
    (status) => !TERMINAL_STATUSES.includes(status) && !UNREACHABLE_STATUSES.includes(status)
  )

  it('covers the six pre-terminal statuses', () => {
    expect(live).toEqual(['draft', 'assigned', 'received', 'qc_submitted', 'qc_passed', 'qc_failed'])
  })

  it('reaches cancelled from each of them', () => {
    for (const from of live) {
      expect(reachableFrom(from).has('cancelled')).toBe(true)
    }
  })

  it('reaches it in one admin step, so nothing has to be walked forward to abandon it', () => {
    for (const from of live) {
      expect(isTransitionAllowed(from, 'cancelled', 'admin')).toBe(true)
      expect(nextStatuses(from, 'admin')).toContain('cancelled')
    }
  })

  it('never lets a vendor cancel', () => {
    for (const from of STATUSES) {
      expect(isTransitionAllowed(from, 'cancelled', 'vendor')).toBe(false)
    }
  })
})

describe('a QC verdict requires a submission', () => {
  it('cannot reach qc_passed by any path that skips qc_submitted', () => {
    for (const from of STATUSES) {
      expect(reachableFrom(from, ['qc_submitted']).has('qc_passed')).toBe(false)
    }
  })

  it('gives qc_passed exactly one in-edge, from qc_submitted', () => {
    expect(edgesInto('qc_passed')).toEqual(['qc_submitted'])
  })

  it('lets a second review fail a job that already passed, before despatch', () => {
    expect(isTransitionAllowed('qc_passed', 'qc_failed', 'admin')).toBe(true)
  })

  it('makes both verdicts admin-only — a vendor cannot rate their own work', () => {
    for (const from of STATUSES) {
      expect(isTransitionAllowed(from, 'qc_passed', 'vendor')).toBe(false)
      expect(isTransitionAllowed(from, 'qc_failed', 'vendor')).toBe(false)
    }
  })
})

describe('the system actor moves nothing', () => {
  it('has no edge anywhere: creation is not a transition, it has no `from`', () => {
    for (const from of STATUSES) {
      expect(nextStatuses(from, 'system')).toEqual([])
      for (const to of STATUSES) {
        expect(isTransitionAllowed(from, to, 'system')).toBe(false)
      }
    }
  })
})

describe('a self-edge is a legal no-op', () => {
  it('allows assigned -> assigned for an admin: that is the reassign/reprice path', () => {
    expect(isTransitionAllowed('assigned', 'assigned', 'admin')).toBe(true)
    expect(() => assertTransition('assigned', 'assigned', 'admin')).not.toThrow()
    expect(nextStatuses('assigned', 'admin')).toContain('assigned')
  })

  it('is the only self-edge — no other status may be re-set onto itself', () => {
    const selfEdges = STATUSES.filter((status) =>
      ACTORS.some((actor) => isTransitionAllowed(status, status, actor))
    )
    expect(selfEdges).toEqual(['assigned'])
  })

  it('does not let a vendor re-report a state they already reported', () => {
    expect(isTransitionAllowed('received', 'received', 'vendor')).toBe(false)
    expect(isTransitionAllowed('qc_submitted', 'qc_submitted', 'vendor')).toBe(false)
  })
})

describe('VENDOR_SETTABLE_STATUSES derives from the matrix', () => {
  it('is exactly the set of targets a vendor has an edge to', () => {
    const derived = STATUSES.filter((to) =>
      STATUSES.some((from) => isTransitionAllowed(from, to, 'vendor'))
    )
    expect([...VENDOR_SETTABLE_STATUSES]).toEqual(derived)
  })

  it('is received, qc_submitted, dispatched — and notably not `sent`', () => {
    expect([...VENDOR_SETTABLE_STATUSES]).toEqual(['received', 'qc_submitted', 'dispatched'])
    expect(VENDOR_SETTABLE_STATUSES).not.toContain('sent')
  })

  it('contains nothing a vendor cannot actually reach from some state', () => {
    for (const status of VENDOR_SETTABLE_STATUSES) {
      expect(edgesInto(status).length).toBeGreaterThan(0)
      expect(STATUSES.some((from) => isTransitionAllowed(from, status, 'vendor'))).toBe(true)
    }
  })
})

describe('nextStatuses renders the actions a UI may offer', () => {
  it('gives an admin the reassign / cancel pair on an assigned job', () => {
    expect(nextStatuses('assigned', 'admin').sort()).toEqual(['assigned', 'cancelled'])
  })

  it('gives a vendor exactly one move on an assigned job', () => {
    expect(nextStatuses('assigned', 'vendor')).toEqual(['received'])
  })

  it('gives a vendor the rework path off qc_failed, and an admin the reassign path', () => {
    expect(nextStatuses('qc_failed', 'vendor')).toEqual(['received'])
    expect(nextStatuses('qc_failed', 'admin').sort()).toEqual(['assigned', 'cancelled'])
  })

  it('lets both actors despatch a passed job', () => {
    expect(nextStatuses('qc_passed', 'vendor')).toEqual(['dispatched'])
    expect(nextStatuses('qc_passed', 'admin').sort()).toEqual(['cancelled', 'dispatched', 'qc_failed'])
  })

  it('returns statuses in enum order, so two screens list the actions the same way', () => {
    for (const from of STATUSES) {
      for (const actor of ACTORS) {
        const next = nextStatuses(from, actor)
        const inEnumOrder = STATUSES.filter((status) => next.includes(status))
        expect(next).toEqual(inEnumOrder)
      }
    }
  })

  it('agrees with isTransitionAllowed on every triple', () => {
    for (const from of STATUSES) {
      for (const actor of ACTORS) {
        const next = nextStatuses(from, actor)
        for (const to of STATUSES) {
          expect(next.includes(to)).toBe(isTransitionAllowed(from, to, actor))
        }
      }
    }
  })

  it('hands back a copy — a caller that sorts it in place must not edit the matrix', () => {
    const first = nextStatuses('qc_passed', 'admin')
    first.push('draft')
    expect(nextStatuses('qc_passed', 'admin')).not.toContain('draft')
  })
})

describe('assertTransition refuses with a 409-shaped error', () => {
  it('stays silent on every legal move', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          if (!isTransitionAllowed(from, to, actor)) continue
          expect(() => assertTransition(from, to, actor)).not.toThrow()
        }
      }
    }
  })

  it('throws on every illegal move', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const actor of ACTORS) {
          if (isTransitionAllowed(from, to, actor)) continue
          expect(() => assertTransition(from, to, actor)).toThrow(ProductionTransitionError)
        }
      }
    }
  })

  it('carries 409 — not 422, which in this router means a fixable payload', () => {
    try {
      assertTransition('draft', 'dispatched', 'admin')
      expect.unreachable('expected a refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionTransitionError)
      const refusal = error as ProductionTransitionError
      expect(refusal.httpStatus).toBe(409)
      expect(refusal.code).toBe('ILLEGAL_TRANSITION')
      expect(refusal.from).toBe('draft')
      expect(refusal.to).toBe('dispatched')
      expect(refusal.actor).toBe('admin')
    }
  })

  it('answers with the remedy, so the UI needs no second round trip', () => {
    try {
      assertTransition('draft', 'dispatched', 'admin')
      expect.unreachable('expected a refusal')
    } catch (error) {
      const body = (error as ProductionTransitionError).toResponseBody()
      expect(body).toEqual({
        error: expect.any(String),
        code: 'ILLEGAL_TRANSITION',
        from: 'draft',
        to: 'dispatched',
        allowed: ['assigned', 'cancelled'],
      })
      expect(body.allowed).toEqual(nextStatuses('draft', 'admin'))
    }
  })

  it('scopes `allowed` to the asking actor, not to everything the job could do', () => {
    try {
      assertTransition('assigned', 'dispatched', 'vendor')
      expect.unreachable('expected a refusal')
    } catch (error) {
      expect((error as ProductionTransitionError).toResponseBody().allowed).toEqual(['received'])
    }
  })

  it('says the job is finished rather than listing an empty remedy silently', () => {
    try {
      assertTransition('cancelled', 'assigned', 'admin')
      expect.unreachable('expected a refusal')
    } catch (error) {
      const refusal = error as ProductionTransitionError
      expect(refusal.toResponseBody().allowed).toEqual([])
      expect(refusal.message).toMatch(/cancelled/)
    }
  })

  it('is a real Error, so an unhandled one still logs a stack', () => {
    const refusal = new ProductionTransitionError('draft', 'dispatched', 'admin', ['assigned'])
    expect(refusal).toBeInstanceOf(Error)
    expect(refusal.name).toBe('ProductionTransitionError')
    expect(refusal.stack).toBeTruthy()
  })
})

describe('the matrix records which guards a route must still evaluate', () => {
  it('names the shot-list guard on received -> qc_submitted', () => {
    expect(PRODUCTION_TRANSITIONS.received.qc_submitted?.guard).toBe('shot-list-complete')
  })

  it('names the transfer/label guard on qc_passed -> dispatched', () => {
    expect(PRODUCTION_TRANSITIONS.qc_passed.dispatched?.guard).toBe('open-transfer-or-order-label')
  })

  it('marks both verdicts as reachable only through a review', () => {
    expect(PRODUCTION_TRANSITIONS.qc_submitted.qc_passed?.guard).toBe('review-verdict-pass')
    expect(PRODUCTION_TRANSITIONS.qc_submitted.qc_failed?.guard).toBe('review-verdict-fail')
    expect(PRODUCTION_TRANSITIONS.qc_passed.qc_failed?.guard).toBe('review-verdict-fail')
  })

  it('marks every edge that must re-price from the live rate card', () => {
    const repriced = new Set<string>()
    for (const from of STATUSES) {
      for (const [to, edge] of Object.entries(PRODUCTION_TRANSITIONS[from])) {
        if (edge?.guard === 'priced-from-rate-card') repriced.add(`${from} -> ${to}`)
      }
    }
    expect([...repriced].sort()).toEqual([
      'assigned -> assigned',
      'draft -> assigned',
      'qc_failed -> assigned',
    ])
  })

  it('leaves cancellation unguarded — an admin may abandon a job at any live point', () => {
    for (const from of STATUSES) {
      expect(PRODUCTION_TRANSITIONS[from].cancelled?.guard).toBeUndefined()
    }
  })
})
