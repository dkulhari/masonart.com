/**
 * FrameSelector Component
 *
 * Allows users to select a frame option for their poster.
 *
 * PARITY WITH THE PDP (#516): mesonart's frame axis is
 * "Rolled Canvas/Frameless/Framed" — a label line reading
 * `<group>:  <selected value>` — followed by circular photographic swatches
 * showing the material itself, rather than a stack of text cards.
 *
 * ONE DELIBERATE DIVERGENCE: the reference prints nothing on its swatches, so
 * seven unlabelled circles ask the shopper to guess both the name and the
 * cost of every option. That is a defect we are copying, not a spec worth
 * matching, so each swatch here carries its own name and its own price
 * uplift, and a caption names what that uplift is measured against. Everything
 * else — the label line, the circles, the ring treatment — is the reference.
 *
 * The uplift is genuinely an uplift, never a total: `+₹999.60` next to a
 * caption reading "…added to the ₹2,499.00 size price" cannot be misread as
 * the price of the frame outright.
 *
 * A four-column grid rather than a wrapping row: seven swatches free-flowing
 * at 92px wrap five-then-two and leave a hole three cells wide, and adding two
 * lines of type under each one makes the mismatch worse. Four fixed columns
 * put the names in aligned stacks, leave a single empty cell, and hold at
 * 390px where each cell is still ~83px.
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
 * This is the string printed under the swatch, and — since the swatch prints
 * it rather than hiding it in an sr-only node — it is also what a screen
 * reader announces. One string, one source, no drift between the two.
 *
 * A zero modifier reads "Included" rather than "+₹0.00" or a blank: the
 * cheapest option is not free of a price, it is already inside the price the
 * panel is quoting, and every cell keeping a price line means the row of
 * prices stays a row instead of a gap-toothed one.
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
    <div className={cn('space-y-2', className)}>
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

      {/* What the "+" on each swatch is measured against. Without this a
       * shopper reading "+₹999.60" has no way to tell an uplift from a price,
       * and a shopper who has already chosen has nothing tying the ringed
       * swatch to a number. Naming the base figure does both. */}
      <p
        data-testid="frame-price-basis"
        className="text-xs text-muted-foreground"
      >
        {framePriceBasis(selectedFrame, basePrice)}
      </p>

      {/* Circular photographic swatches on a fixed four-column grid, each with
       * its name and its uplift underneath. */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-5 pt-1">
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

/**
 * The sentence under the label line, which exists to make the swatch prices
 * unambiguous.
 *
 * `basePrice` is the selected size's price (ProductDetail passes the chosen
 * variant's), so that is what the uplift is relative to and that is what gets
 * named — spelled out in rupees rather than left as "the base price", because
 * a figure can be checked against the one on the button and a phrase cannot.
 */
function framePriceBasis(
  selectedFrame: FrameOptionData | null,
  basePrice: number
): string {
  const base = formatPrice(basePrice)

  if (!selectedFrame) {
    return `Frame prices below are added to the ${base} size price.`
  }

  const addition = calculateFramePrice(
    basePrice,
    selectedFrame.priceModifierType,
    selectedFrame.priceModifierValue
  )

  if (addition === 0) {
    return `${selectedFrame.name} is included in the ${base} size price.`
  }

  return `${selectedFrame.name} adds ${formatPrice(addition)} to the ${base} size price.`
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
        'group/frame flex w-full flex-col items-center rounded-lg text-center',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      {/* The circle. It takes the cell's width up to 104px, so it stays a
       * photographic swatch on a 485px panel and simply shrinks — never
       * overflows — when the panel is 390px wide. */}
      <span
        className={cn(
          'relative grid aspect-square w-full max-w-[104px] place-items-center rounded-full',
          'bg-background transition-shadow',
          'ring-2 ring-offset-2 ring-offset-background',
          // Selected gets a solid dark ring, the rest a light grey one — but
          // the ring alone is not the whole selection story, see the check
          // badge below: colour is never the only cue.
          isSelected
            ? 'ring-foreground'
            : 'ring-border group-hover/frame:ring-foreground/40'
        )}
      >
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
      </span>

      {/* Name and uplift are the button's visible label AND its accessible
       * name — the same two strings a screen reader hears, which is the whole
       * point of deleting the sr-only node that used to carry them alone.
       * `min-h` reserves the second line so the price sits on one baseline
       * across the row whether the name wrapped or not. */}
      <span
        className={cn(
          // A flat 32px rather than a 2-line em height: two lines of 12px/1.2
          // is 28.8px, and the sub-pixel rounding of that against a one-line
          // name dropped the price of every wrapped cell ~3px below its
          // neighbours' — visible as a wobbling row of prices.
          'mt-2 min-h-8 break-words text-[11px] leading-[1.2] text-foreground sm:text-xs',
          isSelected && 'font-medium'
        )}
      >
        {frame.name}
      </span>
      <span
        className={cn(
          'mt-1 text-[11px] leading-none sm:text-xs',
          isSelected ? 'font-medium text-foreground' : 'text-muted-foreground'
        )}
      >
        {priceDisplay}
      </span>
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
    <div className={cn('space-y-2 animate-pulse', className)}>
      <div className="h-4 w-48 rounded bg-muted" />
      <div className="h-3 w-64 max-w-full rounded bg-muted" />
      <div className="grid grid-cols-4 gap-x-2 gap-y-5 pt-1">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="aspect-square w-full max-w-[104px] rounded-full bg-muted" />
            <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
            <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default FrameSelector
