/**
 * /sale — the running promotion, as a page.
 *
 * A product list with a promotion filter, and nothing more inventive than
 * that: the same `ProductGrid` every other listing renders through, fed by
 * `GET /api/products?onSale=true`. Building a second grid here would have
 * meant a second set of column counts and gaps to keep in step with the first.
 *
 * ## The client never decides what is on sale
 *
 * Which products a promotion applies to is `scope minus exclusions`, and both
 * halves live in the promotion rows. The API answers the membership question
 * in SQL (`promotionScopeCondition`), inside the same `where` the count and
 * the page window run against, and hands back exactly the rows that qualify.
 * Nothing describing the scope crosses the wire — which is also why this page
 * cannot drift from the price its cards print.
 *
 * ## Nothing here knows what the sale is
 *
 * No depth, no headline, no duration. The heading is the promotion's own
 * `headline` column, so an admin ending a sale ends the copy with it. The
 * clock counts to the `deadline` the server already resolved and clamped for
 * this visitor (#432) and formats it through SaleStrip's `formatRemaining`, so
 * the band at the top of the window and the clock in the middle of it cannot
 * print different digits for the same second.
 *
 * ## No promotion is not a 404
 *
 * A sale ends. The link in the email that sold it does not. With nothing
 * running the API answers an empty list, and this page answers that with a
 * plain empty state and a way back into the catalogue. `notFound()` would tell
 * a shopper who followed a real link that the page never existed — the one
 * response this route must never give.
 */

