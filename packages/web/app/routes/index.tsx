/**
 * Home Page - chobii.art E-commerce Platform
 *
 * Server-side rendered home page featuring:
 * - Hero section with CTA
 * - Featured products grid
 * - Category highlights
 * - AI poster generator promo
 * - Value propositions
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import {
  ArrowRight,
  Sparkles,
  Truck,
  Shield,
  Palette,
  Star,
  ChevronRight,
} from 'lucide-react'
import { productsApi, toFeaturedProducts } from '~/lib/api'
import {
  categoryHref,
  visibleCategories,
  type CategoryTile,
  type FacetCounts,
} from '~/lib/homeCategories'
import type { ProductCardData } from '~/components/product/ProductCard'
import { ProductGrid } from '~/components/product/ProductGrid'
import { OrganizationJsonLd } from '~/components/seo/ProductJsonLd'
import { cn } from '~/lib/utils'
import { Button, buttonVariants } from '~/components/ui/Button'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'

// ============================================================================
// Types
// ============================================================================

export interface HomePageData {
  featuredProducts: ProductCardData[]
  /**
   * Which categories the catalogue can actually fill (#452). Undefined means
   * the facets call failed — see visibleCategories for why that shows nothing
   * rather than everything.
   */
  categoryCounts?: FacetCounts
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Fetch featured products for the home page
 * Uses SSR for SEO and fast initial page load
 */
const getHomePageData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HomePageData> => {
    try {
      /**
       * Two independent calls, so one failing does not cost the other:
       * featured products for the grid, facet counts to decide which category
       * tiles have anything behind them (#452).
       */
      const [featured, facets] = await Promise.allSettled([
        // The envelope key is `items` — see toFeaturedProducts, which is the
        // only place that name is spelled out.
        productsApi.featured<ProductCardData>({ limit: 8 }),
        productsApi.facets(),
      ])

      return {
        featuredProducts:
          featured.status === 'fulfilled'
            ? toFeaturedProducts(featured.value)
            : [],
        categoryCounts:
          facets.status === 'fulfilled'
            ? {
                styles: facets.value.styles,
                subjects: facets.value.subjects,
              }
            : undefined,
      }
    } catch {
      // Return empty data on error to allow graceful fallback
      return {
        featuredProducts: [],
      }
    }
  }
)

// ============================================================================
// Route Definition
// ============================================================================

export const Route = createFileRoute('/')({
  loader: async () => {
    return getHomePageData()
  },
  head: () => ({
    meta: [
      { title: 'chobii.art | Premium Posters & Custom Frames' },
      {
        name: 'description',
        content:
          'Discover premium posters and custom frames at chobii.art. Create unique AI-generated art or choose from our curated collection of wall art to transform your space.',
      },
      { property: 'og:title', content: 'chobii.art | Premium Posters & Custom Frames' },
      {
        property: 'og:description',
        content:
          'Discover premium posters and custom frames. Create unique AI-generated art for your space.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://chobii.art/' },
      { property: 'og:image', content: 'https://chobii.art/og-default.jpg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://chobii.art/og-default.jpg' },
    ],
    links: [{ rel: 'canonical', href: 'https://chobii.art/' }],
  }),
  component: HomePage,
})

// ============================================================================
// Main Component
// ============================================================================

function HomePage() {
  const { featuredProducts, categoryCounts } = Route.useLoaderData()
  const categories = visibleCategories(categoryCounts)

  return (
    <div className="flex flex-col">
      {/* Organization structured data for search engines (#244) */}
      <OrganizationJsonLd />

      {/* Hero Section */}
      <HeroSection />

      {/* Featured Products Section */}
      <FeaturedProductsSection products={featuredProducts} />

      {/* Categories Section — only the ones the catalogue can fill (#452) */}
      <CategoriesSection categories={categories} />

      {/* AI Generator Promo Section */}
      <AIGeneratorSection />

      {/* Value Propositions */}
      <ValuePropsSection />

      {/* Newsletter Section */}
      <NewsletterSection />
    </div>
  )
}

// ============================================================================
// Hero Section
// ============================================================================

/**
 * The hero was the last of the orange marketing identity: a brand gradient
 * wash, two blur blobs, an amber pill badge and a gradient-filled H1. mesonart
 * puts photography here and lets one outline pill carry the whole call to
 * action, so all of that comes out.
 *
 * The photography itself is Phase D — a contained slideshow needs room
 * mockups we do not have yet. Until then this is the same content on the
 * monochrome system rather than a placeholder.
 */
