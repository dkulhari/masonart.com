/**
 * Tests for ReturnRequestForm Component
 *
 * Tests form validation and submission.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReturnRequestForm, RETURN_REASONS, MIN_DETAILS_LENGTH } from '~/components/returns/ReturnRequestForm'

// ============================================================================
// Mocks
// ============================================================================

vi.mock('~/lib/api', async () => {
  const actual = await vi.importActual('~/lib/api')
  return {
    ...actual,
    returnsApi: {
      createReturn: vi.fn(),
    },
  }
})

import { returnsApi } from '~/lib/api'
const mockedApi = vi.mocked(returnsApi)

// ============================================================================
// Tests
// ============================================================================

describe('ReturnRequestForm Component', () => {
  const defaultProps = {
    orderId: 'order-123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Reason Selection', () => {
    it('renders all return reasons', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      RETURN_REASONS.forEach((reason) => {
        expect(screen.getByText(reason.label)).toBeInTheDocument()
      })
    })

    it('shows reason descriptions', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      RETURN_REASONS.forEach((reason) => {
        expect(screen.getByText(reason.description)).toBeInTheDocument()
      })
    })

    it('allows selecting a reason', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      const defectiveOption = screen.getByText('Defective Product')
      fireEvent.click(defectiveOption)

      const radio = screen.getByRole('radio', { name: /defective product/i })
      expect(radio).toBeChecked()
    })
  })

  describe('Details Textarea', () => {
    it('renders reason details textarea', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      expect(
        screen.getByPlaceholderText(/please provide specific details/i)
      ).toBeInTheDocument()
    })

    it('shows minimum character requirement', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      expect(screen.getByText(/minimum 10 characters required/i)).toBeInTheDocument()
    })

    it('shows character count when typing', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a test reason with enough characters' } })

      expect(screen.getByText(/44 \/ 2000/)).toBeInTheDocument()
    })

    it('shows validation error for short details', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'Short' } })

      // Should still show minimum requirement message
      expect(screen.getByText(/minimum 10 characters required/i)).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('submit button is disabled when no reason selected', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a valid reason with enough characters' } })

      const submitButton = screen.getByRole('button', { name: /submit return request/i })
      expect(submitButton).toBeDisabled()
    })

    it('submit button is disabled when details too short', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      // Select reason
      fireEvent.click(screen.getByText('Defective Product'))

      // Enter short details
      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'Short' } })

      const submitButton = screen.getByRole('button', { name: /submit return request/i })
      expect(submitButton).toBeDisabled()
    })

    it('submit button is enabled when form is valid', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      // Select reason
      fireEvent.click(screen.getByText('Defective Product'))

      // Enter valid details
      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a valid reason with enough characters' } })

      const submitButton = screen.getByRole('button', { name: /submit return request/i })
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('Form Submission', () => {
    it('shows loading state when submitting', async () => {
      mockedApi.createReturn.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          message: 'Success',
          return: {
            id: 'ret-123',
            orderId: 'order-123',
            reason: 'defective',
            reasonDetails: 'Test details',
            status: 'pending',
            requestedAt: new Date().toISOString(),
            approvedAt: null,
            processedAt: null,
            refundAmount: null,
            createdAt: new Date().toISOString(),
          },
        }), 100))
      )

      render(<ReturnRequestForm {...defaultProps} />)

      // Fill form
      fireEvent.click(screen.getByText('Defective Product'))
      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a valid reason with enough characters' } })

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /submit return request/i }))

      expect(screen.getByText('Submitting...')).toBeInTheDocument()
    })

    it('shows success message after submission', async () => {
      mockedApi.createReturn.mockResolvedValue({
        message: 'Success',
        return: {
          id: 'ret-123',
          orderId: 'order-123',
          reason: 'defective',
          reasonDetails: 'Test details',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          approvedAt: null,
          processedAt: null,
          refundAmount: null,
          createdAt: new Date().toISOString(),
        },
      })

      render(<ReturnRequestForm {...defaultProps} />)

      // Fill form
      fireEvent.click(screen.getByText('Defective Product'))
      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a valid reason with enough characters' } })

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /submit return request/i }))

      await waitFor(() => {
        expect(screen.getByText('Return Request Submitted')).toBeInTheDocument()
      })
    })

    it('calls onSuccess callback when submission succeeds', async () => {
      const onSuccess = vi.fn()
      const mockReturn = {
        id: 'ret-123',
        orderId: 'order-123',
        reason: 'defective' as const,
        reasonDetails: 'Test details',
        status: 'pending' as const,
        requestedAt: new Date().toISOString(),
        approvedAt: null,
        processedAt: null,
        refundAmount: null,
        createdAt: new Date().toISOString(),
      }

      mockedApi.createReturn.mockResolvedValue({
        message: 'Success',
        return: mockReturn,
      })

      render(<ReturnRequestForm {...defaultProps} onSuccess={onSuccess} />)

      // Fill and submit form
      fireEvent.click(screen.getByText('Defective Product'))
      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a valid reason with enough characters' } })
      fireEvent.click(screen.getByRole('button', { name: /submit return request/i }))

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(mockReturn)
      })
    })

    it('shows error message when submission fails', async () => {
      mockedApi.createReturn.mockRejectedValue(new Error('Return window expired'))

      render(<ReturnRequestForm {...defaultProps} />)

      // Fill and submit form
      fireEvent.click(screen.getByText('Defective Product'))
      const textarea = screen.getByPlaceholderText(/please provide specific details/i)
      fireEvent.change(textarea, { target: { value: 'This is a valid reason with enough characters' } })
      fireEvent.click(screen.getByRole('button', { name: /submit return request/i }))

      await waitFor(() => {
        expect(screen.getByText('Return window expired')).toBeInTheDocument()
      })
    })
  })

  describe('Cancel Button', () => {
    it('shows cancel button when onCancel provided', () => {
      render(<ReturnRequestForm {...defaultProps} onCancel={() => {}} />)

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('hides cancel button when onCancel not provided', () => {
      render(<ReturnRequestForm {...defaultProps} />)

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    })

    it('calls onCancel when cancel button clicked', () => {
      const onCancel = vi.fn()
      render(<ReturnRequestForm {...defaultProps} onCancel={onCancel} />)

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

      expect(onCancel).toHaveBeenCalled()
    })
  })
})
