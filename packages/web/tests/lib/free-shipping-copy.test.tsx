/**
 * The number the storefront PRINTS and the number the server CHARGES BY are
 * one number (#570).
 *
 * WHY THIS SUITE EXISTS
 *
 * #569 moved the free-shipping threshold out of the bundle and into
 * `shipping_config`, so an admin can change it without a deploy. That makes
 * the *copy* the dangerous half: "₹999" was written as literal text on ten
 * customer-facing surfaces, and an admin raising the charged threshold while
 * those surfaces kept promising ₹999 would manufacture exactly the
 * false-advertising gap commit 70bfa9dd closed — the site promising ₹999 on
 * six surfaces while checkout charged unless ₹2,000.
 *
 * A test that only checks the admin form saves would not catch that. So this
 * suite changes the configured value and asserts the copy moves with it.
 *
 * Two kinds of assertion, because the surfaces are two kinds of thing:
 *
 *  - **Rendered**, for the components that stand up on their own. They are
 *    mounted inside `FreeShippingThresholdProvider` at a value no part of the
 *    codebase hardcodes, and must print that value and never ₹999.
 *  - **Source-scanned**, for the route pages, which need a router and a loader
 *    to render. A page is allowed to *mention* ₹999 in a comment recording
 *    where a claim came from; it is not allowed to ship it as copy. The scan
 *    skips comment lines and fails on the literal anywhere else.
 *
 * The cart's own half — progress bar, shortfall nudge and the charge itself
 * moving together — is pinned in `tests/routes/cart-free-shipping.test.tsx`,
 * which already has the store and server-cart mocks that page needs.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render as rtlRender } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReactElement } from 'react'
import { freeShippingThresholdLabel } from '@chobii/shared'
import { FreeShippingThresholdProvider } from '~/lib/free-shipping'
import { AnnouncementBar } from '~/components/layout/AnnouncementBar'
import { TrustIconsRow } from '~/components/home/TrustIconsRow'
import { TrustList } from '~/components/product/TrustList'
import {
  ProductTabs,
  type ProductTabsSpecData,
} from '~/components/product/ProductTabs'
import { OrderSummary } from '~/components/checkout/OrderSummary'

// ============================================================================
// The admin has moved the threshold
// ============================================================================

/**
 * Deliberately not 999 and not a round thousand: it formats with a comma
 * (`₹1,499`), so a surface that builds the string by hand instead of going
 * through `freeShippingThresholdLabel` shows up as a mismatch rather than
 * passing by luck.
 */
const CONFIGURED = 1499
const CONFIGURED_LABEL = freeShippingThresholdLabel(CONFIGURED)
const STALE_LABEL = '₹999'

function render(ui: ReactElement) {
  return rtlRender(
    <FreeShippingThresholdProvider value={CONFIGURED}>
      {ui}
    </FreeShippingThresholdProvider>
  )
}

/** Everything the surface put on screen, including tab panels not on top. */
function renderedText(): string {
  return document.body.textContent ?? ''
}

// ============================================================================
// Fixtures
// ============================================================================

const SPEC: ProductTabsSpecData = {
  sku: 'PAC347',
  orientation: 'square',
  styles: ['minimalist'],
  subjects: ['nature-landscape'],
  primaryColor: 'neutral',
  artist: { name: 'Aditi Rao', slug: 'aditi-rao' },
  variants: [
    {
      id: 'v1',
      sizeId: 's1',
      sizeLabel: '24" x 24" / 61 x 61 cm',
      widthInches: 24,
      heightInches: 24,
      price: '2000.00',
      stockQuantity: -1,
      isAvailable: true,
      sku: 'PAC347-24',
    },
  ],
}

// ============================================================================
// Rendered surfaces
// ============================================================================

