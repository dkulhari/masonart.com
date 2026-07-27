/**
 * ProductJsonLd Component
 *
 * Generates Schema.org JSON-LD structured data for product pages.
 * This helps search engines understand product information and can
 * enable rich results in Google Search.
 *
 * Implements Schema.org Product type:
 * https://schema.org/Product
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { BRAND_NAME, BRAND_URL, SUPPORT_EMAIL } from '@chobii/shared'

// ============================================================================
// Types
// ============================================================================

/**
 * Product image data for JSON-LD
 */
export interface ProductJsonLdImage {
  id: string
  url: string
  alt?: string
  isPrimary?: boolean
}

/**
 * Product variant data for JSON-LD pricing
 */
export interface ProductJsonLdVariant {
  id: string
  sizeLabel: string
  widthInches: number
  heightInches: number
  price: string | number
  stockQuantity: number
  isAvailable: boolean
  sku?: string
}

/**
 * Artist/creator information for JSON-LD
 */
export interface ProductJsonLdArtist {
  id: string
  name: string
  slug?: string
}

/**
 * Product rating data for JSON-LD
 */
export interface ProductJsonLdRating {
  averageRating: number
  reviewCount: number
}

/**
 * Product data required for generating JSON-LD
 */
export interface ProductJsonLdData {
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
  images: ProductJsonLdImage[]
  /** Size variants */
  variants: ProductJsonLdVariant[]
  /** Artist info */
  artist?: ProductJsonLdArtist
  /** Rating info */
  rating?: ProductJsonLdRating
  /** Is AI generated */
  isAiGenerated?: boolean
  /** Product styles/categories */
  styles?: string[]
  /** Brand name override (defaults to chobii.art) */
  brandName?: string
  /** Product URL override */
  productUrl?: string
}

/**
 * Breadcrumb item for BreadcrumbList structured data
 */
export interface BreadcrumbItem {
  name: string
  url: string
}

export interface ProductJsonLdProps {
  /** Product data */
  product: ProductJsonLdData
  /** Base URL for the site (defaults to https://chobii.art) */
  baseUrl?: string
  /** Optional breadcrumb items for BreadcrumbList structured data */
  breadcrumbs?: BreadcrumbItem[]
  /** Whether to include Organization structured data */
  includeOrganization?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BASE_URL = BRAND_URL
const DEFAULT_BRAND_NAME = BRAND_NAME
const CURRENCY = 'INR'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse price to number from string or number
 */
function parsePrice(price: string | number): number {
  return typeof price === 'string' ? parseFloat(price) : price
}

/**
 * Calculate price range from variants
 */
function calculatePriceRange(variants: ProductJsonLdVariant[]): {
  lowPrice: number
  highPrice: number
} {
  const prices = variants.map((v) => parsePrice(v.price))
  return {
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
  }
}

/**
 * Check if any variants are available
 */
function hasAvailableVariants(variants: ProductJsonLdVariant[]): boolean {
  return variants.some((v) => v.isAvailable)
}

/**
 * Get primary image URL from images array
 */
function getPrimaryImageUrl(images: ProductJsonLdImage[]): string | undefined {
  const primary = images.find((img) => img.isPrimary)
  return primary?.url || images[0]?.url
}

/**
 * Get all image URLs from images array
 */
function getAllImageUrls(images: ProductJsonLdImage[]): string[] {
  return images.map((img) => img.url).filter(Boolean)
}

// ============================================================================
// JSON-LD Schema Builders
// ============================================================================

/**
 * Build Schema.org Product structured data
 */
function buildProductSchema(
  product: ProductJsonLdData,
  baseUrl: string
): Record<string, unknown> {
  const { lowPrice, highPrice } = calculatePriceRange(product.variants)
  const hasAvailable = hasAvailableVariants(product.variants)
  const primaryImage = getPrimaryImageUrl(product.images)
  const allImages = getAllImageUrls(product.images)
  const productUrl = product.productUrl || `${baseUrl}/posters/${product.slug}`
  const brandName = product.brandName || DEFAULT_BRAND_NAME

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.shortDescription || product.description,
    sku: product.sku,
    url: productUrl,
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: lowPrice,
      highPrice: highPrice,
      priceCurrency: CURRENCY,
      offerCount: product.variants.length,
      availability: hasAvailable
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: brandName,
      },
    },
  }

  // Add images
  if (allImages.length > 0) {
    schema.image = allImages.length === 1 ? allImages[0] : allImages
  }

  // Add primary image separately if there are multiple images
  // This ensures Google uses the primary image as the main product image
  if (primaryImage && allImages.length > 1) {
    schema.image = [primaryImage, ...allImages.filter((url) => url !== primaryImage)]
  }

  // Add aggregate rating if reviews exist
  if (product.rating && product.rating.reviewCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating.averageRating,
      reviewCount: product.rating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  // Add creator/artist information
  if (product.artist) {
    schema.creator = {
      '@type': 'Person',
      name: product.artist.name,
    }
  }

  // Add category based on styles
  if (product.styles && product.styles.length > 0) {
    // Use first style as primary category
    const firstStyle = product.styles[0]
    if (firstStyle) {
      schema.category = firstStyle.replace(/-/g, ' ')
    }
  }

  // Add additional type if AI generated
  if (product.isAiGenerated) {
    schema.additionalProperty = {
      '@type': 'PropertyValue',
      name: 'Generation Type',
      value: 'AI Generated',
    }
  }

  return schema
}

