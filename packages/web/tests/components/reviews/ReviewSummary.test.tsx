/**
 * Tests for ReviewSummary Component
 *
 * Tests review summary display, rating distribution, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ReviewSummary,
  ReviewSummarySkeleton,
  calculateDistribution,
  calculateAverageRating,
  type ReviewStats,
} from '~/components/reviews/ReviewSummary';

// Mock data
const mockStats: ReviewStats = {
  averageRating: 4.2,
  totalReviews: 128,
  distribution: [
    { rating: 5, count: 80, percentage: 62.5 },
    { rating: 4, count: 30, percentage: 23.4 },
    { rating: 3, count: 10, percentage: 7.8 },
    { rating: 2, count: 5, percentage: 3.9 },
    { rating: 1, count: 3, percentage: 2.4 },
  ],
};

describe('ReviewSummary Component', () => {
  describe('Full Layout (Default)', () => {
    it('displays average rating', () => {
      render(<ReviewSummary stats={mockStats} />);

      expect(screen.getByText('4.2')).toBeInTheDocument();
    });

    it('displays total review count', () => {
      render(<ReviewSummary stats={mockStats} />);

      expect(screen.getByText(/Based on 128 reviews/)).toBeInTheDocument();
    });

    it('displays rating distribution', () => {
      render(<ReviewSummary stats={mockStats} />);

      // Should show rating labels
      expect(screen.getByText('5 stars')).toBeInTheDocument();
      expect(screen.getByText('4 stars')).toBeInTheDocument();
      expect(screen.getByText('3 stars')).toBeInTheDocument();
      expect(screen.getByText('2 stars')).toBeInTheDocument();
      expect(screen.getByText('1 star')).toBeInTheDocument();
    });

    it('displays review counts in distribution', () => {
      render(<ReviewSummary stats={mockStats} />);

      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders progress bars', () => {
      render(<ReviewSummary stats={mockStats} />);

      const progressBars = document.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(5);
    });

    it('renders star rating component', () => {
      render(<ReviewSummary stats={mockStats} />);

      const starRating = document.querySelector('[role="img"]');
      expect(starRating).toBeInTheDocument();
    });
  });

  describe('Compact Layout', () => {
    it('displays compact layout when compact prop is true', () => {
      render(<ReviewSummary stats={mockStats} compact />);

      // Should show rating count inline
      expect(screen.getByText(/128 reviews/)).toBeInTheDocument();
    });

    it('does not show distribution in compact mode', () => {
      render(<ReviewSummary stats={mockStats} compact />);

      // Should not show rating bars
      expect(screen.queryByText('5 stars')).not.toBeInTheDocument();
    });
  });

  describe('Without Distribution', () => {
    it('hides distribution when showDistribution is false', () => {
      render(<ReviewSummary stats={mockStats} showDistribution={false} />);

      expect(screen.queryByText('5 stars')).not.toBeInTheDocument();
    });

    it('still shows average rating when distribution is hidden', () => {
      render(<ReviewSummary stats={mockStats} showDistribution={false} />);

      expect(screen.getByText('4.2')).toBeInTheDocument();
    });
  });

  describe('Empty Distribution', () => {
    it('handles empty distribution array', () => {
      const statsWithEmptyDist: ReviewStats = {
        ...mockStats,
        distribution: [],
      };

      render(<ReviewSummary stats={statsWithEmptyDist} />);

      // Should not show any rating bars
      const progressBars = document.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(0);
    });
  });

  describe('Singular vs Plural', () => {
    it('shows "review" singular when totalReviews is 1', () => {
      const singleReviewStats: ReviewStats = {
        ...mockStats,
        totalReviews: 1,
      };

      render(<ReviewSummary stats={singleReviewStats} />);

      expect(screen.getByText(/Based on 1 review$/)).toBeInTheDocument();
    });

    it('shows "reviews" plural when totalReviews is more than 1', () => {
      render(<ReviewSummary stats={mockStats} />);

      expect(screen.getByText(/Based on 128 reviews/)).toBeInTheDocument();
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      const { container } = render(
        <ReviewSummary stats={mockStats} className="custom-summary" />
      );

      expect(container.querySelector('.custom-summary')).toBeInTheDocument();
    });
  });
});

describe('ReviewSummarySkeleton Component', () => {
  it('renders with animate-pulse', () => {
    render(<ReviewSummarySkeleton />);

    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders distribution skeleton by default', () => {
    render(<ReviewSummarySkeleton />);

    // Should have 5 bar skeletons for distribution
    const barSkeletons = document.querySelectorAll('.h-2.flex-1.rounded.bg-muted');
    expect(barSkeletons.length).toBe(5);
  });

  it('hides distribution skeleton when showDistribution is false', () => {
    render(<ReviewSummarySkeleton showDistribution={false} />);

    const barSkeletons = document.querySelectorAll('.h-2.flex-1.rounded.bg-muted');
    expect(barSkeletons.length).toBe(0);
  });

  it('renders compact skeleton', () => {
    render(<ReviewSummarySkeleton compact />);

    // Compact skeleton should not have large rating display
    const largePlaceholder = document.querySelector('.h-12.w-16');
    expect(largePlaceholder).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ReviewSummarySkeleton className="my-skeleton" />
    );

    expect(container.querySelector('.my-skeleton')).toBeInTheDocument();
  });
});

describe('Helper Functions', () => {
  describe('calculateDistribution', () => {
    it('calculates distribution from reviews', () => {
      const reviews = [
        { rating: 5 },
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
        { rating: 1 },
      ];

      const distribution = calculateDistribution(reviews);

      expect(distribution).toHaveLength(5);
      expect(distribution.find((d) => d.rating === 5)?.count).toBe(2);
      expect(distribution.find((d) => d.rating === 4)?.count).toBe(1);
      expect(distribution.find((d) => d.rating === 3)?.count).toBe(1);
      expect(distribution.find((d) => d.rating === 2)?.count).toBe(0);
      expect(distribution.find((d) => d.rating === 1)?.count).toBe(1);
    });

    it('calculates correct percentages', () => {
      const reviews = [
        { rating: 5 },
        { rating: 5 },
        { rating: 5 },
        { rating: 5 },
      ];

      const distribution = calculateDistribution(reviews);

      expect(distribution.find((d) => d.rating === 5)?.percentage).toBe(100);
      expect(distribution.find((d) => d.rating === 1)?.percentage).toBe(0);
    });

    it('handles empty reviews array', () => {
      const distribution = calculateDistribution([]);

      expect(distribution).toHaveLength(5);
      distribution.forEach((d) => {
        expect(d.count).toBe(0);
      });
    });

    it('rounds ratings to nearest integer', () => {
      const reviews = [
        { rating: 4.7 },
        { rating: 4.2 },
        { rating: 3.5 },
      ];

      const distribution = calculateDistribution(reviews);

      // 4.7 rounds to 5, 4.2 rounds to 4, 3.5 rounds to 4
      expect(distribution.find((d) => d.rating === 5)?.count).toBe(1);
      expect(distribution.find((d) => d.rating === 4)?.count).toBe(2);
    });

    it('returns ratings in descending order', () => {
      const distribution = calculateDistribution([{ rating: 3 }]);

      expect(distribution[0].rating).toBe(5);
      expect(distribution[4].rating).toBe(1);
    });
  });

  describe('calculateAverageRating', () => {
    it('calculates correct average', () => {
      const reviews = [
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
      ];

      const average = calculateAverageRating(reviews);

      expect(average).toBe(4);
    });

    it('handles single review', () => {
      const reviews = [{ rating: 3 }];

      const average = calculateAverageRating(reviews);

      expect(average).toBe(3);
    });

    it('returns 0 for empty array', () => {
      const average = calculateAverageRating([]);

      expect(average).toBe(0);
    });

    it('handles decimal ratings', () => {
      const reviews = [
        { rating: 4.5 },
        { rating: 3.5 },
      ];

      const average = calculateAverageRating(reviews);

      expect(average).toBe(4);
    });
  });
});
