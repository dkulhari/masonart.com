/**
 * Tests for ReviewForm Component
 *
 * Tests form rendering, validation, submission, and states.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm, ReviewFormSkeleton } from '~/components/reviews/ReviewForm';

describe('ReviewForm Component', () => {
  describe('Unauthenticated State', () => {
    it('shows login prompt when not authenticated', () => {
      render(<ReviewForm productId="123" isAuthenticated={false} />);

      expect(screen.getByText('Sign in to write a review')).toBeInTheDocument();
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });

    it('does not show form when not authenticated', () => {
      render(<ReviewForm productId="123" isAuthenticated={false} />);

      expect(screen.queryByLabelText(/Rating/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Review/)).not.toBeInTheDocument();
    });
  });

  describe('Authenticated State - Form Rendering', () => {
    it('renders form when authenticated', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      expect(screen.getByText('Write a Review')).toBeInTheDocument();
      expect(screen.getByText(/Rating/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Review \*/)).toBeInTheDocument();
      expect(screen.getByText('Submit Review')).toBeInTheDocument();
    });

    it('shows star rating selector', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      // Should have interactive star rating
      const buttons = screen.getAllByRole('button');
      const starButtons = buttons.filter(btn => btn.getAttribute('aria-label')?.includes('Rate'));
      expect(starButtons.length).toBe(5);
    });

    it('shows character counters', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      expect(screen.getByText('0/255')).toBeInTheDocument(); // Title counter
      expect(screen.getByText('0/5000')).toBeInTheDocument(); // Content counter
    });

    it('shows minimum character requirement', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      expect(screen.getByText(/Minimum 10 characters required/)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('validates required rating on submit attempt', async () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      // Fill content to enable partial validation
      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a valid review content' } });
      fireEvent.blur(contentInput);

      // Button should still be disabled without rating
      const submitButton = screen.getByText('Submit Review');
      expect(submitButton).toBeDisabled();
    });

    it('validates required content on blur', async () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      // Focus and blur the content field without entering anything
      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.focus(contentInput);
      fireEvent.blur(contentInput);

      await waitFor(() => {
        expect(screen.getByText('Review content is required')).toBeInTheDocument();
      });
    });

    it('validates minimum content length', async () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      // Enter short content
      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'Short' } });
      fireEvent.blur(contentInput);

      await waitFor(() => {
        expect(screen.getByText(/Review must be at least 10 characters/)).toBeInTheDocument();
      });
    });

    it('updates character count when typing', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a test review' } });

      expect(screen.getByText('21/5000')).toBeInTheDocument();
    });

    it('disables submit when form is invalid', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      const submitButton = screen.getByText('Submit Review');
      expect(submitButton).toBeDisabled();
    });

    it('enables submit when form is valid', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      // Select rating
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[4]); // 5 stars

      // Enter content
      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a great product, highly recommend!' } });

      const submitButton = screen.getByText('Submit Review');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form Interaction', () => {
    it('selects rating when star is clicked', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );

      // Click 4th star
      fireEvent.click(starButtons[3]);

      // Should have visual indication (checked by filled stars)
      // The star rating component handles the visual state
      expect(starButtons[3]).toHaveAttribute('aria-label', 'Rate 4 stars');
    });

    it('rating selection updates state correctly', () => {
      render(<ReviewForm productId="123" isAuthenticated />);

      // Select rating
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[4]); // 5 stars

      // Enter valid content
      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a great product!' } });

      // Submit button should now be enabled
      const submitButton = screen.getByText('Submit Review');
      expect(submitButton).not.toBeDisabled();
    });

    it('handles cancel button', () => {
      const handleCancel = vi.fn();
      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          onCancel={handleCancel}
        />
      );

      fireEvent.click(screen.getByText('Cancel'));
      expect(handleCancel).toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('shows loading state during submission', async () => {
      const handleSubmit = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          onSubmit={handleSubmit}
        />
      );

      // Fill form
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[4]);

      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a great product!' } });

      // Submit
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(screen.getByText('Submitting...')).toBeInTheDocument();
      });
    });

    it('calls onSubmit with form data', async () => {
      const handleSubmit = vi.fn().mockResolvedValue(undefined);

      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          onSubmit={handleSubmit}
        />
      );

      // Fill form
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[3]); // 4 stars

      const titleInput = screen.getByLabelText(/Title/);
      fireEvent.change(titleInput, { target: { value: 'Great product' } });

      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is an amazing product!' } });

      // Submit
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith({
          rating: 4,
          title: 'Great product',
          content: 'This is an amazing product!',
        });
      });
    });

    it('shows success state after submission', async () => {
      const handleSubmit = vi.fn().mockResolvedValue(undefined);

      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          onSubmit={handleSubmit}
        />
      );

      // Fill form
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[4]);

      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a great product!' } });

      // Submit
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(screen.getByText('Thank you for your review!')).toBeInTheDocument();
      });
    });

    it('calls onSuccess callback after submission', async () => {
      const handleSubmit = vi.fn().mockResolvedValue(undefined);
      const handleSuccess = vi.fn();

      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          onSubmit={handleSubmit}
          onSuccess={handleSuccess}
        />
      );

      // Fill form
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[4]);

      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a great product!' } });

      // Submit
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(handleSuccess).toHaveBeenCalledWith({
          rating: 5,
          title: '',
          content: 'This is a great product!',
        });
      });
    });

    it('shows error state on submission failure', async () => {
      const handleSubmit = vi.fn().mockRejectedValue(new Error('Network error'));

      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          onSubmit={handleSubmit}
        />
      );

      // Fill form
      const starButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-label')?.includes('Rate')
      );
      fireEvent.click(starButtons[4]);

      const contentInput = screen.getByLabelText(/Review \*/);
      fireEvent.change(contentInput, { target: { value: 'This is a great product!' } });

      // Submit
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Initial Data', () => {
    it('populates form with initial data', () => {
      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          initialData={{
            rating: 4,
            title: 'Initial title',
            content: 'Initial content here',
          }}
        />
      );

      expect(screen.getByDisplayValue('Initial title')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Initial content here')).toBeInTheDocument();
    });
  });

  describe('Modal Variant', () => {
    it('renders modal variant with close button', () => {
      const handleCancel = vi.fn();
      render(
        <ReviewForm
          productId="123"
          isAuthenticated
          variant="modal"
          onCancel={handleCancel}
        />
      );

      const closeButton = screen.getByLabelText('Close');
      expect(closeButton).toBeInTheDocument();

      fireEvent.click(closeButton);
      expect(handleCancel).toHaveBeenCalled();
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      const { container } = render(
        <ReviewForm
          productId="123"
          isAuthenticated
          className="custom-form"
        />
      );

      expect(container.querySelector('.custom-form')).toBeInTheDocument();
    });
  });
});

describe('ReviewFormSkeleton Component', () => {
  it('renders skeleton with animate-pulse', () => {
    render(<ReviewFormSkeleton />);

    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('has star rating placeholders', () => {
    render(<ReviewFormSkeleton />);

    // Should have 5 star placeholders
    const starPlaceholders = document.querySelectorAll('.h-8.w-8.rounded.bg-muted');
    expect(starPlaceholders.length).toBe(5);
  });

  it('has input field placeholders', () => {
    render(<ReviewFormSkeleton />);

    // Should have title and content placeholders
    const inputPlaceholders = document.querySelectorAll('.rounded-lg.bg-muted');
    expect(inputPlaceholders.length).toBeGreaterThanOrEqual(2);
  });

  it('applies custom className', () => {
    const { container } = render(<ReviewFormSkeleton className="my-skeleton" />);

    expect(container.querySelector('.my-skeleton')).toBeInTheDocument();
  });
});
