/**
 * Posters Listing Page - chobii.art E-commerce Platform
 *
 * Server-side rendered product listing page featuring:
 * - Product grid with pagination
 * - Filter sidebar (desktop) and sheet (mobile)
 * - URL-based filter state for SEO and sharing
 * - Sort options
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  createFileRoute,
  useNavigate,
  useRouterState,
  Link,
} from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { productsApi, type ProductFilters as ProductFiltersType } from '~/lib/api'
import { cn } from '~/lib/utils'
import {
  ProductGrid,
  ProductGridEmptyState,
} from '~/components/product/ProductGrid'
import {
  ProductFilters,
  MobileFilterButton,
  type FilterState,
  type Orientation,
  type SortOption,
  type SortOrder,
} from '~/components/product/ProductFilters'
import {
  DiscoverChips,
  type DiscoverCollection,
} from '~/components/product/DiscoverChips'
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

/** Cards per page. `?page=N` renders N × this many. */
const PAGE_SIZE = 24

/**
 * Which grid cell the promo tile occupies (analysis §1.3.6).
 *
 * Eight: after the second full row at the 4-column desktop breakpoint, and
 * after the fourth at the 2-column mobile one. Early enough to be seen,
 * late enough that the first impression of the page is products.
 */
const PROMO_CELL_INDEX = 8

/** localStorage key for the collapsed-filter-rail preference. */
const FILTERS_HIDDEN_KEY = 'chobii:collection:filters-hidden'

// ============================================================================
// Types
// ============================================================================

