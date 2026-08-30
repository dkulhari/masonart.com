/**
 * The transition table, and the two derivations only the UIs use.
 *
 * The matrix's own semantics are pinned in
 * `packages/api/tests/lib/production-transitions.test.ts` — 47 assertions
 * against the live `production_job_status` pgEnum, which cannot be imported
 * here. That file is the specification. This one covers the part of the module
 * that exists for the screens rather than for the API: `VERDICT_ONLY_STATUSES`
 * and the subtraction built on it, which nothing in `packages/api` calls.
 *
 * Expected values are written out rather than re-derived. A test that recomputes
 * what it is checking passes whatever the code does.
 */

import { describe, it, expect } from 'vitest'

import {
  PRODUCTION_JOB_STATUSES,
  TERMINAL_STATUSES,
  VERDICT_ONLY_STATUSES,
  isTerminalStatus,
  nextStatuses,
  patchableNextStatuses,
} from '../../src/schemas/production-transitions'

describe('the shared status vocabulary', () => {
  it('is the pgEnum in enum order, `sent` included and retired', () => {
    expect([...PRODUCTION_JOB_STATUSES]).toEqual([
      'draft',
      'assigned',
      'sent',
      'received',
      'qc_submitted',
      'qc_passed',
      'qc_failed',
      'dispatched',
      'cancelled',
    ])
  })
})

describe('isTerminalStatus', () => {
  it('is true for the two statuses nothing leaves', () => {
    expect(isTerminalStatus('dispatched')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect([...TERMINAL_STATUSES]).toEqual(['dispatched', 'cancelled'])
  })

  /**
   * `sent` also has no way out — but it has no way IN either, so it is retired
   * rather than terminal, and a screen has to say different things about the
   * two. A job that reached `dispatched` is finished; a row still carrying
   * `sent` is waiting on a backfill.
   */
  it('is false for `sent`, which is retired rather than terminal', () => {
    expect(isTerminalStatus('sent')).toBe(false)
  })

  it('is false for every status with somewhere to go', () => {
    for (const status of ['draft', 'assigned', 'received', 'qc_submitted', 'qc_passed', 'qc_failed'] as const) {
      expect(isTerminalStatus(status)).toBe(false)
    }
  })
})

describe('patchableNextStatuses', () => {
  /**
   * `qc_passed` and `qc_failed` are reachable only through
   * `POST /:jobId/reviews` — a verdict with no review row is a verdict with no
   * evidence — and `PATCH /:jobId` does not even parse them. A status control
   * offering them would spend a round trip on a refusal it could have predicted.
   */
  it('drops the two verdicts from a qc_submitted job, leaving only cancel', () => {
    expect(nextStatuses('qc_submitted', 'admin')).toEqual([
      'qc_passed',
      'qc_failed',
      'cancelled',
    ])
    expect(patchableNextStatuses('qc_submitted', 'admin')).toEqual(['cancelled'])
  })

  it('drops the overturn edge from a qc_passed job but keeps despatch', () => {
    expect(patchableNextStatuses('qc_passed', 'admin')).toEqual([
      'dispatched',
      'cancelled',
    ])
  })

  it('leaves an unguarded row untouched', () => {
    expect(patchableNextStatuses('draft', 'admin')).toEqual(['assigned', 'cancelled'])
    expect(patchableNextStatuses('assigned', 'admin')).toEqual(['assigned', 'cancelled'])
    expect(patchableNextStatuses('qc_failed', 'admin')).toEqual(['assigned', 'cancelled'])
    expect(patchableNextStatuses('received', 'admin')).toEqual(['cancelled'])
  })

  it('is empty for a terminal status and for the retired one', () => {
    expect(patchableNextStatuses('dispatched', 'admin')).toEqual([])
    expect(patchableNextStatuses('cancelled', 'admin')).toEqual([])
    expect(patchableNextStatuses('sent', 'admin')).toEqual([])
  })

  it('names the two verdict-only statuses and nothing else', () => {
    expect([...VERDICT_ONLY_STATUSES]).toEqual(['qc_passed', 'qc_failed'])
  })

  /** A vendor never reaches a verdict, so the subtraction is a no-op for them. */
  it('changes nothing for a vendor, who has no verdict edge at all', () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      expect(patchableNextStatuses(status, 'vendor')).toEqual(
        nextStatuses(status, 'vendor')
      )
    }
  })
})
