/**
 * FrameSelector Component
 *
 * Allows users to select a frame option for their poster.
 *
 * PARITY WITH THE PDP (#516): mesonart's frame axis is
 * "Rolled Canvas/Frameless/Framed" — a label line reading
 * `<group>:  <selected value>` — followed by circular photographic swatches,
 * ~92px, wrapping onto rows as needed. No price is printed on a swatch; the
 * price still has to reach the cart, so `calculateFramePrice` /
 * `formatPriceModifier` stay exported and unchanged, just not rendered here.
 *
 * This mirrors the swatch ChooseOptions.tsx already built for the Quickview
 * panel (#420) — same ring treatment, same "real photo, or draw one" rule —
 * because it is the same frame data and the same measured pattern, just on
 * the full product page instead of the grid's modal.
 */

import { Check } from 'lucide-react'
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
 * Format the price modifier for display.
 *
 * Not rendered on the swatch itself (the measured spec carries no price
 * there), but kept exported: it still backs the accessible name announced to
 * screen readers, and other call sites price the same modifier the same way.
 */
export function formatPriceModifier(
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

/**
 * Whether a frame image is worth putting on a swatch.
 *
 * Seed data has shipped placehold.co placards in the past ("Black+Frame" on
 * a grey square) — worse on a circular swatch than the drawn fallback. Real
 * photography under `/frames/*` always passes.
 */
function usableFrameImage(imageUrl?: string): string | null {
  if (!imageUrl) return null
  return /placehold\.co|placeholder/i.test(imageUrl) ? null : imageUrl
}

/**
 * Which rung of the format axis a frame type belongs to.
 *
 * `rolled` and `frameless` are formats, not mouldings (see
 * packages/api/.../schema/products.ts) — everything else is a moulding
 * around the stretched canvas, so it folds into "Framed".
 */
function frameCategoryLabel(type: string): string {
  if (type === 'rolled') return 'Rolled Canvas'
  if (type === 'frameless') return 'Frameless'
  return 'Framed'
}

/**
 * Collapses the flat frame list into mesonart's axis label —
 * "Rolled Canvas/Frameless/Framed" — in the order each category first
 * appears, deduplicated. Degrades gracefully for any other catalogue: a
 * frame list that is all mouldings just reads "Framed".
 */
function frameGroupLabel(frames: FrameOptionData[]): string {
  const categories: string[] = []
  for (const frame of frames) {
    const label = frameCategoryLabel(frame.type)
    if (!categories.includes(label)) {
      categories.push(label)
    }
  }
  return categories.join('/')
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

  const selectedFrame =
    availableFrames.find((f) => f.id === selectedFrameId) ?? null

  return (
    <div className={cn('space-y-3', className)}>
      {/* Their label/value pair: group name, colon, then the chosen option —
       * "Rolled Canvas/Frameless/Framed:  Rolled Canvas". The value sits
       * outside any <label>/<select> pairing here since the swatches below
       * are buttons, not a native control. */}
      <p
        data-testid="frame-selector-label"
        className="flex flex-wrap items-center gap-2 text-sm text-foreground"
      >
        <span>{frameGroupLabel(availableFrames)}:</span>
        <span data-testid="frame-selector-value" className="font-medium">
          {selectedFrame?.name ?? 'None'}
        </span>
      </p>

      {/* Circular photographic swatches, wrapping onto as many rows as the
       * option count needs — 92px, matching the measured spec. */}
      <div className="flex flex-wrap gap-4">
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
  const previewBgColor = getFramePreviewColor(frame.type)
  const photo = usableFrameImage(frame.imageUrl)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        'group/frame relative grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full',
        'bg-background transition-shadow',
        'ring-2 ring-offset-2 ring-offset-background',
        // Selected gets a solid dark ring, the rest a light grey one — but the
        // ring alone is not the whole selection story, see the check badge
        // below: colour is never the only cue.
        isSelected
          ? 'ring-foreground'
          : 'ring-border hover:ring-foreground/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      {/* The button's accessible name. Screen readers still hear the price
       * even though the swatch itself never prints one. */}
      <span className="sr-only">
        {frame.name} — {priceDisplay}
      </span>

      {photo ? (
        <img
          src={photo}
          alt=""
          aria-hidden="true"
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center rounded-full',
            previewBgColor
          )}
          aria-hidden="true"
        >
          <div className="h-9 w-9 rounded border-2 border-current opacity-60" />
        </div>
      )}

      {/* Non-colour selection cue — a ring colour alone fails for anyone who
       * can't distinguish "dark" from "light grey" by hue. */}
      {isSelected && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-background"
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  )
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Get preview background color based on frame type.
 *
 * Two taxonomies land here: the legacy `-frame` suffixed keys from
 * `packages/shared`'s FrameType, and the `frame_type` enum actually seeded
 * today (`rolled`, `frameless`, `black`, `white`, `wood`, `gold`, `silver` —
 * see packages/api/.../schema/products.ts). Both stay mapped so the fallback
 * swatch is never just grey for a real catalogue row.
 */
function getFramePreviewColor(frameType: string): string {
  const colorMap: Record<string, string> = {
    'poster-only': 'bg-muted',
    'stretched-canvas': 'bg-amber-100',
    'black-frame': 'bg-zinc-900 text-zinc-100',
    'white-frame': 'bg-white border text-zinc-800',
    'natural-wood-frame': 'bg-amber-200 text-amber-900',
    'dark-wood-frame': 'bg-amber-900 text-amber-100',
    'gold-frame': 'bg-yellow-500 text-yellow-950',
    'silver-frame': 'bg-zinc-300 text-zinc-700',
    'floating-frame': 'bg-zinc-800 text-zinc-200',
    rolled: 'bg-amber-50 text-amber-900',
    frameless: 'bg-background border text-foreground',
    black: 'bg-zinc-900 text-zinc-100',
    white: 'bg-white border text-zinc-800',
    wood: 'bg-amber-800 text-amber-100',
    gold: 'bg-yellow-500 text-yellow-950',
    silver: 'bg-zinc-300 text-zinc-700',
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
      <div className="h-4 w-48 rounded bg-muted" />
      <div className="flex flex-wrap gap-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="h-[92px] w-[92px] shrink-0 rounded-full bg-muted"
          />
        ))}
      </div>
    </div>
  )
}

export default FrameSelector
