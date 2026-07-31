/**
 * ProductCard Component
 *
 * Reusable product card for displaying products in grids and listings.
 * Shows product image, title, price, styles, and orientation-based aspect ratio.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Palette, Sparkles } from 'lucide-react'
import { cn, formatPrice } from '~/lib/utils'
import { OptimizedImage } from '~/components/ui/OptimizedImage'

// ============================================================================
// Types
// ============================================================================

// ProductImage now lives in @chobii/shared — one shape across api, web and db.
// Re-exported for the call-sites that imported it from here.
import { mainImage, type ProductImage } from '@chobii/shared'
export type { ProductImage }

export interface ProductCardData {
  id: string
  title: string
  slug: string
  basePrice: string
  images: ProductImage[]
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  styles?: string[]
  isFeatured?: boolean
  isAiGenerated?: boolean
}

export interface ProductCardProps {
  product: ProductCardData
  /** Whether to show the featured badge */
  showFeaturedBadge?: boolean
  /** Whether to show the AI badge */
  showAiBadge?: boolean
  /** Custom className for the card */
  className?: string
  /** Size variant for the card */
  size?: 'sm' | 'md' | 'lg'
  /** Override aspect ratio for uniform grid alignment */
  uniformAspectRatio?: 'aspect-square' | 'aspect-[3/4]' | 'aspect-[2/3]' | 'aspect-[3/2]' | 'aspect-video'
}

// ============================================================================
// Aspect Ratio Map
// ============================================================================

const ASPECT_RATIO_MAP: Record<string, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[2/3]',
  landscape: 'aspect-[3/2]',
  panoramic: 'aspect-video',
  round: 'aspect-square',
}

// ============================================================================
// Component
// ============================================================================

/**
 * ProductCard - Displays a product in a grid layout
 *
 * @example
 * <ProductCard
 *   product={product}
 *   showFeaturedBadge
 *   showAiBadge
 * />
 */
export function ProductCard({
  product,
  showFeaturedBadge = true,
  showAiBadge = true,
  className,
  size = 'md',
  uniformAspectRatio,
}: ProductCardProps) {
  const primaryImage = mainImage(product.images)
  const price = parseFloat(product.basePrice)
  const aspectRatioClass =
    uniformAspectRatio || ASPECT_RATIO_MAP[product.orientation] || ASPECT_RATIO_MAP.portrait

  // Size-based styling
  const sizeStyles = {
    sm: {
      padding: 'p-2 sm:p-3',
      title: 'text-xs sm:text-sm',
      price: 'text-xs sm:text-sm',
      styleText: 'text-[10px] sm:text-xs',
    },
    md: {
      padding: 'p-3 sm:p-4',
      title: 'text-sm sm:text-base',
      price: 'text-sm sm:text-base',
      styleText: 'text-xs',
    },
    lg: {
      padding: 'p-4 sm:p-5',
      title: 'text-base sm:text-lg',
      price: 'text-base sm:text-lg',
      styleText: 'text-xs sm:text-sm',
    },
  }

  const styles = sizeStyles[size]

  return (
    <a
      href={`/posters/${product.slug}`}
      className={cn('group block', className)}
    >
      <div className="card-hover overflow-hidden rounded-lg border border-border bg-card">
        {/* Image Container */}
        <div
          className={cn(
            'relative overflow-hidden bg-muted',
            aspectRatioClass
          )}
        >
          {primaryImage?.url ? (
            <OptimizedImage
              src={primaryImage.url}
              alt={primaryImage.altText || product.title}
              variants={primaryImage.variants}
              width={primaryImage.width}
              height={primaryImage.height}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Palette className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {/* Featured Badge */}
            {showFeaturedBadge && product.isFeatured && (
              <div className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-medium text-white">
                Featured
              </div>
            )}
            {/* AI Generated Badge */}
            {showAiBadge && product.isAiGenerated && (
              <div className="flex items-center gap-1 rounded-full bg-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                <Sparkles className="h-3 w-3" />
                AI
              </div>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className={styles.padding}>
          <h3
            className={cn(
              'line-clamp-1 font-medium text-foreground transition-colors group-hover:text-brand-600',
              styles.title
            )}
          >
            {product.title}
          </h3>

          {/* Style Tags */}
          {product.styles && product.styles.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {product.styles.slice(0, 2).map((style) => (
                <span
                  key={style}
                  className={cn(
                    'capitalize text-muted-foreground',
                    styles.styleText
                  )}
                >
                  {style.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {/* Price */}
          <p
            className={cn(
              'mt-2 font-semibold text-foreground',
              styles.price
            )}
          >
            From {formatPrice(price)}
          </p>
        </div>
      </div>
    </a>
  )
}

/**
 * ProductCardSkeleton - Loading skeleton for product cards
 */
export function ProductCardSkeleton({
  className,
}: {
  className?: string
}) {
  return (
    <div className={cn('animate-pulse', className)}>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Image Skeleton */}
        <div className="aspect-[2/3] bg-muted" />

        {/* Content Skeleton */}
        <div className="space-y-2 p-3 sm:p-4">
          {/* Title */}
          <div className="h-4 w-3/4 rounded bg-muted" />
          {/* Style Tags */}
          <div className="flex gap-1">
            <div className="h-3 w-12 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
          {/* Price */}
          <div className="h-4 w-1/3 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

export default ProductCard
