/**
 * FrameSelector Component
 *
 * Allows users to select a frame option for their poster.
 * Displays frame previews, materials, and price modifiers.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Check, Info } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface FrameOptionData {
  /** Frame ID */
  id: string
  /** Frame type key */
  type: string
  /** Display name */
  name: string
  /** Description */
  description: string
  /** Material description */
  material?: string
  /** Preview image URL */
  imageUrl?: string
  /** Price modifier type */
  priceModifierType: 'percentage' | 'fixed'
  /** Price modifier value (percentage as decimal, fixed in smallest currency unit) */
  priceModifierValue: number
  /** Whether this frame is available */
  isAvailable: boolean
}

export interface FrameSelectorProps {
  /** Available frame options */
  frames: FrameOptionData[]
  /** Currently selected frame ID (null for no frame / poster only) */
  selectedFrameId: string | null
  /** Callback when a frame is selected */
  onFrameSelect: (frame: FrameOptionData | null) => void
  /** Base price to calculate frame price additions */
  basePrice: number
  /** Optional className for styling */
  className?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the price addition for a frame based on modifier type
 */
export function calculateFramePrice(
  basePrice: number,
  modifierType: 'percentage' | 'fixed',
  modifierValue: number
): number {
  if (modifierType === 'percentage') {
    return basePrice * (modifierValue / 100)
  }
  // Fixed price is stored in paise, convert to rupees
  return modifierValue / 100
}

/**
 * Format the price modifier for display
 */
function formatPriceModifier(
  basePrice: number,
  modifierType: 'percentage' | 'fixed',
  modifierValue: number
): string {
  if (modifierValue === 0) {
    return 'Included'
  }

  const addition = calculateFramePrice(basePrice, modifierType, modifierValue)
  return `+${formatPrice(addition)}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * FrameSelector - Displays available frame options with visual previews
 *
 * @example
 * <FrameSelector
 *   frames={frameOptions}
 *   selectedFrameId={selectedFrame?.id}
 *   onFrameSelect={(frame) => setSelectedFrame(frame)}
 *   basePrice={1999}
 * />
 */
export function FrameSelector({
  frames,
  selectedFrameId,
  onFrameSelect,
  basePrice,
  className,
}: FrameSelectorProps) {
  // Filter to only available frames
  const availableFrames = frames.filter((f) => f.isAvailable)

  if (availableFrames.length === 0) {
    return (
      <div className={cn('text-muted-foreground', className)}>
        No frame options available
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Select Frame</h3>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Frame information"
        >
          <Info className="h-3 w-3" />
          Frame guide
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {availableFrames.map((frame) => {
          const isSelected = frame.id === selectedFrameId
          const priceDisplay = formatPriceModifier(
            basePrice,
            frame.priceModifierType,
            frame.priceModifierValue
          )

          return (
            <FrameOptionCard
              key={frame.id}
              frame={frame}
              isSelected={isSelected}
              priceDisplay={priceDisplay}
              onClick={() => onFrameSelect(isSelected ? null : frame)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Frame Option Card
// ============================================================================

interface FrameOptionCardProps {
  frame: FrameOptionData
  isSelected: boolean
  priceDisplay: string
  onClick: () => void
}

function FrameOptionCard({
  frame,
  isSelected,
  priceDisplay,
  onClick,
}: FrameOptionCardProps) {
  // Get background color based on frame type for preview
  const previewBgColor = getFramePreviewColor(frame.type)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex gap-3 rounded-lg border p-3 text-left transition-all',
        isSelected
          ? 'border-primary bg-accent ring-1 ring-primary'
          : 'border-border bg-card hover:border-foreground/30 hover:bg-muted/50'
      )}
      aria-label={`Select ${frame.name}`}
      aria-pressed={isSelected}
    >
      {/* Frame Preview */}
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded',
          previewBgColor
        )}
        aria-hidden="true"
      >
        {frame.imageUrl ? (
          <img
            src={frame.imageUrl}
            alt=""
            className="h-full w-full rounded object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded border-2 border-current opacity-60" />
        )}
      </div>

      {/* Frame Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={cn(
              'block text-sm font-medium leading-tight',
              isSelected ? 'text-foreground' : 'text-foreground'
            )}>
              {frame.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
              {frame.description}
            </span>
          </div>

          {/* Selection Indicator */}
          {isSelected && (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3 w-3" />
            </div>
          )}
        </div>

        {/* Price & Material */}
        <div className="mt-1 flex items-center gap-2">
          <span className={cn(
            'text-xs font-semibold',
            isSelected ? 'text-foreground' : 'text-foreground'
          )}>
            {priceDisplay}
          </span>
          {frame.material && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground truncate">
                {frame.material}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Get preview background color based on frame type
 */
function getFramePreviewColor(frameType: string): string {
  const colorMap: Record<string, string> = {
    'poster-only': 'bg-muted',
    'stretched-canvas': 'bg-amber-100 dark:bg-amber-900/30',
    'black-frame': 'bg-zinc-900 text-zinc-100',
    'white-frame': 'bg-white border text-zinc-800',
    'natural-wood-frame': 'bg-amber-200 dark:bg-amber-800/50 text-amber-900',
    'dark-wood-frame': 'bg-amber-900 text-amber-100',
    'gold-frame': 'bg-yellow-500 text-yellow-950',
    'silver-frame': 'bg-zinc-300 text-zinc-700',
    'floating-frame': 'bg-zinc-800 text-zinc-200',
  }

  return colorMap[frameType] || 'bg-muted'
}

/**
 * Compact frame selector for smaller spaces
 */
export function FrameSelectorCompact({
  frames,
  selectedFrameId,
  onFrameSelect,
  className,
}: Omit<FrameSelectorProps, 'basePrice'>) {
  const availableFrames = frames.filter((f) => f.isAvailable)

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium text-foreground">Frame</label>
      <div className="flex flex-wrap gap-2">
        {availableFrames.map((frame) => {
          const isSelected = frame.id === selectedFrameId

          return (
            <button
              key={frame.id}
              type="button"
              onClick={() => onFrameSelect(isSelected ? null : frame)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-all',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:border-foreground/30'
              )}
            >
              {frame.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Frame selector skeleton for loading states
 */
export function FrameSelectorSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 animate-pulse', className)}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="h-12 w-12 shrink-0 rounded bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FrameSelector
