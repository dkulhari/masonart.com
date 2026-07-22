/**
 * AI Gallery Page - chobi.art E-commerce Platform
 *
 * Public gallery showcasing AI-generated artwork shared by users.
 * Features image grid, filtering by style, and pagination.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Heart,
  Eye,
  ImageOff,
} from 'lucide-react'
import { aiApi, type AIGalleryListParams } from '~/lib/api'
import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

interface GalleryItem {
  id: string
  promptText: string
  stylePreset: string | null
  aspectRatio: string | null
  imageUrl: string | null
  likesCount: number
  viewsCount: number
  createdAt: string
}

interface GalleryPageData {
  items: GalleryItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

// Search params schema for URL state
interface GallerySearchParams {
  page?: number
  stylePreset?: string
  sortBy?: 'createdAt' | 'likes'
}

// Style preset options
const STYLE_PRESETS = [
  { value: '', label: 'All Styles' },
  { value: 'abstract', label: 'Abstract' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'oil-painting', label: 'Oil Painting' },
  { value: 'digital-art', label: 'Digital Art' },
  { value: 'photography', label: 'Photography' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'pop-art', label: 'Pop Art' },
  { value: 'line-art', label: 'Line Art' },
]

// ============================================================================
// Data Fetching Function
// ============================================================================

async function fetchGalleryData(params: GallerySearchParams): Promise<GalleryPageData> {
  try {
    const apiParams: AIGalleryListParams = {
      page: params.page || 1,
      pageSize: 24,
      sortBy: params.sortBy || 'createdAt',
    }

    if (params.stylePreset) {
      apiParams.stylePreset = params.stylePreset
    }

    const response = await aiApi.gallery(apiParams)

    return {
      items: response.items || [],
      pagination: {
        page: response.page || 1,
        pageSize: response.pageSize || 24,
        total: response.total || 0,
        totalPages: response.totalPages || 1,
        hasNextPage: response.hasNextPage || false,
        hasPreviousPage: response.hasPreviousPage || false,
      },
    }
  } catch (error) {
    console.error('Failed to fetch gallery:', error)
    return {
      items: [],
      pagination: {
        page: 1,
        pageSize: 24,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }
  }
}

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/gallery/')({
  validateSearch: (search: Record<string, unknown>): GallerySearchParams => ({
    page: search.page ? Number(search.page) : undefined,
    stylePreset: search.stylePreset as string | undefined,
    sortBy: search.sortBy as 'createdAt' | 'likes' | undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page,
    stylePreset: search.stylePreset,
    sortBy: search.sortBy,
  }),
  loader: async ({ deps }) => {
    return fetchGalleryData(deps)
  },
  head: () => ({
    meta: [
      { title: 'AI Art Gallery | chobi.art' },
      {
        name: 'description',
        content:
          'Explore stunning AI-generated artwork created by our community. Get inspired and create your own unique poster designs.',
      },
      { property: 'og:title', content: 'AI Art Gallery | chobi.art' },
      {
        property: 'og:description',
        content:
          'Explore stunning AI-generated artwork created by our community. Get inspired and create your own unique poster designs.',
      },
    ],
  }),
  component: GalleryPage,
})

// ============================================================================
// Main Component
// ============================================================================

function GalleryPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const { items, pagination } = data
  const currentStylePreset = search.stylePreset || ''
  const currentSortBy = search.sortBy || 'createdAt'

  // Update URL with new search params
  const updateSearch = (updates: Partial<GallerySearchParams>) => {
    navigate({
      search: (prev) => ({
        ...prev,
        ...updates,
        // Reset to page 1 when changing filters
        page: updates.page !== undefined ? updates.page : 1,
      }),
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Page Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700">
            <Sparkles className="h-4 w-4" />
            Community Creations
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            AI Art Gallery
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Explore stunning AI-generated artwork created by our community.
            Get inspired and create your own unique poster designs.
          </p>
          <Link
            to="/create"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            <Sparkles className="h-4 w-4" />
            Create Your Own
          </Link>
        </div>

        {/* Filters Bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Style Preset Filter */}
            <select
              value={currentStylePreset}
              onChange={(e) => updateSearch({ stylePreset: e.target.value || undefined })}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>

            {/* Sort By */}
            <select
              value={currentSortBy}
              onChange={(e) =>
                updateSearch({ sortBy: e.target.value as 'createdAt' | 'likes' })
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="createdAt">Newest</option>
              <option value="likes">Most Liked</option>
            </select>
          </div>

          {/* Results Count */}
          <p className="text-sm text-muted-foreground">
            {pagination.total} {pagination.total === 1 ? 'artwork' : 'artworks'}
          </p>
        </div>

        {/* Gallery Grid */}
        {items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:gap-6">
              {items.map((item) => (
                <GalleryCard key={item.id} item={item} />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => updateSearch({ page: pagination.page - 1 })}
                  disabled={!pagination.hasPreviousPage}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <span className="px-4 text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => updateSearch({ page: pagination.page + 1 })}
                  disabled={!pagination.hasNextPage}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyGalleryState />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Gallery Card Component
// ============================================================================

interface GalleryCardProps {
  item: GalleryItem
}

function GalleryCard({ item }: GalleryCardProps) {
  const [imageError, setImageError] = useState(false)

  // Format date
  const formattedDate = new Date(item.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  // Determine aspect ratio class
  const getAspectRatioClass = () => {
    switch (item.aspectRatio) {
      case '1:1':
        return 'aspect-square'
      case '16:9':
        return 'aspect-video'
      case '9:16':
        return 'aspect-[9/16]'
      case '4:3':
        return 'aspect-[4/3]'
      case '3:4':
        return 'aspect-[3/4]'
      default:
        return 'aspect-square'
    }
  }

  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      {/* Image Container */}
      <div className={cn('relative overflow-hidden bg-muted', getAspectRatioClass())}>
        {item.imageUrl && !imageError ? (
          <img
            src={item.imageUrl}
            alt={item.promptText.slice(0, 100)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Style Badge */}
        {item.stylePreset && (
          <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {item.stylePreset}
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        {/* Stats on Hover */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex items-center gap-3 text-xs text-white">
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {item.likesCount}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {item.viewsCount}
            </span>
          </div>
          <span className="text-xs text-white/80">{formattedDate}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <p className="line-clamp-2 text-sm text-foreground">{item.promptText}</p>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyGalleryState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <Sparkles className="h-10 w-10 text-muted-foreground" />
      </div>

      <h2 className="mb-2 text-xl font-semibold text-foreground">No artworks yet</h2>

      <p className="mb-8 text-muted-foreground">
        Be the first to share your AI-generated creations with the community!
      </p>

      <Link
        to="/create"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
      >
        <Sparkles className="h-4 w-4" />
        Create with AI
      </Link>
    </div>
  )
}
