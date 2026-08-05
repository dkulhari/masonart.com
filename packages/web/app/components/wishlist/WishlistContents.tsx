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
import { ReorderableWishlistGrid } from './ReorderableWishlistGrid'
import {
  useWishlistHydration,
  useWishlistIds,
  useWishlistStore,
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
  const dropMissing = useWishlistStore((state) => state.dropMissing)
  const reorder = useWishlistStore((state) => state.reorder)
  // The server cannot know a guest's list, so the first paint is the empty
  // one either way — same reason the header count waits (#498).
  const isHydrated = useWishlistHydration()

  /**
   * Product data by id, kept across renders so unsaving something does not
   * re-fetch everything that is left: the id simply stops being rendered.
   */
  const [known, setKnown] = useState<Record<string, ProductCardData>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  /**
   * Ids asked for and answered with nothing. Tracked separately from `known`
   * so a dangling id is not asked for again on every render, and so the page
   * can tell "you saved things that are gone" from "you saved nothing".
   */
  const [gone, setGone] = useState<string[]>([])
  /** Bumped by Try again, to re-run the effect after a failure. */
  const [attempt, setAttempt] = useState(0)

  const missing = ids.filter((id) => !known[id] && !gone.includes(id))
  // A dangling id never resolves, so this key stops changing once every id has
  // been asked for — which is what keeps the effect from looping on it.
  const missingKey = missing.join(',')

  useEffect(() => {
    if (!isHydrated || missing.length === 0) return

    let cancelled = false
    const asked = missing
    setIsLoading(true)
    setHasFailed(false)

    void (async () => {
      try {
        const batches = await Promise.all(
          chunk(asked, BATCH_SIZE).map((batch) => productsApi.getByIds(batch))
        )
        if (cancelled) return

        const fetched = batches.flatMap(
          (batch: { items: ProductCardData[] }) => batch.items
        )
        setKnown((previous) => ({
          ...previous,
          ...Object.fromEntries(fetched.map((item) => [item.id, item])),
        }))

        /**
         * Asked for and not returned: the product is gone from the catalogue.
         * Remembering which ids those were is what stops the effect asking
         * again, and dropping them from a guest list is what stops the header
         * badge counting saves this page can never show (#494).
         */
        const returned = new Set(fetched.map((item) => item.id))
        const dead = asked.filter((id) => !returned.has(id))
        if (dead.length > 0) {
          setGone((previous) => [...previous, ...dead])
          dropMissing(dead)
        }
      } catch {
        // A failed lookup is NOT proof the saves are dead — say so and offer
        // a retry rather than silently rendering an empty grid.
        if (!cancelled) setHasFailed(true)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, missingKey, attempt])

  /**
   * Rendered in the order they were saved, dropping ids the catalogue no
   * longer has: a product deleted after being saved leaves a dangling id, and
   * one fewer card beats a broken one.
   */
  const products = ids
    .map((id) => known[id])
    .filter((product): product is ProductCardData => Boolean(product))

  /**
   * Reordering is over the STORE's indices, not the rendered ones.
   *
   * They diverge whenever a saved product has left the catalogue: `products`
   * drops it, `ids` keeps it. Reordering by rendered position would then move
   * the wrong entry, and the further down the list the worse it gets.
   */
  const handleReorder = (from: number, to: number) => {
    const movedId = products[from]?.id
    const targetId = products[to]?.id
    if (!movedId || !targetId) return

    reorder(ids.indexOf(movedId), ids.indexOf(targetId))
  }

  if (products.length > 0) {
    return (
      <ReorderableWishlistGrid products={products} onReorder={handleReorder} />
    )
  }

  return (
    <ProductGrid
      products={products}
      isLoading={!isHydrated || (isLoading && products.length === 0)}
      skeletonCount={Math.min(Math.max(ids.length, 4), 8)}
      /**
       * ALWAYS supplied, whatever the reason for the emptiness. Left undefined,
       * ProductGrid falls back to its collection copy — "No products found. Try
       * adjusting your filters" — on a page that has no filters, which is what
       * the reported blank page actually showed (#494).
       */
      emptyState={
        <EmptyState
          hasFailed={hasFailed}
          goneCount={gone.length}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      }
    />
  )
}

/**
 * The three ways this page can have nothing to show. They are not the same
 * thing and must not read as the same thing: one is normal, one is a dead
 * saved item, one is a failed request the visitor can retry.
 */
function EmptyState({
  hasFailed,
  goneCount,
  onRetry,
}: {
  hasFailed: boolean
  goneCount: number
  onRetry: () => void
}) {
  if (hasFailed) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-medium text-foreground">
          Could not load your saved items
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          They are still saved — this was a problem reaching us.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex rounded-pill bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="py-16 text-center">
      <p className="text-lg font-medium text-foreground">
        {goneCount > 0
          ? goneCount === 1
            ? 'That poster is no longer available'
            : 'Those posters are no longer available'
          : 'Nothing saved yet'}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {goneCount > 0
          ? goneCount === 1
            ? 'It has left the catalogue since you saved it.'
            : 'They have left the catalogue since you saved them.'
          : 'Tap the heart on any poster to keep it here — no account needed.'}
      </p>
      <Link
        to="/posters"
        className="mt-6 inline-flex rounded-pill bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Browse posters
      </Link>
    </div>
  )
}

export default WishlistContents
