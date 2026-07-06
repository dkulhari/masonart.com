/**
 * TrackingTimeline Component
 *
 * Displays a visual timeline showing the shipment's progress through
 * various stages from order received to delivered.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Clock, Tag, Package, Truck, MapPin, CheckCircle, Circle } from "lucide-react";
import { cn, formatDate } from "~/lib/utils";
import type { TrackingTimelineStep } from "~/lib/api";

// ============================================================================
// Types
// ============================================================================

export interface TrackingTimelineProps {
  /** Current status */
  currentStatus: string;
  /** Timeline steps */
  steps: TrackingTimelineStep[];
  /** Estimated delivery date */
  estimatedDelivery: string | null;
  /** Show compact version */
  compact?: boolean;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Step Icon Mapping
// ============================================================================

const STEP_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  label_created: Tag,
  shipped: Package,
  in_transit: Truck,
  out_for_delivery: MapPin,
  delivered: CheckCircle,
};

// ============================================================================
// Component
// ============================================================================

/**
 * TrackingTimeline - Visual timeline for shipment tracking
 *
 * @example
 * <TrackingTimeline
 *   currentStatus="in_transit"
 *   steps={trackingSteps}
 *   estimatedDelivery="2024-02-15T00:00:00Z"
 * />
 */
export function TrackingTimeline({
  currentStatus,
  steps,
  estimatedDelivery,
  compact = false,
  className,
}: TrackingTimelineProps) {
  // Find the current step index
  const currentStepIndex = steps.findIndex(
    (step) => !step.completed && steps.some((s) => s.completed)
  );

  return (
    <div className={cn("relative", className)}>
      {/* Timeline */}
      <div className="relative">
        {steps.map((step, index) => {
          const Icon = STEP_ICONS[step.status] || Circle;
          const isCompleted = step.completed;
          const isCurrent =
            index === currentStepIndex ||
            (currentStepIndex === -1 && step.status === currentStatus);
          const isLast = index === steps.length - 1;

          return (
            <div
              key={step.status}
              className={cn("relative flex", compact ? "pb-4" : "pb-6", isLast && "pb-0")}
            >
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-4 top-8 w-0.5",
                    compact ? "h-8" : "h-12",
                    isCompleted ? "bg-brand-500" : "bg-border"
                  )}
                  style={{ transform: "translateX(-50%)" }}
                />
              )}

              {/* Step icon */}
              <div
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                  isCompleted
                    ? "border-brand-500 bg-brand-500 text-white"
                    : isCurrent
                      ? "border-brand-500 bg-background text-brand-500"
                      : "border-border bg-background text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              {/* Step content */}
              <div className={cn("ml-4 flex-1", compact ? "pt-0.5" : "pt-1")}>
                <p
                  className={cn(
                    "font-medium",
                    compact ? "text-sm" : "text-base",
                    isCompleted
                      ? "text-foreground"
                      : isCurrent
                        ? "text-brand-600"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                {step.timestamp && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(step.timestamp, { hour: "numeric", minute: "numeric" })}
                  </p>
                )}
                {!compact && isCurrent && !isCompleted && estimatedDelivery && (
                  <p className="mt-1 text-xs text-brand-600">
                    Est. {formatDate(estimatedDelivery)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default TrackingTimeline;
