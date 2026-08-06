/**
 * ProductTabs — #521.
 *
 * mesonart's PDP puts the long-form content below the buy panel behind a
 * centred tab bar — About The Artwork | Details And Customization | Shipping
 * And Returns | Review — with an underline marking the active tab and one
 * panel visible at a time. Ours currently stacks a `Description` block, a
 * `Perfect For` block and a separate reviews wall (ProductDetail.tsx:520-545,
 * ProductReviewSection via routes/posters/$slug.tsx). This component is the
 * tab bar those get folded into; wiring it into ProductDetail/$slug.tsx is a
 * separate ticket (#521 assigns this file only).
 *
 * ## Prop surface
 *
 * `descriptionHtml` and `roomSuggestions` are the two fields ProductDetail
 * used to render itself (`product.description`, `product.roomSuggestions`).
 * `spec` is a thin projection of `ProductDetailData` for the Details tab —
 * `variants`/`frames` reuse SizeSelector's/FrameSelector's own types, so the
 * integrator can hand this `product.variants` and `product.frames` directly
 * with no reshaping. `reviewPanel` is an opaque ReactNode: the integrator
 * slots the existing `<ProductReviewSection />` in unchanged, and this
 * component never inspects or clones it.
 *
 * ## The `#reviews` anchor
 *
 * `ProductDetail`'s buy panel links `href="#reviews"` at the rating row — a
 * plain anchor, not a click handler this component can intercept. Once the
 * review panel lives behind a tab, that anchor's native jump only works if
 * the panel is already the mounted one, which is not true whenever another
 * tab is selected. So this component watches for it instead:
 *
 *  - on mount, if `location.hash === '#reviews'`, it opens on the Review tab;
 *  - a `hashchange` listener does the same for a click that happens after
 *    mount (the case `buybox-reviews-link` exercises), and additionally
 *    scrolls the panel into view once it has mounted, since the browser's own
 *    jump was a no-op against a tabpanel that did not exist yet.
 *
 * This only runs in UNCONTROLLED mode (no `activeTabId` passed in). A caller
 * that takes control of `activeTabId`/`onTabChange` is also taking on hash
 * syncing — that is the "document exactly what the integrator must do" this
 * component's ticket allows for. The review ReactNode itself must go on
 * carrying `id="reviews"` and `data-testid="product-reviews"` (it already
 * does, from ProductReviewSection) — this component only ever renders it
 * as-is, never renames or wraps it in a second id.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '~/lib/utils'
import type { SizeVariant } from './SizeSelector'
import type { FrameOptionData } from './FrameSelector'

// ============================================================================
// Types
// ============================================================================

export type ProductTabId = 'about' | 'details' | 'shipping' | 'review'

/**
 * The Details And Customization tab's data — a projection of
 * `ProductDetailData` (packages/web/app/components/product/ProductDetail.tsx)
 * and the shared `Product` type (packages/shared/src/types/product.ts).
 *
 * Only fields that actually exist on those types are here. Things the
 * reference site shows that we have no field for — print medium/paper stock,
 * weight, care instructions, edition/print-technology copy — are left out
 * rather than invented; see the ticket report for the full list.
 */
export interface ProductTabsSpecData {
  sku: string
  orientation: string
  styles?: string[]
  subjects?: string[]
  primaryColor?: string
  /** `ProductDetailData['variants']` — sizes, reused verbatim. */
  variants?: SizeVariant[]
  /** `ProductDetailData['frames']` — frame/material options, reused verbatim. */
  frames?: FrameOptionData[]
}