function HeroSection() {
  return (
    <SectionBand className="py-16 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-3xl text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-pill border border-foreground/15 bg-highlight px-4 py-1.5 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4" />
          <span>New: AI Poster Generator</span>
        </div>

        {/* Headline */}
        <DisplayHeading className="text-balance text-foreground sm:text-5xl lg:text-6xl">
          Transform Your Space with Premium Art
        </DisplayHeading>

        {/* Subheadline */}
        <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
          Discover our curated collection of stunning posters and custom frames.
          Create unique AI-generated art or choose from hundreds of designs
          crafted by talented artists.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="/posters" className={buttonVariants({ size: 'lg' })}>
            Shop Posters
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="/create"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            <Sparkles className="h-4 w-4" />
            Create with AI
          </a>
        </div>

        {/* Trust indicators */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-rating text-rating" />
              ))}
            </div>
            <span>4.9/5 from 2,000+ reviews</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span>Free shipping over ₹999</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>30-day returns</span>
          </div>
        </div>
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Featured Products Section
// ============================================================================

interface FeaturedProductsSectionProps {
  products: ProductCardData[]
}

function FeaturedProductsSection({ products }: FeaturedProductsSectionProps) {
  return (
    <SectionBand>
      {/* Section Header */}
      <div className="mb-12 flex items-end justify-between">
        <div>
          <DisplayHeading as="h2" className="text-3xl sm:text-4xl">
            Featured Collection
          </DisplayHeading>
          <p className="mt-2 text-lg text-muted-foreground">
            Handpicked favorites loved by our customers
          </p>
        </div>
        <a
          href="/posters"
          className="hidden items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-foreground/60 sm:flex"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>

      {/* Products Grid — shares the one canonical grid with /posters, so the
          home page and the listing can no longer disagree about layout. */}
      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <ProductsPlaceholder />
      )}

      {/* Mobile View All Link */}
      <div className="mt-8 text-center sm:hidden">
        <a
          href="/posters"
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground"
        >
          View all products
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Products Placeholder
// ============================================================================

function ProductsPlaceholder() {
  return (
    <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-12 text-center">
      <Palette className="mx-auto h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium text-foreground">
        Coming Soon
      </h3>
      <p className="mt-2 text-muted-foreground">
        Our featured collection is being curated. Check back soon for amazing posters!
      </p>
      <a
        href="/create"
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/60"
      >
        <Sparkles className="h-4 w-4" />
        Create your own with AI in the meantime
      </a>
    </div>
  )
}

// ============================================================================
// Categories Section
// ============================================================================

/**
 * The tiles themselves live in `~/lib/homeCategories` — they carry the facet
 * group as well as the value, and they are filtered by what the catalogue
 * actually holds before they get here (#452).
 */
