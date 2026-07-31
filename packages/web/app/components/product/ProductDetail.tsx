/**
 * ProductDetail Component
 *
 * Main product detail display with image gallery, size/frame selectors,
 * pricing, and add-to-cart functionality.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState, useMemo, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  ShoppingCart,
  Star,
  Sparkles,
  Truck,
  Shield,
  RotateCcw,
  Palette,
} from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { useCartStore } from '~/stores/cart'
import { SizeSelector, type SizeVariant } from './SizeSelector'
import { FrameSelector, calculateFramePrice, type FrameOptionData } from './FrameSelector'

// ============================================================================
// Types
// ============================================================================

import { mainImage, type ProductImage } from '@chobii/shared'
export type { ProductImage }

export interface ProductDetailData {
  /** Product ID */
  id: string
  /** SKU */
  sku: string
  /** Product title */
  title: string
  /** URL slug */
  slug: string
  /** Rich description */
  description: string
  /** Short description */
  shortDescription?: string
  /** Product images */
  images: ProductImage[]
  /** Size variants */
  variants: SizeVariant[]
  /** Available frame options */
  frames?: FrameOptionData[]
  /** Orientation */
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  /** Styles */
  styles?: string[]
  /** Subjects */
  subjects?: string[]
  /** Primary color */
  primaryColor?: string
  /** Room suggestions */
  roomSuggestions?: string[]
  /** Artist info */
  artist?: {
    id: string
    name: string
    slug?: string
  }
  /** Rating info */
  rating?: {
    averageRating: number
    reviewCount: number
  }
  /** Is featured */
  isFeatured?: boolean
  /** Is AI generated */
  isAiGenerated?: boolean
  /** SEO title */
  seoTitle?: string
  /** SEO description */
  seoDescription?: string
}

export interface ProductDetailProps {
  /** Product data */
  product: ProductDetailData
  /** Optional className */
  className?: string
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ProductDetail - Full product page component with all selection options
 */
export function ProductDetail({ product, className }: ProductDetailProps) {
  // State for selections
  const [selectedVariant, setSelectedVariant] = useState<SizeVariant | null>(
    product.variants.find((v) => v.isAvailable) || null
  )
  const [selectedFrame, setSelectedFrame] = useState<FrameOptionData | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)

  // Cart store
  const addItem = useCartStore((state) => state.addItem)

  // Calculate total price
  const totalPrice = useMemo(() => {
    if (!selectedVariant) return 0

    const basePrice = typeof selectedVariant.price === 'string'
      ? parseFloat(selectedVariant.price)
      : selectedVariant.price

    let total = basePrice

    if (selectedFrame) {
      const frameAddition = calculateFramePrice(
        basePrice,
        selectedFrame.priceModifierType,
        selectedFrame.priceModifierValue
      )
      total += frameAddition
    }

    return total
  }, [selectedVariant, selectedFrame])

  // Handle add to cart
  const handleAddToCart = useCallback(() => {
    if (!selectedVariant) return

    const basePrice = typeof selectedVariant.price === 'string'
      ? parseFloat(selectedVariant.price)
      : selectedVariant.price

    let framePrice = 0
    if (selectedFrame) {
      framePrice = calculateFramePrice(
        basePrice,
        selectedFrame.priceModifierType,
        selectedFrame.priceModifierValue
      )
    }

    const primaryImage = mainImage(product.images)

    addItem({
      productId: product.id,
      variantId: selectedVariant.id,
      frameId: selectedFrame?.id || null,
      quantity,
      productTitle: product.title,
      productSlug: product.slug,
      thumbnailUrl: primaryImage?.url || '',
      sizeLabel: selectedVariant.sizeLabel,
      widthInches: selectedVariant.widthInches,
      heightInches: selectedVariant.heightInches,
      unitPrice: basePrice,
      framePrice,
      frameName: selectedFrame?.name,
      frameType: selectedFrame?.type,
      isAiGenerated: product.isAiGenerated,
    })
  }, [selectedVariant, selectedFrame, quantity, product, addItem])

