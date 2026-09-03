/**
 * The shipment status vocabulary (#733): theirs onto ours, and what may
 * follow what.
 *
 * Three tables live in `lib/shipment-status.ts` and this file holds each to
 * the enum it is written over:
 *
 * - `SHIPROCKET_STATUSES` — every Shiprocket status this codebase knows, by
 *   id and by text, with the `shipment_status` it means or `null` for one
 *   that is deliberately ignored. The ticket's done-when: every value of OUR
 *   enum is reachable from at least one of theirs, and an unrecognised
 *   status maps to nothing rather than to something.
 * - `ORDER_STATUS_FOR_SHIPMENT_STATUS` / `ORDER_FOLLOWS_ITS_SHIPMENT` — moved
 *   here from `routes/admin/shipments.ts` (#730) so the webhook and the admin
 *   route read ONE table; `shipments-status-propagation.test.ts` still holds
 *   them through the route's re-export.
 * - `shipmentMayMoveTo` — which courier facts are allowed to move a shipment
 *   from where it is. Scans arrive out of order and get replayed; a late
 *   "in transit" after "delivered" is noise, not a regression to apply.
 */

import { describe, it, expect } from 'vitest'

import { shipmentStatusEnum, type ShipmentStatus } from '../../src/database/schema/shipping'
import {
  SHIPROCKET_STATUSES,
  TERMINAL_SHIPMENT_STATUSES,
  mapShiprocketStatus,
  normaliseShiprocketStatusText,
  shipmentMayMoveTo,
  ORDER_STATUS_FOR_SHIPMENT_STATUS,
  ORDER_FOLLOWS_ITS_SHIPMENT,
  orderShouldMoveTo,
} from '../../src/lib/shipment-status'

const OURS = shipmentStatusEnum.enumValues

describe('SHIPROCKET_STATUSES', () => {
  it('reaches every value of shipment_status from at least one Shiprocket status', () => {
    const unreachable = OURS.filter((ours) => !SHIPROCKET_STATUSES.some((s) => s.ours === ours))
    expect(unreachable, `no Shiprocket status maps onto: ${unreachable.join(', ')}`).toEqual([])
  })

  it('CAN fail: it names a value the table forgot', () => {
    const withoutDelivered = SHIPROCKET_STATUSES.filter((s) => s.ours !== 'delivered')
    const unreachable = OURS.filter((ours) => !withoutDelivered.some((s) => s.ours === ours))
    expect(unreachable).toEqual(['delivered'])
  })

  it('maps only onto real shipment statuses', () => {
    const targets = SHIPROCKET_STATUSES.map((s) => s.ours).filter((t): t is ShipmentStatus => t !== null)
    expect(targets.filter((t) => !OURS.includes(t))).toEqual([])
  })

  it('gives every Shiprocket status one id and one text, neither repeated', () => {
    const ids = SHIPROCKET_STATUSES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const texts = SHIPROCKET_STATUSES.map((s) => normaliseShiprocketStatusText(s.text))
    expect(new Set(texts).size).toBe(texts.length)
    for (const s of SHIPROCKET_STATUSES) {
      expect(Number.isInteger(s.id) && s.id > 0, `${s.text} has no id`).toBe(true)
      expect(s.text.trim()).not.toBe('')
    }
  })

  it('lists the statuses it deliberately ignores, so the unmapped set is inspectable', () => {
    // A fulfilment-centre status is about a warehouse we do not run. Known,
    // and mapped to nothing — which is different from unknown.
    const ignored = SHIPROCKET_STATUSES.filter((s) => s.ours === null)
    expect(ignored.length).toBeGreaterThan(0)
    expect(ignored.map((s) => s.text)).toContain('Packed')
  })
})

describe('mapShiprocketStatus', () => {
  it('maps by id first: ids are stable, their text drifts', () => {
    expect(mapShiprocketStatus({ statusId: 7, status: 'anything they like' })).toBe('delivered')
    expect(mapShiprocketStatus({ statusId: 17, status: '' })).toBe('out_for_delivery')
    expect(mapShiprocketStatus({ statusId: 21, status: 'UNDELIVERED' })).toBe('undelivered')
    expect(mapShiprocketStatus({ statusId: 9, status: 'RTO INITIATED' })).toBe('rto_initiated')
    expect(mapShiprocketStatus({ statusId: 10, status: 'RTO DELIVERED' })).toBe('rto_delivered')
  })

  it('falls back to the text when the id is absent or unknown', () => {
    expect(mapShiprocketStatus({ statusId: null, status: 'Delivered' })).toBe('delivered')
    expect(mapShiprocketStatus({ statusId: 999, status: 'In Transit' })).toBe('in_transit')
  })

  it('reads the text without regard to case, spacing or underscores', () => {
    expect(mapShiprocketStatus({ statusId: null, status: 'rto_initiated' })).toBe('rto_initiated')
    expect(mapShiprocketStatus({ statusId: null, status: '  Out  For Delivery ' })).toBe('out_for_delivery')
    expect(mapShiprocketStatus({ statusId: null, status: 'OUT-FOR-DELIVERY' })).toBe('out_for_delivery')
  })

  it('maps a known-but-ignored status to null, and an unknown one to null', () => {
    expect(mapShiprocketStatus({ statusId: 62, status: 'Packed' })).toBeNull()
    expect(mapShiprocketStatus({ statusId: 31337, status: 'Teleported' })).toBeNull()
    expect(mapShiprocketStatus({ statusId: null, status: '' })).toBeNull()
  })

  it('tells known-ignored from unknown, because one is information and the other is a table gap', () => {
    expect(mapShiprocketStatus({ statusId: 62, status: 'Packed' }, { detail: true })).toEqual({
      ours: null,
      known: true,
    })
    expect(mapShiprocketStatus({ statusId: 31337, status: 'Teleported' }, { detail: true })).toEqual({
      ours: null,
      known: false,
    })
    expect(mapShiprocketStatus({ statusId: 7, status: 'Delivered' }, { detail: true })).toEqual({
      ours: 'delivered',
      known: true,
    })
  })
})

