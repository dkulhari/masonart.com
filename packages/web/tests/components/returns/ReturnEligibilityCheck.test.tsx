/**
 * Tests for ReturnEligibilityCheck Component
 *
 * Tests eligibility display and state handling.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReturnEligibilityCheck } from '~/components/returns/ReturnEligibilityCheck'

// ============================================================================
// Tests
// ============================================================================

describe('ReturnEligibilityCheck Component', () => {
  describe('Loading State', () => {
    it('shows loading skeleton when isLoading is true', () => {
      const { container } = render(
        <ReturnEligibilityCheck isEligible={false} isLoading />
      )

      // Should have animated skeleton elements
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('Eligible State', () => {
    it('shows eligible message when isEligible is true', () => {
      render(<ReturnEligibilityCheck isEligible daysRemaining={14} />)

      expect(screen.getByText('Eligible for Return')).toBeInTheDocument()
      expect(screen.getByText(/14 days remaining/i)).toBeInTheDocument()
    })

    it('shows days remaining correctly', () => {
      render(<ReturnEligibilityCheck isEligible daysRemaining={7} />)

      expect(screen.getByText(/7 days remaining/i)).toBeInTheDocument()
    })

    it('shows singular day when 1 day remaining', () => {
      render(<ReturnEligibilityCheck isEligible daysRemaining={1} />)

      expect(screen.getByText('1 day remaining in return window')).toBeInTheDocument()
    })

    it('shows last day message when 0 days remaining', () => {
      render(<ReturnEligibilityCheck isEligible daysRemaining={0} />)

      expect(screen.getByText('Last day to request a return')).toBeInTheDocument()
    })

    it('shows urgent state when 3 or fewer days remaining', () => {
      render(<ReturnEligibilityCheck isEligible daysRemaining={2} />)

      expect(screen.getByText('Return Window Closing Soon!')).toBeInTheDocument()
    })

    it('shows generic message when daysRemaining is undefined', () => {
      render(<ReturnEligibilityCheck isEligible />)

      expect(screen.getByText('Eligible for Return')).toBeInTheDocument()
      expect(screen.getByText('You can request a return for this order.')).toBeInTheDocument()
    })
  })

  describe('Not Eligible State', () => {
    it('shows not eligible message when isEligible is false', () => {
      render(<ReturnEligibilityCheck isEligible={false} />)

      expect(screen.getByText('Not Eligible for Return')).toBeInTheDocument()
    })

    it('shows custom message when provided', () => {
      render(
        <ReturnEligibilityCheck
          isEligible={false}
          message="Order must be delivered first"
        />
      )

      expect(screen.getByText('Order must be delivered first')).toBeInTheDocument()
    })

    it('shows default message when no custom message', () => {
      render(<ReturnEligibilityCheck isEligible={false} />)

      expect(
        screen.getByText('This order is not eligible for a return request.')
      ).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <ReturnEligibilityCheck isEligible className="custom-class" />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('uses green styling for eligible state', () => {
      const { container } = render(
        <ReturnEligibilityCheck isEligible daysRemaining={10} />
      )

      expect(container.querySelector('[class*="green"]')).toBeInTheDocument()
    })

    it('uses amber styling for urgent state', () => {
      const { container } = render(
        <ReturnEligibilityCheck isEligible daysRemaining={2} />
      )

      expect(container.querySelector('[class*="amber"]')).toBeInTheDocument()
    })

    it('uses red styling for not eligible state', () => {
      const { container } = render(<ReturnEligibilityCheck isEligible={false} />)

      expect(container.querySelector('[class*="red"]')).toBeInTheDocument()
    })
  })
})