  // Image navigation
  const handlePrevImage = useCallback(() => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? product.images.length - 1 : prev - 1
    )
  }, [product.images.length])

  const handleNextImage = useCallback(() => {
    setCurrentImageIndex((prev) =>
      prev === product.images.length - 1 ? 0 : prev + 1
    )
  }, [product.images.length])

  // Get primary image
  const currentImage = product.images[currentImageIndex] || product.images[0]

  return (
    <div className={cn('', className)}>
      <div className="container-wide py-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left Column - Image Gallery */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
              {currentImage?.url ? (
                <img
                  src={currentImage.url}
                  alt={currentImage.altText || product.title}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Palette className="h-24 w-24 text-muted-foreground/30" />
                </div>
              )}

              {/* Image Navigation Arrows */}
              {product.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur-sm transition-all hover:bg-background"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur-sm transition-all hover:bg-background"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Badges */}
              <div className="absolute left-3 top-3 flex flex-col gap-2">
                {product.isFeatured && (
                  <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-medium text-white">
                    Featured
                  </span>
                )}
                {product.isAiGenerated && (
                  <span className="flex items-center gap-1 rounded-full bg-purple-500 px-2.5 py-1 text-xs font-medium text-white">
                    <Sparkles className="h-3 w-3" />
                    AI Generated
                  </span>
                )}
              </div>
            </div>

            {/* Thumbnail Gallery */}
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setCurrentImageIndex(index)}
                    className={cn(
                      'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-all',
                      index === currentImageIndex
                        ? 'border-brand-500'
                        : 'border-transparent hover:border-brand-300'
                    )}
                  >
                    <img
                      src={image.url}
                      alt={image.altText || `Product image ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column - Product Info */}
          <div className="space-y-6">
            {/* Header */}
            <div>
              {/* Styles */}
              {product.styles && product.styles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {product.styles.map((style) => (
                    <span
                      key={style}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-xs capitalize text-muted-foreground"
                    >
                      {style.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {product.title}
              </h1>

              {/* Artist */}
              {product.artist && (
                <p className="mt-1 text-sm text-muted-foreground">
                  by <span className="font-medium text-foreground">{product.artist.name}</span>
                </p>
              )}

              {/* Rating */}
              {product.rating && product.rating.reviewCount > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">
                      {product.rating.averageRating.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    ({product.rating.reviewCount} reviews)
                  </span>
                </div>
              )}

              {/* SKU */}
              <p className="mt-2 text-xs text-muted-foreground">SKU: {product.sku}</p>
            </div>

            {/* Price Display */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {formatPrice(totalPrice)}
                </span>
                {selectedFrame && (
                  <span className="text-sm text-muted-foreground">
                    (includes frame)
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Price varies by size and frame selection
              </p>
            </div>

            {/* Size Selector */}
            <SizeSelector
              variants={product.variants}
              selectedVariantId={selectedVariant?.id || null}
              onVariantSelect={setSelectedVariant}
            />

            {/* Frame Selector */}
            {product.frames && product.frames.length > 0 && selectedVariant && (
              <FrameSelector
                frames={product.frames}
                selectedFrameId={selectedFrame?.id || null}
                onFrameSelect={setSelectedFrame}
                basePrice={
                  typeof selectedVariant.price === 'string'
                    ? parseFloat(selectedVariant.price)
                    : selectedVariant.price
                }
              />
            )}

            {/* Quantity and Add to Cart */}
            <div className="space-y-4">
              {/* Quantity Selector */}
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-foreground">Quantity</label>
                <div className="flex items-center rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 text-foreground hover:bg-muted disabled:opacity-50"
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <span className="min-w-[3rem] text-center text-sm font-medium">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="px-3 py-2 text-foreground hover:bg-muted"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!selectedVariant}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all',
                    selectedVariant
                      ? 'bg-brand-500 text-white hover:bg-brand-600'
                      : 'cursor-not-allowed bg-muted text-muted-foreground'
                  )}
                >
                  <ShoppingCart className="h-5 w-5" />
                  Add to Cart
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                  aria-label="Add to wishlist"
                >
                  <Heart className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                  aria-label="Share product"
                >
                  <Share2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-3 gap-4 border-t border-border pt-6">
              <div className="flex flex-col items-center text-center">
                <Truck className="mb-2 h-6 w-6 text-brand-500" />
                <span className="text-xs font-medium text-foreground">Free Shipping</span>
                <span className="text-xs text-muted-foreground">Orders over ₹999</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <Shield className="mb-2 h-6 w-6 text-brand-500" />
                <span className="text-xs font-medium text-foreground">Secure Payment</span>
                <span className="text-xs text-muted-foreground">100% Protected</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <RotateCcw className="mb-2 h-6 w-6 text-brand-500" />
                <span className="text-xs font-medium text-foreground">Easy Returns</span>
                <span className="text-xs text-muted-foreground">30-day policy</span>
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <div className="border-t border-border pt-6">
                <h2 className="mb-3 text-lg font-semibold text-foreground">Description</h2>
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}

            {/* Room Suggestions */}
            {product.roomSuggestions && product.roomSuggestions.length > 0 && (
              <div className="border-t border-border pt-6">
                <h2 className="mb-3 text-lg font-semibold text-foreground">Perfect For</h2>
                <div className="flex flex-wrap gap-2">
                  {product.roomSuggestions.map((room) => (
                    <span
                      key={room}
                      className="rounded-full border border-border bg-background px-3 py-1 text-sm capitalize text-foreground"
                    >
                      {room.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ProductDetail skeleton for loading states
 */
export function ProductDetailSkeleton() {
  return (
    <div className="container-wide py-6 lg:py-10">
      <div className="grid animate-pulse gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Left Column */}
        <div className="space-y-4">
          <div className="aspect-square rounded-lg bg-muted" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 w-16 rounded-md bg-muted" />
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-8 w-3/4 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>

          <div className="h-20 rounded-lg bg-muted" />

          <div className="space-y-3">
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted" />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted" />
              ))}
            </div>
          </div>

          <div className="h-12 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  )
}

export default ProductDetail