export interface ProductTabsProps {
  /** Rich description HTML — `ProductDetailData['description']`. */
  descriptionHtml: string
  /** `ProductDetailData['roomSuggestions']`. */
  roomSuggestions?: string[]
  /** Spec/dimension data for the Details And Customization tab. */
  spec: ProductTabsSpecData
  /**
   * The review panel, rendered unchanged. Pass `<ProductReviewSection />` —
   * it already carries `id="reviews"` and `data-testid="product-reviews"`,
   * which this component depends on for the hash-sync above.
   */
  reviewPanel: ReactNode
  /** Tab selected before any hash or user interaction. Defaults to `'about'`. */
  defaultTabId?: ProductTabId
  /**
   * Pass together with `onTabChange` to take over tab selection. While
   * controlled, this component's built-in `#reviews` hash sync is disabled —
   * the caller must reproduce it (see the file header).
   */
  activeTabId?: ProductTabId
  /** Fires on every selection attempt — click, arrow key, or a `#reviews` hash. */
  onTabChange?: (tabId: ProductTabId) => void
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const TABS: ReadonlyArray<{ id: ProductTabId; label: string }> = [
  { id: 'about', label: 'About The Artwork' },
  { id: 'details', label: 'Details And Customization' },
  { id: 'shipping', label: 'Shipping And Returns' },
  { id: 'review', label: 'Review' },
]

const REVIEWS_HASH = '#reviews'

// ============================================================================
// Component
// ============================================================================

export function ProductTabs({
  descriptionHtml,
  roomSuggestions,
  spec,
  reviewPanel,
  defaultTabId = 'about',
  activeTabId,
  onTabChange,
  className,
}: ProductTabsProps) {
  const isControlled = activeTabId !== undefined
  const [internalTab, setInternalTab] = useState<ProductTabId>(defaultTabId)
  const currentTab = isControlled ? activeTabId : internalTab

  const tabRefs = useRef<Partial<Record<ProductTabId, HTMLButtonElement | null>>>({})

  const selectTab = useCallback(
    (tabId: ProductTabId) => {
      if (!isControlled) setInternalTab(tabId)
      onTabChange?.(tabId)
    },
    [isControlled, onTabChange]
  )

  // Hash sync — uncontrolled only. See the file header for why.
  useEffect(() => {
    if (isControlled) return
    if (typeof window === 'undefined') return
    if (window.location.hash === REVIEWS_HASH) {
      setInternalTab('review')
    }
    // Only ever meant to seed the initial render from whatever hash the page
    // loaded with; `isControlled` cannot change mid-life for a given caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isControlled) return
    if (typeof window === 'undefined') return

    function handleHashChange() {
      if (window.location.hash === REVIEWS_HASH) {
        setInternalTab('review')
        onTabChange?.('review')
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [isControlled, onTabChange])

  // The browser's own jump to `#reviews` is a no-op the instant the panel
  // isn't mounted yet, so once it is (via either effect above), scroll to it
  // ourselves. Guarded because jsdom does not implement scrollIntoView.
  useEffect(() => {
    if (currentTab !== 'review') return
    if (typeof window === 'undefined') return
    if (window.location.hash !== REVIEWS_HASH) return
    const target = document.getElementById('reviews')
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start' })
    }
  }, [currentTab])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TABS.findIndex((tab) => tab.id === currentTab)
      let nextIndex: number | null = null

      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % TABS.length
          break
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
          break
        case 'Home':
          nextIndex = 0
          break
        case 'End':
          nextIndex = TABS.length - 1
          break
        default:
          return
      }

      event.preventDefault()
      const next = TABS[nextIndex]!
      selectTab(next.id)
      // The tab buttons are always mounted (only the panel below swaps), so
      // this ref already points at the real node — no need to wait a render.
      tabRefs.current[next.id]?.focus()
    },
    [currentTab, selectTab]
  )

  const activeTabMeta = TABS.find((tab) => tab.id === currentTab) ?? TABS[0]!
  const tabDomId = `product-tab-${activeTabMeta.id}`
  const panelDomId = `product-tabpanel-${activeTabMeta.id}`

