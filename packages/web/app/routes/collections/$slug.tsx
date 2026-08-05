/**
 * A curated collection, as a page.
 *
 * The same shell `/posters` runs — beige header band, Discover rail, sticky
 * toolbar, facet rail, grid, lazy paging — fed by GET /api/collections/:slug
 * instead of the product list.
 *
 * ## What differs from /posters
 *
 * - Heading, copy and SEO come from the collection row, not from constants.
 * - Facet counts are scoped to the collection, so the sidebar cannot offer a
 *   filter that returns nothing here.
 * - The rail marks this collection current.
 * - An unknown or inactive slug is a 404, not an empty grid. Rendering an
 *   empty grid would tell a shopper the collection exists and is bare.
 *
 * ## Filters intersect, they do not replace
 *
 * The API merges the collection's rule with whatever the shopper ticks, and
 * the intersection is what runs. A shopper on Pop Art who ticks Ukiyo-e gets
 * an empty grid — which is true — rather than ukiyo-e work under the Pop Art
 * heading. All of that lives in the resolver (#463); this page just passes the
 * facets along.
 */

import { createFileRoute, notFound, useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  collectionsApi,
  type CollectionSummary,
  type ProductFilters as ProductFiltersType,
} from '~/lib/api'
import { countActiveFilters, type ActiveFilterKey } from '~/lib/activeFilters'
import { cn } from '~/lib/utils'
import {
  ProductGrid,
  ProductGridEmptyState,
} from '~/components/product/ProductGrid'
import {
  ProductFilters,
  MobileFilterButton,
  type FilterState,
} from '~/components/product/ProductFilters'
import {
  DiscoverChips,
  type DiscoverCollection,
} from '~/components/product/DiscoverChips'
import { ActiveFilterTags } from '~/components/product/ActiveFilterTags'
import { MobileFiltersSheet } from '~/components/product/MobileFiltersSheet'
import { PromoTile } from '~/components/product/PromoTile'
import type { ProductCardData } from '~/components/product/ProductCard'
import { ItemListJsonLd } from '~/components/seo/ProductJsonLd'
import { Button } from '~/components/ui/Button'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import {
  CollectionToolbar,
  FILTER_SIDEBAR_ID,
} from '~/components/product/CollectionToolbar'
import { productsApi } from '~/lib/api'

const PAGE_SIZE = 24
const PROMO_CELL_INDEX = 8
const FILTERS_HIDDEN_KEY = 'chobii:filters-hidden'

// ============================================================================
// Search
// ============================================================================

export interface CollectionSearchParams {
  page?: number
  styles?: string[]
  subjects?: string[]
  colors?: string[]
  rooms?: string[]
  vibe?: string[]
  aesthetic?: string[]
  medium?: string[]
  uniqueness?: string
  availability?: string
  orientation?: string
  priceMin?: number
  priceMax?: number
  isAiGenerated?: boolean
  isFeatured?: boolean
  sortBy?: string
  sortOrder?: string
}

const FACET_ARRAYS = [
  'styles',
  'subjects',
  'colors',
  'rooms',
  'vibe',
  'aesthetic',
  'medium',
] as const

/**
 * Turn raw search into typed params.
 *
 * Exported so it can be tested without a router, and because getting it wrong
 * is not a subtle failure: `router.tsx` overrides TanStack's search
 * serialisation, so everything arrives as a string and arrays arrive
 * comma-joined. A schema that assumes typed values throws inside
 * `validateSearch`, and a throw there error-boundaries the whole route to a
 * blank page rather than degrading to an unfiltered grid.
 */
export function parseCollectionSearch(
  search: Record<string, unknown>
): CollectionSearchParams {
  const parsed: CollectionSearchParams = {}

  const num = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }

  const bool = (value: unknown): boolean | undefined =>
    value === true || value === 'true' ? true : undefined

  const list = (value: unknown): string[] | undefined => {
    if (Array.isArray(value)) {
      const cleaned = value.map(String).filter(Boolean)
      return cleaned.length > 0 ? cleaned : undefined
    }
    if (typeof value !== 'string' || value === '') return undefined
    const cleaned = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    return cleaned.length > 0 ? cleaned : undefined
  }

  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined

  parsed.page = num(search.page)
  for (const key of FACET_ARRAYS) {
    const values = list(search[key])
    if (values) parsed[key] = values
  }
  parsed.uniqueness = str(search.uniqueness)
  parsed.availability = str(search.availability)
  parsed.orientation = str(search.orientation)
  parsed.priceMin = num(search.priceMin)
  parsed.priceMax = num(search.priceMax)
  parsed.isAiGenerated = bool(search.isAiGenerated)
  parsed.isFeatured = bool(search.isFeatured)
  parsed.sortBy = str(search.sortBy)
  parsed.sortOrder = str(search.sortOrder)

  return parsed
}

