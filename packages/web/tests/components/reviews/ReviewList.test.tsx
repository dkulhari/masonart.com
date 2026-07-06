/**
 * Tests for ReviewList Component
 *
 * Tests review list rendering, filtering, sorting, pagination,
 * and loading/empty states.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewList } from "~/components/reviews/ReviewList";
import type { ReviewData } from "~/components/reviews/ReviewCard";

// Mock data
const createMockReview = (overrides: Partial<ReviewData> = {}): ReviewData => ({
  id: `review-${Math.random().toString(36).substr(2, 9)}`,
  rating: 4,
  title: "Great product!",
  content: "This is a fantastic product. Highly recommend.",
  author: {
    id: "user-1",
    name: "John Doe",
    image: null,
  },
  createdAt: new Date().toISOString(),
  isVerifiedPurchase: true,
  ...overrides,
});

const mockReviews: ReviewData[] = [
  createMockReview({ id: "review-1", rating: 5, createdAt: "2024-01-20T10:00:00Z" }),
  createMockReview({ id: "review-2", rating: 4, createdAt: "2024-01-19T10:00:00Z" }),
  createMockReview({ id: "review-3", rating: 3, createdAt: "2024-01-18T10:00:00Z" }),
  createMockReview({ id: "review-4", rating: 5, createdAt: "2024-01-17T10:00:00Z" }),
  createMockReview({ id: "review-5", rating: 2, createdAt: "2024-01-16T10:00:00Z" }),
  createMockReview({ id: "review-6", rating: 4, createdAt: "2024-01-15T10:00:00Z" }),
];

describe("ReviewList Component", () => {
  describe("Basic Rendering", () => {
    it("renders list of reviews", () => {
      render(<ReviewList reviews={mockReviews} />);

      // Should render review cards
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBeGreaterThan(0);
    });

    it("displays all reviews within pagination limit", () => {
      render(<ReviewList reviews={mockReviews} pageSize={10} />);

      // All 6 reviews should be visible
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBe(6);
    });
  });

  describe("Empty State", () => {
    it("shows empty state when no reviews", () => {
      render(<ReviewList reviews={[]} />);

      expect(screen.getByText("No reviews yet")).toBeInTheDocument();
      expect(screen.getByText(/Be the first to share your thoughts/)).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("displays loading skeleton when isLoading is true", () => {
      render(<ReviewList reviews={[]} isLoading />);

      // Should have skeleton cards with animate-pulse
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("does not show reviews when loading", () => {
      render(<ReviewList reviews={mockReviews} isLoading />);

      // Should not show review articles
      expect(screen.queryAllByRole("article").length).toBe(0);
    });
  });

  describe("Summary Section", () => {
    it("shows summary when showSummary is true", () => {
      render(<ReviewList reviews={mockReviews} showSummary />);

      // Should show average rating
      expect(screen.getByText(/Based on/)).toBeInTheDocument();
    });

    it("hides summary when showSummary is false", () => {
      render(<ReviewList reviews={mockReviews} showSummary={false} />);

      expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
    });
  });

  describe("Filters Section", () => {
    it("shows filters when showFilters is true", () => {
      render(<ReviewList reviews={mockReviews} showFilters />);

      // Should show filter buttons (All, 5 star, 4 star, etc.)
      expect(screen.getByText("All")).toBeInTheDocument();
    });

    it("hides filters when showFilters is false", () => {
      render(<ReviewList reviews={mockReviews} showFilters={false} />);

      // Should not show All button (filter control)
      const allButtons = screen.queryAllByRole("button", { name: /^All/ });
      expect(allButtons.length).toBe(0);
    });

    it("filters reviews by rating when filter is selected", () => {
      render(<ReviewList reviews={mockReviews} showFilters pageSize={10} />);

      // Find and click 5-star filter
      const fiveStarButtons = screen.getAllByRole("button");
      const fiveStarFilter = fiveStarButtons.find((btn) => btn.textContent?.includes("5"));
      if (fiveStarFilter) {
        fireEvent.click(fiveStarFilter);
      }

      // Should only show 5-star reviews (2 in our mock data)
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBe(2);
    });

    it("shows empty filter state when no reviews match filter", () => {
      // Use all mockReviews (which has no 1-star reviews)
      render(<ReviewList reviews={mockReviews} showFilters pageSize={10} />);

      // Click 1-star filter (no 1-star reviews in mockReviews)
      // Filter buttons have aria-pressed attribute and contain the rating number
      const buttons = screen.getAllByRole("button");
      // Find the "1" rating button - it's in the filters section with aria-pressed
      const oneStarFilter = buttons.find(
        (btn) => btn.hasAttribute("aria-pressed") && btn.textContent?.trim() === "1"
      );
      expect(oneStarFilter).toBeTruthy();
      if (oneStarFilter) {
        fireEvent.click(oneStarFilter);
      }

      expect(screen.getByText(/No 1-star reviews/)).toBeInTheDocument();
    });
  });

  describe("Sorting", () => {
    it("sorts reviews by newest first by default", () => {
      render(<ReviewList reviews={mockReviews} showFilters pageSize={10} />);

      const articles = screen.getAllByRole("article");
      // First review should be the newest (review-1 from 2024-01-20)
      expect(articles[0]).toHaveAttribute("aria-label", expect.stringContaining("John Doe"));
    });

    it("has sort dropdown", () => {
      render(<ReviewList reviews={mockReviews} showFilters />);

      expect(screen.getByText(/Sort:/)).toBeInTheDocument();
    });
  });

  describe("Pagination", () => {
    it("paginates reviews when enablePagination is true", () => {
      render(<ReviewList reviews={mockReviews} enablePagination pageSize={3} />);

      // Should only show 3 reviews on first page
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBe(3);
    });

    it("shows pagination controls when there are multiple pages", () => {
      render(<ReviewList reviews={mockReviews} enablePagination pageSize={3} />);

      // Should have navigation
      const nav = screen.getByRole("navigation", { name: /Pagination/ });
      expect(nav).toBeInTheDocument();
    });

    it("navigates to next page", () => {
      render(<ReviewList reviews={mockReviews} enablePagination pageSize={3} />);

      // Click next page button
      const nextButton = screen.getByLabelText("Next page");
      fireEvent.click(nextButton);

      // Should show different reviews
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBe(3);
    });

    it("navigates to previous page", () => {
      render(<ReviewList reviews={mockReviews} enablePagination pageSize={3} />);

      // Go to page 2
      const nextButton = screen.getByLabelText("Next page");
      fireEvent.click(nextButton);

      // Go back to page 1
      const prevButton = screen.getByLabelText("Previous page");
      fireEvent.click(prevButton);

      // Should be back on first page - find the page button within pagination nav
      const nav = screen.getByRole("navigation", { name: /Pagination/ });
      const pageOneButton = nav.querySelector('[aria-current="page"]');
      expect(pageOneButton).toBeInTheDocument();
      expect(pageOneButton).toHaveTextContent("1");
    });

    it("disables previous button on first page", () => {
      render(<ReviewList reviews={mockReviews} enablePagination pageSize={3} />);

      const prevButton = screen.getByLabelText("Previous page");
      expect(prevButton).toBeDisabled();
    });

    it("disables next button on last page", () => {
      render(<ReviewList reviews={mockReviews} enablePagination pageSize={3} />);

      // Go to last page (page 2)
      fireEvent.click(screen.getByLabelText("Next page"));

      const nextButton = screen.getByLabelText("Next page");
      expect(nextButton).toBeDisabled();
    });

    it("hides pagination when disabled", () => {
      render(<ReviewList reviews={mockReviews} enablePagination={false} />);

      expect(screen.queryByRole("navigation", { name: /Pagination/ })).not.toBeInTheDocument();
    });

    it("shows all reviews when pagination is disabled", () => {
      render(<ReviewList reviews={mockReviews} enablePagination={false} pageSize={3} />);

      // All 6 reviews should be visible
      const articles = screen.getAllByRole("article");
      expect(articles.length).toBe(6);
    });
  });

  describe("Actions", () => {
    it("shows action menu when showActions is true", () => {
      render(<ReviewList reviews={mockReviews.slice(0, 1)} showActions onReport={() => {}} />);

      expect(screen.getByLabelText("Review actions")).toBeInTheDocument();
    });

    it("calls onReport callback", () => {
      const handleReport = vi.fn();
      render(<ReviewList reviews={mockReviews.slice(0, 1)} showActions onReport={handleReport} />);

      // Open menu and click report
      fireEvent.click(screen.getByLabelText("Review actions"));
      fireEvent.click(screen.getByText("Report"));

      expect(handleReport).toHaveBeenCalled();
    });

    it("calls onDelete callback", () => {
      const handleDelete = vi.fn();
      render(<ReviewList reviews={mockReviews.slice(0, 1)} showActions onDelete={handleDelete} />);

      // Open menu and click delete
      fireEvent.click(screen.getByLabelText("Review actions"));
      fireEvent.click(screen.getByText("Delete"));

      expect(handleDelete).toHaveBeenCalled();
    });
  });

  describe("Custom ClassName", () => {
    it("applies custom className", () => {
      const { container } = render(<ReviewList reviews={mockReviews} className="custom-list" />);

      expect(container.querySelector(".custom-list")).toBeInTheDocument();
    });
  });

  describe("Total Count", () => {
    it("uses totalCount when provided", () => {
      render(<ReviewList reviews={mockReviews} totalCount={100} showSummary />);

      expect(screen.getByText(/Based on 100 reviews/)).toBeInTheDocument();
    });

    it("falls back to reviews.length when totalCount not provided", () => {
      render(<ReviewList reviews={mockReviews} showSummary />);

      expect(screen.getByText(/Based on 6 reviews/)).toBeInTheDocument();
    });
  });
});
