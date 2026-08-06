/**
 * DeliveryEstimate tests (ticket #517)
 *
 * The window is pinned via the `now` prop rather than asserted against
 * `new Date()`, so these tests are not a moving target. The expected dates
 * below were hand-computed the same way the component does it: business
 * days (Sat/Sun skipped) added to a fixed Monday, formatted `en-US`
 * "MMM D".
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeliveryEstimate, DEFAULT_LEAD_TIME_DAYS } from '~/components/product/DeliveryEstimate'

// Monday, Jan 5 2026. +5 business days -> Mon Jan 12. +11 business days -> Tue Jan 20.
const MONDAY = new Date(2026, 0, 5)

describe('DeliveryEstimate', () => {
  it('defaults to a 5–11 business day window (2–4 day production + 3–7 day delivery)', () => {
    expect(DEFAULT_LEAD_TIME_DAYS).toEqual({ min: 5, max: 11 })
  })

  it('renders the promise text around a bold date range, given a fixed date', () => {
    render(<DeliveryEstimate now={MONDAY} />)

    expect(screen.getByText(/Arrives soon! Get it by/)).toBeTruthy()
    expect(screen.getByText(/if you order today/)).toBeTruthy()
    expect(screen.getByText('Jan 12–Jan 20')).toBeTruthy()
  })

  it('derives the range from `leadTimeDays`, not a hardcoded date', () => {
    // 1 business day and 3 business days from the same Monday: Tue Jan 6, Thu Jan 8.
    render(<DeliveryEstimate now={MONDAY} leadTimeDays={{ min: 1, max: 3 }} />)

    expect(screen.getByText('Jan 6–Jan 8')).toBeTruthy()
  })

  it('moves the window when `now` moves — nothing is hardcoded', () => {
    const laterMonday = new Date(2026, 1, 2) // Feb 2 2026, a Monday
    render(<DeliveryEstimate now={laterMonday} leadTimeDays={{ min: 1, max: 1 }} />)

    // +1 business day from Feb 2 (Mon) is Feb 3 (Tue).
    expect(screen.getByText('Feb 3–Feb 3')).toBeTruthy()
  })

  it('bolds the date range while the surrounding sentence stays muted', () => {
    render(<DeliveryEstimate now={MONDAY} />)

    const range = screen.getByText('Jan 12–Jan 20')
    expect(range.tagName).toBe('STRONG')
    expect(range.className).toContain('font-semibold')
    expect(range.className).toContain('text-foreground')

    const wrapper = screen.getByText(/Arrives soon! Get it by/).closest('p')
    expect(wrapper?.className).toContain('text-muted-foreground')
  })

  it('renders a check glyph', () => {
    const { container } = render(<DeliveryEstimate now={MONDAY} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('accepts and merges a custom className', () => {
    const { container } = render(<DeliveryEstimate now={MONDAY} className="mt-4" />)
    expect(container.querySelector('p')?.className).toContain('mt-4')
  })
})