/**
 * Build Schema.org BreadcrumbList structured data
 */
function buildBreadcrumbSchema(
  breadcrumbs: BreadcrumbItem[],
  baseUrl: string
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`,
    })),
  }
}

/**
 * Build Schema.org Organization structured data
 */
function buildOrganizationSchema(baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: DEFAULT_BRAND_NAME,
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    sameAs: [
      'https://twitter.com/chobiiart',
      'https://instagram.com/chobiiart',
      'https://facebook.com/chobiiart',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: SUPPORT_EMAIL,
    },
  }
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ProductJsonLd - Renders JSON-LD structured data for products
 *
 * This component generates Schema.org structured data that helps search
 * engines understand product information. It can improve SEO and enable
 * rich results in Google Search.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ProductJsonLd product={productData} />
 *
 * // With breadcrumbs
 * <ProductJsonLd
 *   product={productData}
 *   breadcrumbs={[
 *     { name: 'Home', url: '/' },
 *     { name: 'Posters', url: '/posters' },
 *     { name: 'Abstract', url: '/posters?styles=abstract' },
 *     { name: productData.title, url: `/posters/${productData.slug}` },
 *   ]}
 * />
 *
 * // With custom base URL
 * <ProductJsonLd
 *   product={productData}
 *   baseUrl="https://custom-domain.com"
 * />
 * ```
 */
export function ProductJsonLd({
  product,
  baseUrl = DEFAULT_BASE_URL,
  breadcrumbs,
  includeOrganization = false,
}: ProductJsonLdProps) {
  // Build product schema
  const productSchema = buildProductSchema(product, baseUrl)

  // Build array of all schemas to include
  const schemas: Record<string, unknown>[] = [productSchema]

  // Add breadcrumb schema if provided
  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push(buildBreadcrumbSchema(breadcrumbs, baseUrl))
  }

  // Add organization schema if requested
  if (includeOrganization) {
    schemas.push(buildOrganizationSchema(baseUrl))
  }

  // If only one schema, render single script tag
  // If multiple schemas, render as array (supported by Google)
  const jsonLdContent = schemas.length === 1 ? schemas[0] : schemas

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdContent, null, 0) }}
    />
  )
}

// ============================================================================
// Standalone Schema Functions (for advanced use cases)
// ============================================================================

/**
 * Generate raw Product JSON-LD object (for custom rendering)
 */
export function generateProductJsonLd(
  product: ProductJsonLdData,
  baseUrl: string = DEFAULT_BASE_URL
): Record<string, unknown> {
  return buildProductSchema(product, baseUrl)
}

/**
 * Generate raw BreadcrumbList JSON-LD object (for custom rendering)
 */
export function generateBreadcrumbJsonLd(
  breadcrumbs: BreadcrumbItem[],
  baseUrl: string = DEFAULT_BASE_URL
): Record<string, unknown> {
  return buildBreadcrumbSchema(breadcrumbs, baseUrl)
}

/**
 * Generate raw Organization JSON-LD object (for custom rendering)
 */
export function generateOrganizationJsonLd(
  baseUrl: string = DEFAULT_BASE_URL
): Record<string, unknown> {
  return buildOrganizationSchema(baseUrl)
}

export default ProductJsonLd

// ============================================================================
// Standalone Schemas (#244 — home + listing pages)
// ============================================================================

/**
 * OrganizationJsonLd - site-wide Organization schema for the home page
 */
export function OrganizationJsonLd({
  baseUrl = DEFAULT_BASE_URL,
}: {
  baseUrl?: string
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildOrganizationSchema(baseUrl)),
      }}
    />
  )
}

export interface ItemListEntry {
  name: string
  slug: string
}

/**
 * ItemListJsonLd - ItemList schema for the /posters listing page
 */
export function ItemListJsonLd({
  items,
  baseUrl = DEFAULT_BASE_URL,
}: {
  items: ItemListEntry[]
  baseUrl?: string
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: `${baseUrl}/posters/${item.slug}`,
    })),
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
