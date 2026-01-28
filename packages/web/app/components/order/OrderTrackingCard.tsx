/**
 * OrderTrackingCard Component
 *
 * Main card component for displaying order tracking information.
 * Combines TrackingStatusBadge, TrackingTimeline, and DeliveryEstimate.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useEffect } from 'react'
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Package,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  shipmentsApi,
  type Shipment,
  type ShipmentTrackingResponse,
} from '~/lib/api'
import { TrackingStatusBadge } from './TrackingStatusBadge'
import { TrackingTimeline } from './TrackingTimeline'
import { DeliveryEstimate } from './DeliveryEstimate'

// ============================================================================
// Types
// ============================================================================

export interface OrderTrackingCardProps {
  /** Order ID (UUID) */
  orderId: string
  /** Optional initial shipment data to avoid extra fetch */
  initialShipments?: Shipment[]
  /** Show expanded timeline by default */
  defaultExpanded?: boolean
  /** Optional className */
  className?: string
}

// ============================================================================
// Carrier Display Names
// ============================================================================

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

/**
 * Get display name for carrier
 */
function getCarrierDisplayName(carrier: string): string {
  return CARRIER_DISPLAY_NAMES[carrier.toLowerCase()] || carrier
}

// ============================================================================
// Component
// ============================================================================

/**
 * OrderTrackingCard - Main tracking card component
 *
 * @example
 * <OrderTrackingCard orderId="uuid" orderNumber="ORD-12345" />
 */
export function OrderTrackingCard({
  orderId,
  initialShipments,
  defaultExpanded = false,
  className,
}: OrderTrackingCardProps) {
  const [shipments, setShipments] = useState<Shipment[]>(initialShipments || [])
  const [trackingData, setTrackingData] = useState<Record<string, ShipmentTrackingResponse>>({})
  const [isLoading, setIsLoading] = useState(!initialShipments)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(
    defaultExpanded ? new Set() : new Set()
  )

  // Fetch shipments
  const fetchShipments = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const response = await shipmentsApi.getOrderShipments(orderId)
      setShipments(response.shipments)

      // Auto-expand if defaultExpanded and we have shipments
      if (defaultExpanded && response.shipments.length > 0) {
        setExpandedShipments(new Set(response.shipments.map((s) => s.id)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tracking')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  // Fetch tracking details for a shipment
  const fetchTrackingDetails = async (shipmentId: string) => {
    if (trackingData[shipmentId]) return // Already loaded

    try {
      const response = await shipmentsApi.getTracking(shipmentId)
      setTrackingData((prev) => ({ ...prev, [shipmentId]: response }))
    } catch (err) {
      console.error('Failed to fetch tracking details:', err)
    }
  }

  // Toggle shipment expansion
  const toggleShipment = (shipmentId: string) => {
    setExpandedShipments((prev) => {
      const next = new Set(prev)
      if (next.has(shipmentId)) {
        next.delete(shipmentId)
      } else {
        next.add(shipmentId)
        // Fetch tracking details when expanding
        fetchTrackingDetails(shipmentId)
      }
      return next
    })
  }

  // Initial fetch
  useEffect(() => {
    if (!initialShipments) {
      fetchShipments()
    }
  }, [orderId])

  // Auto-fetch tracking for expanded shipments
  useEffect(() => {
    expandedShipments.forEach((shipmentId) => {
      if (!trackingData[shipmentId]) {
        fetchTrackingDetails(shipmentId)
      }
    })
  }, [expandedShipments])

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          <span className="text-muted-foreground">Loading tracking information...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-200 bg-red-50 p-6', className)}>
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div className="flex-1">
            <p className="font-medium text-red-900">Failed to load tracking</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => fetchShipments()}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // No shipments yet
  if (shipments.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-foreground">
            No shipping information yet
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Tracking will appear here once your order ships.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          Shipment{shipments.length > 1 ? 's' : ''} ({shipments.length})
        </h3>
        <button
          onClick={() => fetchShipments(true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Shipment cards */}
      {shipments.map((shipment) => {
        const isExpanded = expandedShipments.has(shipment.id)
        const tracking = trackingData[shipment.id]

        return (
          <div
            key={shipment.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            {/* Shipment header (clickable) */}
            <button
              type="button"
              onClick={() => toggleShipment(shipment.id)}
              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
                  <Package className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {getCarrierDisplayName(shipment.carrier)}
                    </p>
                    <TrackingStatusBadge status={shipment.status} size="sm" />
                  </div>
                  {shipment.trackingNumber && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tracking: {shipment.trackingNumber}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <DeliveryEstimate
                  estimatedDeliveryAt={shipment.estimatedDeliveryAt}
                  deliveredAt={shipment.deliveredAt}
                  status={shipment.status}
                  className="hidden sm:flex"
                />
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border bg-muted/30 p-4">
                {/* Mobile delivery estimate */}
                <div className="mb-4 sm:hidden">
                  <DeliveryEstimate
                    estimatedDeliveryAt={shipment.estimatedDeliveryAt}
                    deliveredAt={shipment.deliveredAt}
                    status={shipment.status}
                  />
                </div>

                {/* Tracking timeline */}
                {tracking ? (
                  <TrackingTimeline
                    currentStatus={tracking.tracking.currentStatus}
                    steps={tracking.tracking.steps}
                    estimatedDelivery={tracking.tracking.estimatedDelivery}
                  />
                ) : (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                  </div>
                )}

                {/* External tracking link */}
                {shipment.trackingUrl && (
                  <div className="mt-4 border-t border-border pt-4">
                    <a
                      href={shipment.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
                    >
                      Track on {getCarrierDisplayName(shipment.carrier)}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Exports
// ============================================================================

export default OrderTrackingCard