export interface PostersPageData {
  products: ProductCardData[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
  filters: FilterState
}

// Search params schema for URL state
export interface PostersSearchParams {
  page?: number
  styles?: string
  subjects?: string
  colors?: string
  rooms?: string
  vibe?: string
  aesthetic?: string
  medium?: string
  uniqueness?: string
  availability?: string
  orientation?: Orientation
  priceMin?: number
  priceMax?: number
  isAiGenerated?: boolean
  isFeatured?: boolean
  sortBy?: SortOption
  sortOrder?: SortOrder
}

// ============================================================================
// Data Fetching Function
// ============================================================================

/**
 * Fetch products with filters
 */
async function fetchPostersData(params: PostersSearchParams): Promise<PostersPageData> {
  try {
    // Build API query parameters
    /**
     * `?page=N` means "everything up to page N", not "page N alone".
     *
     * The grid appends rather than replaces, so a shared or reloaded URL has
     * to reproduce what the sharer was looking at. Fetching pages 1..N in one
     * request (page 1 at N × PAGE_SIZE) does that server-side, which keeps the
     * whole accumulated view crawlable and removes any need for the client to
     * stitch pages together — the earlier attempt did stitch, and navigating
     * to page 2 then wiped page 1 out from under it.
     */
    const requestedPage = params.page || 1
    const apiParams: ProductFiltersType = {
      page: 1,
      pageSize: PAGE_SIZE * requestedPage,
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc',
    }

    // Add filter params
    if (params.styles) apiParams.styles = params.styles
    if (params.subjects) apiParams.subjects = params.subjects
    if (params.colors) apiParams.colors = params.colors
    if (params.rooms) apiParams.rooms = params.rooms
    if (params.vibe) apiParams.vibe = params.vibe
    if (params.aesthetic) apiParams.aesthetic = params.aesthetic
    if (params.medium) apiParams.medium = params.medium
    if (params.uniqueness) apiParams.uniqueness = params.uniqueness
    if (params.availability) apiParams.availability = params.availability
    if (params.orientation) apiParams.orientation = params.orientation
    if (params.priceMin) apiParams.priceMin = params.priceMin
    if (params.priceMax) apiParams.priceMax = params.priceMax
    if (params.isAiGenerated !== undefined) apiParams.isAiGenerated = params.isAiGenerated
    if (params.isFeatured !== undefined) apiParams.isFeatured = params.isFeatured

    const response = await productsApi.list(apiParams)

    // Transform API response to page data
    const products: ProductCardData[] = (response.items || []).map(
      (item: Record<string, unknown>) => ({
        id: item.id as string,
        title: item.title as string,
        slug: item.slug as string,
        basePrice: item.basePrice as string,
        images: (item.images as ProductCardData['images']) || [],
        orientation: (item.orientation as ProductCardData['orientation']) || 'portrait',
        styles: item.styles as string[] | undefined,
        isFeatured: item.isFeatured as boolean | undefined,
        isAiGenerated: item.isAiGenerated as boolean | undefined,
        averageRating: (item.averageRating as number | null) ?? null,
        reviewCount: (item.reviewCount as number | undefined) ?? 0,
      })
    )

    return {
      products,
      pagination: {
        // Reported in PAGE_SIZE units, not in the widened request size.
        page: requestedPage,
        pageSize: PAGE_SIZE,
        total: response.total || 0,
        totalPages: Math.ceil((response.total || 0) / PAGE_SIZE),
        hasNextPage: requestedPage * PAGE_SIZE < (response.total || 0),
        hasPreviousPage: requestedPage > 1,
      },
      filters: {
        styles: params.styles?.split(',').filter(Boolean) || [],
        subjects: params.subjects?.split(',').filter(Boolean) || [],
        colors: params.colors?.split(',').filter(Boolean) || [],
        rooms: params.rooms?.split(',').filter(Boolean) || [],
        vibe: params.vibe?.split(',').filter(Boolean) || [],
        aesthetic: params.aesthetic?.split(',').filter(Boolean) || [],
        medium: params.medium?.split(',').filter(Boolean) || [],
        uniqueness: params.uniqueness,
        availability: params.availability,
        orientation: params.orientation,
        priceMin: params.priceMin,
        priceMax: params.priceMax,
        isAiGenerated: params.isAiGenerated,
        isFeatured: params.isFeatured,
        sortBy: params.sortBy || 'createdAt',
        sortOrder: params.sortOrder || 'desc',
      },
    }
  } catch {
    // Return empty data on error
    return {
      products: [],
      pagination: {
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      filters: {
        styles: [],
        subjects: [],
        colors: [],
        rooms: [],
        vibe: [],
        aesthetic: [],
        medium: [],
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    }
  }
}

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/posters/')({
  validateSearch: (search: Record<string, unknown>): PostersSearchParams => {
    return {
      page: search.page ? Number(search.page) : undefined,
      styles: search.styles as string | undefined,
      subjects: search.subjects as string | undefined,
      colors: search.colors as string | undefined,
      rooms: search.rooms as string | undefined,
      vibe: search.vibe as string | undefined,
      aesthetic: search.aesthetic as string | undefined,
      medium: search.medium as string | undefined,
      uniqueness: search.uniqueness as string | undefined,
      availability: search.availability as string | undefined,
      orientation: search.orientation as Orientation | undefined,
      priceMin: search.priceMin ? Number(search.priceMin) : undefined,
      priceMax: search.priceMax ? Number(search.priceMax) : undefined,
      isAiGenerated: search.isAiGenerated === true || search.isAiGenerated === 'true' ? true : undefined,
      isFeatured: search.isFeatured === true || search.isFeatured === 'true' ? true : undefined,
      sortBy: search.sortBy as SortOption | undefined,
      sortOrder: search.sortOrder as SortOrder | undefined,
    }
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps }) => {
    return fetchPostersData(deps.search)
  },
  // Force loader to re-run when search params change (fixes client-side navigation)
  shouldReload: () => true,
  head: ({ loaderData }) => {
    const defaultDescription = 'Browse our collection of premium posters.'
    const defaultTitle = 'Shop Posters | chobii.art'

    if (!loaderData) {
      return {
        meta: [
          { title: defaultTitle },
          { name: 'description', content: defaultDescription },
        ],
      }
    }

    const { pagination, filters, products } = loaderData
    const activeFiltersCount =
      filters.styles.length +
      filters.subjects.length +
      filters.colors.length +
      filters.rooms.length +
      (filters.orientation ? 1 : 0)

    // Build dynamic title based on filters
    let title = 'Shop Posters'
    const firstStyle = filters.styles[0]
    if (filters.styles.length === 1 && firstStyle) {
      title = `${firstStyle.replace(/-/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase())} Posters`
    }
    title += ' | chobii.art'

    const description = activeFiltersCount > 0
      ? `Browse our curated collection of ${pagination.total} posters. Filter by style, subject, color, and more.`
      : 'Discover premium posters for your space. Browse our curated collection of wall art, from abstract to minimalist, nature to typography.'

    // Use first product image as OG image, or fall back to default
    const firstProductImage = products[0]?.images?.[0]?.url
    const ogImage = firstProductImage || 'https://chobii.art/og-posters-collection.jpg'

    // Build keywords from active filters
    const keywords = [
      'posters',
      'wall art',
      'prints',
      ...filters.styles,
      ...filters.subjects,
      'home decor',
      'chobii.art',
    ].filter(Boolean).join(', ')

    // Build canonical URL (without pagination for SEO)
    const canonicalUrl = 'https://chobii.art/posters'

    return {
      meta: [
        // Basic meta tags
        { title },
        { name: 'description', content: description },
        { name: 'keywords', content: keywords },
        { name: 'robots', content: pagination.page > 1 ? 'noindex, follow' : 'index, follow' },

        // Open Graph meta tags
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: canonicalUrl },
        { property: 'og:site_name', content: 'chobii.art' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:secure_url', content: ogImage },
        { property: 'og:image:alt', content: 'chobii.art Poster Collection' },
        { property: 'og:image:type', content: 'image/jpeg' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:locale', content: 'en_IN' },

        // Twitter Card meta tags
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@chobiiart' },
        { name: 'twitter:creator', content: '@chobiiart' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImage },
        { name: 'twitter:image:alt', content: 'chobii.art Poster Collection' },
      ],
      links: [
        {
          rel: 'canonical',
          href: canonicalUrl,
        },
      ],
    }
  },
  component: PostersPage,
})

// ============================================================================
// Main Component
// ============================================================================

function PostersPage() {
  const loaderData = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()

  // Handle case where loader data might be undefined
  const products = loaderData?.products ?? []
  const pagination = loaderData?.pagination ?? {
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  }
  const initialFilters = loaderData?.filters ?? {
    styles: [],
    subjects: [],
    colors: [],
    rooms: [],
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  }

  // Local filter state (synced with URL)
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

  /**
   * Hide-filters is remembered: a shopper who collapsed the rail does not want
   * it back on every navigation. Read lazily and guarded — this component is
   * server-rendered, where localStorage does not exist.
   */
  const [filtersHidden, setFiltersHidden] = useState(false)

  /**
   * Facet counts. Fetched client-side rather than in the loader: they describe
   * the whole catalogue, not this page, so they do not change with filters or
   * paging and would only slow the SSR response down.
   */
  const [facetCounts, setFacetCounts] = useState<Record<
    string,
    Map<string, number>
  > | null>(null)

  useEffect(() => {
    let cancelled = false
    productsApi
      .facets()
      .then((facets) => {
        if (cancelled) return
        const toMap = (rows: Array<{ value: string; count: number }>) =>
          new Map(rows.map((row) => [row.value, row.count]))
        setFacetCounts({
          styles: toMap(facets.styles),
          subjects: toMap(facets.subjects),
          colors: toMap(facets.colors),
          rooms: toMap(facets.rooms),
          orientation: toMap(facets.orientation),
        })
      })
      // Counts are an enhancement; without them the labels simply render
      // bare, which is what they did before this feature.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Discover collections. Client-side for the same reason as the facet counts
   * above: they describe the catalogue, not this page, so they neither change
   * with the filters nor belong in the SSR critical path.
   */
  const [collections, setCollections] = useState<DiscoverCollection[]>([])

  /**
   * Catalogue review aggregate for the promo tile. Same reasoning again: it
   * describes the catalogue, not the page.
   */
  const [reviewStats, setReviewStats] = useState<{
    averageRating: number | null
    reviewCount: number
  }>({ averageRating: null, reviewCount: 0 })

  useEffect(() => {
    let cancelled = false
    productsApi
      .catalogueReviewStats()
      .then((stats) => {
        if (cancelled) return
        setReviewStats(stats)
      })
      // Failing to load leaves the tile absent, which is the same thing it
      // does when the catalogue has too few reviews to quote.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    productsApi
      .collections()
      .then((response) => {
        if (cancelled) return
        setCollections(response.collections)
      })
      // The rail is an enhancement. Without it the page is what it was
      // before this feature, rather than a broken version of what it is now.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setFiltersHidden(
      window.localStorage.getItem(FILTERS_HIDDEN_KEY) === 'true'
    )
  }, [])

  useEffect(() => {
    window.localStorage.setItem(FILTERS_HIDDEN_KEY, String(filtersHidden))
  }, [filtersHidden])

  const handleSortChange = useCallback(
    (sortId: string) => {
      const [sortBy, sortOrder] = sortId.split('-') as [SortOption, SortOrder]
      handleFiltersChange({ ...filters, sortBy, sortOrder })
    },
    // handleFiltersChange is defined below; both are stable per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters]
  )

  // Sync filters when URL changes
  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  // Handle filter changes - update URL
  const handleFiltersChange = useCallback(
    (newFilters: FilterState) => {
      setFilters(newFilters)

      // Build new search params
      const newSearch: PostersSearchParams = {
        page: 1, // Reset to page 1 when filters change
      }

      if (newFilters.styles.length > 0) {
        newSearch.styles = newFilters.styles.join(',')
      }
      if (newFilters.subjects.length > 0) {
        newSearch.subjects = newFilters.subjects.join(',')
      }
      if (newFilters.colors.length > 0) {
        newSearch.colors = newFilters.colors.join(',')
      }
      if (newFilters.rooms.length > 0) {
        newSearch.rooms = newFilters.rooms.join(',')
      }
      if (newFilters.orientation) {
        newSearch.orientation = newFilters.orientation
      }
      if (newFilters.priceMin !== undefined) {
        newSearch.priceMin = newFilters.priceMin
      }
      if (newFilters.priceMax !== undefined) {
        newSearch.priceMax = newFilters.priceMax
      }
      if (newFilters.isAiGenerated !== undefined) {
        newSearch.isAiGenerated = newFilters.isAiGenerated
      }
      if (newFilters.isFeatured !== undefined) {
        newSearch.isFeatured = newFilters.isFeatured
      }
      if (newFilters.sortBy && newFilters.sortBy !== 'createdAt') {
        newSearch.sortBy = newFilters.sortBy
      }
      if (newFilters.sortOrder && newFilters.sortOrder !== 'desc') {
        newSearch.sortOrder = newFilters.sortOrder
      }

      // Navigate with new search params
      navigate({
        to: '/posters',
        search: newSearch,
        replace: true,
      })
    },
    [navigate]
  )

  // Handle page change
  /**
   * The loader returns pages 1..page, so this is already the accumulated set —
   * nothing to stitch on the client. `loadMore` just widens the URL.
   */
  const visibleProducts = products
  const hasMore = pagination.hasNextPage
  const isLoadingMore = useRouterState({ select: (state) => state.isLoading })
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return

    /**
     * `replace` because scrolling is not a navigation the back button should
     * have to unwind one page at a time — back should leave the collection,
     * not step through however many batches were loaded.
     */
    navigate({
      to: '/posters',
      search: { ...search, page: pagination.page + 1 },
      replace: true,
    })
  }, [hasMore, isLoadingMore, navigate, pagination.page, search])

