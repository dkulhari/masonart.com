/**
 * Tests for TrackingStatusBadge Component
 *
 * Tests status badge rendering with correct icons and colors.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrackingStatusBadge, STATUS_CONFIG } from '~/components/order/TrackingStatusBadge'
import type { ShipmentStatus } from '~/lib/api'

// ============================================================================
// Tests
// ============================================================================

describe('TrackingStatusBadge Component', () => {
  const statuses: ShipmentStatus[] = [
    'pending',
    'label_created',
    'shipped',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'returned',
    'cancelled',
  ]

  describe('Status Rendering', () => {
    statuses.forEach((status) => {
      it(`renders ${status} status with correct label`, () => {
        render(<TrackingStatusBadge status={status} />)

        const config = STATUS_CONFIG[status]
        expect(screen.getByText(config.label)).toBeInTheDocument()
      })
    })

    it('renders pending status correctly', () => {
      render(<TrackingStatusBadge status="pending" />)
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('renders delivered status correctly', () => {
      render(<TrackingStatusBadge status="delivered" />)
      expect(screen.getByText('Delivered')).toBeInTheDocument()
    })

    it('renders in_transit status correctly', () => {
      render(<TrackingStatusBadge status="in_transit" />)
      expect(screen.getByText('In Transit')).toBeInTheDocument()
    })
  })

  describe('Size Variants', () => {
    it('renders small size', () => {
      const { container } = render(<TrackingStatusBadge status="shipped" size="sm" />)
      const badge = container.querySelector('[class*="px-2"]')
      expect(badge).toBeInTheDocument()
    })

    it('renders medium size by default', () => {
      const { container } = render(<TrackingStatusBadge status="shipped" />)
      const badge = container.querySelector('[class*="px-3"]')
      expect(badge).toBeInTheDocument()
    })

    it('renders large size', () => {
      const { container } = render(<TrackingStatusBadge status="shipped" size="lg" />)
      const badge = container.querySelector('[class*="px-4"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies correct colors for delivered status', () => {
      const { container } = render(<TrackingStatusBadge status="delivered" />)
      const badge = container.firstChild as HTMLElement
      expect(badge.className).toContain('text-green')
      expect(badge.className).toContain('bg-green')
    })

    it('applies correct colors for cancelled status', () => {
      const { container } = render(<TrackingStatusBadge status="cancelled" />)
      const badge = container.firstChild as HTMLElement
      expect(badge.className).toContain('text-red')
      expect(badge.className).toContain('bg-red')
    })

    it('applies custom className', () => {
      const { container } = render(
        <TrackingStatusBadge status="pending" className="custom-class" />
      )
      const badge = container.firstChild as HTMLElement
      expect(badge.className).toContain('custom-class')
    })
  })

  describe('Icon Rendering', () => {
    it('renders an icon with the badge', () => {
      const { container } = render(<TrackingStatusBadge status="shipped" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })
})
