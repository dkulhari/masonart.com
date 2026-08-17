import { describe, it, expect } from 'vitest'
import {
  longestEdgeInches,
  selectRateInForce,
  findOverlappingBand,
  type RateRow,
} from '../../src/lib/vendor-rates'

const rate = (o: Partial<RateRow>): RateRow => ({
  id: o.id ?? 'r',
  vendorId: o.vendorId ?? 'v1',
  kind: o.kind ?? 'print',
  finish: o.finish ?? null,
  longestEdgeMinInches: o.longestEdgeMinInches ?? 0,
  longestEdgeMaxInches: o.longestEdgeMaxInches ?? 24,
  amount: o.amount ?? '100.00',
  effectiveFrom: o.effectiveFrom ?? new Date('2020-01-01'),
  effectiveTo: o.effectiveTo ?? null,
})

describe('longestEdgeInches', () => {
  it('takes the longer side regardless of orientation', () => {
    expect(longestEdgeInches({ widthInches: 24, heightInches: 36 })).toBe(36)
    expect(longestEdgeInches({ widthInches: 36, heightInches: 24 })).toBe(36)
    expect(longestEdgeInches({ widthInches: 20, heightInches: 20 })).toBe(20)
  })
})

describe('selectRateInForce', () => {
  const now = new Date('2026-08-17T00:00:00Z')

  it('is inclusive of min and exclusive of max', () => {
    const rows = [rate({ id: 'a', longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })]
    expect(selectRateInForce(rows, { longestEdge: 0, kind: 'print', finish: null, at: now })?.id).toBe('a')
    expect(selectRateInForce(rows, { longestEdge: 23, kind: 'print', finish: null, at: now })?.id).toBe('a')
    // 24 belongs to the NEXT band, not this one
    expect(selectRateInForce(rows, { longestEdge: 24, kind: 'print', finish: null, at: now })).toBeNull()
  })

  it('does not leak a rate scheduled to start in the future', () => {
    const rows = [
      rate({ id: 'current', amount: '100.00' }),
      rate({ id: 'future', amount: '150.00', effectiveFrom: new Date('2026-09-01') }),
    ]
    // A vendor announcing a rise from the 1st is ordinary; charging it early is the bug.
    expect(selectRateInForce(rows, { longestEdge: 12, kind: 'print', finish: null, at: now })?.id).toBe('current')
  })

  it('ignores a rate whose window has closed', () => {
    const rows = [rate({ id: 'expired', effectiveTo: new Date('2026-01-01') })]
    expect(selectRateInForce(rows, { longestEdge: 12, kind: 'print', finish: null, at: now })).toBeNull()
  })

  it('matches on finish when one is asked for', () => {
    const rows = [
      rate({ id: 'matte', finish: 'matte', amount: '100.00' }),
      rate({ id: 'gloss', finish: 'gloss', amount: '120.00' }),
    ]
    expect(selectRateInForce(rows, { longestEdge: 12, kind: 'print', finish: 'gloss', at: now })?.id).toBe('gloss')
  })
})

describe('findOverlappingBand', () => {
  it('rejects two size bands whose effective windows also intersect', () => {
    const existing = [rate({ id: 'a', longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })]
    const candidate = rate({ id: 'b', longestEdgeMinInches: 12, longestEdgeMaxInches: 36 })
    expect(findOverlappingBand(existing, candidate)?.id).toBe('a')
  })

  it('allows the SAME size band at a later time — that is how a price changes', () => {
    const existing = [
      rate({ id: 'a', effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-09-01') }),
    ]
    const candidate = rate({ id: 'b', effectiveFrom: new Date('2026-09-01') })
    expect(findOverlappingBand(existing, candidate)).toBeNull()
  })

  it('allows adjacent bands — exclusive max means 24 does not collide with 0-24', () => {
    const existing = [rate({ id: 'a', longestEdgeMinInches: 0, longestEdgeMaxInches: 24 })]
    const candidate = rate({ id: 'b', longestEdgeMinInches: 24, longestEdgeMaxInches: 48 })
    expect(findOverlappingBand(existing, candidate)).toBeNull()
  })

  it('does not compare across different kinds or finishes', () => {
    const existing = [rate({ id: 'a', kind: 'print', finish: 'matte' })]
    expect(findOverlappingBand(existing, rate({ id: 'b', kind: 'frame', finish: 'matte' }))).toBeNull()
    expect(findOverlappingBand(existing, rate({ id: 'c', kind: 'print', finish: 'gloss' }))).toBeNull()
  })

  it('ignores the row being edited when checking itself', () => {
    const existing = [rate({ id: 'a' })]
    expect(findOverlappingBand(existing, rate({ id: 'a', amount: '200.00' }))).toBeNull()
  })
})
