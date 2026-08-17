/**
 * orderTracking — the order-status vocabulary shared by the /track routes.
 *
 * Ticket #629. There are two tracking pages and they show the same thing:
 *
 *   /track          guest lookup, by order number plus email or phone
 *   /track/$token   direct access from the link in a confirmation email
 *
 * Both rendered the same status banner, the same carrier names and the same
 * six-step timeline from their own private copy of everything below. A status
 * table kept in two files is one release away from a status that renders on one
 * page and falls back to "Confirmed" on the other — which is exactly what the
 * `|| ORDER_STATUS_CONFIG.confirmed` guard at each call site was papering over.
 *
 * The icons live here rather than at the call sites on purpose: the icon IS the
 * status, and splitting the label from the glyph is how the two drift.
 */

import {
  Package,
  AlertCircle,
  CheckCircle,
  Clock,
  Truck,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import type { GuestOrderLookupResponse } from '~/lib/api'

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export interface StatusConfig {
  label: string
  icon: typeof Package
  color: string
  bgColor: string
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  pending_payment: {
    label: 'Pending Payment',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  confirmed: {
    label: 'Confirmed',
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  processing: {
    label: 'Processing',
    icon: Package,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  shipped: {
    label: 'Shipped',
    icon: Truck,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    icon: MapPin,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  delivered: {
    label: 'Delivered',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  cancelled: {
    label: 'Cancelled',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  refunded: {
    label: 'Refunded',
    icon: RefreshCw,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
}

/**
 * Resolve the banner config for a status string off the wire.
 *
 * The API's status is a plain string, so an unrecognised value has to render as
 * *something* — both pages already fell back to "Confirmed", and this keeps
 * that single decision in one place instead of at every call site.
 */
export function getOrderStatusConfig(status: string): StatusConfig {
  return ORDER_STATUS_CONFIG[status as OrderStatus] || ORDER_STATUS_CONFIG.confirmed
}

const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  usps: 'USPS',
  fedex: 'FedEx',
  ups: 'UPS',
  dhl: 'DHL',
  delhivery: 'Delhivery',
  bluedart: 'Blue Dart',
  dtdc: 'DTDC',
  shiprocket: 'Shiprocket',
  'india post': 'India Post',
}

/** Carrier slug to display name, passing an unknown carrier through as-is. */
export function getCarrierDisplayName(carrier: string): string {
  return CARRIER_DISPLAY_NAMES[carrier.toLowerCase()] || carrier
}

export interface TimelineStep {
  status: string
  label: string
  completed: boolean
  timestamp: string | null
}

/**
 * The six-step delivery timeline for an order.
 *
 * Completion reads from three sources, and which one wins per step is the part
 * worth not rewriting from intuition:
 *
 *   - Processing comes off the ORDER status alone (tracking does not exist yet);
 *   - Shipped and everything past it come off the TRACKING status, or a
 *     timestamp on the order's own timeline when the carrier has not reported;
 *   - Delivered trusts either source, because a delivered timestamp on the
 *     order is a stronger signal than a tracking feed that has gone quiet.
 *
 * Timestamps prefer the order's timeline over the carrier's, since the order is
 * the record of truth for what the customer was told.
 */
export function buildTimelineSteps(order: GuestOrderLookupResponse): TimelineStep[] {
  const trackingStatus = order.tracking?.status || ''

  return [
    {
      status: 'confirmed',
      label: 'Order Confirmed',
      completed: true,
      timestamp: order.timeline.orderedAt,
    },
    {
      status: 'processing',
      label: 'Processing',
      completed: ['processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(order.status),
      timestamp: null,
    },
    {
      status: 'shipped',
      label: 'Shipped',
      completed:
        !!order.timeline.shippedAt ||
        ['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(trackingStatus),
      timestamp: order.timeline.shippedAt || order.tracking?.shippedAt || null,
    },
    {
      status: 'in_transit',
      label: 'In Transit',
      completed: ['in_transit', 'out_for_delivery', 'delivered'].includes(trackingStatus),
      timestamp: null,
    },
    {
      status: 'out_for_delivery',
      label: 'Out for Delivery',
      completed: ['out_for_delivery', 'delivered'].includes(trackingStatus),
      timestamp: null,
    },
    {
      status: 'delivered',
      label: 'Delivered',
      completed: !!order.timeline.deliveredAt || trackingStatus === 'delivered',
      timestamp: order.timeline.deliveredAt || order.tracking?.deliveredAt || null,
    },
  ]
}
