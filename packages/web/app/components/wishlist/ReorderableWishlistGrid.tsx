/**
 * The saved grid, rearrangeable.
 *
 * ## Why not just drag
 *
 * Drag is the affordance most people reach for and the one nobody using a
 * keyboard or a screen reader can use at all. So every card also carries
 * explicit move-earlier / move-later buttons, named after the product. That is
 * not a fallback — it is the primary path for anyone not holding a mouse, and
 * the same call the admin collections list made (#472).
 *
 * ## Why not a library
 *
 * `ProductForm.tsx` already reorders product images with plain HTML5
 * `draggable` + `onDragStart` / `onDragOver` / `onDrop`. Adding dnd-kit for the
 * second reorderable list in the codebase would leave two patterns where one
 * works.
 *
 * ## Order comes from the caller
 *
 * This renders `products` in the order given and never sorts. The caller maps
 * the store's `ids`, which is the ordering the shopper controls — the server's
 * response order is not it (see #500, where `inArray` was returning rows in
 * planner order and nobody had noticed).
 */

import { useState } from 'react'
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ProductCard, type ProductCardData } from '~/components/product/ProductCard'
import { GRID_CLASSES } from '~/components/product/ProductGrid'

export interface ReorderableWishlistGridProps {
  products: ProductCardData[]
  /** Move the card at `from` to `to`. Indices, because both callers know them. */
  onReorder: (from: number, to: number) => void
  className?: string
}

export function ReorderableWishlistGrid({
  products,
  onReorder,
  className,
}: ReorderableWishlistGridProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  /**
   * One card cannot be reordered, and two disabled buttons on it read as
   * broken rather than as "nothing to do".
   */
  const canReorder = products.length > 1

  const finishDrag = () => {
    setDraggingIndex(null)
    setDropIndex(null)
  }

  return (
    <ul className={cn(GRID_CLASSES, className)}>
      {products.map((product, index) => (
        <li
          key={product.id}
          data-testid="wishlist-item"
          data-dragging={draggingIndex === index}
          data-drop-target={dropIndex === index && draggingIndex !== index}
          draggable={canReorder}
          onDragStart={() => setDraggingIndex(index)}
          onDragOver={(event) => {
            // Without preventDefault the browser refuses the drop outright.
            event.preventDefault()
            setDropIndex(index)
          }}
          onDrop={() => {
            if (draggingIndex !== null && draggingIndex !== index) {
              onReorder(draggingIndex, index)
            }
            finishDrag()
          }}
          onDragEnd={finishDrag}
          className={cn(
            'relative transition-opacity',
            draggingIndex === index && 'opacity-40',
            // The drop target needs to be visible, or dragging across a long
            // grid is guesswork.
            dropIndex === index &&
              draggingIndex !== index &&
              'rounded-lg ring-2 ring-primary ring-offset-2'
          )}
        >
          <ProductCard product={product} />

          {canReorder && (
            <div className="mt-2 flex items-center justify-between gap-1">
              <span
                aria-hidden="true"
                className={cn(
                  'text-muted-foreground',
                  // Decorative: the buttons beside it are the real controls,
                  // and the whole card is the drag surface.
                  'cursor-grab active:cursor-grabbing'
                )}
              >
                <GripVertical className="h-4 w-4" />
              </span>

              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onReorder(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${product.title} earlier`}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onReorder(index, index + 1)}
                  disabled={index === products.length - 1}
                  aria-label={`Move ${product.title} later`}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default ReorderableWishlistGrid
