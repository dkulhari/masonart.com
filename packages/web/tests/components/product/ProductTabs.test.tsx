/**
 * ProductTabs — #521.
 *
 * The PDP's long-form content (description, room suggestions, spec data,
 * shipping/returns, reviews) moves from flat stacked sections into a tab bar:
 * About The Artwork | Details And Customization | Shipping And Returns | Review.
 *
 * Two things this suite is careful about because they are load-bearing for
 * the wider app rather than for this component alone:
 *
 *  - The review panel is an opaque ReactNode owned by the caller
 *    (ProductReviewSection). This suite never re-asserts what is INSIDE it —
 *    only that it is rendered unmodified when the Review tab is active.
 *  - The `#reviews` deep link. `buybox-reviews-link` in ProductDetail is a
 *    plain `<a href="#reviews">` this component does not own and cannot
 *    intercept. ProductTabs has to notice the hash on its own — on mount and
 *    on `hashchange` — and both select the Review tab and scroll its panel
 *    into view, since a plain anchor click cannot find an unmounted tabpanel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductTabs, type ProductTabsSpecData } from '~/components/product/ProductTabs'

const SPEC: ProductTabsSpecData = {
  sku: 'PAC347',
  orientation: 'square',
  styles: ['wabi-sabi', 'minimalist'],
  subjects: ['nature-landscape'],
  primaryColor: 'neutral',
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
    {
      id: 'v2',
      sizeId: 's2',
      sizeLabel: '36" x 36" / 91 x 91 cm',
      widthInches: 36,
      heightInches: 36,
      price: '3200.00',
      stockQuantity: -1,
      isAvailable: true,
      sku: 'PAC347-36',
    },
  ],
  frames: [
    {
      id: 'f1',
      type: 'poster-only',
      name: 'Rolled Canvas',
      description: 'Unframed, ready to mount',
      material: 'Cotton-poly blend canvas',
      priceModifierType: 'fixed',
      priceModifierValue: 0,
      isAvailable: true,
    },
    {
      id: 'f2',
      type: 'black-frame',
      name: 'Black Frame',
      description: 'Solid wood, matte black',
      material: 'Engineered wood',
      priceModifierType: 'percentage',
      priceModifierValue: 0.35,
      isAvailable: true,
    },
  ],
}

const DESCRIPTION_HTML = '<p>A quiet study in <strong>rain</strong>.</p>'
const ROOM_SUGGESTIONS = ['living-room', 'bedroom']

function renderTabs(props: Partial<React.ComponentProps<typeof ProductTabs>> = {}) {
  return render(
    <ProductTabs
      descriptionHtml={DESCRIPTION_HTML}
      roomSuggestions={ROOM_SUGGESTIONS}
      spec={SPEC}
      reviewPanel={
        <section id="reviews" data-testid="product-reviews">
          <div data-testid="reviews-header">4.8 (104 reviews)</div>
          <div data-testid="review-grid">reviews go here</div>
        </section>
      }
      {...props}
    />
  )
}

/** The four tabs, in reference order. */
const TAB_LABELS = [
  'About The Artwork',
  'Details And Customization',
  'Shipping And Returns',
  'Review',
]

beforeEach(() => {
  window.location.hash = ''
})

afterEach(() => {
  window.location.hash = ''
})

