/**
 * Tests for StarRating Component
 *
 * Tests star rating display, accessibility, and interactive functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating, StarRatingSkeleton } from '~/components/reviews/StarRating';

describe('StarRating Component', () => {
  describe('Basic Rendering', () => {
    it('renders correct number of stars', () => {
      render(<StarRating rating={3} />);

      // Should have 5 stars by default
      const container = screen.getByRole('img');
      const stars = container.querySelectorAll('span.relative');
      expect(stars).toHaveLength(5);
    });

    it('renders with custom maxRating', () => {
      render(<StarRating rating={3} maxRating={10} />);

      const container = screen.getByRole('img');
      const stars = container.querySelectorAll('span.relative');
      expect(stars).toHaveLength(10);
    });

    it('renders filled stars based on rating', () => {
      render(<StarRating rating={4} />);

      const container = screen.getByRole('img');
      // Check that filled star elements exist (fill-amber-400 class)
      const filledStars = container.querySelectorAll('.fill-amber-400');
      expect(filledStars.length).toBe(4);
    });

    it('renders partial stars for decimal ratings', () => {
      render(<StarRating rating={3.5} showHalfStars />);

      // Component should render half-filled star for .5 rating
      const container = screen.getByRole('img');
      expect(container).toBeInTheDocument();
    });

    it('renders 0 filled stars for 0 rating', () => {
      render(<StarRating rating={0} />);

      const container = screen.getByRole('img');
      const filledStars = container.querySelectorAll('.fill-amber-400');
      expect(filledStars.length).toBe(0);
    });
  });

  describe('Size Variants', () => {
    it('renders xs size', () => {
      render(<StarRating rating={3} size="xs" />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('renders sm size', () => {
      render(<StarRating rating={3} size="sm" />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('renders md size (default)', () => {
      render(<StarRating rating={3} size="md" />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('renders lg size', () => {
      render(<StarRating rating={3} size="lg" />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  describe('Display Options', () => {
    it('displays rating count when showCount is true', () => {
      render(<StarRating rating={4} showCount count={128} />);

      expect(screen.getByText('(128)')).toBeInTheDocument();
    });

    it('does not display count when showCount is false', () => {
      render(<StarRating rating={4} showCount={false} count={128} />);

      expect(screen.queryByText('(128)')).not.toBeInTheDocument();
    });

    it('displays numeric rating value when showValue is true', () => {
      render(<StarRating rating={4.5} showValue />);

      expect(screen.getByText('4.5')).toBeInTheDocument();
    });

    it('formats large count with locale', () => {
      render(<StarRating rating={4} showCount count={1250} />);

      expect(screen.getByText('(1,250)')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has correct aria-label', () => {
      render(<StarRating rating={4.5} />);

      const container = screen.getByRole('img');
      expect(container).toHaveAttribute(
        'aria-label',
        'Rating: 4.5 out of 5 stars'
      );
    });

    it('includes count in aria-label when provided', () => {
      render(<StarRating rating={4} showCount count={128} />);

      const container = screen.getByRole('img');
      expect(container).toHaveAttribute(
        'aria-label',
        'Rating: 4.0 out of 5 stars, 128 reviews'
      );
    });

    it('has correct role for display mode', () => {
      render(<StarRating rating={4} />);

      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  describe('Interactive Mode', () => {
    it('calls onRatingChange when star is clicked', () => {
      const handleChange = vi.fn();
      render(
        <StarRating rating={0} interactive onRatingChange={handleChange} />
      );

      const container = screen.getByRole('img');
      const stars = container.querySelectorAll('span.relative');

      // Click the 3rd star
      fireEvent.click(stars[2]);

      expect(handleChange).toHaveBeenCalledWith(3);
    });

    it('has cursor-pointer class when interactive', () => {
      render(<StarRating rating={0} interactive />);

      const container = screen.getByRole('img');
      const stars = container.querySelectorAll('span.relative');

      expect(stars[0]).toHaveClass('cursor-pointer');
    });

    it('supports keyboard navigation', () => {
      const handleChange = vi.fn();
      render(
        <StarRating rating={0} interactive onRatingChange={handleChange} />
      );

      const container = screen.getByRole('img');
      const stars = container.querySelectorAll('span.relative');

      // Press Enter on 4th star
      fireEvent.keyDown(stars[3], { key: 'Enter' });

      expect(handleChange).toHaveBeenCalledWith(4);
    });

    it('supports Space key for selection', () => {
      const handleChange = vi.fn();
      render(
        <StarRating rating={0} interactive onRatingChange={handleChange} />
      );

      const container = screen.getByRole('img');
      const stars = container.querySelectorAll('span.relative');

      fireEvent.keyDown(stars[4], { key: ' ' });

      expect(handleChange).toHaveBeenCalledWith(5);
    });

    it('has role="button" on interactive stars', () => {
      render(<StarRating rating={0} interactive />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(5);
    });

    it('has aria-label on interactive stars', () => {
      render(<StarRating rating={0} interactive />);

      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveAttribute('aria-label', 'Rate 1 stars');
      expect(buttons[4]).toHaveAttribute('aria-label', 'Rate 5 stars');
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      render(<StarRating rating={4} className="custom-class" />);

      const container = screen.getByRole('img');
      expect(container).toHaveClass('custom-class');
    });
  });
});

describe('StarRatingSkeleton Component', () => {
  it('renders skeleton stars', () => {
    render(<StarRatingSkeleton />);

    // Skeleton should have animate-pulse class
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders 5 star placeholders', () => {
    render(<StarRatingSkeleton />);

    // Should have 5 rounded bg-muted divs for stars
    const starPlaceholders = document.querySelectorAll('.rounded.bg-muted');
    expect(starPlaceholders.length).toBeGreaterThanOrEqual(5);
  });

  it('shows count placeholder when showCount is true', () => {
    render(<StarRatingSkeleton showCount />);

    // Should have additional placeholder for count
    const placeholders = document.querySelectorAll('.rounded.bg-muted');
    expect(placeholders.length).toBeGreaterThan(5);
  });

  it('applies custom className', () => {
    const { container } = render(<StarRatingSkeleton className="my-skeleton" />);

    expect(container.querySelector('.my-skeleton')).toBeInTheDocument();
  });
});