  return (
    <div className={cn('border-t border-border pt-10', className)}>
      <div
        role="tablist"
        aria-label="Product details"
        className="flex flex-wrap items-center justify-center gap-8 border-b border-border"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === currentTab
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el
              }}
              type="button"
              role="tab"
              id={`product-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`product-tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={handleKeyDown}
              className={cn(
                'relative -mb-px whitespace-nowrap px-1 pb-4 text-sm font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'border-b-2 border-foreground text-foreground'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={panelDomId}
        aria-labelledby={tabDomId}
        tabIndex={0}
        className="pt-8"
      >
        {renderPanel(activeTabMeta.id, { descriptionHtml, roomSuggestions, spec, reviewPanel })}
      </div>
    </div>
  )
}

// ============================================================================
// Panel content
// ============================================================================

interface PanelContentProps {
  descriptionHtml: string
  roomSuggestions?: string[]
  spec: ProductTabsSpecData
  reviewPanel: ReactNode
}

function renderPanel(tabId: ProductTabId, props: PanelContentProps): ReactNode {
  switch (tabId) {
    case 'about':
      return <AboutPanel descriptionHtml={props.descriptionHtml} roomSuggestions={props.roomSuggestions} />
    case 'details':
      return <DetailsPanel spec={props.spec} />
    case 'shipping':
      return <ShippingPanel />
    case 'review':
      return props.reviewPanel
    default:
      return null
  }
}

function AboutPanel({
  descriptionHtml,
  roomSuggestions,
}: {
  descriptionHtml: string
  roomSuggestions?: string[]
}) {
  return (
    <div className="space-y-6">
      {descriptionHtml && (
        <div
          className="prose prose-sm max-w-none text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      {roomSuggestions && roomSuggestions.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-foreground">Perfect For</h3>
          <div className="flex flex-wrap gap-2">
            {roomSuggestions.map((room) => (
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
  )
}

function DetailsPanel({ spec }: { spec: ProductTabsSpecData }) {
  const availableVariants = (spec.variants ?? []).filter((variant) => variant.isAvailable)
  const availableFrames = (spec.frames ?? []).filter((frame) => frame.isAvailable)

  return (
    <div className="space-y-6 text-sm text-muted-foreground">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
          <dt className="font-medium text-foreground">SKU</dt>
          <dd>{spec.sku}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
          <dt className="font-medium text-foreground">Orientation</dt>
          <dd className="capitalize">{spec.orientation}</dd>
        </div>
        {spec.primaryColor && (
          <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
            <dt className="font-medium text-foreground">Primary colour</dt>
            <dd className="capitalize">{spec.primaryColor}</dd>
          </div>
        )}
        {spec.styles && spec.styles.length > 0 && (
          <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
            <dt className="font-medium text-foreground">Style</dt>
            <dd className="capitalize">{spec.styles.map((style) => style.replace(/-/g, ' ')).join(', ')}</dd>
          </div>
        )}
        {spec.subjects && spec.subjects.length > 0 && (
          <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
            <dt className="font-medium text-foreground">Subject</dt>
            <dd className="capitalize">{spec.subjects.map((subject) => subject.replace(/-/g, ' ')).join(', ')}</dd>
          </div>
        )}
      </dl>

      {availableVariants.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-foreground">Available Sizes</h3>
          <ul className="space-y-1">
            {availableVariants.map((variant) => (
              <li key={variant.id}>{variant.sizeLabel}</li>
            ))}
          </ul>
        </div>
      )}

      {availableFrames.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-foreground">Frame &amp; Material Options</h3>
          <ul className="space-y-2">
            {availableFrames.map((frame) => (
              <li key={frame.id}>
                <span className="font-medium text-foreground">{frame.name}</span>
                {frame.material && <span> — {frame.material}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Sourced from our actual policy — packages/web/app/routes/shipping.tsx and
 * packages/web/app/routes/returns.tsx — not the reference site's claims.
 */
function ShippingPanel() {
  return (
    <div className="space-y-6 text-sm text-muted-foreground">
      <section>
        <h3 className="mb-2 text-lg font-semibold text-foreground">Shipping</h3>
        <p>
          Free shipping on orders over ₹999. Below that, the cost is calculated and shown at
          checkout before payment.
        </p>
        <p className="mt-2">
          Every piece is printed to order: production takes 2–4 business days, and delivery adds
          another 3–7 business days depending on your pincode. Framed orders can take a little
          longer than poster-only orders.
        </p>
        <p className="mt-2">
          A tracking link arrives by email as soon as your order ships. You can also check status
          anytime on the{' '}
          <a href="/track" className="text-primary hover:underline">
            order tracking page
          </a>
          .
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-lg font-semibold text-foreground">Returns &amp; Refunds</h3>
        <p>
          Return any order within 30 days of delivery for a full refund. Start a return from{' '}
          <a href="/account/orders" className="text-primary hover:underline">
            your order history
          </a>{' '}
          or email{' '}
          <a href="mailto:support@chobii.art" className="text-primary hover:underline">
            support@chobii.art
          </a>
          .
        </p>
        <p className="mt-2">
          Damaged in transit or received the wrong item? Email us a photo within 48 hours of
          delivery and we&apos;ll ship a replacement or refund you, no return required in most
          cases.
        </p>
        <p className="mt-2">
          Once a return is received and checked, refunds are issued to the original payment
          method within 5–7 business days.
        </p>
      </section>

      <p className="text-xs">
        <a href="/shipping" className="text-primary hover:underline">
          Full shipping policy
        </a>{' '}
        ·{' '}
        <a href="/returns" className="text-primary hover:underline">
          Full returns policy
        </a>
      </p>
    </div>
  )
}

export default ProductTabs
