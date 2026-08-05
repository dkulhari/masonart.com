/**
 * Tests for ReviewForm Component
 *
 * Tests form rendering, validation, submission, and states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm, ReviewFormSkeleton } from '~/components/reviews/ReviewForm';

// The form talks to the media helper directly; the network is not under test.
const { uploadReviewMedia } = vi.hoisted(() => ({
  uploadReviewMedia: vi.fn(),
}));
vi.mock('~/hooks/useReviews', () => ({ uploadReviewMedia }));

/** A File with a forced size — `new File(['a'], ...)` is always 1 byte. */
function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File(['a'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

let objectUrlCounter = 0;

beforeEach(() => {
  objectUrlCounter = 0;
  uploadReviewMedia.mockReset();
  uploadReviewMedia.mockResolvedValue({ id: 'media-1' });

  // jsdom ships neither of these, and the picker mints previews on selection.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:mock-${++objectUrlCounter}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fill in a rating and a body long enough to pass validation. */
function fillValidForm(rating = 5, content = 'This is a great product!') {
  const starButtons = screen
    .getAllByRole('button')
    .filter((btn) => btn.getAttribute('aria-label')?.includes('Rate'));
  fireEvent.click(starButtons[rating - 1]);

  const contentInput = screen.getByLabelText(/Review \*/);
  fireEvent.change(contentInput, { target: { value: content } });
}

function attachFiles(files: File[]) {
  fireEvent.change(screen.getByTestId('review-media-input'), {
    target: { files },
  });
}

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

  describe('Media Upload', () => {
    it('does not touch the media helper when nothing is attached', async () => {
      const handleSubmit = vi.fn().mockResolvedValue({ id: 'rev-1' });

      render(
        <ReviewForm productId="123" isAuthenticated onSubmit={handleSubmit} />
      );

      fillValidForm();
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(screen.getByText('Thank you for your review!')).toBeInTheDocument();
      });
      expect(uploadReviewMedia).not.toHaveBeenCalled();
    });

    it('creates the review first, then uploads media against the returned id', async () => {
      const order: string[] = [];
      const handleSubmit = vi.fn().mockImplementation(async () => {
        order.push('create-review');
        return { id: 'rev-99' };
      });
      uploadReviewMedia.mockImplementation(async (id: string, file: File) => {
        order.push(`upload:${id}:${file.name}`);
        return { id: 'media-1' };
      });

      render(
        <ReviewForm productId="123" isAuthenticated onSubmit={handleSubmit} />
      );

      attachFiles([
        makeFile('one.jpg', 'image/jpeg'),
        makeFile('two.png', 'image/png'),
      ]);
      await waitFor(() => {
        expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      });

      fillValidForm();
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(screen.getByText('Thank you for your review!')).toBeInTheDocument();
      });

      // The review must exist before a single byte is presigned against it.
      expect(order).toEqual([
        'create-review',
        'upload:rev-99:one.jpg',
        'upload:rev-99:two.png',
      ]);
    });

    it('keeps the created review and offers a retry when an upload fails', async () => {
      const handleSubmit = vi.fn().mockResolvedValue({ id: 'rev-99' });
      uploadReviewMedia.mockRejectedValue(new Error('Upload failed (500)'));

      render(
        <ReviewForm productId="123" isAuthenticated onSubmit={handleSubmit} />
      );

      attachFiles([makeFile('one.jpg', 'image/jpeg')]);
      await waitFor(() => {
        expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      });

      fillValidForm();
      fireEvent.click(screen.getByText('Submit Review'));

      // The review survived: the customer is told it saved, not that it failed.
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /your review was saved/i })
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument();

      // The file is still staged, with its own retry.
      expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /retry one\.jpg/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/Upload failed \(500\)/)).toBeInTheDocument();

      // And it is NOT reported as a failed review submission.
      expect(
        screen.queryByText('Thank you for your review!')
      ).not.toBeInTheDocument();
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('retrying a failed upload does not create a second review', async () => {
      const handleSubmit = vi.fn().mockResolvedValue({ id: 'rev-99' });
      uploadReviewMedia
        .mockRejectedValueOnce(new Error('Upload failed (500)'))
        .mockResolvedValueOnce({ id: 'media-1' });

      render(
        <ReviewForm productId="123" isAuthenticated onSubmit={handleSubmit} />
      );

      attachFiles([makeFile('one.jpg', 'image/jpeg')]);
      await waitFor(() => {
        expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      });

      fillValidForm();
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /your review was saved/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => {
        expect(screen.getByText('Thank you for your review!')).toBeInTheDocument();
      });

      expect(handleSubmit).toHaveBeenCalledTimes(1);
      expect(uploadReviewMedia).toHaveBeenCalledTimes(2);
      expect(uploadReviewMedia).toHaveBeenLastCalledWith(
        'rev-99',
        expect.objectContaining({ name: 'one.jpg' })
      );
    });

    it('tells the customer media publishes with the review once approved', async () => {
      const handleSubmit = vi.fn().mockResolvedValue({ id: 'rev-99' });

      render(
        <ReviewForm productId="123" isAuthenticated onSubmit={handleSubmit} />
      );

      attachFiles([makeFile('one.jpg', 'image/jpeg')]);
      await waitFor(() => {
        expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      });

      fillValidForm();
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(
          screen.getByText(/publish with your review once it's approved/i)
        ).toBeInTheDocument();
      });
    });

    it('reports the review as failed when creation itself fails, with no upload', async () => {
      const handleSubmit = vi.fn().mockRejectedValue(new Error('Network error'));

      render(
        <ReviewForm productId="123" isAuthenticated onSubmit={handleSubmit} />
      );

      attachFiles([makeFile('one.jpg', 'image/jpeg')]);
      await waitFor(() => {
        expect(screen.getByLabelText('Remove one.jpg')).toBeInTheDocument();
      });

      fillValidForm();
      fireEvent.click(screen.getByText('Submit Review'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
      expect(uploadReviewMedia).not.toHaveBeenCalled();
    });

    it('hides the picker when media is not allowed', () => {
      render(
        <ReviewForm productId="123" isAuthenticated allowMedia={false} />
      );

      expect(screen.queryByTestId('review-media-input')).not.toBeInTheDocument();
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
