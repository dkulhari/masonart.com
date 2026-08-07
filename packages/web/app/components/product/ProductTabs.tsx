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
 * `spec` is a thin projection of `ProductDetailData` shared by the About and
 * the Details panels — `variants`/`frames` reuse SizeSelector's/FrameSelector's
 * own types, so the integrator can hand this `product.variants` and
 * `product.frames` directly with no reshaping. `rating` is
 * `product.rating` — the aggregate the route already fetches
 * (`fetchReviewAggregate` in routes/posters/$slug.tsx) and the buy panel
 * already renders. `reviewPanel` is an opaque ReactNode: the integrator slots
 * the existing `<ProductReviewSection />` in unchanged, and this component
 * never inspects or clones it.
 *
 * ## Why the rating is surfaced OUTSIDE the Review panel
 *
 * Social proof on an expensive purchase has to be legible before the click,
 * not behind it. So two things sit permanently in the tab bar's row: a count
 * on the Review tab itself, and a star/average summary beside the bar that
 * doubles as a way into the panel.
 *
 * The count is rendered `aria-hidden` inside the tab button ON PURPOSE. The
 * Review tab's ACCESSIBLE NAME has to stay exactly `Review`: Playwright's
 * `getByRole('tab', { name: 'Review' })` matches the accessible name by
 * case-insensitive EQUALITY, not substring (playwright-core
 * `matchesAttributePart`, op `=`), and tests/e2e/product-detail.spec.ts locates
 * the tab that way in three places. Screen readers still get the number: the
 * Review tab is `aria-describedby` the summary, which spells it out.
 *
 * Zero reviews renders `No reviews yet` as plain text rather than a `(0)` badge
 * or a button — a `(0)` reads as a broken counter, and a control that opens an
 * empty wall is a promise the page cannot keep. Absent aggregate (`undefined`/
 * `null`, i.e. we do not KNOW the count) renders nothing at all; that is the
 * same null-is-not-zero distinction ProductReviewSection draws.
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
import { ArrowRight, Star } from 'lucide-react'
import { cn } from '~/lib/utils'
import { useFreeShippingThresholdLabel } from '~/lib/free-shipping'
import type { SizeVariant } from './SizeSelector'
import type { FrameOptionData } from './FrameSelector'

// ============================================================================
// Types
// ============================================================================

export type ProductTabId = 'about' | 'details' | 'shipping' | 'review'

/** `ProductDetailData['rating']` — the aggregate, reused verbatim. */
export interface ProductTabsRating {
  averageRating: number
  reviewCount: number
}

/**
 * The About and Details panels' data — a projection of `ProductDetailData`
 * (packages/web/app/components/product/ProductDetail.tsx) and the shared
 * `Product` type (packages/shared/src/types/product.ts).
 *
 * Only fields that actually exist on those types are here. Things the
 * reference site shows that we have no field for — print medium/paper stock,
 * weight, care instructions, edition/print-technology copy, and any artist
 * biography beyond a name — are left out rather than invented; see the ticket
 * report for the full list.
 */
