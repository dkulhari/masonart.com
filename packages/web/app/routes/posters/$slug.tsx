/**
 * Product Detail Page (Single Slug Route)
 *
 * Handles URLs like /posters/dream-big (without category)
 * Fetches product by slug and renders the detail page.
 */

import { createFileRoute, notFound } from '@tanstack/react-router'
import { productsApi } from '~/lib/api'
import {
  ProductDetail,
  ProductDetailSkeleton,
  type ProductDetailData,
  type ProductImage,
} from '~/components/product/ProductDetail'
import { ProductReviews, ProductReviewsSkeleton } from '~/components/product/ProductReviews'
import type { SizeVariant } from '~/components/product/SizeSelector'
import type { FrameOptionData } from '~/components/product/FrameSelector'

// ============================================================================
// Types
// ============================================================================

interface ProductApiResponse {
  id: string
  sku: string
  title: string
  slug: string
  description: string
  shortDescription?: string
  images: Array<{
    id: string
    url: string
    alt?: string
    type?: string
    isPrimary?: boolean
  }>
  variants: Array<{
    id: string
    sizeId?: string
    sizeLabel: string
    widthInches: number
    heightInches: number
    price: string | number
    stockQuantity: number
    isInStock: boolean
    variantSku?: string
  }>
  frames?: Array<{
    id: string
    type: string
    name: string
    description: string
    material?: string
    imageUrl?: string
    priceModifier: string
    priceAddition: string
  }>
  orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round'
  styles?: string[]
  subjects?: string[]
  primaryColor?: string
  rooms?: string[]
  artist?: {
    id: string
    name: string
    slug?: string
  }
  rating?: {
    averageRating: number
    reviewCount: number
  }
  isFeatured?: boolean
  isAiGenerated?: boolean
  seoTitle?: string
  seoDescription?: string
  basePrice?: string | number
  minPrice?: number
  maxPrice?: number
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch product data by slug
 */
async function fetchProductData(slug: string): Promise<ProductDetailData | null> {
  try {
    const response = await productsApi.getBySlug(slug) as ProductApiResponse | null

    if (!response) {
      return null
    }

    // Transform API response to component data structure
    const product: ProductDetailData = {
      id: response.id,
      sku: response.sku,
      title: response.title,
      slug: response.slug,
      description: response.description,
      shortDescription: response.shortDescription,
      images: response.images.map((img): ProductImage => ({
        id: img.id,
        url: img.url,
        alt: img.alt,
        type: img.type as ProductImage['type'],
        isPrimary: img.isPrimary,
      })),
      variants: response.variants.map((v): SizeVariant => ({
        id: v.id,
        sizeId: v.sizeId || v.id,
        sizeLabel: v.sizeLabel,
        widthInches: v.widthInches,
        heightInches: v.heightInches,
        price: v.price,
        stockQuantity: v.stockQuantity,
        isAvailable: v.isInStock,
        sku: v.variantSku,
      })),
      frames: response.frames?.map((f): FrameOptionData => ({
        id: f.id,
        type: f.type,
        name: f.name,
        description: f.description,
        material: f.material,
        imageUrl: f.imageUrl,
        // API returns priceAddition as string in rupees, component expects fixed price in paise
        priceModifierType: 'fixed',
        priceModifierValue: parseFloat(f.priceAddition || '0') * 100,
        isAvailable: true,
      })),
      orientation: response.orientation,
      styles: response.styles,
      subjects: response.subjects,
      primaryColor: response.primaryColor,
      roomSuggestions: response.rooms,
      artist: response.artist,
      rating: response.rating,
      isFeatured: response.isFeatured,
      isAiGenerated: response.isAiGenerated,
      seoTitle: response.seoTitle,
      seoDescription: response.seoDescription,
    }

    return product
  } catch (error) {
    // Return null on error - will trigger 404
    return null
  }
}

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/posters/$slug')({
  loader: async ({ params }) => {
    const product = await fetchProductData(params.slug)

    if (!product) {
      throw notFound()
    }

    return { product }
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: 'Product Not Found | chobi.art' },
          { name: 'description', content: 'The product you are looking for could not be found.' },
        ],
      }
    }

    const { product } = loaderData
    const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0]

    // Calculate price range for display
    const prices = product.variants.map((v) =>
      typeof v.price === 'string' ? parseFloat(v.price) : v.price
    )
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceText = minPrice === maxPrice
      ? `₹${minPrice.toLocaleString('en-IN')}`
      : `₹${minPrice.toLocaleString('en-IN')} - ₹${maxPrice.toLocaleString('en-IN')}`

    const title = product.seoTitle || `${product.title} | chobi.art`
    const description = product.seoDescription ||
      product.shortDescription ||
      `Shop ${product.title} at chobi.art. ${priceText}. Premium quality poster available in multiple sizes and frames.`
    const productUrl = `https://chobi.art/posters/${product.slug}`
    const imageUrl = primaryImage?.url || 'https://chobi.art/og-default.jpg'
    const imageAlt = primaryImage?.alt || product.title

    // Build keywords from product attributes
    const keywords = [
      product.title,
      ...(product.styles || []),
      ...(product.subjects || []),
      'poster',
      'wall art',
      'chobi.art',
    ].filter(Boolean).join(', ')

    return {
      meta: [
        // Basic meta tags
        { title },
        { name: 'description', content: description },
        { name: 'keywords', content: keywords },
        { name: 'robots', content: 'index, follow' },

        // Open Graph meta tags
        { property: 'og:title', content: product.title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'product' },
        { property: 'og:url', content: productUrl },
        { property: 'og:site_name', content: 'chobi.art' },
        { property: 'og:image', content: imageUrl },
        { property: 'og:image:secure_url', content: imageUrl },
        { property: 'og:image:alt', content: imageAlt },
        { property: 'og:image:type', content: 'image/jpeg' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:locale', content: 'en_IN' },

        // Product-specific Open Graph tags
        { property: 'product:price:amount', content: String(minPrice) },
        { property: 'product:price:currency', content: 'INR' },
        { property: 'product:availability', content: product.variants.some(v => v.isAvailable) ? 'in stock' : 'out of stock' },
        { property: 'product:condition', content: 'new' },
        { property: 'product:brand', content: 'chobi.art' },
        ...(product.sku ? [{ property: 'product:retailer_item_id', content: product.sku }] : []),

        // Twitter Card meta tags
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@chobiart' },
        { name: 'twitter:creator', content: '@chobiart' },
        { name: 'twitter:title', content: product.title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: imageUrl },
        { name: 'twitter:image:alt', content: imageAlt },
        { name: 'twitter:label1', content: 'Price' },
        { name: 'twitter:data1', content: priceText },
        { name: 'twitter:label2', content: 'Availability' },
        { name: 'twitter:data2', content: product.variants.some(v => v.isAvailable) ? 'In Stock' : 'Out of Stock' },
      ],
      links: [
        {
          rel: 'canonical',
          href: productUrl,
        },
      ],
    }
  },
  component: ProductPage,
  pendingComponent: ProductPageLoading,
  notFoundComponent: ProductNotFound,
})

