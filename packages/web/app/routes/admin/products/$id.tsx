/**
 * Admin Edit Product Page - chobii.art E-commerce Platform
 *
 * Page for editing an existing product with:
 * - Loading product data
 * - Product form with all fields
 * - API integration for updates
 * - Success/error handling
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import type { ProductImage } from '@chobii/shared'
import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { getApiUrl, formatPrice } from '~/lib/utils'
import {
  ProductForm,
  ProductFormSkeleton,
  type ProductFormData,
  type ProductVariant,
} from '~/components/admin/ProductForm'
import { useConfirmDialog } from '~/components/admin/useConfirm'
import { ADMIN_PRODUCTS_SEARCH } from '~/lib/admin-nav'

// ============================================================================
// Route Configuration
// ============================================================================

export const Route = createFileRoute('/admin/products/$id')({
  head: () => ({
    meta: [
      { title: 'Edit Product | Admin | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: EditProductPage,
})

// ============================================================================
// Types
// ============================================================================

interface ProductWithVariants {
  id: string
  sku: string
  title: string
  slug: string
  description: string | null
  basePrice: string
  styles: string[]
  subjects: string[]
  colors: string[]
  rooms: string[]
  tags: string[]
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  images: ProductImage[]
  seoTitle: string | null
  seoDescription: string | null
  status: 'draft' | 'active' | 'archived'
  isFeatured: boolean
  featuredOrder: number | null
  isPopular: boolean
  popularOrder: number | null
  isAiGenerated: boolean
  createdAt: string
  updatedAt: string
  variants: Array<{
    id: string
    sizeLabel: string
    widthInches: number
    heightInches: number
    widthCm: number | null
    heightCm: number | null
    price: string
    stockQuantity: number
    lowStockThreshold: number
    isInStock: boolean
    variantSku: string | null
    sortOrder: number
    isActive: boolean
  }>
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchProduct(id: string): Promise<ProductWithVariants> {
  const response = await fetch(`${getApiUrl()}/api/admin/products/${id}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Product not found')
    }
    throw new Error('Failed to fetch product')
  }

  return response.json()
}

async function updateProduct(
  id: string,
  data: Partial<ProductFormData>
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/admin/products/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sku: data.sku,
      title: data.title,
      slug: data.slug,
      description: data.description || null,
      basePrice: data.basePrice,
      styles: data.styles,
      subjects: data.subjects,
      colors: data.colors,
      rooms: data.rooms,
      tags: data.tags,
      orientation: data.orientation,
      images: data.images?.filter((img) => img.url) || [],
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      status: data.status,
      isFeatured: data.isFeatured,
      featuredOrder: data.featuredOrder,
      isPopular: data.isPopular,
      popularOrder: data.popularOrder,
      isAiGenerated: data.isAiGenerated,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update product')
  }
}

async function createVariant(
  productId: string,
  variant: ProductVariant
): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/products/${productId}/variants`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sizeLabel: variant.sizeLabel,
        widthInches: variant.widthInches,
        heightInches: variant.heightInches,
        widthCm: variant.widthCm,
        heightCm: variant.heightCm,
        price: variant.price,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold: variant.lowStockThreshold,
        isInStock: variant.isInStock,
        variantSku: variant.variantSku,
        sortOrder: variant.sortOrder,
        isActive: variant.isActive,
      }),
    }
  )

  if (!response.ok) {
    throw new Error('Failed to create variant')
  }
}

async function updateVariant(
  productId: string,
  variantId: string,
  variant: Partial<ProductVariant>
): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/products/${productId}/variants/${variantId}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sizeLabel: variant.sizeLabel,
        widthInches: variant.widthInches,
        heightInches: variant.heightInches,
        widthCm: variant.widthCm,
        heightCm: variant.heightCm,
        price: variant.price,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold: variant.lowStockThreshold,
        isInStock: variant.isInStock,
        variantSku: variant.variantSku,
        sortOrder: variant.sortOrder,
        isActive: variant.isActive,
      }),
    }
  )

  if (!response.ok) {
    throw new Error('Failed to update variant')
  }
}

async function deleteVariant(productId: string, variantId: string): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/api/admin/products/${productId}/variants/${variantId}`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to delete variant')
  }
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

function EditProductPage() {
  const navigate = useNavigate()
  const { id } = Route.useParams()
  const { confirmAction, dialog } = useConfirmDialog()

  const [product, setProduct] = useState<ProductWithVariants | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // Fetch product data
  useEffect(() => {
    async function loadProduct() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchProduct(id)
        setProduct(data)
      } catch (err) {
        if (err instanceof Error && err.message === 'Product not found') {
          setNotFound(true)
        } else {
          setError('Failed to load product. Please try again.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadProduct()
  }, [id])

  // Handle form submission
  const handleSubmit = async (data: ProductFormData) => {
    if (!product) return

    try {
      setError(null)

      // Update the product
      await updateProduct(id, data)

      // Handle variants
      const existingVariantIds = product.variants.map((v) => v.id)
      const newVariants = data.variants.filter((v) => !v.id)
      const updatedVariants = data.variants.filter(
        (v) => v.id && existingVariantIds.includes(v.id)
      )
      const deletedVariantIds = existingVariantIds.filter(
        (vid) => !data.variants.some((v) => v.id === vid)
      )

      // Create new variants
      await Promise.all(
        newVariants
          .filter((v) => v.sizeLabel && v.price)
          .map((v) => createVariant(id, v))
      )

      // Update existing variants
      await Promise.all(
        updatedVariants
          .filter((v) => v.id)
          .map((v) => updateVariant(id, v.id!, v))
      )

      // Delete removed variants
      await Promise.all(deletedVariantIds.map((vid) => deleteVariant(id, vid)))

      setSuccess(true)

      // Hide success message and refresh data after a short delay
      setTimeout(() => {
        setSuccess(false)
        // Refresh product data
        fetchProduct(id)
          .then(setProduct)
          .catch(() => {})
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product')
      throw err
    }
  }

  // Handle cancel
  const handleCancel = () => {
    navigate({ to: '/admin/products', search: ADMIN_PRODUCTS_SEARCH })
  }

  // Handle archive
  const handleArchive = async () => {
    if (!product) return

    const confirmed = await confirmAction({
      title: 'Archive this product?',
      body: `"${product.title}" is hidden from the store. Existing orders keep it.`,
      confirmLabel: 'Archive product',
      destructive: true,
    })

    if (!confirmed) return

    try {
      await archiveProduct(id)
      navigate({ to: '/admin/products', search: ADMIN_PRODUCTS_SEARCH })
    } catch (err) {
      setError('Failed to archive product. Please try again.')
    }
  }

  // Not found state
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="mt-6 text-xl text-foreground">
          Product Not Found
        </h2>
        <p className="mt-2 text-muted-foreground">
          The product you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <button
          onClick={() => navigate({ to: '/admin/products', search: ADMIN_PRODUCTS_SEARCH })}
          className="mt-6 flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-sm font-medium text-white hover:bg-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </button>
      </div>
    )
  }

  // Convert product data to form data
  const initialFormData: Partial<ProductFormData> | undefined = product
    ? {
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description || '',
        basePrice: product.basePrice,
        styles: product.styles || [],
        subjects: product.subjects || [],
        colors: product.colors || [],
        rooms: product.rooms || [],
        tags: product.tags || [],
        orientation: product.orientation,
        images: product.images || [],
        seoTitle: product.seoTitle || '',
        seoDescription: product.seoDescription || '',
        status: product.status,
        isFeatured: product.isFeatured,
        featuredOrder: product.featuredOrder,
        isPopular: product.isPopular ?? false,
        popularOrder: product.popularOrder ?? null,
        isAiGenerated: product.isAiGenerated,
        variants: product.variants.map((v) => ({
          id: v.id,
          sizeLabel: v.sizeLabel,
          widthInches: v.widthInches,
          heightInches: v.heightInches,
          widthCm: v.widthCm || undefined,
          heightCm: v.heightCm || undefined,
          price: v.price,
          stockQuantity: v.stockQuantity,
          lowStockThreshold: v.lowStockThreshold,
          isInStock: v.isInStock,
          variantSku: v.variantSku || undefined,
          sortOrder: v.sortOrder,
          isActive: v.isActive,
        })),
      }
    : undefined

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-medium text-foreground sm:text-3xl">
              {isLoading ? 'Loading...' : product?.title || 'Edit Product'}
            </h1>
            {product && (
              <p className="mt-1 text-sm text-muted-foreground">
                SKU: {product.sku} • {formatPrice(parseFloat(product.basePrice))}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        {product && (
          <div className="flex items-center gap-2">
            {/* View in Store */}
            <a
              href={`/posters/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View in Store</span>
            </a>

            {/* Archive */}
            {product.status !== 'archived' && (
              <button
                onClick={handleArchive}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Archive</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Success Banner */}
      {success && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">Product updated successfully!</p>
        </div>
      )}

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

      {/* Product Form */}
      {isLoading ? (
        <ProductFormSkeleton />
      ) : (
        <ProductForm
          initialData={initialFormData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isEditing
        />
      )}

      {/* Archive asks here, in the page (#625). */}
      {dialog}
    </div>
  )
}

export default EditProductPage