function CategoriesSection({ categories }: { categories: CategoryTile[] }) {
  // Nothing to shop by: no heading promising a section that is not there.
  if (categories.length === 0) return null

  return (
    // Beige rather than the old `bg-muted/30`: that was a cool blue-gray, and
    // it is the one band tone mesonart never uses.
    <SectionBand tone="beige">
      {/* Section Header */}
      <div className="mb-12 text-center">
        <DisplayHeading as="h2" className="text-3xl sm:text-4xl">
          Shop by Style
        </DisplayHeading>
        <p className="mt-2 text-lg text-muted-foreground">
          Find the perfect piece for your aesthetic
        </p>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {categories.map((category) => (
            <a
              key={`${category.group}-${category.id}`}
              // `?styles=` for everything is what sent Abstract — a subject —
              // at a filter that rejects it (#452).
              href={categoryHref(category)}
              className="group relative aspect-square overflow-hidden rounded-xl"
            >
              {/* Category Image (with gradient fallback) */}
              <img
                src={category.image}
                alt={category.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  // Hide broken image, gradient overlay handles the visual
                  e.currentTarget.style.display = 'none'
                }}
              />

              {/* Brand gradient — carries the category's colour identity */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-75 transition-opacity duration-300 group-hover:opacity-90`}
              />

              {/* Text-protection scrim.
               *
               * The colour gradient alone is not enough: it is translucent, so
               * a light, high-key category photo reads straight through it.
               * That is what made the Minimalist caption illegible — its
               * grey/slate wash had nothing like the masking power of the
               * saturated purple/green/amber ones (#357).
               *
               * A flat scrim under the text keeps every card legible
               * regardless of which image sits behind it, including any added
               * later.
               */}
              <div className="absolute inset-0 bg-black/25" />

              {/* Text content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white">
                <h3 className="text-lg font-medium sm:text-xl [text-shadow:0_1px_3px_rgb(0_0_0_/_45%)]">
                  {category.name}
                </h3>
                <p className="mt-1 text-sm text-white/90 [text-shadow:0_1px_3px_rgb(0_0_0_/_45%)]">
                  {category.description}
                </p>
                <span className="mt-3 inline-flex items-center text-sm font-medium opacity-0 transition-opacity group-hover:opacity-100">
                  Explore
                  <ChevronRight className="ml-1 h-4 w-4" />
                </span>
              </div>
            </a>
          ))}
      </div>
    </SectionBand>
  )
}

// ============================================================================
// AI Generator Section
// ============================================================================

/**
 * The AI generator is our differentiator and stays, but it cannot stay as a
 * brand-orange gradient with two blur blobs. `tone="ink"` gives it the one
 * remaining way to say "this section is different" without a hue: it inverts.
 */
function AIGeneratorSection() {
  return (
    <SectionBand tone="ink">
      <div className="mx-auto max-w-3xl text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-background/10">
          <Sparkles className="h-8 w-8" />
        </div>

        {/* Content */}
        <DisplayHeading as="h2" className="text-3xl sm:text-4xl">
          Create Your Own Masterpiece
        </DisplayHeading>
        <p className="mt-4 text-lg text-background/80">
          Use our AI-powered poster generator to create unique, one-of-a-kind
          artwork. Simply describe your vision, choose a style, and watch your
          idea come to life.
        </p>

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { title: 'Easy to use', desc: 'No design skills needed' },
            { title: 'Multiple styles', desc: 'From abstract to realistic' },
            { title: 'Print ready', desc: 'High-quality output' },
          ].map((feature) => (
            <div key={feature.title} className="rounded-lg bg-background/10 p-4">
              <p className="font-medium">{feature.title}</p>
              <p className="text-sm text-background/70">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA — inverted outline pill, so it reads as the same control as the
            hero CTA rather than a different kind of button. */}
        <a
          href="/create"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'mt-10 border-background text-background hover:bg-background hover:text-foreground'
          )}
        >
          <Sparkles className="h-5 w-5" />
          Start Creating
        </a>
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Value Propositions Section
// ============================================================================

const valueProps = [
  {
    icon: Palette,
    title: 'Premium Quality',
    description:
      'Museum-grade paper and archival inks ensure your prints last a lifetime.',
  },
  {
    icon: Truck,
    title: 'Free Shipping',
    description:
      'Enjoy free delivery on all orders over ₹999, delivered right to your door.',
  },
  {
    icon: Shield,
    title: '30-Day Returns',
    description:
      "Not satisfied? Return within 30 days for a full refund, no questions asked.",
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Creation',
    description:
      'Create custom artwork with our state-of-the-art AI poster generator.',
  },
]

function ValuePropsSection() {
  return (
    <SectionBand>
      {/* Section Header */}
      <div className="mb-12 text-center">
        <DisplayHeading as="h2" className="text-3xl sm:text-4xl">
          Why Choose chobii.art?
        </DisplayHeading>
        <p className="mt-2 text-lg text-muted-foreground">
          We&apos;re committed to bringing art into every home
        </p>
      </div>

      {/* Value Props Grid */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {valueProps.map((prop) => (
          <div
            key={prop.title}
            className="group rounded-xl border border-border bg-card p-6 text-center transition-all hover:border-foreground/20 hover:shadow-lg"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-highlight text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <prop.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-medium text-foreground">{prop.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {prop.description}
            </p>
          </div>
        ))}
      </div>
    </SectionBand>
  )
}

// ============================================================================
// Newsletter Section
// ============================================================================

function NewsletterSection() {
  return (
    <SectionBand tone="beige">
      <div className="mx-auto max-w-2xl text-center">
        <DisplayHeading as="h2" className="text-2xl sm:text-3xl">
          Stay Inspired
        </DisplayHeading>
        <p className="mt-2 text-muted-foreground">
          Subscribe to receive updates on new collections, exclusive offers, and
          design inspiration.
        </p>

        {/* Newsletter Form
         *
         * The field and the button are separate pills rather than a fused
         * rectangle: at a 3.75rem radius the old flush `sm:rounded-r-none` /
         * `sm:rounded-l-none` seam has nothing to sit flush against.
         */}
        <form
          className="mt-8 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            // Newsletter signup will be implemented later
          }}
        >
          <input
            type="email"
            placeholder="Enter your email"
            required
            className="h-11 flex-1 rounded-pill border border-input bg-background px-5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit">Subscribe</Button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground">
          By subscribing, you agree to our Privacy Policy. Unsubscribe anytime.
        </p>
      </div>
    </SectionBand>
  )
}
