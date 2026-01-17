/**
 * Admin Products List Page - MasonArt E-commerce Platform
 *
 * Products management page with:
 * - Product listing with TanStack Table
 * - Filtering by status and search
 * - Bulk actions (archive, delete)
 * - Links to create/edit products
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useEffect, useState, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import {
  Plus,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { getApiUrl } from '~/lib/utils'
import { ProductsTable, ProductsTableSkeleton, type AdminProduct } from '~/components/admin/ProductsTable'

// ============================================================================
// Route Configuration
// ============================================================================

const searchParamsSchema = z.object({
  page: z.coerce.number().positive().optional().default(1),
  pageSize: z.coerce.number().positive().max(100).optional().default(20),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'basePrice', 'sku']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

type SearchParams = z.infer<typeof searchParamsSchema>

export const Route = createFileRoute('/admin/products/')({
  validateSearch: (search) => searchParamsSchema.parse(search),
  head: () => ({
    meta: [
      { title: 'Products | Admin | MasonArt' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminProductsPage,
})

// ============================================================================
// Types
// ============================================================================

interface PaginatedResponse {
  items: AdminProduct[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchProducts(params: SearchParams): Promise<PaginatedResponse> {
  const queryParams = new URLSearchParams()

  queryParams.set('page', String(params.page))
  queryParams.set('pageSize', String(params.pageSize))
  queryParams.set('sortBy', params.sortBy)
  queryParams.set('sortOrder', params.sortOrder)

  if (params.status) {
    queryParams.set('status', params.status)
  }

  if (params.search) {
    queryParams.set('search', params.search)
  }

  const response = await fetch(
    `${getApiUrl()}/api/admin/products?${queryParams.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch products')
  }

  return response.json()
}

async function archiveProduct(id: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/products/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to archive product')
  }
}

// ============================================================================
// Component
// ============================================================================

function AdminProductsPage() {
  const navigate = useNavigate()
  const searchParams = Route.useSearch()

  const [products, setProducts] = useState<AdminProduct[]>([])
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch products
  const loadProducts = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchProducts(searchParams)
      setProducts(data.items)
      setPagination({
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        hasPreviousPage: data.hasPreviousPage,
      })
    } catch (err) {
      setError('Failed to load products. Please try again.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [searchParams])

  useEffect(() => {
    setIsLoading(true)
    loadProducts()
  }, [loadProducts])

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true)
    loadProducts()
  }

  // Update URL params
  const updateSearch = (updates: Partial<SearchParams>) => {
    navigate({
      to: '/admin/products',
      search: (prev: SearchParams) => ({
        ...prev,
        ...updates,
        page: updates.page || (updates.status !== undefined || updates.search !== undefined ? 1 : prev.page),
      }),
    })
  }

  // Navigation handlers
  const handleCreateProduct = () => {
    navigate({ to: '/admin/products/new' })
  }

  const handleEditProduct = (product: AdminProduct) => {
    navigate({
      to: '/admin/products/$id',
      params: { id: product.id },
    })
  }

  const handleViewProduct = (product: AdminProduct) => {
    navigate({
      to: '/admin/products/$id',
      params: { id: product.id },
    })
  }

  // Archive handler
  const handleArchiveProduct = async (product: AdminProduct) => {
    if (!confirm(`Are you sure you want to archive "${product.title}"?`)) {
      return
    }

    try {
      await archiveProduct(product.id)
      loadProducts()
    } catch (err) {
      setError('Failed to archive product. Please try again.')
    }
  }

  // Delete handler (same as archive for soft delete)
  const handleDeleteProduct = async (product: AdminProduct) => {
    if (
      !confirm(
        `Are you sure you want to delete "${product.title}"? This action will archive the product.`
      )
    ) {
      return
    }

    try {
      await archiveProduct(product.id)
      loadProducts()
    } catch (err) {
      setError('Failed to delete product. Please try again.')
    }
  }

  // Bulk archive
  const handleBulkArchive = async (selectedProducts: AdminProduct[]) => {
    if (
      !confirm(
        `Are you sure you want to archive ${selectedProducts.length} products?`
      )
    ) {
      return
    }

    try {
      await Promise.all(selectedProducts.map((p) => archiveProduct(p.id)))
      loadProducts()
    } catch (err) {
      setError('Failed to archive some products. Please try again.')
    }
  }

  // Bulk delete (same as archive)
  const handleBulkDelete = handleBulkArchive

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your product catalog ({pagination.total} total)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Create Button */}
          <button
            onClick={handleCreateProduct}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-sm font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Products Table */}
      {isLoading && !isRefreshing ? (
        <ProductsTableSkeleton />
      ) : (
        <ProductsTable
          products={products}
          isLoading={isRefreshing}
          onEdit={handleEditProduct}
          onDelete={handleDeleteProduct}
          onView={handleViewProduct}
          onArchive={handleArchiveProduct}
          onBulkDelete={handleBulkDelete}
          onBulkArchive={handleBulkArchive}
        />
      )}

      {/* Pagination */}
      {!isLoading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          {/* Page Info */}
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>

          {/* Page Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSearch({ page: pagination.page - 1 })}
              disabled={!pagination.hasPreviousPage}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => updateSearch({ page: pagination.page + 1 })}
              disabled={!pagination.hasNextPage}
              className="flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminProductsPage
