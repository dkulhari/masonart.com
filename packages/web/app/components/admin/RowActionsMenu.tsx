import { useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

/**
 * One row in the dropdown. Exported because the items live with their table —
 * only the shell around them is shared — and they would otherwise each repeat
 * this string.
 */
export const ROW_ACTION_ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted'

/** The hairline between groups of items. */
export const ROW_ACTION_SEPARATOR = 'my-1 border-t border-border'

interface RowActionsMenuProps {
  /**
   * Accessible name for the icon-only trigger, e.g. "Order actions for
   * ORD-0042". Optional only because ProductsTable has never had one; new
   * callers should pass it (#625).
   */
  label?: string
  /**
   * The menu items. Called with `close` so an item can dismiss the menu after
   * running its handler — the shell owns the open state, the items decide
   * whether choosing them should end it. A link out of the app, for instance,
   * deliberately leaves the menu alone.
   */
  children: (close: () => void) => ReactNode
}

/**
 * The overflow menu at the end of an admin table row: an icon trigger, a
 * full-screen transparent backdrop that closes on any outside click, and the
 * panel itself.
 *
 * The backdrop sits at z-10 and the panel at z-20, so a click lands on the
 * backdrop everywhere except on the menu.
 */
export function RowActionsMenu({ label, children }: RowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const close = () => setIsOpen(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={label}
        aria-haspopup={label ? 'menu' : undefined}
        aria-expanded={label ? isOpen : undefined}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={close} />

          {/* Menu */}
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-lg">
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}
