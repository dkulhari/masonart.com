/**
 * TrackingStatusBadge Component
 *
 * Displays the current shipment status with icon and color coding.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Clock, Tag, Truck, Package, MapPin, CheckCircle, RotateCcw, XCircle } from "lucide-react";
import { cn } from "~/lib/utils";
import type { ShipmentStatus } from "~/lib/api";

// ============================================================================
// Types
// ============================================================================

export interface TrackingStatusBadgeProps {
  /** The current shipment status */
  status: ShipmentStatus;
  /** Optional size variant */
  size?: "sm" | "md" | "lg";
  /** Optional className */
  className?: string;
}

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  label: string;
  icon: typeof Clock;
  color: string;
  bgColor: string;
  borderColor: string;
}

const STATUS_CONFIG: Record<ShipmentStatus, StatusConfig> = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  label_created: {
    label: "Label Created",
    icon: Tag,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  shipped: {
    label: "Shipped",
    icon: Package,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
  },
  in_transit: {
    label: "In Transit",
    icon: Truck,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    icon: MapPin,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  returned: {
    label: "Returned",
    icon: RotateCcw,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
};

// Size variants
const SIZE_CLASSES = {
  sm: {
    badge: "px-2 py-0.5 text-xs",
    icon: "h-3 w-3",
  },
  md: {
    badge: "px-3 py-1 text-sm",
    icon: "h-4 w-4",
  },
  lg: {
    badge: "px-4 py-1.5 text-base",
    icon: "h-5 w-5",
  },
};

// ============================================================================
// Component
// ============================================================================

/**
 * TrackingStatusBadge - Displays shipment status with icon
 *
 * @example
 * <TrackingStatusBadge status="in_transit" />
 * <TrackingStatusBadge status="delivered" size="lg" />
 */
export function TrackingStatusBadge({ status, size = "md", className }: TrackingStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const sizeClasses = SIZE_CLASSES[size];
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        config.bgColor,
        config.color,
        config.borderColor,
        sizeClasses.badge,
        className
      )}
    >
      <StatusIcon className={sizeClasses.icon} />
      <span>{config.label}</span>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export { STATUS_CONFIG };
export default TrackingStatusBadge;
