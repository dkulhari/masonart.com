/**
 * TrustList tests (ticket #519)
 *
 * Two concerns: the copy is true of us (not the reference site's "Free
 * Shipping on All Orders"), and the `?` next to each title is a real,
 * keyboard-operable tooltip rather than a decorative glyph.
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrustList } from '~/components/product/TrustList'

describe('TrustList', () => {
  it('renders four rows', () => {
    render(<TrustList />)
    expect(screen.getAllByRole('button', { name: /^More about:/ })).toHaveLength(4)
  })

  it('claims free shipping over ₹999, not free on all orders', () => {
    render(<TrustList />)
    expect(screen.getByText('Free Shipping Over ₹999')).toBeTruthy()
    expect(screen.queryByText(/Free Shipping on All Orders/i)).toBeNull()
    expect(screen.queryByText(/free.*all orders/i)).toBeNull()
  })

  it('states the real return window', () => {
    render(<TrustList />)
    expect(screen.getByText('30 Days Easy Returns')).toBeTruthy()
  })

  it('links its "Learn more" sub-line at the real returns policy page', () => {
    render(<TrustList />)
    const link = screen.getByRole('link', { name: 'Learn more.' })
    expect(link.getAttribute('href')).toBe('/returns')
  })

  it('states the real payment rail', () => {
    render(<TrustList />)
    expect(screen.getByText('Safe Payment Options')).toBeTruthy()
    expect(screen.getByText(/Razorpay/)).toBeTruthy()
  })

  it('states the real made-to-order production line', () => {
    render(<TrustList />)
    expect(screen.getByText('Made Just For You')).toBeTruthy()
    expect(screen.getByText(/printed to order/)).toBeTruthy()
  })

  describe('the `?` tooltip', () => {
    it('is closed by default', () => {
      render(<TrustList />)
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('opens on focus, exposing content via aria-describedby', () => {
      render(<TrustList />)
      const trigger = screen.getAllByRole('button', { name: /^More about:/ })[0]!
      fireEvent.focus(trigger)

      const tooltip = screen.getByRole('tooltip')
      expect(tooltip.id).toBe(trigger.getAttribute('aria-describedby'))
    })

    it('closes on blur', () => {
      render(<TrustList />)
      const trigger = screen.getAllByRole('button', { name: /^More about:/ })[0]!
      fireEvent.focus(trigger)
      expect(screen.getByRole('tooltip')).toBeTruthy()

      fireEvent.blur(trigger)
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('closes on Escape while focused', () => {
      render(<TrustList />)
      const trigger = screen.getAllByRole('button', { name: /^More about:/ })[0]!
      fireEvent.focus(trigger)
      expect(screen.getByRole('tooltip')).toBeTruthy()

      fireEvent.keyDown(trigger, { key: 'Escape' })
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('toggles open on click, for touch input with no hover/focus event', () => {
      render(<TrustList />)
      const trigger = screen.getAllByRole('button', { name: /^More about:/ })[0]!

      fireEvent.click(trigger)
      expect(screen.getByRole('tooltip')).toBeTruthy()

      fireEvent.click(trigger)
      expect(screen.queryByRole('tooltip')).toBeNull()
    })

    it('carries real content sourced from the approval workflow, not filler', () => {
      render(<TrustList />)
      const trigger = screen.getAllByRole('button', { name: /^More about:/ })[0]!
      fireEvent.focus(trigger)

      expect(screen.getByRole('tooltip').textContent).toMatch(/photo approval/i)
    })
  })
})
