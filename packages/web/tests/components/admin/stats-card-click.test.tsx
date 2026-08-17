/**
 * StatsCard as a filter control (#626).
 *
 * The four tiles on /admin/ai-moderation pass `onClick` to filter the queue by
 * status. `StatsCardProps` never declared it, so React dropped the prop and the
 * tiles did nothing — a dead control of exactly the kind #603 and #604 were
 * about, found this time by the typecheck rather than by an operator.
 *
 * `href` already existed for the navigating case and renders an anchor. The
 * clicking case has to be a real button: a div with a click handler is
 * unreachable by keyboard and invisible to a screen reader, and these tiles are
 * the only way to filter that queue.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Clock } from 'lucide-react'

import { StatsCard } from '~/components/admin/StatsCard'

afterEach(cleanup)

describe('StatsCard', () => {
  it('is a button when it filters, and reports the click', () => {
    const onClick = vi.fn()
    render(<StatsCard title="Pending Review" value={3} icon={Clock} onClick={onClick} />)

    const control = screen.getByRole('button', { name: /pending review/i })
    fireEvent.click(control)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stays a plain card when it does nothing', () => {
    render(<StatsCard title="Total Revenue" value="₹2,500" />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Total Revenue')).toBeInTheDocument()
  })

  it('renders a link when it navigates, not a button', () => {
    render(<StatsCard title="Orders" value={12} href="/admin/orders" />)

    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute(
      'href',
      '/admin/orders'
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})
