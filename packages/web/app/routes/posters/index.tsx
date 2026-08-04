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

import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, useCallback, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
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
import type { ProductCardData } from '~/components/product/ProductCard'
import { ItemListJsonLd } from '~/components/seo/ProductJsonLd'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import {
  CollectionToolbar,
  FILTER_SIDEBAR_ID,
} from '~/components/product/CollectionToolbar'

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
    const apiParams: ProductFiltersType = {
      page: params.page || 1,
      pageSize: 24,
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc',
    }

    // Add filter params
    if (params.styles) apiParams.styles = params.styles
    if (params.subjects) apiParams.subjects = params.subjects
    if (params.colors) apiParams.colors = params.colors
    if (params.rooms) apiParams.rooms = params.rooms
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
      })
    )

    return {
      products,
      pagination: {
        page: response.page || 1,
        pageSize: response.pageSize || 24,
        total: response.total || 0,
        totalPages: response.totalPages || 1,
        hasNextPage: response.hasNextPage || false,
        hasPreviousPage: response.hasPreviousPage || false,
      },
      filters: {
        styles: params.styles?.split(',').filter(Boolean) || [],
        subjects: params.subjects?.split(',').filter(Boolean) || [],
        colors: params.colors?.split(',').filter(Boolean) || [],
        rooms: params.rooms?.split(',').filter(Boolean) || [],
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
        pageSize: 24,
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
  const handlePageChange = useCallback(
    (newPage: number) => {
      // Build new search params preserving existing filters
      const newSearch: PostersSearchParams = {
        ...search,
        page: newPage > 1 ? newPage : undefined, // Only include page param if > 1
      }

      // Remove undefined values to keep URL clean
      const cleanSearch = Object.fromEntries(
        Object.entries(newSearch).filter(([, v]) => v !== undefined)
      ) as PostersSearchParams

      navigate({
        to: '/posters',
        search: cleanSearch,
      })
    },
    [navigate, search]
  )

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

      {/* Main Content */}
      <div className="container-wide py-6 lg:py-8">
        <div className="flex gap-8">
          {/* Desktop Filters Sidebar */}
          <aside
            id={FILTER_SIDEBAR_ID}
            className={cn(
              'hidden w-64 shrink-0',
              filtersHidden ? 'lg:hidden' : 'lg:block'
            )}
          >
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-border">
              <ProductFilters
                filters={filters}
                onFiltersChange={handleFiltersChange}
              />
            </div>
          </aside>

          {/* Products Content */}
          <div className="flex-1">
            <CollectionToolbar
              totalProducts={pagination.total}
              sortId={`${filters.sortBy || 'createdAt'}-${filters.sortOrder || 'desc'}`}
              onSortChange={handleSortChange}
              filtersHidden={filtersHidden}
              onToggleFilters={() => setFiltersHidden((hidden) => !hidden)}
              className="mb-6"
            />

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
            {products.length > 0 ? (
              <>
                {/* ItemList structured data for the visible page (#244) */}
                <ItemListJsonLd
                  items={products.map((p) => ({ name: p.title, slug: p.slug }))}
                />
                <ProductGrid products={products} />

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <Pagination
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                    hasNextPage={pagination.hasNextPage}
                    hasPreviousPage={pagination.hasPreviousPage}
                    onPageChange={handlePageChange}
                  />
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
// Pagination Component
// ============================================================================

interface PaginationProps {
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  onPageChange: (page: number) => void
}

function Pagination({
  currentPage,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}: PaginationProps) {
  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const showEllipsis = totalPages > 7

    if (!showEllipsis) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      if (currentPage > 3) {
        pages.push('ellipsis')
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i)
        }
      }

      if (currentPage < totalPages - 2) {
        pages.push('ellipsis')
      }

      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages)
      }
    }

    return pages
  }

  return (
    <nav
      className="mt-12 flex items-center justify-center gap-1"
      aria-label="Pagination"
    >
      {/* Previous Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPreviousPage}
        className={cn(
          'flex h-10 items-center gap-1 rounded-lg border px-4 text-sm font-medium transition-colors',
          hasPreviousPage
            ? 'border-border hover:bg-accent'
            : 'cursor-not-allowed border-border/50 text-muted-foreground'
        )}
        aria-label="Go to previous page"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {getPageNumbers().map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="flex h-10 w-10 items-center justify-center text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                page === currentPage
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              )}
              aria-label={`Go to page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}
      </div>

      {/* Next Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage}
        className={cn(
          'flex h-10 items-center gap-1 rounded-lg border px-4 text-sm font-medium transition-colors',
          hasNextPage
            ? 'border-border hover:bg-accent'
            : 'cursor-not-allowed border-border/50 text-muted-foreground'
        )}
        aria-label="Go to next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
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
