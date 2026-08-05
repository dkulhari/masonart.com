/**
 * The wishlist page's contents.
 *
 * Deliberately not inside the route module: routes call `createFileRoute` at
 * module scope and cannot be rendered in a test without a router, and this is
 * where all the behaviour lives.
 *
 * The store holds ids and nothing else. For a guest those came from
 * localStorage, for a signed-in user from the account (#477) — so the page
 * hydrates them through the PUBLIC by-ids endpoint and one code path serves
 * both. Going through `/api/wishlist` instead would 401 every guest, which is
 * the whole point of saving without an account.
 */

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { productsApi } from '~/lib/api'
import {
  useWishlistHydration,
  useWishlistIds,
} from '~/stores/wishlist'
import { ProductGrid } from '~/components/product/ProductGrid'
import type { ProductCardData } from '~/components/product/ProductCard'

/** The by-ids endpoint caps a request at 50 and 400s past it. */
const BATCH_SIZE = 50

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

export function WishlistContents() {
  const ids = useWishlistIds()
  // The server cannot know a guest's list, so the first paint is the empty
  // one either way — same reason the header count waits (#498).
  const isHydrated = useWishlistHydration()

  /**
   * Product data by id, kept across renders so unsaving something does not
   * re-fetch everything that is left: the id simply stops being rendered.
   */
  const [known, setKnown] = useState<Record<string, ProductCardData>>({})
  const [isLoading, setIsLoading] = useState(false)

  const missing = ids.filter((id) => !known[id])
  // A dangling id never resolves, so this key stops changing once every id has
  // been asked for — which is what keeps the effect from looping on it.
  const missingKey = missing.join(',')

  useEffect(() => {
    if (!isHydrated || missing.length === 0) return

    let cancelled = false
    setIsLoading(true)

    void (async () => {
      try {
        const batches = await Promise.all(
          chunk(missing, BATCH_SIZE).map((batch) => productsApi.getByIds(batch))
        )
        if (cancelled) return

        const fetched = batches.flatMap(
          (batch: { items: ProductCardData[] }) => batch.items
        )
        setKnown((previous) => ({
          ...previous,
          ...Object.fromEntries(fetched.map((item) => [item.id, item])),
        }))
      } catch {
        // Nothing to say beyond the empty grid — the ids are still saved, and
        // the next visit tries again.
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, missingKey])

  /**
   * Rendered in the order they were saved, dropping ids the catalogue no
   * longer has: a product deleted after being saved leaves a dangling id, and
   * one fewer card beats a broken one.
   */
  const products = ids
    .map((id) => known[id])
    .filter((product): product is ProductCardData => Boolean(product))

  const isEmpty = isHydrated && ids.length === 0

  return (
    <ProductGrid
      products={products}
      isLoading={!isHydrated || (isLoading && products.length === 0)}
      skeletonCount={Math.min(Math.max(ids.length, 4), 8)}
      emptyState={
        isEmpty ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium text-foreground">
              Nothing saved yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Tap the heart on any poster to keep it here — no account needed.
            </p>
            <Link
              to="/posters"
              className="mt-6 inline-flex rounded-pill bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Browse posters
            </Link>
          </div>
        ) : undefined
      }
    />
  )
}

export default WishlistContents