import {
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'

import type { ActivePromotion } from '~/components/layout/SaleStrip'
import type { ProductCardData } from '~/components/product/ProductCard'
import { ProductGrid } from '~/components/product/ProductGrid'
import { ItemListJsonLd } from '~/components/seo/ProductJsonLd'
import { Button } from '~/components/ui/Button'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { SectionBand } from '~/components/ui/SectionBand'
import { useActivePromotion, useCountdown } from '~/hooks/useActivePromotion'
import { productsApi } from '~/lib/api'

/** Cards per page. `?page=N` renders N × this many. */
export const SALE_PAGE_SIZE = 24

/**
 * The heading before the lookup answers, and after it answers "nothing".
 *
 * One word, and a true one either way. Anything richer would be this file
 * describing a sale it has no row for.
 */
const FALLBACK_HEADING = 'Sale'

// ============================================================================
// Search
// ============================================================================

export interface SaleSearchParams {
  /**
   * Optional in the TYPE, always present in the VALUE.
   *
   * TanStack derives a link's required search from the validator's return
   * type: declared as `page: number`, every `<Link to="/sale">` in the header
   * would have to pass one, and the nav entry would read `/sale?page=1`. The
   * parser still fills it in, so nothing downstream sees `undefined` from a
   * real navigation.
   */
  page?: number
}

/**
 * Turn raw search into typed params.
 *
 * Exported for the tests, and getting it wrong is not a subtle failure:
 * `app/router.tsx` overrides TanStack's search serialisation, so `?page=2`
 * arrives as the STRING '2'. A schema that assumes a number throws inside
 * `validateSearch`, and a throw there error-boundaries the route to a blank
 * page rather than degrading to page one. Junk coerces down to 1 for the same
 * reason — a hand-edited or stale URL still has to land.
 */
export function parseSaleSearch(
  search: Record<string, unknown>
): SaleSearchParams {
  const raw = Number(search.page)
  return { page: Number.isInteger(raw) && raw > 0 ? raw : 1 }
}

// ============================================================================
// Data
// ============================================================================

export interface SalePageData {
  products: ProductCardData[]
  total: number
  page: number
  hasNextPage: boolean
}

const EMPTY: SalePageData = {
  products: [],
  total: 0,
  page: 1,
  hasNextPage: false,
}

async function fetchSaleProducts(page: number): Promise<SalePageData> {
  try {
    /**
     * `?page=N` means "everything up to page N", not "page N alone" — the
     * grid appends, so a shared or reloaded URL has to reproduce the
     * accumulated view. Same contract as /posters and /collections/$slug.
     */
    const response = await productsApi.list({
      page: 1,
      pageSize: SALE_PAGE_SIZE * page,
      onSale: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })

    const products: ProductCardData[] = (response.items || []).map(
      (item: Record<string, unknown>) => ({
        id: item.id as string,
        sku: item.sku as string | undefined,
        title: item.title as string,
        slug: item.slug as string,
        basePrice: item.basePrice as string,
        images: (item.images as ProductCardData['images']) || [],
        orientation:
          (item.orientation as ProductCardData['orientation']) || 'portrait',
        styles: item.styles as string[] | undefined,
        isFeatured: item.isFeatured as boolean | undefined,
        isAiGenerated: item.isAiGenerated as boolean | undefined,
        averageRating: (item.averageRating as number | null) ?? null,
        reviewCount: (item.reviewCount as number | undefined) ?? 0,
      })
    )

    const total = (response.total as number) || 0

    return {
      products,
      total,
      page,
      hasNextPage: page * SALE_PAGE_SIZE < total,
    }
  } catch {
    /**
     * An unreachable API reads the same as an absent sale: an empty page a
     * shopper can leave, not an error boundary. The distinction is not one a
     * visitor can act on.
     */
    return EMPTY
  }
}

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute('/sale')({
  validateSearch: parseSaleSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => fetchSaleProducts(deps.search.page ?? 1),
  shouldReload: () => true,
  head: () => ({
    meta: [
      { title: 'Sale | chobii.art' },
      {
        name: 'description',
        content:
          'Every piece in the current sale, at the price it is selling for.',
      },
      { property: 'og:title', content: 'Sale | chobii.art' },
      { property: 'og:type', content: 'website' },
      /**
       * Deliberately not indexed. The page's contents — and whether it has
       * any — turn over with the promotion, so a crawler's snapshot is a
       * claim about prices that has usually already expired.
       */
      { name: 'robots', content: 'noindex, follow' },
    ],
    links: [{ rel: 'canonical', href: 'https://chobii.art/sale' }],
  }),
  component: SalePage,
})

// ============================================================================
// Hero
// ============================================================================

export interface SaleHeroProps {
  /** `undefined` while the lookup is out; `null` once known to be absent. */
  promotion?: ActivePromotion | null
}

export function SaleHero({ promotion }: SaleHeroProps) {
  const remaining = useCountdown(promotion?.deadline)

  return (
    <SectionBand tone="beige" className="py-10 lg:py-14">
      <DisplayHeading as="h1" data-testid="sale-headline" className="text-4xl">
        {promotion?.headline ?? FALLBACK_HEADING}
      </DisplayHeading>

      {remaining && (
        /**
         * Not a live region. It changes every second, and a screen reader
         * interrupting itself once a second to read a clock nobody asked for
         * is worse than no clock at all.
         */
        <time
          dateTime={promotion?.deadline}
          aria-label={remaining.label}
          data-testid="sale-page-countdown"
          className="mt-4 block font-medium tabular-nums text-sale"
        >
          {remaining.display}
        </time>
      )}
    </SectionBand>
  )
}

// ============================================================================
// Empty state
// ============================================================================

/**
 * What an expired link lands on.
 *
 * A statement about the shop rather than about the URL, and a door out of it.
 * The heading level is 2: the page still has its H1 above.
 */
function SaleEmptyState() {
  return (
    <div
      data-testid="sale-empty"
      className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-12 text-center"
    >
      <h2 className="text-lg font-medium text-foreground">
        No sale running right now
      </h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Nothing is discounted at the moment. The next one will show up here —
        and in the band at the top of every page — the day it starts.
      </p>
      <Link
        to="/posters"
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/60"
      >
        Browse all posters
      </Link>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export interface SalePageViewProps {
  products: ProductCardData[]
  total: number
  hasNextPage?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  /**
   * The promotion, when the caller already holds it. Omit to let the page look
   * it up; pass `null` to say explicitly that none is running.
   */
  promotion?: ActivePromotion | null
}

export function SalePageView({
  products,
  total,
  hasNextPage = false,
  isLoadingMore = false,
  onLoadMore,
  promotion,
}: SalePageViewProps) {
  const { promotion: active } = useActivePromotion(promotion)

  // Paging. Same append-by-widening-the-URL contract as the other listings.
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMoreToLoad(hasNextPage, isLoadingMore) || !onLoadMore) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isLoadingMore, onLoadMore])

  return (
    <div className="flex flex-col" data-testid="sale-page">
      <SaleHero promotion={active} />

      <div className="container-wide py-6 lg:py-8">
        {products.length > 0 ? (
          <>
            <ItemListJsonLd
              items={products.map((product) => ({
                name: product.title,
                slug: product.slug,
              }))}
            />

            <p className="mb-6 text-sm text-muted-foreground">
              {total === 1 ? '1 piece on sale' : `${total} pieces on sale`}
            </p>

            <ProductGrid products={products} />

            {hasNextPage && (
              <div ref={sentinelRef} className="mt-10 flex justify-center">
                <Button
                  variant="outline"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        ) : (
          <SaleEmptyState />
        )}
      </div>
    </div>
  )
}

function hasMoreToLoad(hasNextPage: boolean, isLoadingMore: boolean): boolean {
  return hasNextPage && !isLoadingMore
}

function SalePage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const isLoadingMore = useRouterState({ select: (state) => state.isLoading })

  const page = search.page ?? 1

  const loadMore = useCallback(() => {
    if (isLoadingMore || !data.hasNextPage) return
    navigate({
      to: '/sale',
      search: { page: page + 1 },
      replace: true,
      // Appending a batch is not a navigation the reader made (#457).
      resetScroll: false,
    })
  }, [data.hasNextPage, isLoadingMore, navigate, page])

  return (
    <SalePageView
      products={data.products}
      total={data.total}
      hasNextPage={data.hasNextPage}
      isLoadingMore={isLoadingMore}
      onLoadMore={loadMore}
    />
  )
}

export default SalePage