// ============================================================================
// Page Components
// ============================================================================

function ProductPage() {
  const { product } = Route.useLoaderData()

  return (
    <>
      {/* JSON-LD Structured Data */}
      <ProductJsonLd product={product} />

      {/* Breadcrumb */}
      <Breadcrumb product={product} />

      {/* Main Product Detail */}
      <ProductDetail product={product} />

      {/* Customer Reviews Section */}
      <ProductReviews productId={product.id} />

      {/* Related Products Section (placeholder) */}
      <RelatedProductsSection />
    </>
  )
}

function ProductPageLoading() {
  return (
    <>
      <div className="container-wide py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-12 animate-pulse rounded bg-muted" />
          <span>/</span>
          <span className="h-4 w-16 animate-pulse rounded bg-muted" />
          <span>/</span>
          <span className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <ProductDetailSkeleton />
      <ProductReviewsSkeleton />
    </>
  )
}

function ProductNotFound() {
  return (
    <div className="container-wide flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-2xl font-bold text-foreground">Product Not Found</h1>
      <p className="mt-2 text-muted-foreground">
        The product you are looking for could not be found or may have been removed.
      </p>
      <a
        href="/posters"
        className="mt-6 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
      >
        Browse All Products
      </a>
    </div>
  )
}

// ============================================================================
// Supporting Components
// ============================================================================

/**
 * Breadcrumb navigation
 */
function Breadcrumb({ product }: { product: ProductDetailData }) {
  const category = product.styles?.[0] || 'all'

  return (
    <nav className="container-wide py-4" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm">
        <li>
          <a href="/" className="text-muted-foreground hover:text-foreground">
            Home
          </a>
        </li>
        <li className="text-muted-foreground">/</li>
        <li>
          <a href="/posters" className="text-muted-foreground hover:text-foreground">
            Posters
          </a>
        </li>
        <li className="text-muted-foreground">/</li>
        <li>
          <a
            href={`/posters?styles=${category}`}
            className="text-muted-foreground hover:text-foreground capitalize"
          >
            {category.replace(/-/g, ' ')}
          </a>
        </li>
        <li className="text-muted-foreground">/</li>
        <li className="truncate font-medium text-foreground" aria-current="page">
          {product.title}
        </li>
      </ol>
    </nav>
  )
}

/**
 * JSON-LD structured data for SEO
 * Note: Uses dangerouslySetInnerHTML which is safe here as content is
 * generated from trusted API data, not user input.
 */
function ProductJsonLd({ product }: { product: ProductDetailData }) {
  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0]

  // Calculate price range
  const prices = product.variants.map((v) =>
    typeof v.price === 'string' ? parseFloat(v.price) : v.price
  )
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  // Check availability
  const hasAvailableVariants = product.variants.some((v) => v.isAvailable)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.shortDescription || product.description,
    image: product.images.map((img) => img.url),
    sku: product.sku,
    brand: {
      '@type': 'Brand',
      name: 'chobi.art',
    },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: minPrice,
      highPrice: maxPrice,
      priceCurrency: 'INR',
      availability: hasAvailableVariants
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'chobi.art',
      },
    },
    ...(product.rating && product.rating.reviewCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating.averageRating,
        reviewCount: product.rating.reviewCount,
      },
    }),
    ...(product.artist && {
      creator: {
        '@type': 'Person',
        name: product.artist.name,
      },
    }),
    ...(primaryImage && {
      image: primaryImage.url,
    }),
    url: `https://chobi.art/posters/${product.slug}`,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

/**
 * Related products section placeholder
 */
function RelatedProductsSection() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="container-wide py-12">
        <h2 className="mb-6 text-xl font-bold text-foreground">You May Also Like</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {/* Placeholder for related products - will be implemented with actual products */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[2/3] rounded-lg bg-muted" />
              <div className="mt-2 space-y-1">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