/** Search params → the query the API takes (arrays comma-joined again). */
function toApiParams(
  search: CollectionSearchParams,
  page: number
): ProductFiltersType {
  const params: ProductFiltersType = {
    page: 1,
    // `?page=N` means "everything up to N": the grid appends, so a shared or
    // reloaded URL has to reproduce the accumulated view. Same contract as
    // /posters.
    pageSize: PAGE_SIZE * page,
  }

  for (const key of FACET_ARRAYS) {
    const values = search[key]
    if (values?.length) {
      ;(params as Record<string, unknown>)[key] = values.join(',')
    }
  }
  if (search.uniqueness) params.uniqueness = search.uniqueness
  if (search.availability) params.availability = search.availability
  if (search.orientation) {
    params.orientation = search.orientation as ProductFiltersType['orientation']
  }
  if (search.priceMin !== undefined) params.priceMin = search.priceMin
  if (search.priceMax !== undefined) params.priceMax = search.priceMax
  if (search.isAiGenerated !== undefined) params.isAiGenerated = search.isAiGenerated
  if (search.isFeatured !== undefined) params.isFeatured = search.isFeatured
  if (search.sortBy) params.sortBy = search.sortBy as ProductFiltersType['sortBy']
  if (search.sortOrder) {
    params.sortOrder = search.sortOrder as ProductFiltersType['sortOrder']
  }

  return params
}

/** Search params → the shape ProductFilters and the chips read. */
function toFilterState(search: CollectionSearchParams): FilterState {
  return {
    styles: search.styles ?? [],
    subjects: search.subjects ?? [],
    colors: search.colors ?? [],
    rooms: search.rooms ?? [],
    vibe: search.vibe ?? [],
    aesthetic: search.aesthetic ?? [],
    medium: search.medium ?? [],
    uniqueness: search.uniqueness,
    availability: search.availability,
    orientation: search.orientation as FilterState['orientation'],
    priceMin: search.priceMin,
    priceMax: search.priceMax,
    isAiGenerated: search.isAiGenerated,
    isFeatured: search.isFeatured,
    sortBy: (search.sortBy ?? 'createdAt') as FilterState['sortBy'],
    sortOrder: (search.sortOrder ?? 'desc') as FilterState['sortOrder'],
  }
}

/** FilterState → search, dropping defaults so the URL stays readable. */
function toSearch(filters: FilterState): Record<string, unknown> {
  const search: Record<string, unknown> = { page: 1 }

  for (const key of FACET_ARRAYS) {
    const values = filters[key]
    if (values?.length) search[key] = values.join(',')
  }
  if (filters.uniqueness) search.uniqueness = filters.uniqueness
  if (filters.availability) search.availability = filters.availability
  if (filters.orientation) search.orientation = filters.orientation
  if (filters.priceMin !== undefined) search.priceMin = filters.priceMin
  if (filters.priceMax !== undefined) search.priceMax = filters.priceMax
  if (filters.isAiGenerated !== undefined) search.isAiGenerated = filters.isAiGenerated
  if (filters.isFeatured !== undefined) search.isFeatured = filters.isFeatured
  if (filters.sortBy && filters.sortBy !== 'createdAt') search.sortBy = filters.sortBy
  if (filters.sortOrder && filters.sortOrder !== 'desc') {
    search.sortOrder = filters.sortOrder
  }

  return search
}

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute('/collections/$slug')({
  validateSearch: parseCollectionSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    try {
      return await collectionsApi.detail(
        params.slug,
        toApiParams(deps.search, deps.search.page || 1)
      )
    } catch (error) {
      /**
       * 404 is a real answer — an unknown or an inactive slug. Rendering an
       * empty grid instead would tell a shopper the collection exists and
       * happens to be empty, which is a different and false statement.
       */
      if ((error as { status?: number }).status === 404) throw notFound()
      throw error
    }
  },
  shouldReload: () => true,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: 'Collection | chobii.art' }] }
    }

    const { collection, total } = loaderData
    const title = `${collection.seoTitle ?? collection.title} | chobii.art`
    const description =
      collection.seoDescription ??
      collection.description ??
      `Browse ${total} pieces in ${collection.title}.`

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
      ],
      links: [
        {
          rel: 'canonical',
          href: `https://chobii.art/collections/${collection.slug}`,
        },
      ],
    }
  },
  component: CollectionPage,
  notFoundComponent: () => (
    <div className="container-wide py-24 text-center">
      <DisplayHeading as="h1" className="mb-4">
        Collection not found
      </DisplayHeading>
      <p className="text-muted-foreground">
        That collection has moved or is no longer published.
      </p>
    </div>
  ),
})

