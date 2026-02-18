/**
 * OptimizedImage Component
 *
 * Renders responsive images with WebP support and lazy loading.
 * Uses <picture> element for WebP with fallback to original format.
 * Generates srcSet for responsive sizes when variants are available.
 */

import { cn } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ImageVariant {
  name: string
  width: number
  url: string
}

export interface OptimizedImageProps {
  /** Original image URL (JPEG/PNG fallback) */
  src: string
  /** WebP version URL (if available) */
  webpSrc?: string
  /** Alt text for accessibility */
  alt: string
  /** Responsive variants for srcSet */
  variants?: ImageVariant[]
  /** CSS class name */
  className?: string
  /** Image width (for aspect ratio) */
  width?: number
  /** Image height (for aspect ratio) */
  height?: number
  /** Loading strategy - defaults to "lazy" */
  loading?: 'lazy' | 'eager'
  /** Responsive sizes attribute for <img> */
  sizes?: string
  /** Fetch priority for critical images */
  fetchPriority?: 'high' | 'low' | 'auto'
}

// ============================================================================
// Component
// ============================================================================

export function OptimizedImage({
  src,
  webpSrc,
  alt,
  variants,
  className,
  width,
  height,
  loading = 'lazy',
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  fetchPriority,
}: OptimizedImageProps) {
  // Build WebP srcSet from variants (sorted by width ascending)
  const webpSrcSet = variants
    ?.sort((a, b) => a.width - b.width)
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ')

  // If we have webp source or variants, use <picture> for format negotiation
  if (webpSrc || webpSrcSet) {
    return (
      <picture>
        {/* WebP source with responsive variants */}
        <source
          type="image/webp"
          srcSet={webpSrcSet ? `${webpSrcSet}${webpSrc ? `, ${webpSrc} ${width || 1200}w` : ''}` : webpSrc}
          sizes={webpSrcSet ? sizes : undefined}
        />
        {/* Fallback to original format */}
        <img
          src={src}
          alt={alt}
          className={cn('', className)}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
        />
      </picture>
    )
  }

  // No WebP available - render standard img with lazy loading
  return (
    <img
      src={src}
      alt={alt}
      className={cn('', className)}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
    />
  )
}

export default OptimizedImage