describe('ProductTabs', () => {
  describe('structure and ARIA semantics', () => {
    it('renders a tablist with the four reference tabs in order', () => {
      renderTabs()

      const tablist = screen.getByRole('tablist')
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((tab) => tab.textContent)).toEqual(TAB_LABELS)
      expect(tablist).toBeTruthy()
    })

    it('marks exactly one tab selected, defaulting to About The Artwork', () => {
      renderTabs()

      const tabs = screen.getAllByRole('tab')
      const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')
      expect(selected).toHaveLength(1)
      expect(selected[0]!.textContent).toBe('About The Artwork')
    })

    it('associates the visible tabpanel with its tab via aria-controls/aria-labelledby', () => {
      renderTabs()

      const activeTab = screen.getByRole('tab', { name: 'About The Artwork' })
      const panel = screen.getByRole('tabpanel')

      expect(activeTab.getAttribute('aria-controls')).toBe(panel.id)
      expect(panel.getAttribute('aria-labelledby')).toBe(activeTab.id)
    })

    it('gives only the selected tab a 0 tabindex (roving tabindex)', () => {
      renderTabs()

      const tabs = screen.getAllByRole('tab')
      const tabIndexes = tabs.map((tab) => tab.getAttribute('tabindex'))
      expect(tabIndexes).toEqual(['0', '-1', '-1', '-1'])
    })
  })

  describe('selecting a tab', () => {
    it('clicking a tab swaps the panel and updates aria-selected', () => {
      renderTabs()

      fireEvent.click(screen.getByRole('tab', { name: 'Details And Customization' }))

      expect(
        screen.getByRole('tab', { name: 'Details And Customization' }).getAttribute(
          'aria-selected'
        )
      ).toBe('true')
      expect(
        screen.getByRole('tab', { name: 'About The Artwork' }).getAttribute('aria-selected')
      ).toBe('false')
      expect(screen.getByText('PAC347')).toBeTruthy()
    })

    it('only one tabpanel is in the document at a time', () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Shipping And Returns' }))
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    })
  })

  describe('keyboard navigation', () => {
    it('ArrowRight moves focus to and activates the next tab, wrapping past the last', () => {
      renderTabs()

      const [about, details, shipping, review] = screen.getAllByRole('tab')

      about!.focus()
      fireEvent.keyDown(about!, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(details)
      expect(details!.getAttribute('aria-selected')).toBe('true')

      fireEvent.keyDown(details!, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(shipping)

      fireEvent.keyDown(shipping!, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(review)

      // Wraps back to the first tab.
      fireEvent.keyDown(review!, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(about)
      expect(about!.getAttribute('aria-selected')).toBe('true')
    })

    it('ArrowLeft moves focus to and activates the previous tab, wrapping past the first', () => {
      renderTabs()

      const [about, , , review] = screen.getAllByRole('tab')

      about!.focus()
      fireEvent.keyDown(about!, { key: 'ArrowLeft' })
      expect(document.activeElement).toBe(review)
      expect(review!.getAttribute('aria-selected')).toBe('true')
    })

    it('Home and End jump to the first and last tab', () => {
      renderTabs()
      const tabs = screen.getAllByRole('tab')
      const [about, , , review] = tabs

      about!.focus()
      fireEvent.keyDown(about!, { key: 'End' })
      expect(document.activeElement).toBe(review)

      fireEvent.keyDown(review!, { key: 'Home' })
      expect(document.activeElement).toBe(about)
    })
  })

  describe('About The Artwork panel', () => {
    it('renders the description HTML', () => {
      renderTabs()
      const panel = screen.getByRole('tabpanel')
      expect(panel.innerHTML).toContain('A quiet study in <strong>rain</strong>.')
    })

    it('renders room suggestions as pills', () => {
      renderTabs()
      expect(screen.getByText(/living room/i)).toBeTruthy()
      expect(screen.getByText(/bedroom/i)).toBeTruthy()
    })

    it('omits the room-suggestions block when there are none', () => {
      renderTabs({ roomSuggestions: [] })
      expect(screen.queryByText(/perfect for/i)).toBeNull()
    })
  })

  describe('Details And Customization panel', () => {
    it('shows the SKU and orientation', () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Details And Customization' }))

      const panel = screen.getByRole('tabpanel')
      expect(panel.textContent).toContain('PAC347')
      expect(panel.textContent).toMatch(/square/i)
    })

    it('lists available sizes with both units', () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Details And Customization' }))

      const panel = screen.getByRole('tabpanel')
      expect(panel.textContent).toContain('24" x 24" / 61 x 61 cm')
      expect(panel.textContent).toContain('36" x 36" / 91 x 91 cm')
    })

    it('lists frame/material options when present', () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Details And Customization' }))

      const panel = screen.getByRole('tabpanel')
      expect(panel.textContent).toContain('Rolled Canvas')
      expect(panel.textContent).toContain('Cotton-poly blend canvas')
      expect(panel.textContent).toContain('Black Frame')
    })

    it('does not invent a materials section when no frames are given', () => {
      renderTabs({ spec: { ...SPEC, frames: undefined } })
      fireEvent.click(screen.getByRole('tab', { name: 'Details And Customization' }))

      expect(screen.queryByText('Rolled Canvas')).toBeNull()
    })
  })

  describe('Shipping And Returns panel', () => {
    it('states our actual free-shipping threshold and return window', () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Shipping And Returns' }))

      const panel = screen.getByRole('tabpanel')
      // Sourced from packages/web/app/routes/shipping.tsx and returns.tsx —
      // not the reference site's claims.
      expect(panel.textContent).toContain('₹999')
      expect(panel.textContent).toMatch(/30 days?/i)
      expect(panel.textContent).toMatch(/support@chobii\.art/)
    })
  })

  describe('Review panel', () => {
    it('renders the caller-supplied review ReactNode unmodified when active', () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Review' }))

      const section = screen.getByTestId('product-reviews')
      expect(section.id).toBe('reviews')
      expect(screen.getByTestId('reviews-header')).toBeTruthy()
      expect(screen.getByTestId('review-grid')).toBeTruthy()
    })
  })

  describe('#reviews hash sync', () => {
    it('selects the Review tab on mount when the URL already carries #reviews', async () => {
      window.location.hash = '#reviews'
      renderTabs()

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: 'Review' }).getAttribute('aria-selected')
        ).toBe('true')
      })
      expect(screen.getByTestId('product-reviews')).toBeTruthy()
    })

    it('selects the Review tab and scrolls it into view when the hash changes after mount', async () => {
      renderTabs()
      expect(
        screen.getByRole('tab', { name: 'About The Artwork' }).getAttribute('aria-selected')
      ).toBe('true')

      // jsdom does not implement scrollIntoView; stand one up so we can assert
      // the component asked for it once the panel exists to scroll to.
      const scrollIntoView = vi.fn()
      // The element does not exist yet — it mounts once the tab switches — so
      // the spy is installed by patching the prototype instead of the node.
      Element.prototype.scrollIntoView = scrollIntoView

      window.location.hash = '#reviews'
      fireEvent(window, new HashChangeEvent('hashchange'))

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: 'Review' }).getAttribute('aria-selected')
        ).toBe('true')
      })
      expect(screen.getByTestId('product-reviews')).toBeTruthy()
      expect(scrollIntoView).toHaveBeenCalled()

      // @ts-expect-error - test-only cleanup of the patched prototype method
      delete Element.prototype.scrollIntoView
    })

    it('ignores hash changes that are not #reviews', async () => {
      renderTabs()
      fireEvent.click(screen.getByRole('tab', { name: 'Shipping And Returns' }))

      window.location.hash = '#somewhere-else'
      fireEvent(window, new HashChangeEvent('hashchange'))

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(
        screen.getByRole('tab', { name: 'Shipping And Returns' }).getAttribute(
          'aria-selected'
        )
      ).toBe('true')
    })
  })

  describe('controlled mode', () => {
    it('defers to activeTabId + onTabChange instead of managing its own state', () => {
      const onTabChange = vi.fn()
      renderTabs({ activeTabId: 'shipping', onTabChange })

      expect(
        screen.getByRole('tab', { name: 'Shipping And Returns' }).getAttribute(
          'aria-selected'
        )
      ).toBe('true')

      fireEvent.click(screen.getByRole('tab', { name: 'Review' }))

      expect(onTabChange).toHaveBeenCalledWith('review')
      // Controlled: clicking alone must not flip the selection without the
      // caller feeding activeTabId back in.
      expect(
        screen.getByRole('tab', { name: 'Shipping And Returns' }).getAttribute(
          'aria-selected'
        )
      ).toBe('true')
    })
  })
})
