/**
 * orderTracking — the shared order-status vocabulary for the /track routes (#629).
 *
 * `/track` (guest lookup by order number) and `/track/$token` (link from the
 * confirmation email) rendered the same status chrome from two identical
 * private copies of this: the `OrderStatus` union, the status config table, the
 * carrier display names, and `buildTimelineSteps`. Two copies of a status table
 * is one release away from a status that exists on one page and not the other.
 *
 * What these tests pin is the part that is easy to get wrong on the way out of
 * the copies — the timeline's completion rules, which read from THREE sources
 * (the order status, the tracking status, and the timeline timestamps) and are
 * not simply "is this step's status the current one".
 */

import { describe, it, expect } from 'vitest'
import {
  ORDER_STATUS_CONFIG,
  getCarrierDisplayName,
  buildTimelineSteps,
  type OrderStatus,
} from '~/lib/orderTracking'
import type { GuestOrderLookupResponse } from '~/lib/api'

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
]

/** A lookup response with only the fields the timeline actually reads. */
function orderOf(
  overrides: Partial<GuestOrderLookupResponse> = {}
): GuestOrderLookupResponse {
  return {
    orderNumber: 'CHB-1001',
    status: 'confirmed',
    itemCount: 1,
    timeline: {
      orderedAt: '2026-08-01T00:00:00.000Z',
      shippedAt: null,
      deliveredAt: null,
    },
    tracking: null,
    shippingAddress: null,
    ...overrides,
  } as GuestOrderLookupResponse
}

const stepFor = (order: GuestOrderLookupResponse, status: string) =>
  buildTimelineSteps(order).find((step) => step.status === status)!

describe('ORDER_STATUS_CONFIG', () => {
  it('covers every order status', () => {
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_CONFIG[status]).toBeDefined()
      expect(ORDER_STATUS_CONFIG[status].label).toBeTruthy()
    }
  })
})

describe('getCarrierDisplayName', () => {
  it('maps a known carrier slug to its display name', () => {
    expect(getCarrierDisplayName('bluedart')).toBe('Blue Dart')
    expect(getCarrierDisplayName('usps')).toBe('USPS')
  })

  it('is case-insensitive', () => {
    expect(getCarrierDisplayName('FedEx')).toBe('FedEx')
    expect(getCarrierDisplayName('DHL')).toBe('DHL')
  })

  it('passes an unknown carrier through untouched', () => {
    expect(getCarrierDisplayName('Some Local Courier')).toBe('Some Local Courier')
  })
})

describe('buildTimelineSteps', () => {
  it('returns the six steps in delivery order', () => {
    expect(buildTimelineSteps(orderOf()).map((step) => step.status)).toEqual([
      'confirmed',
      'processing',
      'shipped',
      'in_transit',
      'out_for_delivery',
      'delivered',
    ])
  })

  it('always treats the order as confirmed, and carries the ordered timestamp', () => {
    const step = stepFor(orderOf({ status: 'pending_payment' }), 'confirmed')

    expect(step.completed).toBe(true)
    expect(step.timestamp).toBe('2026-08-01T00:00:00.000Z')
  })

  it('completes Processing from the ORDER status, not the tracking status', () => {
    expect(stepFor(orderOf({ status: 'confirmed' }), 'processing').completed).toBe(false)
    expect(stepFor(orderOf({ status: 'processing' }), 'processing').completed).toBe(true)
    expect(stepFor(orderOf({ status: 'delivered' }), 'processing').completed).toBe(true)
  })

  it('completes Shipped from a shipped timestamp even when tracking is absent', () => {
    const order = orderOf({
      status: 'confirmed',
      timeline: {
        orderedAt: '2026-08-01T00:00:00.000Z',
        shippedAt: '2026-08-02T00:00:00.000Z',
        deliveredAt: null,
      },
    } as Partial<GuestOrderLookupResponse>)

    const step = stepFor(order, 'shipped')
    expect(step.completed).toBe(true)
    expect(step.timestamp).toBe('2026-08-02T00:00:00.000Z')
  })

  it('completes Shipped from the TRACKING status when no timestamp exists', () => {
    const order = orderOf({
      status: 'confirmed',
      tracking: { status: 'in_transit', carrier: 'delhivery' },
    } as Partial<GuestOrderLookupResponse>)

    expect(stepFor(order, 'shipped').completed).toBe(true)
    expect(stepFor(order, 'in_transit').completed).toBe(true)
    expect(stepFor(order, 'out_for_delivery').completed).toBe(false)
  })

  it('falls back to the tracking timestamps when the order timeline has none', () => {
    const order = orderOf({
      tracking: {
        status: 'delivered',
        carrier: 'delhivery',
        shippedAt: '2026-08-03T00:00:00.000Z',
        deliveredAt: '2026-08-05T00:00:00.000Z',
      },
    } as Partial<GuestOrderLookupResponse>)

    expect(stepFor(order, 'shipped').timestamp).toBe('2026-08-03T00:00:00.000Z')
    expect(stepFor(order, 'delivered').timestamp).toBe('2026-08-05T00:00:00.000Z')
  })

  it('completes Delivered from a delivered timestamp alone', () => {
    const order = orderOf({
      status: 'shipped',
      timeline: {
        orderedAt: '2026-08-01T00:00:00.000Z',
        shippedAt: '2026-08-02T00:00:00.000Z',
        deliveredAt: '2026-08-05T00:00:00.000Z',
      },
    } as Partial<GuestOrderLookupResponse>)

    expect(stepFor(order, 'delivered').completed).toBe(true)
  })

  it('leaves every shipping step open for an order that has only just been placed', () => {
    const steps = buildTimelineSteps(orderOf({ status: 'confirmed' }))

    expect(steps.filter((step) => step.completed).map((step) => step.status)).toEqual([
      'confirmed',
    ])
  })
})
