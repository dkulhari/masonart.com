/**
 * Product Detail Page (Single Slug Route)
 *
 * Handles URLs like /posters/dream-big (without category)
 * Fetches product by slug and renders the detail page.
 */

import { createFileRoute, notFound } from '@tanstack/react-router'
import { productsApi, toFeaturedProducts } from '~/lib/api'
import { mainImage, type ProductImage } from '@chobii/shared'
import type { ProductCardData } from '~/components/product/ProductCard'
import { ProductCarousel } from '~/components/product/ProductCarousel'
import { ProductTabs } from '~/components/product/ProductTabs'
import {
  ProductDetail,
  ProductDetailSkeleton,
  type ProductDetailData,
} from '~/components/product/ProductDetail'
import {
  ProductReviewSection,
  ProductReviewSectionSkeleton,
} from '~/components/product/ProductReviewSection'
import type { SizeVariant } from '~/components/product/SizeSelector'
import type { FrameOptionData } from '~/components/product/FrameSelector'
import type { SalePricing } from '~/components/product/SalePrice'

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
  images: ProductImage[]
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
    thumbnailUrl?: string | null
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
  /**
   * The resolved sale, or null when nothing discounts this poster (#428).
   *
   * Passed through untouched. `locked` already accounts for the viewer's
   * membership, because the endpoint resolves it against the session — the
   * page never decides who the viewer is.
   */
  sale?: SalePricing | null
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
      images: response.images,
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
        imageUrl: f.thumbnailUrl || f.imageUrl,
        /**
         * A percentage of the piece, not a flat fee (#420). A moulding for a
         * 12x16 and one for a 60x80 are not the same amount of timber, so the
         * frames carry `priceModifier` — 1.40 meaning "the piece plus 40%" —
         * and `priceAddition` is 0. Reading the flat field here would have
         * quoted every frame at zero while the quickview charged correctly.
         */
        priceModifierType: 'percentage',
        priceModifierValue: Math.max(
          0,
          (parseFloat(f.priceModifier || '1') - 1) * 100
        ),
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
      // Straight through, deliberately: every figure was resolved by
      // `resolveSalePrice` on the API side, and a transform here would be a
      // second pricing rule.
      sale: response.sale ?? null,
    }

    return product
  } catch (error) {
    // Return null on error - will trigger 404
    return null
  }
}

/**
 * The poster's review aggregate, which the detail payload does not carry.
 *
 * Two surfaces read it: the buy box's star row (whose "(N reviews)" is the way
 * down to the wall) and the review section's Loox header row. Both were wired
 * to `product.rating` and both rendered nothing, because `/api/products/:slug`
 * returns the product row alone — the join that gives a product CARD its rating
 * is on the list endpoint only.
 *
 * Never throws, for the same reason `fetchRelatedProducts` does not: a poster
 * with an unreachable aggregate is a poster without a star row, not a 404.
 */
async function fetchReviewAggregate(
  productId: string
): Promise<{ averageRating: number; reviewCount: number } | undefined> {
  try {
    const stats = await productsApi.productReviewStats(productId)
    // Undefined rather than a zeroed object: every consumer treats the absence
    // as "not yet rated" and drops the row, which is what nothing-approved
    // should look like.
    if (stats.reviewCount <= 0 || stats.averageRating === null) return undefined
    return {
      averageRating: stats.averageRating,
      reviewCount: stats.reviewCount,
    }
  } catch {
    return undefined
  }
}

/**
 * Fetch products related to this one for the "You May Also Like" row.
 *
 * Never throws: the section is supplementary, so a failure here should hide
 * it rather than take down the product page.
 */
