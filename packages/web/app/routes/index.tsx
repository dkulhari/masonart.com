/**
 * Home Page - chobii.art E-commerce Platform
 *
 * The page is a stack of bands, in the reference's running order:
 *
 *   HomeHero → Best Seller rail → Shop By Popular → Shop by Room →
 *   promo tiles → New In rail → Shop By Orientation → Customer Reviews →
 *   Brand Story → Newsletter → trust icons row
 *
 * Every band lives in `~/components/home/` and owns its own data, layout and
 * empty state. This file's job is the order, the two SSR product fetches the
 * rails need, and nothing else — the sections that used to be defined inline
 * here (hero, featured grid, category tiles, AI generator, value props) have
 * all been superseded by components under that directory. See the
 * home-page-parity feature for which ticket replaced what.
 *
 * Featured Artists (#536) is descoped: we have no artist records, and a band
 * of invented names is not a parity win. The page is deliberately one band
 * shorter than the reference.
 */

import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { ProductCardData } from '~/components/product/ProductCard'
import { OrganizationJsonLd } from '~/components/seo/ProductJsonLd'
import { Button } from '~/components/ui/Button'
import { SectionBand } from '~/components/ui/SectionBand'
import { DisplayHeading } from '~/components/ui/DisplayHeading'
import { HomeHero } from '~/components/home/HomeHero'
import {
  BestSellersRail,
  fetchBestSellerProducts,
} from '~/components/home/BestSellersRail'
import { PopularCategoriesSection } from '~/components/home/PopularCategoriesSection'
import { ShopByRoomBand } from '~/components/home/ShopByRoomBand'
import { PromoTilesSection } from '~/components/home/PromoTilesSection'
import { NewInRail, fetchNewInProducts } from '~/components/home/NewInRail'
import { ShopByOrientationSection } from '~/components/home/ShopByOrientationSection'
import { CustomerReviewsSection } from '~/components/home/CustomerReviewsSection'
import { BrandStorySection } from '~/components/home/BrandStorySection'
import { TrustIconsRow } from '~/components/home/TrustIconsRow'

// ============================================================================
// Types
// ============================================================================

export interface HomePageData {
  /** Real units sold, `sortBy=salesCount` over the list endpoint (#530). */
  bestSellers: ProductCardData[]
  /** The catalogue's genuine newest active products, `sortBy=createdAt` (#534). */
  newIn: ProductCardData[]
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * The two product rails, server-rendered.
 *
 * They are the only bands loaded here. Shop By Popular, Shop by Room and the
 * promo tiles all read client-side through `useQuery` — a category tile is not
 * worth a slower first byte — and the rest carry no data at all.
 *
 * `Promise.allSettled`, not `all`: one rail failing must not cost the other.
 * Both fetchers already swallow their own errors and return `[]`, and an empty
 * list renders as an absent band rather than a heading over a dead track, so
 * the settled branches here are belt-and-braces for anything thrown before the
 * fetcher's own try.
 */
const getHomePageData = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HomePageData> => {
    try {
      const [bestSellers, newIn] = await Promise.allSettled([
        fetchBestSellerProducts(),
        fetchNewInProducts(),
      ])

      return {
        bestSellers: bestSellers.status === 'fulfilled' ? bestSellers.value : [],
        newIn: newIn.status === 'fulfilled' ? newIn.value : [],
      }
    } catch {
      // Return empty data on error to allow graceful fallback
      return {
        bestSellers: [],
        newIn: [],
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
  const { bestSellers, newIn } = Route.useLoaderData()

  return (
    <div className="flex flex-col">
      {/* Organization structured data for search engines (#244) */}
      <OrganizationJsonLd />

      {/* Hero slideshow (#529) — replaced the gradient hero */}
      <HomeHero />

      {/* Best Seller rail (#530) — replaced the Featured Collection grid */}
      <BestSellersRail products={bestSellers} />

      {/* Shop By Popular (#531) — replaced the Shop by Style tiles */}
      <PopularCategoriesSection />

      {/* Shop by Room (#532) */}
      <ShopByRoomBand />

      {/* On Sale / In Stock / Custom Art (#533).
          The Custom Art tile is where the AI generator now lives — see the
          note under the component list on #538. */}
      <PromoTilesSection />

      {/* New In rail (#534) */}
      <NewInRail products={newIn} />

      {/* Shop By Orientation chips (#535) */}
      <ShopByOrientationSection />

      {/* Featured Artists (#536) sits here on the reference. Descoped — we
          have no artist records to draw it from. */}

      {/* Customer Reviews — mesonart places these late, after the
          merchandising rails. Renders nothing below ten approved reviews or
          when there is no average to print; see the component. */}
      <CustomerReviewsSection />

      {/* Brand Story (#538) */}
      <BrandStorySection />

      {/* Newsletter Section */}
      <NewsletterSection />

      {/* Trust icons (#539) — the last band before the footer, and the only
          place these four claims are made now: it replaced both the
          "Why Choose chobii.art?" card row that used to live in this file and
          the duplicate USP strip inside Footer.tsx. */}
      <TrustIconsRow />
    </div>
  )
}

// ============================================================================
// Newsletter Section
// ============================================================================

/**
 * The one band on this page that has no counterpart on the reference.
 *
 * It therefore takes its geometry from the page around it rather than from a
 * measurement (#540): `text-section` like every other band heading, aligned
 * left like every other band, and the measured pill scale on the submit. It
 * was the page's last centred band and its last 44px button — with the copy
 * centred inside a `max-w-2xl` it read as a card that had wandered in from
 * another site.
 */
function NewsletterSection() {
  return (
    <SectionBand tone="beige">
      <DisplayHeading as="h2" className="text-section">
        Stay Inspired
      </DisplayHeading>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Subscribe to receive updates on new collections, exclusive offers, and
        design inspiration.
      </p>

      {/* Newsletter Form
       *
       * The field and the button are separate pills rather than a fused
       * rectangle: at a 3.75rem radius the old flush `sm:rounded-r-none` /
       * `sm:rounded-l-none` seam has nothing to sit flush against.
       *
       * `h-14` on the field, not `h-11`: it sits beside a `size="pill"`
       * button, and a 44px field against a 56px button is two systems on one
       * row. `text-button` for the same reason — the field's own text and the
       * button's label are the same size on the same row.
       */}
      <form
        className="mt-5 flex max-w-xl flex-col gap-3 sm:mt-8 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          // Newsletter signup will be implemented later
        }}
      >
        <input
          type="email"
          placeholder="Enter your email"
          required
          className="h-14 flex-1 rounded-pill border border-input bg-background px-6 text-button placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="pill">
          Subscribe
        </Button>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        By subscribing, you agree to our Privacy Policy. Unsubscribe anytime.
      </p>
    </SectionBand>
  )
}
