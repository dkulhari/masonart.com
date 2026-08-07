/**
 * BestSellersRail — the home page's first product band (#530).
 *
 * SUPERSEDES `FeaturedProductsSection` in `app/routes/index.tsx` ("Featured
 * Collection"). That section is a static two-row four-up grid with a subtitle
 * and a `View all >` text link in its heading; this is the bar's single
 * scrolling rail with a centred View All pill. The old section is left in
 * place for the integration step to remove — see the ticket.
 *
 * ## The data source is the fix, not the card
 *
 * The complaint on #530 is "no ratings, no counts". That was never a card
 * defect: `product/ProductCard` has drawn the star row since the collection
 * parity work, and `/posters` shows it. The home page did not, because it read
 * `GET /api/products/featured`, whose projection (packages/api/src/routes/
 * products.ts) selects no review aggregate at all — no `averageRating`, no
 * `reviewCount`. Every home card therefore arrived unrated and `ProductRating`
 * correctly rendered nothing rather than inventing a score.
 *
 * `GET /api/products` DOES join the aggregate (`avg(reviews.rating)` over
 * approved reviews only, `count(reviews.id)`), so this rail reads the list
 * endpoint instead and the stars are real. Verified against the dev catalogue:
 * 41 active products, ratings 4.0–5.0 over 1–2 approved reviews each.
 *
 * ## "Best seller" is a real ordering, not a synonym for "featured"
 *
 * `sortBy=salesCount` is units actually sold, computed from settled orders in
 * SQL, with the curator's `isPopular` / `popularOrder` pin above it. It is not
 * the featured flag and not a hand-written list, which is what makes the
 * heading a claim we can stand behind.
 */

import { productsApi, type PaginatedResponse } from '~/lib/api'
import type { ProductCardData } from '~/components/product/ProductCard'
import { ProductRail, type RailViewAllSearch } from './ProductRail'

/**
 * Cards fetched for the rail.
 *
 * Four are visible at 1440 and roughly one and a bit at 390, so twelve is two
 * to three screens of scrolling — enough that the arrows and the peek both
 * have somewhere to go, short of a page's worth of images nobody scrolls to.
 */
export const BEST_SELLERS_LIMIT = 12

/** The sort the View All pill carries into `/posters`, so the grid opens on the same order. */
export const BEST_SELLERS_SEARCH: RailViewAllSearch = {
  sortBy: 'salesCount',
  sortOrder: 'desc',
}

/**
 * Best sellers for the home rail.
 *
 * A plain async function rather than a server function: the home route already
 * wraps its loads in one `createServerFn`, and this is meant to be called from
 * inside it alongside the existing `Promise.allSettled` pair.
 *
 * Never throws. A rail that failed to load is an absent band (ProductRail
 * renders nothing on an empty list), which is what the rest of the home
 * loader already does with its own failures.
 */
export async function fetchBestSellerProducts(
  limit: number = BEST_SELLERS_LIMIT
): Promise<ProductCardData[]> {
  try {
    const response = (await productsApi.list({
      page: 1,
      pageSize: limit,
      ...BEST_SELLERS_SEARCH,
    })) as PaginatedResponse<ProductCardData> | null

    return response?.items ?? []
  } catch {
    return []
  }
}

export interface BestSellersRailProps {
  products: ProductCardData[]
}

export function BestSellersRail({ products }: BestSellersRailProps) {
  return (
    <ProductRail
      // Singular, as the band itself reads on mesonart — "Best Sellers" is
      // the nav label, "Best Seller" is the heading over the rail.
      heading="Best Seller"
      products={products}
      viewAllSearch={BEST_SELLERS_SEARCH}
      // The first band under the hero, so its first card holds the LCP
      // candidate. New In, four bands further down, does not and stays lazy.
      priority
      testId="best-sellers-rail"
    />
  )
}

export default BestSellersRail
