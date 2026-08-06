import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SalePrice } from '~/components/product/SalePrice'
import type { SalePricing } from '~/components/product/SalePrice'

const SALE: SalePricing = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'Monsoon Sale — 40% off',
  percentOff: 40,
  basePrice: '2000.00',
  salePrice: '1200.00',
  locked: false,
}

describe('SalePrice', () => {
  describe('with no promotion running', () => {
    it('prints the base price plainly when sale is null', () => {
      render(<SalePrice sale={null} basePrice="2000.00" />)

      expect(screen.getByTestId('price-current').textContent).toContain('2,000.00')
      expect(screen.queryByTestId('price-was')).toBeNull()
      expect(screen.queryByTestId('sale-percent-off')).toBeNull()
    })

    it('treats an undefined sale the same as an absent one', () => {
      render(<SalePrice sale={undefined} basePrice={2000} />)

      expect(screen.getByTestId('price-current').textContent).toContain('2,000.00')
      expect(screen.queryByTestId('price-was')).toBeNull()
    })

    it('never strikes a price through when nothing is discounted', () => {
      const { container } = render(<SalePrice sale={null} basePrice="2000.00" />)
      expect(container.innerHTML).not.toContain('line-through')
    })
  })

  describe('with a promotion running', () => {
    it('shows the sale price as the price being charged', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" />)
      expect(screen.getByTestId('price-current').textContent).toContain('1,200.00')
    })

    it('strikes the base price through beside it', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" />)

      const was = screen.getByTestId('price-was')
      expect(was.textContent).toContain('2,000.00')
      expect(was.className).toContain('line-through')
    })

    it('reads the struck price off the payload, not off the basePrice prop', () => {
      // The payload is the one source of truth for what the sale is worth
      // (design §7). A card holding a stale prop must not be able to invent a
      // deeper discount than the server resolved.
      render(
        <SalePrice
          sale={{ ...SALE, basePrice: '2500.00' }}
          basePrice="2000.00"
        />
      )
      expect(screen.getByTestId('price-was').textContent).toContain('2,500.00')
    })

    it('marks the depth with the percentage the server resolved', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" />)
      expect(screen.getByTestId('sale-percent-off').textContent).toContain('40')
    })

    it('never computes a discount of its own', () => {
      // 2000 -> 1200 is 40% off, but the payload says 15. The payload wins:
      // no component on the storefront derives a percentage.
      render(<SalePrice sale={{ ...SALE, percentOff: 15 }} basePrice="2000.00" />)

      const marker = screen.getByTestId('sale-percent-off').textContent ?? ''
      expect(marker).toContain('15')
      expect(marker).not.toContain('40')
    })

    it('drops the marker rather than printing "0% off"', () => {
      render(<SalePrice sale={{ ...SALE, percentOff: 0 }} basePrice="2000.00" />)

      expect(screen.queryByTestId('sale-percent-off')).toBeNull()
      // The saving is still real, so the struck price stays.
      expect(screen.getByTestId('price-was')).toBeTruthy()
    })

    it('gives the struck price an accessible name, since a strike is not read aloud', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" />)
      expect(screen.getByTestId('price-was').getAttribute('aria-label')).toContain(
        'Regular price'
      )
    })
  })

  describe('the members gate', () => {
    it('tags a locked price so the viewer knows it is not theirs yet', () => {
      render(<SalePrice sale={{ ...SALE, locked: true }} basePrice="2000.00" />)
      expect(screen.getByTestId('sale-members-tag').textContent).toContain('Members')
    })

    it('carries no tag once the price is the viewer’s', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" />)
      expect(screen.queryByTestId('sale-members-tag')).toBeNull()
    })

    it('still shows the locked price — shown, not charged (design §7)', () => {
      render(<SalePrice sale={{ ...SALE, locked: true }} basePrice="2000.00" />)
      expect(screen.getByTestId('price-current').textContent).toContain('1,200.00')
    })

    it('drops the tag for a viewer who joined mid-session', () => {
      // The payload was resolved before the join, so it still says locked.
      // `isMember` is the shared signal (#443) catching up, exactly as the
      // cart's locked-saving row does — the component never asks who the
      // viewer is, it is told.
      render(
        <SalePrice sale={{ ...SALE, locked: true }} basePrice="2000.00" isMember />
      )
      expect(screen.queryByTestId('sale-members-tag')).toBeNull()
    })

    it('cannot lock a price the payload left open', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" isMember={false} />)
      expect(screen.queryByTestId('sale-members-tag')).toBeNull()
    })
  })

  describe('the token set', () => {
    it('uses the reserved --sale token and no second loud colour', () => {
      // Parity §3.3: the orange Featured and purple AI badges already clash
      // with a monochrome system. The sale marker spends the one warm token
      // the design reserves for exactly this, and adds nothing new.
      const { container } = render(
        <SalePrice sale={{ ...SALE, locked: true }} basePrice="2000.00" />
      )
      const html = container.innerHTML

      expect(html).toContain('sale')
      for (const stray of [
        'green-',
        'red-',
        'orange-',
        'purple-',
        'yellow-',
        'blue-',
      ]) {
        expect(html).not.toContain(stray)
      }
    })
  })

  describe('layout hooks the callers need', () => {
    it('renders the prefix the card puts before a range price', () => {
      render(<SalePrice sale={null} basePrice="2000.00" prefix="From" />)
      expect(screen.getByText('From')).toBeTruthy()
    })

    it('keeps the prefix in front of a discounted price too', () => {
      render(<SalePrice sale={SALE} basePrice="2000.00" prefix="From" />)

      expect(screen.getByText('From')).toBeTruthy()
      expect(screen.getByTestId('price-current').textContent).toContain('1,200.00')
    })

    it('passes a className through so the card and the panel can size it', () => {
      const { container } = render(
        <SalePrice sale={SALE} basePrice="2000.00" className="text-3xl" />
      )
      expect((container.firstChild as HTMLElement).className).toContain('text-3xl')
    })
  })
})
