/**
 * AI Creations History Page - chobii.art E-commerce Platform
 *
 * Displays user's AI-generated artwork history with filtering and pagination.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import {
  Sparkles,
  ArrowLeft,
  Filter,
  Loader2,
  X,
  Plus,
} from 'lucide-react'
import { Pagination } from '~/components/ui/Pagination'
import { cn } from '~/lib/utils'
import { authApi, aiApi } from '~/lib/api'
import { AICreationsList, type AICreation, type AICreationStatus, type AIModerationStatus } from '~/components/account/AICreationsList'

// ============================================================================
// Route Definition
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().optional().default(1),
  status: z.string().optional(),
  style: z.string().optional(),
  moderation: z.string().optional(),
})

export const Route = createFileRoute('/_authed/account/ai-creations')({
  validateSearch: searchParamsSchema,
  head: () => ({
    meta: [
      { title: 'AI Creations | chobii.art' },
      {
        name: 'description',
        content: 'View and manage your AI-generated artwork created with chobii.art.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AICreationsHistoryPage,
})

// ============================================================================
// Types
// ============================================================================

interface CreationsResponse {
  items: AICreation[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// ============================================================================
// Filter Options
// ============================================================================

interface FilterOption {
  value: string
  label: string
}

const STATUS_FILTERS: FilterOption[] = [
  { value: '', label: 'All Creations' },
  { value: 'completed', label: 'Completed' },
  { value: 'processing', label: 'Processing' },
  { value: 'queued', label: 'In Queue' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STYLE_FILTERS: FilterOption[] = [
  { value: '', label: 'All Styles' },
  { value: 'wabi-sabi', label: 'Wabi-Sabi' },
  { value: 'abstract-expression', label: 'Abstract Expression' },
  { value: 'botanical', label: 'Botanical' },
  { value: 'geometric-modern', label: 'Geometric Modern' },
  { value: 'vintage-poster', label: 'Vintage Poster' },
  { value: 'pop-art', label: 'Pop Art' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'photography', label: 'Photography' },
  { value: 'line-art', label: 'Line Art' },
  { value: 'typography', label: 'Typography' },
]

const MODERATION_FILTERS: FilterOption[] = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const PAGE_SIZE = 12

// ============================================================================
// Main Component
// ============================================================================

function AICreationsHistoryPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authed/account/ai-creations' })

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [creations, setCreations] = useState<AICreation[]>([])
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const currentPage = search.page || 1
  const currentStatus = search.status || ''
  const currentStyle = search.style || ''
  const currentModeration = search.moderation || ''

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      try {
        const session = await authApi.getSession()
        if (!session?.user) {
          navigate({
            to: '/auth/login',
            search: { redirect: '/account/ai-creations' },
          })
          return
        }
        setIsAuthenticated(true)
      } catch {
        navigate({
          to: '/auth/login',
          search: { redirect: '/account/ai-creations' },
        })
      }
    }

    checkAuth()
  }, [navigate])

  // Fetch creations
  const fetchCreations = useCallback(async () => {
    if (!isAuthenticated) return

    setIsLoading(true)
    setError(null)

    try {
      const response: CreationsResponse = await aiApi.list({
        page: currentPage,
        pageSize: PAGE_SIZE,
        ...(currentStatus && { status: currentStatus as AICreationStatus }),
        ...(currentStyle && { stylePreset: currentStyle }),
        ...(currentModeration && { moderationStatus: currentModeration as AIModerationStatus }),
      })

      setCreations(response.items || [])
      setPagination({
        total: response.total,
        page: response.page,
        totalPages: response.totalPages,
        hasNextPage: response.hasNextPage,
        hasPreviousPage: response.hasPreviousPage,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creations')
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, currentPage, currentStatus, currentStyle, currentModeration])

  useEffect(() => {
    fetchCreations()
  }, [fetchCreations])

  // Handle status filter change
  const handleStatusChange = (status: string) => {
    navigate({
      to: '/account/ai-creations',
      search: {
        page: 1,
        status: status || undefined,
        style: currentStyle || undefined,
        moderation: currentModeration || undefined,
      },
    })
    setShowFilters(false)
  }

  // Handle style filter change
  const handleStyleChange = (style: string) => {
    navigate({
      to: '/account/ai-creations',
      search: {
        page: 1,
        status: currentStatus || undefined,
        style: style || undefined,
        moderation: currentModeration || undefined,
      },
    })
    setShowFilters(false)
  }

  // Handle moderation filter change
  const handleModerationChange = (moderation: string) => {
    navigate({
      to: '/account/ai-creations',
      search: {
        page: 1,
        status: currentStatus || undefined,
        style: currentStyle || undefined,
        moderation: moderation || undefined,
      },
    })
    setShowFilters(false)
  }

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    navigate({
      to: '/account/ai-creations',
      search: {
        page: newPage,
        status: currentStatus || undefined,
        style: currentStyle || undefined,
        moderation: currentModeration || undefined,
      },
    })
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Clear all filters
  const handleClearFilters = () => {
    navigate({
      to: '/account/ai-creations',
      search: { page: 1 },
    })
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this creation? This cannot be undone.')) {
      return
    }

    try {
      await aiApi.delete(id)
      // Refresh the list
      fetchCreations()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete creation')
    }
  }

  // Handle add to cart
  const handleAddToCart = (creation: AICreation) => {
    // Navigate to the creation detail page where they can configure and add to cart
    navigate({ to: `/account/ai-creations/${creation.id}` })
  }

  // Active filter count
  const activeFilterCount = (currentStatus ? 1 : 0) + (currentStyle ? 1 : 0) + (currentModeration ? 1 : 0)

  // Loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-wide py-8 lg:py-12">
        {/* Back Link */}
        <a
          href="/account"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Account
        </a>

        {/* Page Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl text-foreground sm:text-3xl">
              <Sparkles className="h-7 w-7 text-purple-500" />
              AI Creations
            </h1>
            <p className="mt-2 text-muted-foreground">
              {pagination.total > 0
                ? `${pagination.total} ${pagination.total === 1 ? 'creation' : 'creations'} found`
                : 'Create unique artwork with AI'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Create New Button */}
            <a
              href="/create"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="h-4 w-4" />
              Create New
            </a>

            {/* Filter Toggle (Mobile) */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:hidden"
            >
              <Filter className="h-4 w-4" />
              Filter
              {activeFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar Filters (Desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Status Filter */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-4 text-sm text-foreground">Status</h3>
                <div className="space-y-1">
                  {STATUS_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleStatusChange(option.value)}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        currentStatus === option.value
                          ? 'bg-purple-100 font-medium text-purple-700'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Filter */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-4 text-sm text-foreground">Style</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {STYLE_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleStyleChange(option.value)}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        currentStyle === option.value
                          ? 'bg-purple-100 font-medium text-purple-700'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Moderation Status Filter */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-4 text-sm text-foreground">Approval Status</h3>
                <div className="space-y-1">
                  {MODERATION_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleModerationChange(option.value)}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        currentModeration === option.value
                          ? 'bg-purple-100 font-medium text-purple-700'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Mobile Filters (Slide-down) */}
          {showFilters && (
            <div className="rounded-xl border border-border bg-card p-4 lg:hidden">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm text-foreground">Filters</h3>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Status */}
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase">Status</h4>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleStatusChange(option.value)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-sm transition-colors',
                        currentStatus === option.value
                          ? 'bg-purple-500 font-medium text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className="mb-4">
                <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase">Style</h4>
                <div className="flex flex-wrap gap-2">
                  {STYLE_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleStyleChange(option.value)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-sm transition-colors',
                        currentStyle === option.value
                          ? 'bg-purple-500 font-medium text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Approval Status */}
              <div>
                <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase">Approval Status</h4>
                <div className="flex flex-wrap gap-2">
                  {MODERATION_FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleModerationChange(option.value)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-sm transition-colors',
                        currentModeration === option.value
                          ? 'bg-purple-500 font-medium text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Active Filter Badges */}
            {(currentStatus || currentStyle || currentModeration) && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Filtered by:</span>
                {currentStatus && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange('')}
                    className="flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 hover:bg-purple-200"
                  >
                    {STATUS_FILTERS.find((f) => f.value === currentStatus)?.label}
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {currentStyle && (
                  <button
                    type="button"
                    onClick={() => handleStyleChange('')}
                    className="flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 hover:bg-purple-200"
                  >
                    {STYLE_FILTERS.find((f) => f.value === currentStyle)?.label}
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {currentModeration && (
                  <button
                    type="button"
                    onClick={() => handleModerationChange('')}
                    className="flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 hover:bg-purple-200"
                  >
                    {MODERATION_FILTERS.find((f) => f.value === currentModeration)?.label}
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {activeFilterCount > 1 && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {/* Creations List */}
            <AICreationsList
              creations={creations}
              isLoading={isLoading}
              error={error}
              onDelete={handleDelete}
              onAddToCart={handleAddToCart}
            />

            {/* Pagination */}
            {!isLoading && !error && pagination.totalPages > 1 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                hasNextPage={pagination.hasNextPage}
                hasPreviousPage={pagination.hasPreviousPage}
                onPageChange={handlePageChange}
                activeClassName="border-purple-500 bg-purple-500 text-white"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
