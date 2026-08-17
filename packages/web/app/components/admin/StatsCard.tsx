/**
 * StatsCard Component - chobii.art E-commerce Platform
 *
 * Reusable stats card for displaying key metrics in the admin dashboard.
 * Supports different variants, trends, and loading states.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { ArrowDown, ArrowUp, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface StatsCardProps {
  /** Title/label for the stat */
  title: string
  /** Main value to display */
  value: string | number
  /** Optional icon to display */
  icon?: LucideIcon
  /** Optional description or subtitle */
  description?: string
  /** Trend direction for comparison */
  trend?: 'up' | 'down' | 'neutral'
  /** Trend value (e.g., "+12%", "-5%") */
  trendValue?: string
  /** Trend comparison period (e.g., "vs last month") */
  trendLabel?: string
  /** Color variant for the card */
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  /** Loading state */
  isLoading?: boolean
  /** Additional className */
  className?: string
  /** Optional link destination */
  href?: string
  /**
   * Makes the tile a filter control. Rendered as a real `<button>` (#626) —
   * the AI moderation tiles passed this for months while the prop was
   * undeclared, so React dropped it and clicking them did nothing.
   */
  onClick?: () => void
  /** Compact mode for smaller displays */
  compact?: boolean
}

// ============================================================================
// Variant Styles
// ============================================================================

const variantStyles = {
  default: {
    icon: 'bg-muted text-foreground',
    iconBg: 'bg-muted/50',
    trend: {
      up: 'text-green-600',
      down: 'text-red-600',
      neutral: 'text-muted-foreground',
    },
  },
  success: {
    icon: 'bg-green-100 text-green-600',
    iconBg: 'bg-green-50',
    trend: {
      up: 'text-green-600',
      down: 'text-red-600',
      neutral: 'text-muted-foreground',
    },
  },
  warning: {
    icon: 'bg-amber-100 text-amber-600',
    iconBg: 'bg-amber-50',
    trend: {
      up: 'text-amber-600',
      down: 'text-green-600',
      neutral: 'text-muted-foreground',
    },
  },
  danger: {
    icon: 'bg-red-100 text-red-600',
    iconBg: 'bg-red-50',
    trend: {
      up: 'text-red-600',
      down: 'text-green-600',
      neutral: 'text-muted-foreground',
    },
  },
  info: {
    icon: 'bg-blue-100 text-blue-600',
    iconBg: 'bg-blue-50',
    trend: {
      up: 'text-green-600',
      down: 'text-red-600',
      neutral: 'text-muted-foreground',
    },
  },
  purple: {
    icon: 'bg-purple-100 text-purple-600',
    iconBg: 'bg-purple-50',
    trend: {
      up: 'text-green-600',
      down: 'text-red-600',
      neutral: 'text-muted-foreground',
    },
  },
}

// ============================================================================
// Component
// ============================================================================

/**
 * StatsCard - Display a key metric with optional icon, trend, and styling
 *
 * @example
 * <StatsCard
 *   title="Total Revenue"
 *   value="₹1,23,456"
 *   icon={IndianRupee}
 *   trend="up"
 *   trendValue="+12%"
 *   trendLabel="vs last month"
 *   variant="success"
 * />
 */
export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  trendValue,
  trendLabel,
  variant = 'default',
  isLoading = false,
  className,
  href,
  onClick,
  compact = false,
}: StatsCardProps) {
  const styles = variantStyles[variant]

  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
  const trendColor = trend ? styles.trend[trend] : styles.trend.neutral

  const content = (
    <div
      className={cn(
        'rounded-xl border border-border bg-card transition-all',
        (href || onClick) && 'cursor-pointer hover:border-brand-200 hover:shadow-sm',
        compact ? 'p-4' : 'p-5 sm:p-6',
        className
      )}
    >
      {/* Header with Icon and Title */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-muted-foreground',
              compact ? 'text-xs' : 'text-sm'
            )}
          >
            {title}
          </p>

          {/* Value */}
          {isLoading ? (
            <div
              className={cn(
                'mt-1 animate-pulse rounded bg-muted',
                compact ? 'h-6 w-20' : 'h-8 w-24'
              )}
            />
          ) : (
            <p
              className={cn(
                'mt-1 font-medium text-foreground',
                compact ? 'text-xl' : 'text-2xl sm:text-3xl'
              )}
            >
              {value}
            </p>
          )}

          {/* Description */}
          {description && !isLoading && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>

        {/* Icon */}
        {Icon && (
          <div
            className={cn(
              'flex-shrink-0 rounded-lg',
              styles.icon,
              compact ? 'p-2' : 'p-2.5 sm:p-3'
            )}
          >
            <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5 sm:h-6 sm:w-6'} />
          </div>
        )}
      </div>

      {/* Trend */}
      {trend && trendValue && !isLoading && (
        <div className={cn('flex items-center gap-1', compact ? 'mt-2' : 'mt-3')}>
          <div className={cn('flex items-center gap-0.5', trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{trendValue}</span>
          </div>
          {trendLabel && (
            <span className="text-xs text-muted-foreground">{trendLabel}</span>
          )}
        </div>
      )}

      {/* Loading Trend Skeleton */}
      {isLoading && trend && (
        <div className="mt-3 flex items-center gap-1">
          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      )}
    </div>
  )

  if (href) {
    return <a href={href}>{content}</a>
  }

  /*
   * A button, not a div with a handler: these tiles are the only way to filter
   * the queue they sit above, and a div is unreachable by keyboard and silent
   * to a screen reader.
   */
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    )
  }

  return content
}

// ============================================================================
// Stats Card Grid Component
// ============================================================================

export interface StatsCardGridProps {
  children: React.ReactNode
  /** Number of columns on different screen sizes */
  columns?: {
    default?: 1 | 2 | 3 | 4
    sm?: 2 | 3 | 4
    md?: 2 | 3 | 4 | 5 | 6
    lg?: 3 | 4 | 5 | 6
  }
  className?: string
}

/**
 * StatsCardGrid - A responsive grid layout for stats cards
 *
 * @example
 * <StatsCardGrid columns={{ default: 1, sm: 2, lg: 4 }}>
 *   <StatsCard ... />
 *   <StatsCard ... />
 * </StatsCardGrid>
 */
export function StatsCardGrid({
  children,
  columns = { default: 1, sm: 2, lg: 4 },
  className,
}: StatsCardGridProps) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
    6: 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        columns.default && `grid-cols-${columns.default}`,
        columns.sm && colClasses[columns.sm],
        columns.lg && colClasses[columns.lg],
        className
      )}
    >
      {children}
    </div>
  )
}

// ============================================================================
// Stats Card Skeleton
// ============================================================================

export function StatsCardSkeleton({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl border border-border bg-card',
        compact ? 'p-4' : 'p-5 sm:p-6',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className={cn('rounded bg-muted', compact ? 'h-6 w-20' : 'h-8 w-28')} />
        </div>
        <div
          className={cn(
            'rounded-lg bg-muted',
            compact ? 'h-8 w-8' : 'h-10 w-10 sm:h-12 sm:w-12'
          )}
        />
      </div>

      {/* Trend */}
      <div className="mt-3 flex items-center gap-1">
        <div className="h-4 w-12 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
    </div>
  )
}

export default StatsCard