async function fetchRelatedProducts(slug: string): Promise<ProductCardData[]> {
  try {
    const response = await productsApi.related<ProductCardData>(slug, {
      limit: 5,
    })
    return toFeaturedProducts(response)
  } catch {
    return []
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

    // In parallel: neither one gates the other, and the aggregate is the
    // slower of the two only because it counts.
    const [related, rating] = await Promise.all([
      fetchRelatedProducts(params.slug),
      fetchReviewAggregate(product.id),
    ])

    return { product: { ...product, rating: product.rating ?? rating }, related }
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: 'Product Not Found | chobii.art' },
          { name: 'description', content: 'The product you are looking for could not be found.' },
        ],
      }
    }

    const { product } = loaderData
    const primaryImage = mainImage(product.images)

    // Calculate price range for display
    const prices = product.variants.map((v) =>
      typeof v.price === 'string' ? parseFloat(v.price) : v.price
    )
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceText = minPrice === maxPrice
      ? `₹${minPrice.toLocaleString('en-IN')}`
      : `₹${minPrice.toLocaleString('en-IN')} - ₹${maxPrice.toLocaleString('en-IN')}`

    const title = product.seoTitle || `${product.title} | chobii.art`
    const description = product.seoDescription ||
      product.shortDescription ||
      `Shop ${product.title} at chobii.art. ${priceText}. Premium quality poster available in multiple sizes and frames.`
    const productUrl = `https://chobii.art/posters/${product.slug}`
    const imageUrl = primaryImage?.url || 'https://chobii.art/og-default.jpg'
    const imageAlt = primaryImage?.altText || product.title

    // Build keywords from product attributes
    const keywords = [
      product.title,
      ...(product.styles || []),
      ...(product.subjects || []),
      'poster',
      'wall art',
      'chobii.art',
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
        { property: 'og:site_name', content: 'chobii.art' },
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
        { property: 'product:brand', content: 'chobii.art' },
        ...(product.sku ? [{ property: 'product:retailer_item_id', content: product.sku }] : []),

        // Twitter Card meta tags
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@chobiiart' },
        { name: 'twitter:creator', content: '@chobiiart' },
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
  const { product, related } = Route.useLoaderData()

  return (
    <>
      {/* JSON-LD Structured Data */}
      <ProductJsonLd product={product} />

      {/* Breadcrumb */}
      <Breadcrumb product={product} />

      {/* Main Product Detail */}
      <ProductDetail product={product} />

      {/* Below the buy panel the reference runs the similar-artworks carousel
          FIRST and the tab bar after it (docs/design/pdp-parity-reference.md,
          "Below the buy panel, in order"). */}
      <RelatedProductsSection products={related} />

      {/* The long-form content, behind one tab bar.
       *
       * UNCONTROLLED on purpose: ProductTabs only self-manages the `#reviews`
       * hash while it owns its own selection (see its file header). The buy
       * panel's `buybox-reviews-link` is a plain `href="#reviews"` anchor, so
       * taking `activeTabId` here would move hash-syncing onto this route for
       * no gain.
       *
       * `<ProductReviewSection>` is handed through as the review panel
       * unwrapped and unrenamed — it keeps its own `id="reviews"` and
       * `data-testid="product-reviews"`, which is exactly what that anchor and
       * the tabs' scroll-into-view both aim at. ONE review surface still, not
       * two: it simply lives behind the Review tab now. */}
      <div className="container-wide pb-16">
        <ProductTabs
          descriptionHtml={product.description}
          roomSuggestions={product.roomSuggestions}
          spec={{
            sku: product.sku,
            orientation: product.orientation,
            styles: product.styles,
            subjects: product.subjects,
            primaryColor: product.primaryColor,
            artist: product.artist,
            variants: product.variants,
            frames: product.frames,
          }}
          /* The aggregate this route already fetches (`fetchReviewAggregate`)
             and the buy panel already renders. Straight through, undefined
             included: ProductTabs draws "unknown" and "none yet" differently
             on purpose, so narrowing it to a number here would erase the
             distinction. Without it the tab bar's star summary and the Review
             tab's count both render nothing. */
          rating={product.rating}
          reviewPanel={
            <ProductReviewSection
              productId={product.id}
              averageRating={product.rating?.averageRating ?? null}
              reviewCount={product.rating?.reviewCount ?? null}
            />
          }
        />
      </div>
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
      <ProductReviewSectionSkeleton />
    </>
  )
}

function ProductNotFound() {
  return (
    <div className="container-wide flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-2xl text-foreground">Product Not Found</h1>
      <p className="mt-2 text-muted-foreground">
        The product you are looking for could not be found or may have been removed.
      </p>
      <a
        href="/posters"
        className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/85"
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
  const primaryImage = mainImage(product.images)

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
      name: 'chobii.art',
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
        name: 'chobii.art',
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
    url: `https://chobii.art/posters/${product.slug}`,
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}

/**
 * Related products row.
 *
 * Data is loaded server-side alongside the product, so there is no loading
 * state to render — previously this section showed five permanently pulsing
 * skeletons because it was a placeholder that never got implemented (#352).
 *
 * A horizontal carousel now, not a grid, and headed "Visually Similar
 * Artworks" rather than "You May Also Like" (#522, parity reference "Below the
 * buy panel"). The cards are the same `ProductCard`s the grid rendered, so
 * sale pricing on this row is unchanged — `toFeaturedProducts` still passes
 * the API's `sale` block straight through.
 *
 * ProductCarousel renders nothing for an empty list on its own; the `<section>`
 * wrapper is kept out of the way for the same reason, so an empty related row
 * leaves no bordered strip behind.
 */
function RelatedProductsSection({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) {
    return null
  }

  return (
    <section className="border-t border-border bg-muted/30">
      <div className="container-wide py-12">
        <ProductCarousel heading="Visually Similar Artworks" products={products} />
      </div>
    </section>
  )
}
