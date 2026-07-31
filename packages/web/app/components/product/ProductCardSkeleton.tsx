/**
 * ProductCardSkeleton
 *
 * Extracted from ProductCard so it can import MEDIA_RATIO. Previously it
 * hardcoded aspect-[2/3] while the home page rendered aspect-[3/4], which
 * guaranteed a layout shift as featured products resolved (ticket #360's first
 * acceptance criterion).
 *
 * Sharing the constant makes that class of bug structurally impossible rather
 * than merely fixed.
 */

import { cn } from '~/lib/utils'
import { MEDIA_RATIO } from './productCardTokens'

export function ProductCardSkeleton({ className }: { className?: string }) {
  return (
    <li
      data-testid="product-card-skeleton"
      className={cn('flex animate-pulse flex-col leading-none', className)}
    >
      {/* Reserves exactly the box the real media will occupy. */}
      <div
        className={cn(
          'w-full rounded-[var(--card-radius)] bg-muted',
          MEDIA_RATIO
        )}
      />

      <div className="mt-[11px] flex w-full grow flex-col gap-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-4 w-1/3 rounded bg-muted" />
      </div>
    </li>
  )
}

export default ProductCardSkeleton
