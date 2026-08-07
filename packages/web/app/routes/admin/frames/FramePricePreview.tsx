/**
 * What this frame would add, at three sizes of piece.
 *
 * The arithmetic is `frameAddition`'s and nothing here reproduces it. #566 was
 * a mispricing that lived unnoticed because the product page re-derived a
 * formula the server already owned, and it stayed invisible because every
 * seeded frame had a zero flat column — so the two answers agreed by accident.
 * This screen is the one that lets an admin make that column non-zero. A
 * preview with its own arithmetic would be the same bug in the worst possible
 * place: the screen whose entire job is to convince the admin the number is
 * right.
 *
 * Three reference prices rather than one because a frame is priced as a
 * proportion of the piece precisely so its cost tracks the size of it. One
 * sample row would show a number while hiding the behaviour being chosen.
 */

import {
  frameAddition,
  FRAME_PREVIEW_REFERENCE_PRICES,
  type FramePriceColumns,
} from '@chobii/shared'

export interface FramePreviewRow {
  basePrice: number
  addition: number
  total: number
}

export function framePreviewRows(
  pricing: FramePriceColumns
): FramePreviewRow[] {
  return FRAME_PREVIEW_REFERENCE_PRICES.map((basePrice) => {
    const addition = frameAddition(basePrice, pricing)
    return { basePrice, addition, total: basePrice + addition }
  })
}

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

/**
 * Is there a number here yet?
 *
 * A half-typed `1.` parses to 1 and an empty box parses to NaN. Rather than
 * quote either at an admin mid-keystroke, the preview waits — a wrong number
 * on this screen is worse than no number, because this is the screen they
 * trust.
 */
const isTyped = (value: string | number | null | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value)
  if (!value) return false
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
}

export function FramePricePreview({
  pricing,
}: {
  pricing: FramePriceColumns
}) {
  if (!isTyped(pricing.priceModifier) || !isTyped(pricing.priceAddition)) {
    return (
      <p className="text-xs text-muted-foreground">
        Enter both price fields to see what this frame costs a shopper.
      </p>
    )
  }

  const rows = framePreviewRows(pricing)

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium">
        What a shopper pays with this frame
      </p>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((row) => (
            <tr key={row.basePrice}>
              <td className="py-1 text-muted-foreground">
                on a {rupees(row.basePrice)} print
              </td>
              <td className="py-1 text-right">+{rupees(row.addition)}</td>
              <td className="py-1 text-right font-medium">
                {rupees(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        The same figures the product page quotes and the cart charges.
      </p>
    </div>
  )
}
