/**
 * NewInRail — the home page's "New In" band (#534).
 *
 * SUPERSEDES nothing. The home page has no new-arrivals band today; this one
 * is additive and sits after the promo tiles on the bar's running order.
 *
 * ## A real newest-products source, not the featured list again
 *
 * `GET /api/products` sorts by `createdAt` (its documented enum, and its
 * default), so "New In" is the catalogue's genuine newest active products.
 * Reusing `GET /api/products/featured` would have been a curated list wearing
 * a chronological label, and it returns no review aggregate either.
 *
 * ## Why these cards have no stars, and why that is correct
 *
 * The newest products in the catalogue have no approved reviews yet
 * (`averageRating: null`, `reviewCount: 0`), so `ProductRating` renders
 * nothing and each card shows the wishlist heart alone on that row. That is
 * exactly what the bar's own New In cards do — theirs carry the heart with no
 * star row either, for the same reason. The numbers are read, never invented.
 */

import { productsApi, type PaginatedResponse } from '~/lib/api'
import type { ProductCardData } from '~/components/product/ProductCard'
import { ProductRail, type RailViewAllSearch } from './ProductRail'

/** Same depth as the Best Seller rail — see BestSellersRail.tsx. */
export const NEW_IN_LIMIT = 12

/** The sort the View All pill carries into `/posters`. */
export const NEW_IN_SEARCH: RailViewAllSearch = {
  sortBy: 'createdAt',
  sortOrder: 'desc',
}

/**
 * The newest active products.
 *
 * A plain async function, called from the home route's existing
 * `createServerFn` loader. Never throws: a failed load is an absent band.
 */
export async function fetchNewInProducts(
  limit: number = NEW_IN_LIMIT
): Promise<ProductCardData[]> {
  try {
    const response = (await productsApi.list({
      page: 1,
      pageSize: limit,
      ...NEW_IN_SEARCH,
    })) as PaginatedResponse<ProductCardData> | null

    return response?.items ?? []
  } catch {
    return []
  }
}

export interface NewInRailProps {
  products: ProductCardData[]
}

export function NewInRail({ products }: NewInRailProps) {
  return (
    <ProductRail
      heading="New In"
      products={products}
      viewAllSearch={NEW_IN_SEARCH}
      testId="new-in-rail"
    />
  )
}

export default NewInRail
