/**
 * Order numbers, after the masonart → chobii rebrand (#361).
 *
 * Three properties, each of which fails silently if it is wrong:
 *
 * 1. **New orders carry the chobii prefix.** The rebrand swept code, docs and
 *    infra but never touched the generator, so orders placed on chobii.art went
 *    on being stamped `MA-` — the old brand — for months after the cutover.
 *
 * 2. **Numbers issued before the switch stay recognisable.** Both the customer
 *    and admin order routes gate on the prefix *before* they will even query,
 *    so a hard switch turns every historical `MA-` number — the ones already
 *    sitting in customers' confirmation emails and SMS — into a 400.
 *
 * 3. **The yearly sequence counts both prefixes.** The counter is prefix-scoped
 *    by construction, so counting only the new prefix restarts at 000001 in the
 *    middle of a year and puts two different orders at sequence 1 in it.
 *
 * The database is mocked. What the generator decides is pure once the count is
 * in hand, and what is worth asserting is the format and which rows get counted
 * — not that Postgres can run a LIKE.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { whereMock } = vi.hoisted(() => ({ whereMock: vi.fn() }))

vi.mock('../../src/database', () => ({
  db: { select: () => ({ from: () => ({ where: whereMock }) }) },
}))

import {
  ORDER_NUMBER_PREFIX,
  LEGACY_ORDER_NUMBER_PREFIXES,
  generateOrderNumber,
  isOrderNumber,
  orderNumberYearPrefixes,
} from '../../src/lib/order-number'

const CURRENT_YEAR = new Date().getFullYear()

beforeEach(() => {
  vi.clearAllMocks()
  whereMock.mockResolvedValue([{ count: 0 }])
})

describe('the prefixes themselves', () => {
  it('issues under the chobii prefix, not the masonart one', () => {
    expect(ORDER_NUMBER_PREFIX).toBe('CA')
  })

  it('keeps the masonart prefix, as a legacy one', () => {
    expect(LEGACY_ORDER_NUMBER_PREFIXES).toContain('MA')
  })
})

describe('generateOrderNumber', () => {
  it('stamps a new order with the chobii prefix', async () => {
    whereMock.mockResolvedValue([{ count: 0 }])

    await expect(generateOrderNumber()).resolves.toBe(`CA-${CURRENT_YEAR}-000001`)
  })

  it('continues from the orders already counted for the year', async () => {
    whereMock.mockResolvedValue([{ count: 41 }])

    await expect(generateOrderNumber()).resolves.toBe(`CA-${CURRENT_YEAR}-000042`)
  })

  it('starts at one when the count comes back empty', async () => {
    whereMock.mockResolvedValue([])

    await expect(generateOrderNumber()).resolves.toBe(`CA-${CURRENT_YEAR}-000001`)
  })
})

describe('orderNumberYearPrefixes', () => {
  it('counts the legacy prefix too, so the year does not restart at one', () => {
    expect(orderNumberYearPrefixes(2026)).toEqual(['CA-2026-', 'MA-2026-'])
  })
})

describe('isOrderNumber', () => {
  it('recognises a number issued after the switch', () => {
    expect(isOrderNumber(`CA-${CURRENT_YEAR}-000001`)).toBe(true)
  })

  it('still recognises a masonart number from before it', () => {
    expect(isOrderNumber('MA-2024-001234')).toBe(true)
  })

  it('rejects a UUID, which the routes resolve as an order id instead', () => {
    expect(isOrderNumber('3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607')).toBe(false)
  })

  it('rejects a word that merely opens with the prefix letters', () => {
    expect(isOrderNumber('CANCELLED')).toBe(false)
  })
})