describe('shipmentMayMoveTo', () => {
  it('never moves a shipment to where it already is', () => {
    for (const status of OURS) expect(shipmentMayMoveTo(status, status)).toBe(false)
  })

  it('never moves a shipment out of a terminal state', () => {
    for (const from of TERMINAL_SHIPMENT_STATUSES) {
      for (const to of OURS) {
        expect(shipmentMayMoveTo(from, to), `${from} -> ${to}`).toBe(false)
      }
    }
    expect([...TERMINAL_SHIPMENT_STATUSES].sort()).toEqual(
      ['cancelled', 'delivered', 'failed', 'lost', 'rto_delivered'].sort()
    )
  })

  it('moves forward along the delivery path, and skips steps a courier did not report', () => {
    expect(shipmentMayMoveTo('label_created', 'shipped')).toBe(true)
    expect(shipmentMayMoveTo('shipped', 'in_transit')).toBe(true)
    expect(shipmentMayMoveTo('in_transit', 'out_for_delivery')).toBe(true)
    expect(shipmentMayMoveTo('out_for_delivery', 'delivered')).toBe(true)
    expect(shipmentMayMoveTo('shipped', 'delivered')).toBe(true)
    expect(shipmentMayMoveTo('pending', 'in_transit')).toBe(true)
  })

  it('does not move backwards along it: a late scan is noise', () => {
    expect(shipmentMayMoveTo('out_for_delivery', 'in_transit')).toBe(false)
    expect(shipmentMayMoveTo('in_transit', 'shipped')).toBe(false)
    expect(shipmentMayMoveTo('shipped', 'label_created')).toBe(false)
    expect(shipmentMayMoveTo('label_created', 'pending')).toBe(false)
  })

  it('lets a courier report trouble from anywhere on the path', () => {
    expect(shipmentMayMoveTo('out_for_delivery', 'undelivered')).toBe(true)
    expect(shipmentMayMoveTo('in_transit', 'rto_initiated')).toBe(true)
    expect(shipmentMayMoveTo('shipped', 'lost')).toBe(true)
    expect(shipmentMayMoveTo('label_created', 'cancelled')).toBe(true)
    expect(shipmentMayMoveTo('in_transit', 'rto_delivered')).toBe(true)
  })

  it('after a failed attempt the parcel can go out again, be delivered, or start back', () => {
    expect(shipmentMayMoveTo('undelivered', 'out_for_delivery')).toBe(true)
    expect(shipmentMayMoveTo('undelivered', 'delivered')).toBe(true)
    expect(shipmentMayMoveTo('undelivered', 'in_transit')).toBe(true)
    expect(shipmentMayMoveTo('undelivered', 'rto_initiated')).toBe(true)
    expect(shipmentMayMoveTo('undelivered', 'lost')).toBe(true)
    expect(shipmentMayMoveTo('undelivered', 'shipped')).toBe(false)
    expect(shipmentMayMoveTo('undelivered', 'label_created')).toBe(false)
  })

  it('once a parcel is coming back it only arrives back, or is lost', () => {
    expect(shipmentMayMoveTo('rto_initiated', 'rto_delivered')).toBe(true)
    expect(shipmentMayMoveTo('rto_initiated', 'lost')).toBe(true)
    expect(shipmentMayMoveTo('rto_initiated', 'failed')).toBe(true)
    expect(shipmentMayMoveTo('rto_initiated', 'delivered')).toBe(false)
    expect(shipmentMayMoveTo('rto_initiated', 'out_for_delivery')).toBe(false)
    expect(shipmentMayMoveTo('rto_initiated', 'in_transit')).toBe(false)
  })
})

describe('the order tables, now shared', () => {
  it('are the same objects the admin route re-exports', async () => {
    const route = await import('../../src/routes/admin/shipments')
    expect(route.ORDER_STATUS_FOR_SHIPMENT_STATUS).toBe(ORDER_STATUS_FOR_SHIPMENT_STATUS)
    expect(route.ORDER_FOLLOWS_ITS_SHIPMENT).toBe(ORDER_FOLLOWS_ITS_SHIPMENT)
  })

  it('orderShouldMoveTo is the same predicate the route uses', () => {
    expect(orderShouldMoveTo('processing', 'shipped')).toBe(true)
    expect(orderShouldMoveTo('shipped', 'shipped')).toBe(false)
    expect(orderShouldMoveTo('cancelled', 'delivered')).toBe(false)
    expect(orderShouldMoveTo('processing', null)).toBe(false)
  })
})