  /**
   * The observer is an enhancement over the button, never a replacement: it
   * presses Load more when the sentinel approaches the viewport.
   */
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

  // Count active filters for badge
  const activeFilterCount =
    filters.styles.length +
    filters.subjects.length +
    filters.colors.length +
    filters.rooms.length +
    (filters.orientation ? 1 : 0) +
    (filters.priceMin !== undefined ? 1 : 0) +
    (filters.priceMax !== undefined ? 1 : 0) +
    (filters.isAiGenerated !== undefined ? 1 : 0)

  return (
    <div className="flex flex-col">
      {/* Page Header */}
      <PageHeader />

      {/*
        Discover rail (analysis §1.3.2). Between the header band and the
        toolbar, where mesonart puts it.

        Selection is folded into the existing filter handler rather than
        navigated directly: router.tsx overrides TanStack's search
        serialisation, so a hand-built search object skips the comma-joining
        that validateSearch expects and error-boundaries the route.
      */}
      {collections.length > 0 && (
        <div className="container-wide pt-6">
          <DiscoverChips
            collections={collections}
            activeStyle={filters.styles?.[0]}
            onSelect={(styleId) =>
              handleFiltersChange({
                ...filters,
                styles: styleId ? [styleId] : [],
              })
            }
          />
        </div>
      )}

      {/* Main Content */}
      <div className="container-wide py-6 lg:py-8">
        {/*
          The toolbar spans BOTH columns (#419). Theirs is a `.facet-topbar`
          row across the full page width: the Hide-filters pill at the rail's
          left edge, the count beside it, sort against the right margin. Ours
          used to live inside the products column, which put the toggle to the
          right of the rail it collapses.

          The pill is not nested inside the <aside> — that is `lg:hidden` once
          filters are hidden, so the only way back would go with it. Their own
          button does not move when the rail collapses either.
        */}
        <CollectionToolbar
          totalProducts={pagination.total}
          sortId={`${filters.sortBy || 'createdAt'}-${filters.sortOrder || 'desc'}`}
          onSortChange={handleSortChange}
          filtersHidden={filtersHidden}
          onToggleFilters={() => setFiltersHidden((hidden) => !hidden)}
          className="mb-8"
        />

        <div className="flex gap-8">
          {/* Desktop Filters Sidebar */}
          <aside
            id={FILTER_SIDEBAR_ID}
            className={cn(
              'hidden w-[300px] shrink-0',
              filtersHidden ? 'lg:hidden' : 'lg:block'
            )}
          >
            {/* No box, no radius, no inner scroll (#415).
             *
             * mesonart's rail is a bare 300px column that sticks to the top and
             * scrolls with the page. Ours was a bordered card with its own
             * scrollbar, which read as a widget dropped onto the page and put a
             * second scrollbar inside the first. */}
            {/* Offset against `--chrome-offset` + 1rem, not a fixed top-20:
             * the header's styles row reveals on scroll up and the rail has to
             * move with it, same as the toolbar (#421).
             *
             * The 5rem is the toolbar itself (#419): 56px pill inside `py-3`,
             * sticky at `--chrome-offset` and now spanning this column too.
             * Pinned any higher, the rail scrolls under a translucent bar. */}
            <div className="sticky top-[calc(var(--chrome-offset)+5rem)] transition-[top] duration-200 motion-reduce:transition-none">
              <ProductFilters
                filters={filters}
                onFiltersChange={handleFiltersChange}
                facetCounts={facetCounts}
              />
            </div>
          </aside>

          {/* Products Content */}
          <div className="flex-1">
            {/* Mobile Filter Button and Active Filters */}
            <div className="mb-6 flex flex-col gap-4 lg:hidden">
              <MobileFilterButton
                activeCount={activeFilterCount}
                onClick={() => setIsMobileFiltersOpen(true)}
              />

              {/* Active Filters Tags (Mobile) */}
              {activeFilterCount > 0 && (
                <ActiveFilterTags
                  filters={filters}
                  onRemoveFilter={(key, value) => {
                    if (Array.isArray(filters[key])) {
                      const currentValues = filters[key] as string[]
                      handleFiltersChange({
                        ...filters,
                        [key]: currentValues.filter((v) => v !== value),
                      })
                    } else {
                      handleFiltersChange({
                        ...filters,
                        [key]: undefined,
                      })
                    }
                  }}
                  onClearAll={() =>
                    handleFiltersChange({
                      styles: [],
                      subjects: [],
                      colors: [],
                      rooms: [],
                      vibe: [],
                      aesthetic: [],
                      medium: [],
                      uniqueness: undefined,
                      availability: undefined,
                      orientation: undefined,
                      priceMin: undefined,
                      priceMax: undefined,
                      isAiGenerated: undefined,
                      isFeatured: undefined,
                      sortBy: 'createdAt',
                      sortOrder: 'desc',
                    })
                  }
                />
              )}
            </div>

            {/* Active Filters Tags (Desktop) */}
            {activeFilterCount > 0 && (
              <div className="mb-6 hidden lg:block">
                <ActiveFilterTags
                  filters={filters}
                  onRemoveFilter={(key, value) => {
                    if (Array.isArray(filters[key])) {
                      const currentValues = filters[key] as string[]
                      handleFiltersChange({
                        ...filters,
                        [key]: currentValues.filter((v) => v !== value),
                      })
                    } else {
                      handleFiltersChange({
                        ...filters,
                        [key]: undefined,
                      })
                    }
                  }}
                  onClearAll={() =>
                    handleFiltersChange({
                      styles: [],
                      subjects: [],
                      colors: [],
                      rooms: [],
                      vibe: [],
                      aesthetic: [],
                      medium: [],
                      uniqueness: undefined,
                      availability: undefined,
                      orientation: undefined,
                      priceMin: undefined,
                      priceMax: undefined,
                      isAiGenerated: undefined,
                      isFeatured: undefined,
                      sortBy: 'createdAt',
                      sortOrder: 'desc',
                    })
                  }
                />
              </div>
            )}

            {/* Product Grid */}
            {visibleProducts.length > 0 ? (
              <>
                {/* ItemList structured data. Describes everything currently
                    rendered, so it stays in step as pages accumulate. */}
                <ItemListJsonLd
                  items={visibleProducts.map((p) => ({
                    name: p.title,
                    slug: p.slug,
                  }))}
                />
                <ProductGrid
                  products={visibleProducts}
                  /**
                   * After the second full 4-column row (analysis §1.3.6).
                   * The tile returns null when the catalogue has too few
                   * approved reviews to quote, and ProductGrid then renders
                   * the plain grid.
                   */
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

                {/* Load more.
                 *
                 * A REAL BUTTON, not a bare scroll sentinel. Pure infinite
                 * scroll is unreachable by keyboard, invisible to crawlers,
                 * and impossible to recover from if the request fails. The
                 * observer below simply presses this early for mouse users. */}
                {hasMore && (
                  <div ref={sentinelRef} className="mt-10 flex justify-center">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <ProductGridEmptyState
                title="No products found"
                description="Try adjusting your filters or search criteria to find what you're looking for."
                showCreateLink
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filters Sheet */}
      <MobileFiltersSheet
        isOpen={isMobileFiltersOpen}
        onClose={() => setIsMobileFiltersOpen(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}

// ============================================================================
// Page Header Component
// ============================================================================

/**
 * SEO copy for the collection. mesonart runs a paragraph here with a "Show
 * More" toggle; ours is short enough to render whole.
 */
const COLLECTION_DESCRIPTION =
  'Museum-grade posters and framed art, printed on archival paper with pigment inks. ' +
  'Filter by style, subject, colour or the room you are furnishing — every piece ships ' +
  'free over ₹999 and returns free within 30 days.'

const BREADCRUMBS = [
  { name: 'Home', href: '/' },
  { name: 'Posters', href: '/posters' },
]

/**
 * Collection header — mesonart's beige band (analysis §1.3.1).
 *
 * Was a flat `bg-muted/30` strip with a plain h1 and the result count. The
 * count now lives in the toolbar, where mesonart puts it; this band carries
 * breadcrumbs, the display H1 and the SEO paragraph.
 *
 * SectionBand and DisplayHeading both landed in Phase A and until now were
 * used only on the home page.
 */
function PageHeader() {
  return (
    <SectionBand tone="beige" className="py-8 sm:py-12">
      {/* Real navigation markup, not a decorative string — breadcrumbs are
          the one piece of structured data Google renders directly in the
          result, and #244 already established JSON-LD on this page. */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-2 text-sm text-muted-foreground">
          {BREADCRUMBS.map((crumb, index) => (
            <li key={crumb.href} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {index === BREADCRUMBS.length - 1 ? (
                <span aria-current="page" className="text-foreground">
                  {crumb.name}
                </span>
              ) : (
                <Link to={crumb.href} className="hover:text-foreground">
                  {crumb.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: BREADCRUMBS.map((crumb, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: crumb.name,
              item: `https://chobii.art${crumb.href}`,
            })),
          }),
        }}
      />

      <DisplayHeading className="text-foreground">Shop Posters</DisplayHeading>

      <p className="mt-4 max-w-2xl text-muted-foreground">
        {COLLECTION_DESCRIPTION}
      </p>
    </SectionBand>
  )
}

// ============================================================================
// Active Filter Tags Component
// ============================================================================

interface ActiveFilterTagsProps {
  filters: FilterState
  onRemoveFilter: (key: keyof FilterState, value?: string) => void
  onClearAll: () => void
}

function ActiveFilterTags({
  filters,
  onRemoveFilter,
  onClearAll,
}: ActiveFilterTagsProps) {
  const tags: Array<{
    key: keyof FilterState
    value: string
    label: string
  }> = []

  // Build tags array from filters
  filters.styles.forEach((style) => {
    tags.push({
      key: 'styles',
      value: style,
      label: style.replace(/-/g, ' '),
    })
  })

  filters.subjects.forEach((subject) => {
    tags.push({
      key: 'subjects',
      value: subject,
      label: subject.replace(/-/g, ' '),
    })
  })

  filters.colors.forEach((color) => {
    tags.push({
      key: 'colors',
      value: color,
      label: color.replace(/-/g, ' '),
    })
  })

  filters.rooms.forEach((room) => {
    tags.push({
      key: 'rooms',
      value: room,
      label: room.replace(/-/g, ' '),
    })
  })

  if (filters.orientation) {
    tags.push({
      key: 'orientation',
      value: filters.orientation,
      label: filters.orientation,
    })
  }

  if (filters.isAiGenerated !== undefined) {
    tags.push({
      key: 'isAiGenerated',
      value: 'true',
      label: 'AI Generated',
    })
  }

  if (filters.isFeatured !== undefined) {
    tags.push({
      key: 'isFeatured',
      value: 'true',
      label: 'Featured',
    })
  }

  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Active filters:</span>
      {tags.map((tag, index) => (
        <button
          key={`${tag.key}-${tag.value}-${index}`}
          type="button"
          onClick={() => onRemoveFilter(tag.key, tag.value)}
          className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-sm capitalize transition-colors hover:bg-muted"
        >
          {tag.label}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  )
}

// ============================================================================
// Mobile Filters Sheet Component
// ============================================================================

interface MobileFiltersSheetProps {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

function MobileFiltersSheet({
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
