/**
 * ProductGrid
 *
 * One canonical grid. Column counts and gaps are measured from mesonart.com:
 *   1536/1440/1280 -> 4 columns · 1024/768 -> 3 · 640/375 -> 2
 *   gap: 20px row / 13.5px column
 *
 * This is where rows actually get aligned. `display: grid` with the default
 * `align-items: stretch` sizes each row to its tallest card and stretches the
 * others to match — so cards whose titles wrap to different line counts still
 * produce a flush row. Card heights differ BETWEEN rows, which is expected and
 * matches the reference implementation.
 *
 * The previous columns/gap/cardSize/uniformAspectRatio props are gone: a single
 * canonical grid means per-call-site configuration was dead weight, and the two
 * call-sites disagreeing about ratio was defect D1.
 *
 * Mesonart's `grid-flow-row-dense` is deliberately NOT carried over — it exists
 * only to back-fill holes left by their multi-cell promo app blocks, which we do
 * not have. Omitting it keeps DOM order equal to visual order, which matters for
 * keyboard and screen-reader traversal.
 */

import { Palette } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ProductCard, type ProductCardData } from './ProductCard'
import { ProductCardSkeleton } from './ProductCardSkeleton'

export interface ProductGridProps {
  products: ProductCardData[]
  isLoading?: boolean
  skeletonCount?: number
  emptyState?: React.ReactNode
  className?: string
}

/** Measured from mesonart: 2 / md:3 / xl:4, gap 20px row and 13.5px column. */
const GRID_CLASSES =
  'grid list-none grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-[13.5px] gap-y-5'

export function ProductGrid({
  products,
  isLoading = false,
  skeletonCount = 8,
  emptyState,
  className,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <ul className={cn(GRID_CLASSES, className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ProductCardSkeleton key={`skeleton-${i}`} />
        ))}
      </ul>
    )
  }

  if (products.length === 0) {
    return emptyState || <ProductGridEmptyState />
  }

  return (
    <ul className={cn(GRID_CLASSES, className)}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </ul>
  )
}

export function ProductGridEmptyState({
  title = 'No products found',
  description = "Try adjusting your filters or search criteria to find what you're looking for.",
  showCreateLink = false,
}: {
  title?: string
  description?: string
  showCreateLink?: boolean
}) {
  return (
    <div className="col-span-full rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-12 text-center">
      <Palette className="mx-auto h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-muted-foreground">{description}</p>
      {showCreateLink && (
        <a
          href="/create"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Create your own with AI instead
        </a>
      )}
    </div>
  )
}

export default ProductGrid
