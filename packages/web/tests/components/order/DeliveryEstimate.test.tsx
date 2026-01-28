/**
 * Tests for DeliveryEstimate Component
 *
 * Tests delivery date display and formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeliveryEstimate } from '~/components/order/DeliveryEstimate'

// ============================================================================
// Test Setup
// ============================================================================

describe('DeliveryEstimate Component', () => {
  beforeEach(() => {
    // Mock current date to a fixed value
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-02-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Delivered State', () => {
    it('shows delivered message when status is delivered', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-08T00:00:00Z"
          deliveredAt="2024-02-08T14:30:00Z"
          status="delivered"
        />
      )

      expect(screen.getByText('Delivered')).toBeInTheDocument()
    })

    it('shows delivery date when delivered', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-08T00:00:00Z"
          deliveredAt="2024-02-08T14:30:00Z"
          status="delivered"
        />
      )

      // The date should be formatted
      expect(screen.getByText(/February/i)).toBeInTheDocument()
    })
  })

  describe('Cancelled/Returned State', () => {
    it('returns null for cancelled orders', () => {
      const { container } = render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-15T00:00:00Z"
          deliveredAt={null}
          status="cancelled"
        />
      )

      expect(container.firstChild).toBeNull()
    })

    it('returns null for returned orders', () => {
      const { container } = render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-15T00:00:00Z"
          deliveredAt={null}
          status="returned"
        />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('No Estimate State', () => {
    it('shows calculating message when no estimate', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt={null}
          deliveredAt={null}
          status="shipped"
        />
      )

      expect(screen.getByText('Estimated Delivery')).toBeInTheDocument()
      expect(screen.getByText('Calculating...')).toBeInTheDocument()
    })
  })

  describe('Estimated Delivery Display', () => {
    it('shows "Today" for same-day delivery', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-10T00:00:00Z"
          deliveredAt={null}
          status="out_for_delivery"
        />
      )

      expect(screen.getByText('Arriving Soon!')).toBeInTheDocument()
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('shows "Tomorrow" for next-day delivery', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-11T00:00:00Z"
          deliveredAt={null}
          status="in_transit"
        />
      )

      expect(screen.getByText('Arriving Soon!')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })

    it('shows "Arriving in a few days" for delivery within 3 days', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-12T00:00:00Z"
          deliveredAt={null}
          status="shipped"
        />
      )

      expect(screen.getByText('Arriving in a few days')).toBeInTheDocument()
    })

    it('shows "Estimated Delivery" for delivery beyond 3 days', () => {
      render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-20T00:00:00Z"
          deliveredAt={null}
          status="shipped"
        />
      )

      expect(screen.getByText('Estimated Delivery')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-15T00:00:00Z"
          deliveredAt={null}
          status="shipped"
          className="custom-class"
        />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('uses urgent styling for delivery today', () => {
      const { container } = render(
        <DeliveryEstimate
          estimatedDeliveryAt="2024-02-10T00:00:00Z"
          deliveredAt={null}
          status="out_for_delivery"
        />
      )

      expect(container.querySelector('[class*="amber"]')).toBeInTheDocument()
    })
  })
})
