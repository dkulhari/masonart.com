/**
 * The filter rail as a mobile sheet.
 *
 * Lifted out of `routes/posters/index.tsx` when `/collections/$slug` arrived
 * (#470). Both pages carry the same rail, so both need the same sheet — and
 * the scroll lock below is the kind of detail that gets forgotten in a copy
 * (#348 is what happens when it is).
 */

import { useEffect } from 'react'
import { ProductFilters, type FilterState } from './ProductFilters'

export interface MobileFiltersSheetProps {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

export function MobileFiltersSheet({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
}: MobileFiltersSheetProps) {
  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm bg-background shadow-xl transition-transform lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        <ProductFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          isMobile
          onClose={onClose}
        />
      </div>
    </>
  )
}

export default MobileFiltersSheet
