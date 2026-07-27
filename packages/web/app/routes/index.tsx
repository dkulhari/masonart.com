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
import { productsApi } from '~/lib/api'
import { ProductCard, type ProductCardData } from '~/components/product/ProductCard'
import { OrganizationJsonLd } from '~/components/seo/ProductJsonLd'

// ============================================================================
// Types
// ============================================================================

export interface HomePageData {
  featuredProducts: ProductCardData[]
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
      // Fetch featured products from API
      const featuredResponse = await productsApi.featured({ limit: 8 })
      return {
        featuredProducts: featuredResponse.products || [],
      }
    } catch (error) {
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
  const { featuredProducts } = Route.useLoaderData()

  return (
    <div className="flex flex-col">
      {/* Organization structured data for search engines (#244) */}
      <OrganizationJsonLd />

      {/* Hero Section */}
      <HeroSection />

      {/* Featured Products Section */}
      <FeaturedProductsSection products={featuredProducts} />

      {/* Categories Section */}
      <CategoriesSection />

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

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-background to-brand-100/30 py-16 sm:py-24 lg:py-32">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-brand-300/20 blur-3xl" />
      </div>

      <div className="container-wide relative">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700">
            <Sparkles className="h-4 w-4" />
            <span>New: AI Poster Generator</span>
          </div>

          {/* Headline */}
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Transform Your Space with{' '}
            <span className="gradient-text">Premium Art</span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
            Discover our curated collection of stunning posters and custom frames.
            Create unique AI-generated art or choose from hundreds of designs
            crafted by talented artists.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/posters"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
            >
              Shop Posters
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/create"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-brand-300 bg-background px-8 text-base font-semibold text-brand-600 transition-all hover:border-brand-400 hover:bg-brand-50"
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
                  <Star
                    key={i}
                    className="h-4 w-4 fill-yellow-400 text-yellow-400"
                  />
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
      </div>
    </section>
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
    <section className="py-16 sm:py-24">
      <div className="container-wide">
        {/* Section Header */}
        <div className="mb-12 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Featured Collection
            </h2>
            <p className="mt-2 text-lg text-muted-foreground">
              Handpicked favorites loved by our customers
            </p>
          </div>
          <a
            href="/posters"
            className="hidden items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 sm:flex"
          >
            View all
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        {/* Products Grid */}
        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                uniformAspectRatio="aspect-[3/4]"
              />
            ))}
          </div>
        ) : (
          <ProductsPlaceholder />
        )}

        {/* Mobile View All Link */}
        <div className="mt-8 text-center sm:hidden">
          <a
            href="/posters"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
          >
            View all products
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
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
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
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

const categories = [
  {
    name: 'Abstract',
    slug: 'abstract',
    description: 'Bold, expressive art pieces',
    image: '/images/categories/abstract.jpg',
    color: 'from-purple-600/70 to-pink-600/70',
  },
  {
    name: 'Nature',
    slug: 'nature',
    description: 'Serene landscapes & botanicals',
    image: '/images/categories/nature.jpg',
    color: 'from-green-600/70 to-teal-600/70',
  },
  {
    name: 'Minimalist',
    slug: 'minimalist',
    description: 'Clean lines, simple beauty',
    image: '/images/categories/minimalist.jpg',
    color: 'from-gray-600/70 to-slate-600/70',
  },
  {
    name: 'Typography',
    slug: 'typography',
    description: 'Words that inspire',
    image: '/images/categories/typography.jpg',
    color: 'from-amber-600/70 to-orange-600/70',
  },
]

function CategoriesSection() {
  return (
    <section className="bg-muted/30 py-16 sm:py-24">
      <div className="container-wide">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Shop by Style
          </h2>
          <p className="mt-2 text-lg text-muted-foreground">
            Find the perfect piece for your aesthetic
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {categories.map((category) => (
            <a
              key={category.slug}
              href={`/posters?styles=${category.slug}`}
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

              {/* Gradient overlay for text readability */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-75 transition-opacity duration-300 group-hover:opacity-90`}
              />

              {/* Text content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white">
                <h3 className="text-lg font-bold sm:text-xl">
                  {category.name}
                </h3>
                <p className="mt-1 text-sm text-white/80">
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
      </div>
    </section>
  )
}

// ============================================================================
// AI Generator Section
// ============================================================================

function AIGeneratorSection() {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-600 to-brand-800" />

      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="container-wide relative">
        <div className="mx-auto max-w-3xl text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <Sparkles className="h-8 w-8 text-white" />
          </div>

          {/* Content */}
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Create Your Own Masterpiece
          </h2>
          <p className="mt-4 text-lg text-white/80">
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
              <div key={feature.title} className="rounded-lg bg-white/10 p-4 backdrop-blur">
                <p className="font-semibold text-white">{feature.title}</p>
                <p className="text-sm text-white/70">{feature.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <a
            href="/create"
            className="mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-8 text-base font-semibold text-brand-700 shadow-xl transition-all hover:bg-white/90 hover:shadow-2xl"
          >
            <Sparkles className="h-5 w-5" />
            Start Creating
          </a>
        </div>
      </div>
    </section>
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
    <section className="py-16 sm:py-24">
      <div className="container-wide">
        {/* Section Header */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Why Choose chobii.art?
          </h2>
          <p className="mt-2 text-lg text-muted-foreground">
            We&apos;re committed to bringing art into every home
          </p>
        </div>

        {/* Value Props Grid */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {valueProps.map((prop) => (
            <div
              key={prop.title}
              className="group rounded-xl border border-border bg-card p-6 text-center transition-all hover:border-brand-200 hover:shadow-lg"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                <prop.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {prop.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {prop.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// Newsletter Section
// ============================================================================

function NewsletterSection() {
  return (
    <section className="border-t border-border bg-muted/30 py-16 sm:py-24">
      <div className="container-wide">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Stay Inspired
          </h2>
          <p className="mt-2 text-muted-foreground">
            Subscribe to receive updates on new collections, exclusive offers, and
            design inspiration.
          </p>

          {/* Newsletter Form */}
          <form
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-0"
            onSubmit={(e) => {
              e.preventDefault()
              // Newsletter signup will be implemented later
            }}
          >
            <input
              type="email"
              placeholder="Enter your email"
              required
              className="h-12 flex-1 rounded-lg border border-input bg-background px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:rounded-r-none"
            />
            <button
              type="submit"
              className="h-12 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:rounded-l-none"
            >
              Subscribe
            </button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">
            By subscribing, you agree to our Privacy Policy. Unsubscribe anytime.
          </p>
        </div>
      </div>
    </section>
  )
}