function CollectionPage() {
  const loaderData = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { slug } = Route.useParams()

  const collection: CollectionSummary = loaderData.collection
  const products = (loaderData.items ?? []) as unknown as ProductCardData[]
  const filters = toFilterState(search)
  const page = search.page || 1

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)
  const [filtersHidden, setFiltersHidden] = useState(false)
  const [collections, setCollections] = useState<DiscoverCollection[]>([])
  const [reviewStats, setReviewStats] = useState<{
    averageRating: number | null
    reviewCount: number
  }>({ averageRating: null, reviewCount: 0 })

  useEffect(() => {
    setFiltersHidden(window.localStorage.getItem(FILTERS_HIDDEN_KEY) === 'true')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(FILTERS_HIDDEN_KEY, String(filtersHidden))
  }, [filtersHidden])

  /**
   * The rail and the review aggregate describe the catalogue, not this page,
   * so they neither change with the filters nor belong in the SSR critical
   * path — the same reasoning /posters uses.
   */
  useEffect(() => {
    let cancelled = false
    productsApi
      .collections()
      .then((response) => {
        if (!cancelled) setCollections(response.collections)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    productsApi
      .catalogueReviewStats()
      .then((stats) => {
        if (!cancelled) setReviewStats(stats)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const handleFiltersChange = useCallback(
    (next: FilterState) => {
      navigate({
        to: '/collections/$slug',
        params: { slug },
        search: toSearch(next) as never,
        replace: true,
      })
    },
    [navigate, slug]
  )

  const handleSortChange = useCallback(
    (sortId: string) => {
      const [sortBy, sortOrder] = sortId.split('-') as [
        FilterState['sortBy'],
        FilterState['sortOrder'],
      ]
      handleFiltersChange({ ...filters, sortBy, sortOrder })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, handleFiltersChange]
  )

  const activeFilterCount = countActiveFilters(filters)

  const removeFilter = useCallback(
    (key: ActiveFilterKey, value?: string) => {
      if (key === 'price') {
        handleFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined })
        return
      }
      if (Array.isArray(filters[key])) {
        const current = filters[key] as string[]
        handleFiltersChange({
          ...filters,
          [key]: current.filter((v) => v !== value),
        })
      } else {
        handleFiltersChange({ ...filters, [key]: undefined })
      }
    },
    [filters, handleFiltersChange]
  )

  const clearAllFilters = useCallback(() => {
    navigate({
      to: '/collections/$slug',
      params: { slug },
      search: { page: 1 } as never,
      replace: true,
    })
  }, [navigate, slug])

  // Paging. Same append-by-widening-the-URL contract as /posters.
  const hasMore = loaderData.hasNextPage
  const isLoadingMore = useRouterState({ select: (state) => state.isLoading })
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return
    navigate({
      to: '/collections/$slug',
      params: { slug },
      search: { ...(search as Record<string, unknown>), page: page + 1 } as never,
      replace: true,
      // Appending a batch is not a navigation the reader made (#457).
      resetScroll: false,
    })
  }, [hasMore, isLoadingMore, navigate, page, search, slug])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || isLoadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, loadMore])

  return (
    <div className="flex flex-col">
      {/* Header band — the collection's own words, not a constant. */}
      <SectionBand className="py-10 lg:py-14">
        <div className="container-wide">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
            <a href="/" className="hover:text-foreground">
              Home
            </a>
            <span className="mx-2">/</span>
            <a href="/posters" className="hover:text-foreground">
              Posters
            </a>
            <span className="mx-2">/</span>
            <span className="text-foreground">{collection.title}</span>
          </nav>

          <DisplayHeading as="h1" className="mb-4">
            {collection.title}
          </DisplayHeading>

          {collection.subtitle && (
            <p className="mb-2 text-muted-foreground">{collection.subtitle}</p>
          )}
          {collection.description && (
            <p className="max-w-3xl text-muted-foreground">
              {collection.description}
            </p>
          )}
        </div>
      </SectionBand>

      {collections.length > 0 && (
        <div className="container-wide pt-6">
          {/* This collection is the current one, so its chip says so. */}
          <DiscoverChips collections={collections} activeSlug={slug} />
        </div>
      )}

      <div className="container-wide py-6 lg:py-8">
        <CollectionToolbar
          totalProducts={loaderData.total}
          /*
           * The sort the API applied, not the raw search. A collection can BE
           * a sort, and Best Sellers otherwise announced "Newest First" over a
           * list ordered by units sold.
           */
          sortId={`${loaderData.appliedSort?.sortBy ?? filters.sortBy ?? 'createdAt'}-${loaderData.appliedSort?.sortOrder ?? filters.sortOrder ?? 'desc'}`}
          onSortChange={handleSortChange}
          filtersHidden={filtersHidden}
          onToggleFilters={() => setFiltersHidden((hidden) => !hidden)}
          className="mb-8"
          chips={
            activeFilterCount > 0 ? (
              <ActiveFilterTags
                variant="row"
                filters={filters}
                onRemoveFilter={removeFilter}
                onClearAll={clearAllFilters}
              />
            ) : null
          }
        />

        <div className="flex gap-8">
          <aside
            id={FILTER_SIDEBAR_ID}
            className={cn(
              'hidden w-[300px] shrink-0',
              filtersHidden ? 'lg:hidden' : 'lg:block'
            )}
          >
            <div className="sticky top-[calc(var(--chrome-offset)+5rem)] transition-[top] duration-200 motion-reduce:transition-none">
              {/*
                Counts come from the collection endpoint and describe THIS
                collection. Catalogue-wide counts would offer filters that
                return nothing here.
              */}
              <ProductFilters
                filters={filters}
                onFiltersChange={handleFiltersChange}
                facetCounts={toFacetCountMaps(loaderData.facets)}
              />
            </div>
          </aside>

          <div className="flex-1">
            <div className="mb-6 flex flex-col gap-4 lg:hidden">
              <MobileFilterButton
                activeCount={activeFilterCount}
                onClick={() => setIsMobileFiltersOpen(true)}
              />
              {activeFilterCount > 0 && (
                <ActiveFilterTags
                  filters={filters}
                  onRemoveFilter={removeFilter}
                  onClearAll={clearAllFilters}
                />
              )}
            </div>

            {products.length > 0 ? (
              <>
                <ItemListJsonLd
                  items={products.map((p) => ({ name: p.title, slug: p.slug }))}
                />
                <ProductGrid
                  products={products}
                  promo={{
                    node: (
                      <PromoTile
                        key="promo-tile"
                        averageRating={reviewStats.averageRating}
                        reviewCount={reviewStats.reviewCount}
                      />
                    ),
                    index: PROMO_CELL_INDEX,
                  }}
                />

                {hasMore && (
                  <div ref={sentinelRef} className="mt-10 flex justify-center">
                    <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                      {isLoadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <ProductGridEmptyState
                title="Nothing here yet"
                description={
                  activeFilterCount > 0
                    ? 'No piece in this collection matches those filters. Try clearing one.'
                    : 'This collection has no published work at the moment.'
                }
              />
            )}
          </div>
        </div>
      </div>

      <MobileFiltersSheet
        isOpen={isMobileFiltersOpen}
        onClose={() => setIsMobileFiltersOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}

/** The sidebar wants Maps; the API sends arrays. */
function toFacetCountMaps(
  facets: Record<string, Array<{ value: string; count: number }>> | undefined
): Record<string, Map<string, number>> | null {
  if (!facets) return null
  const out: Record<string, Map<string, number>> = {}
  for (const [group, rows] of Object.entries(facets)) {
    out[group] = new Map(rows.map((row) => [row.value, row.count]))
  }
  return out
}
