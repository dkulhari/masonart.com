/**
 * Admin New Product Page - MasonArt E-commerce Platform
 *
 * Page for creating a new product with:
 * - Product form with all fields
 * - API integration for creation
 * - Success/error handling
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react'
import { getApiUrl } from '~/lib/utils'
import { ProductForm, type ProductFormData } from '~/components/admin/ProductForm'

// ============================================================================
// Route Configuration
// ============================================================================

export const Route = createFileRoute('/admin/products/new')({
  head: () => ({
    meta: [
      { title: 'New Product | Admin | MasonArt' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: NewProductPage,
})

// ============================================================================
// API Functions
// ============================================================================

async function createProduct(data: ProductFormData): Promise<{ id: string }> {
  const response = await fetch(`${getApiUrl()}/api/admin/products`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sku: data.sku,
      title: data.title,
      slug: data.slug,
      description: data.description || undefined,
      basePrice: data.basePrice,
      styles: data.styles,
      subjects: data.subjects,
      colors: data.colors,
      rooms: data.rooms,
      tags: data.tags,
      orientation: data.orientation,
      images: data.images.filter((img) => img.url), // Only include images with URLs
      seoTitle: data.seoTitle || undefined,
      seoDescription: data.seoDescription || undefined,
      status: data.status,
      isFeatured: data.isFeatured,
      featuredOrder: data.featuredOrder,
      isAiGenerated: data.isAiGenerated,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create product')
  }

  const result = await response.json()
  return { id: result.product.id }
}

async function createVariant(
  productId: string,
  variant: ProductFormData['variants'][0]
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

// ============================================================================
// Component
// ============================================================================

function NewProductPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Handle form submission
  const handleSubmit = async (data: ProductFormData) => {
    try {
      setError(null)

      // Create the product
      const { id } = await createProduct(data)

      // Create variants if any
      if (data.variants.length > 0) {
        await Promise.all(
          data.variants
            .filter((v) => v.sizeLabel && v.price)
            .map((variant) => createVariant(id, variant))
        )
      }

      setSuccess(true)

      // Redirect to products list after a short delay
      setTimeout(() => {
        navigate({ to: '/admin/products' })
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product')
      throw err // Re-throw to keep form in submitting state
    }
  }

  // Handle cancel
  const handleCancel = () => {
    navigate({ to: '/admin/products' })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleCancel}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            New Product
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a new product to your catalog
          </p>
        </div>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">Product created successfully! Redirecting...</p>
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
      <ProductForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isEditing={false}
      />
    </div>
  )
}

export default NewProductPage
