/**
 * StarRating Component
 *
 * Displays a star rating with filled/empty stars, optional count display,
 * and accessibility support. Can be interactive for rating selection.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useCallback } from 'react'
import { Star } from 'lucide-react'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface StarRatingProps {
  /** Current rating value (0-5) */
  rating: number
  /** Maximum rating value */
  maxRating?: number
  /** Size variant for stars */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Show rating count next to stars */
  showCount?: boolean
  /** Rating count to display */
  count?: number
  /** Show numeric rating value */
  showValue?: boolean
  /** Enable interactive rating selection */
  interactive?: boolean
  /** Callback when rating changes (only used when interactive) */
  onRatingChange?: (rating: number) => void
  /** Custom className */
  className?: string
  /** Show half stars */
  showHalfStars?: boolean
  /**
   * Fill and stroke for the LIT stars.
   *
   * Amber everywhere by default. The override exists because the home reviews
   * band is a Loox port and Loox draws its stars in its own `stars-color`
   * (#ff8d00) — a different orange from the page's amber, and visibly so
   * against the blush quote card it sits on.
   */
  starClassName?: string
}

// ============================================================================
// Size Map
// ============================================================================

const SIZE_MAP = {
  xs: {
    star: 'h-3 w-3',
    gap: 'gap-0.5',
    text: 'text-xs',
  },
  sm: {
    star: 'h-4 w-4',
    gap: 'gap-0.5',
    text: 'text-sm',
  },
  md: {
    star: 'h-5 w-5',
    gap: 'gap-1',
    text: 'text-base',
  },
  lg: {
    star: 'h-6 w-6',
    gap: 'gap-1',
    text: 'text-lg',
  },
}

// ============================================================================
// Component
// ============================================================================

/**
 * StarRating - Displays a star rating with optional interactivity
 *
 * @example
 * // Display only
 * <StarRating rating={4.5} showCount count={128} />
 *
 * @example
 * // Interactive
 * <StarRating
 *   rating={selectedRating}
 *   interactive
 *   onRatingChange={setSelectedRating}
 * />
 */
export function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  showCount = false,
  count = 0,
  showValue = false,
  interactive = false,
  onRatingChange,
  className,
  showHalfStars = true,
  starClassName = 'fill-amber-400 text-amber-400',
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const sizeStyles = SIZE_MAP[size]

  // Current display rating (hover takes priority in interactive mode)
  const displayRating = interactive && hoverRating !== null ? hoverRating : rating

  // Handle mouse enter on star
  const handleMouseEnter = useCallback(
    (index: number) => {
      if (interactive) {
        setHoverRating(index + 1)
      }
    },
    [interactive]
  )

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (interactive) {
      setHoverRating(null)
    }
  }, [interactive])

  // Handle click on star
  const handleClick = useCallback(
    (index: number) => {
      if (interactive && onRatingChange) {
        onRatingChange(index + 1)
      }
    },
    [interactive, onRatingChange]
  )

  // Generate accessible label
  const ariaLabel = `Rating: ${rating.toFixed(1)} out of ${maxRating} stars${count > 0 ? `, ${count} reviews` : ''}`

  // Render individual star
  const renderStar = (index: number) => {
    const fillPercentage = Math.min(Math.max(displayRating - index, 0), 1)
    const isFilled = fillPercentage >= 1
    const isHalfFilled = showHalfStars && fillPercentage > 0 && fillPercentage < 1

    return (
      <span
        key={index}
        className={cn(
          'relative inline-block',
          interactive && 'cursor-pointer'
        )}
        onMouseEnter={() => handleMouseEnter(index)}
        onClick={() => handleClick(index)}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClick(index)
                }
              }
            : undefined
        }
        aria-label={interactive ? `Rate ${index + 1} stars` : undefined}
      >
        {/* Background star (empty) */}
        <Star
          className={cn(
            sizeStyles.star,
            'text-muted-foreground/30',
            interactive && 'transition-colors'
          )}
        />
        {/* Foreground star (filled) */}
        {(isFilled || isHalfFilled) && (
          <span
            className="absolute inset-0 overflow-hidden"
            style={isHalfFilled ? { width: `${fillPercentage * 100}%` } : undefined}
          >
            <Star
              className={cn(
                sizeStyles.star,
                starClassName,
                interactive && 'transition-colors'
              )}
            />
          </span>
        )}
      </span>
    )
  }

  return (
    <div
      className={cn('flex items-center', sizeStyles.gap, className)}
      role="img"
      aria-label={ariaLabel}
      onMouseLeave={handleMouseLeave}
    >
      {/* Stars */}
      <div className={cn('flex', sizeStyles.gap)}>
        {Array.from({ length: maxRating }, (_, index) => renderStar(index))}
      </div>

      {/* Rating value */}
      {showValue && (
        <span className={cn('font-medium text-foreground', sizeStyles.text)}>
          {rating.toFixed(1)}
        </span>
      )}

      {/* Review count */}
      {showCount && (
        <span className={cn('text-muted-foreground', sizeStyles.text)}>
          ({count.toLocaleString()})
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Skeleton
// ============================================================================

/**
 * StarRatingSkeleton - Loading skeleton for star rating
 */
export function StarRatingSkeleton({
  size = 'md',
  showCount = false,
  className,
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showCount?: boolean
  className?: string
}) {
  const sizeStyles = SIZE_MAP[size]

  return (
    <div className={cn('flex animate-pulse items-center', sizeStyles.gap, className)}>
      <div className={cn('flex', sizeStyles.gap)}>
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className={cn(sizeStyles.star, 'rounded bg-muted')}
          />
        ))}
      </div>
      {showCount && <div className="h-4 w-12 rounded bg-muted" />}
    </div>
  )
}

export default StarRating