export interface ProductTabsSpecData {
  sku: string
  orientation: string
  /** About: what the artwork IS. */
  styles?: string[]
  /** About: what the artwork DEPICTS. */
  subjects?: string[]
  /** About: the artwork's dominant colour. */
  primaryColor?: string
  /** `ProductDetailData['artist']` — we hold a name and a slug, no bio. */
  artist?: { name: string; slug?: string }
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
  /** Spec data for the About and Details And Customization tabs. */
  spec: ProductTabsSpecData
  /**
   * `ProductDetailData['rating']`. Pass it straight through — `undefined`/
   * `null` means "unknown", `reviewCount: 0` means "none yet", and the two
   * render differently on purpose (see the file header).
   */
  rating?: ProductTabsRating | null
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

/** The id the Review tab points `aria-describedby` at. */
const REVIEW_SUMMARY_ID = 'product-tabs-review-summary'

/**
 * Our real returns window, from packages/web/app/routes/returns.tsx. Named
 * because the Shipping panel and the About panel's cross-links both quote it
 * and must not drift apart.
 *
 * The free-shipping figure used to sit beside it as `'₹999'` and no longer
 * can: it is an admin setting (#569/#570), so both panels read
 * `useFreeShippingThresholdLabel()` and state whatever is in force.
 */
const RETURN_WINDOW_DAYS = 30

// ============================================================================
// Helpers
// ============================================================================

/** `wabi-sabi` → `wabi sabi`. Our enums are kebab-case; humans are not. */
function humanize(value: string): string {
  return value.replace(/-/g, ' ')
}

function humanizeList(values: string[]): string {
  return values.map(humanize).join(', ')
}

function pluralReviews(count: number): string {
  return count === 1 ? '1 review' : `${count} reviews`
}

// ============================================================================
// Component
// ============================================================================

export function ProductTabs({
  descriptionHtml,
  roomSuggestions,
  spec,
  rating,
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

  // `undefined`/`null` is "we did not load an aggregate", which is not the same
  // claim as "this poster has no reviews" — only the latter gets a summary.
  const hasAggregate = rating !== undefined && rating !== null
  const reviewCount = hasAggregate ? rating.reviewCount : 0

  return (
    <div className={cn('border-t border-border pt-10', className)}>
      <div className="relative border-b border-border">
        {/* Centred from `md`, which is where all four labels fit on one line.
            Below that they wrap, and centring a wrap is what turns the bar
            into a three-row zigzag on a 350px column (#523) — each row
            centred on its own axis, so nothing lines up with anything. Left
            aligned with a tighter gutter it packs two-and-two against the
            same left edge as the rest of the page. */}
        <div
          role="tablist"
          aria-label="Product details"
          className="flex flex-wrap items-center gap-x-5 gap-y-1 md:justify-center md:gap-x-8"
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
                // The count is aria-hidden, so the number reaches assistive tech
                // through the summary instead.
                aria-describedby={
                  tab.id === 'review' && hasAggregate ? REVIEW_SUMMARY_ID : undefined
                }
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
                {/* Kept out of the accessible name deliberately — see header. */}
                {tab.id === 'review' && reviewCount > 0 && (
                  <span
                    aria-hidden="true"
                    data-testid="product-tabs-review-count"
                    className="ml-1.5 font-normal text-muted-foreground"
                  >
                    ({reviewCount})
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Below `xl` this is a centred line under the tab bar; from `xl` there
            is room to park it on the bar's own baseline at the right edge
            without colliding with the widest tab label. */}
        {hasAggregate && (
          <div className="flex justify-center pb-4 xl:absolute xl:inset-y-0 xl:right-0 xl:items-center xl:pb-0">
            <ReviewSummary rating={rating} onOpenReviews={() => selectTab('review')} />
          </div>
        )}
      </div>

      {/*
        The floor exists because our seeded descriptions are one sentence long:
        without it the About panel collapses to ~250px and the page hands off to
        the footer before the fold. It is a floor, not padding — every panel
        that has more to say simply grows past it.
      */}
      <div
        role="tabpanel"
        id={panelDomId}
        aria-labelledby={tabDomId}
        tabIndex={0}
        className="flex min-h-[20rem] flex-col pb-10 pt-8 sm:min-h-[24rem]"
      >
        {renderPanel(activeTabMeta.id, {
          descriptionHtml,
          roomSuggestions,
          spec,
          rating: hasAggregate ? rating : undefined,
          reviewPanel,
          onSelectTab: selectTab,
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Review summary
// ============================================================================

function StarRow({ value }: { value: number }) {
  const filled = Math.round(value)
  return (
    <span aria-hidden="true" className="flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((index) => (
        <Star
          key={index}
          className={cn(
            'h-3.5 w-3.5',
            index < filled ? 'fill-rating text-rating' : 'fill-transparent text-border'
          )}
        />
      ))}
    </span>
  )
}

function ReviewSummary({
  rating,
  onOpenReviews,
}: {
  rating: ProductTabsRating
  onOpenReviews: () => void
}) {
  if (rating.reviewCount <= 0) {
    return (
      <p
        id={REVIEW_SUMMARY_ID}
        data-testid="product-tabs-rating"
        className="text-sm text-muted-foreground"
      >
        No reviews yet
      </p>
    )
  }

  return (
    <button
      type="button"
      id={REVIEW_SUMMARY_ID}
      data-testid="product-tabs-rating"
      onClick={onOpenReviews}
      aria-label={`Rated ${rating.averageRating.toFixed(1)} out of 5 from ${pluralReviews(
        rating.reviewCount
      )} — read the reviews`}
      className="group flex items-center gap-2 rounded-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <StarRow value={rating.averageRating} />
      <span className="font-medium text-foreground">{rating.averageRating.toFixed(1)}</span>
      <span className="text-muted-foreground underline-offset-4 group-hover:underline">
        {pluralReviews(rating.reviewCount)}
      </span>
    </button>
  )
}

// ============================================================================
// Panel content
// ============================================================================

interface PanelContentProps {
  descriptionHtml: string
  roomSuggestions?: string[]
  spec: ProductTabsSpecData
  rating?: ProductTabsRating
  reviewPanel: ReactNode
  onSelectTab: (tabId: ProductTabId) => void
}

function renderPanel(tabId: ProductTabId, props: PanelContentProps): ReactNode {
  switch (tabId) {
    case 'about':
      return (
        <AboutPanel
          descriptionHtml={props.descriptionHtml}
          roomSuggestions={props.roomSuggestions}
          spec={props.spec}
          rating={props.rating}
          onSelectTab={props.onSelectTab}
        />
      )
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

/**
 * About The Artwork — everything we hold about the PIECE, as opposed to the
 * printed object (which is Details And Customization's job). `styles`,
 * `subjects`, `primaryColor` and `artist` moved here from the Details spec
 * table for that reason: a shopper reading "About The Artwork" is asking what
 * it is, not what SKU it ships under.
 *
 * The cross-links at the foot are not filler — they are the three questions
 * this region exists to answer, each stated with the real number behind it and
 * each one click from the panel that expands it.
 */
function AboutPanel({
  descriptionHtml,
  roomSuggestions,
  spec,
  rating,
  onSelectTab,
}: {
  descriptionHtml: string
  roomSuggestions?: string[]
  spec: ProductTabsSpecData
  rating?: ProductTabsRating
  onSelectTab: (tabId: ProductTabId) => void
}) {
  // The threshold is an admin setting (#570); the caption states whatever is
  // in force rather than a figure compiled into this file.
  const freeShippingThresholdLabel = useFreeShippingThresholdLabel()

  const glance: Array<{ term: string; value: string }> = []
  if (spec.artist?.name) glance.push({ term: 'Artist', value: spec.artist.name })
  if (spec.styles && spec.styles.length > 0) {
    glance.push({ term: 'Style', value: humanizeList(spec.styles) })
  }
  if (spec.subjects && spec.subjects.length > 0) {
    glance.push({ term: 'Subject', value: humanizeList(spec.subjects) })
  }
  if (spec.primaryColor) glance.push({ term: 'Palette', value: humanize(spec.primaryColor) })

  const sizeCount = (spec.variants ?? []).filter((variant) => variant.isAvailable).length
  const frameCount = (spec.frames ?? []).filter((frame) => frame.isAvailable).length

  const jumps: Array<{ tab: ProductTabId; title: string; caption: string }> = []
  if (sizeCount > 0 || frameCount > 0) {
    const parts: string[] = []
    if (sizeCount > 0) parts.push(sizeCount === 1 ? '1 size' : `${sizeCount} sizes`)
    if (frameCount > 0) parts.push(frameCount === 1 ? '1 finish' : `${frameCount} finishes`)
    jumps.push({
      tab: 'details',
      title: 'Sizes & materials',
      caption: parts.join(' · '),
    })
  }
  jumps.push({
    tab: 'shipping',
    title: 'Shipping & returns',
    caption: `Free over ${freeShippingThresholdLabel} · ${RETURN_WINDOW_DAYS}-day returns`,
  })
  if (rating && rating.reviewCount > 0) {
    jumps.push({
      tab: 'review',
      title: 'What buyers said',
      caption: `${rating.averageRating.toFixed(1)} from ${pluralReviews(rating.reviewCount)}`,
    })
  }

  // `flex-1` + `mt-auto` below: the panel carries a minimum height, and the
  // slack it leaves on a one-sentence description should sit BETWEEN the copy
  // and the cross-links rather than trailing off the bottom of the section.
  return (
    <div className="flex flex-1 flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
        <div className="space-y-6">
          {spec.artist?.name && (
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
              By <span className="text-foreground">{spec.artist.name}</span>
            </p>
          )}

          {/* No typography plugin in tailwind.config.ts, so `prose` would be a
              dead class, and preflight strips the paragraph margins out of the
              description HTML — the arbitrary variants put them back. */}
          {descriptionHtml && (
            <div
              className="max-w-prose text-base leading-relaxed text-muted-foreground [&_p+p]:mt-4 [&_strong]:font-medium [&_strong]:text-foreground"
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
                    {humanize(room)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {glance.length > 0 && (
          <aside className="h-fit rounded-lg border border-border bg-muted/30 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
              At A Glance
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              {glance.map((row) => (
                <div key={row.term} className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{row.term}</dt>
                  <dd className="text-right capitalize text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </div>

      <div className="mt-auto border-t border-border pt-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jumps.map((jump) => (
            <li key={jump.tab}>
              <button
                type="button"
                onClick={() => onSelectTab(jump.tab)}
                data-testid={`product-tabs-jump-${jump.tab}`}
                className="group flex w-full items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{jump.title}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {jump.caption}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function DetailsPanel({ spec }: { spec: ProductTabsSpecData }) {
  const availableVariants = (spec.variants ?? []).filter((variant) => variant.isAvailable)
  const availableFrames = (spec.frames ?? []).filter((frame) => frame.isAvailable)

  return (
    <div className="space-y-8 text-sm text-muted-foreground">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
          <dt className="font-medium text-foreground">SKU</dt>
          <dd>{spec.sku}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border py-2 sm:justify-start">
          <dt className="font-medium text-foreground">Orientation</dt>
          <dd className="capitalize">{spec.orientation}</dd>
        </div>
      </dl>

      <div className="grid gap-8 sm:grid-cols-2">
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
            <h3 className="mb-3 text-lg font-semibold text-foreground">
              Frame &amp; Material Options
            </h3>
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
    </div>
  )
}

/**
 * Sourced from our actual policy — packages/web/app/routes/shipping.tsx and
 * packages/web/app/routes/returns.tsx — not the reference site's claims.
 */
function ShippingPanel() {
  const freeShippingThresholdLabel = useFreeShippingThresholdLabel()

  return (
    <div className="grid gap-8 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-12">
      <section>
        <h3 className="mb-2 text-lg font-semibold text-foreground">Shipping</h3>
        <p>
          Free shipping on orders over {freeShippingThresholdLabel}. Below that, the cost is
          calculated and shown at checkout before payment.
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
        <p className="mt-4 text-xs">
          <a href="/shipping" className="text-primary hover:underline">
            Full shipping policy
          </a>
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-lg font-semibold text-foreground">Returns &amp; Refunds</h3>
        <p>
          Return any order within {RETURN_WINDOW_DAYS} days of delivery for a full refund. Start a
          return from{' '}
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
        <p className="mt-4 text-xs">
          <a href="/returns" className="text-primary hover:underline">
            Full returns policy
          </a>
        </p>
      </section>
    </div>
  )
}

export default ProductTabs