describe('storefront copy follows the configured free-shipping threshold', () => {
  afterEach(cleanup)

  it('AnnouncementBar states the configured threshold', () => {
    render(<AnnouncementBar />)

    expect(renderedText()).toContain(CONFIGURED_LABEL)
    expect(renderedText()).not.toContain(STALE_LABEL)
  })

  it('the home trust row states the configured threshold', () => {
    render(<TrustIconsRow />)

    expect(renderedText()).toContain(CONFIGURED_LABEL)
    expect(renderedText()).not.toContain(STALE_LABEL)
  })

  it('the PDP trust list states the configured threshold', () => {
    render(<TrustList />)

    expect(renderedText()).toContain(CONFIGURED_LABEL)
    expect(renderedText()).not.toContain(STALE_LABEL)
  })

  it("the PDP shipping tab and its jump caption state the configured threshold", () => {
    render(
      <ProductTabs
        descriptionHtml="<p>A print.</p>"
        spec={SPEC}
        reviewPanel={<div />}
        defaultTabId="shipping"
      />
    )

    expect(renderedText()).toContain(CONFIGURED_LABEL)
    expect(renderedText()).not.toContain(STALE_LABEL)
  })

  it("checkout's order summary states the configured threshold", () => {
    render(<OrderSummary items={[]} subtotal={0} shippingCost={0} />)

    expect(renderedText()).toContain(CONFIGURED_LABEL)
    expect(renderedText()).not.toContain(STALE_LABEL)
  })

  it('every rendered surface prints one formatting of the figure', () => {
    render(
      <>
        <AnnouncementBar />
        <TrustIconsRow />
        <TrustList />
        <OrderSummary items={[]} subtotal={0} shippingCost={0} />
      </>
    )

    // `₹1499` unformatted, or `1,499` without the symbol, means a surface
    // built the string itself instead of using the shared label.
    expect(renderedText()).not.toMatch(/₹\s?1499\b/)
  })
})

// ============================================================================
// Route pages, by source
// ============================================================================

/**
 * Customer-facing files that state the threshold. Route pages need a router
 * and a loader to render, so they are checked as text — the failure this
 * guards against is a literal being typed back in, which is visible in source.
 */
const COPY_FILES = [
  'app/routes/shipping.tsx',
  'app/routes/faq.tsx',
  'app/routes/about.tsx',
  'app/routes/posters/index.tsx',
  'app/routes/cart/index.tsx',
  'app/components/layout/AnnouncementBar.tsx',
  'app/components/home/TrustIconsRow.tsx',
  'app/components/product/TrustList.tsx',
  'app/components/product/ProductTabs.tsx',
  'app/components/checkout/OrderSummary.tsx',
] as const

/**
 * Comment lines are exempt. Several of these files cite where a claim came
 * from ("app/routes/shipping.tsx 'Costs'... 'Free Shipping Over ₹999'") and
 * that provenance is worth keeping; what must not survive is the figure
 * reaching a customer without passing through the setting.
 */
function nonCommentLines(relativePath: string): string[] {
  const source = readFileSync(
    resolve(import.meta.dirname, '../../', relativePath),
    'utf8'
  )

  return source.split('\n').filter((line) => {
    const trimmed = line.trim()
    return !(
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*')
    )
  })
}

describe('no customer-facing file hardcodes the threshold', () => {
  it.each(COPY_FILES)('%s states no literal ₹999', (relativePath) => {
    const offending = nonCommentLines(relativePath).filter((line) =>
      line.includes(STALE_LABEL)
    )

    expect(offending).toEqual([])
  })

  it.each(COPY_FILES)(
    '%s reads the live threshold rather than the bundled default',
    (relativePath) => {
      const source = nonCommentLines(relativePath).join('\n')

      // Booleans, not the source itself: a failed `toMatch` on a 900-line
      // route prints the whole route.
      //
      // The bundled constant is the API's fallback and the provider's default.
      // A *surface* importing it is printing a number the admin cannot move.
      expect({
        usesBundledLabel: source.includes('FREE_SHIPPING_THRESHOLD_LABEL'),
        readsTheSetting: source.includes('useFreeShippingThreshold'),
      }).toEqual({ usesBundledLabel: false, readsTheSetting: true })
    }
  )
})
