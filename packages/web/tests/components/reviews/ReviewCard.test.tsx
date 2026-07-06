/**
 * Tests for ReviewCard Component
 *
 * Tests review card display, content truncation, actions, and accessibility.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewCard, ReviewCardSkeleton, type ReviewData } from "~/components/reviews/ReviewCard";

// Mock data
const mockReview: ReviewData = {
  id: "review-1",
  rating: 4,
  title: "Great quality poster!",
  content:
    "The print quality is amazing and the colors are vibrant. Exactly what I was looking for.",
  author: {
    id: "user-1",
    name: "John Doe",
    image: null,
  },
  createdAt: "2024-01-15T10:30:00Z",
  isVerifiedPurchase: true,
};

const mockLongReview: ReviewData = {
  ...mockReview,
  id: "review-2",
  content:
    "This is a very long review content that should definitely be truncated when displayed on the page. ".repeat(
      10
    ),
};

describe("ReviewCard Component", () => {
  describe("Basic Rendering", () => {
    it("displays author name", () => {
      render(<ReviewCard review={mockReview} />);

      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("displays review title", () => {
      render(<ReviewCard review={mockReview} />);

      expect(screen.getByText("Great quality poster!")).toBeInTheDocument();
    });

    it("displays review content", () => {
      render(<ReviewCard review={mockReview} />);

      expect(screen.getByText(/The print quality is amazing/)).toBeInTheDocument();
    });

    it("displays star rating", () => {
      render(<ReviewCard review={mockReview} />);

      // The StarRating component should be present
      const ratingContainer = document.querySelector('[role="img"]');
      expect(ratingContainer).toBeInTheDocument();
    });

    it("displays author initials when no image", () => {
      render(<ReviewCard review={mockReview} />);

      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("displays author image when provided", () => {
      const reviewWithImage = {
        ...mockReview,
        author: {
          ...mockReview.author,
          image: "https://example.com/avatar.jpg",
        },
      };

      render(<ReviewCard review={reviewWithImage} />);

      const img = screen.getByAltText("John Doe");
      expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
    });
  });

  describe("Verified Purchase Badge", () => {
    it("shows verified purchase badge when applicable", () => {
      render(<ReviewCard review={mockReview} />);

      expect(screen.getByTitle("Verified Purchase")).toBeInTheDocument();
    });

    it("hides verified badge when not a verified purchase", () => {
      const unverifiedReview = { ...mockReview, isVerifiedPurchase: false };
      render(<ReviewCard review={unverifiedReview} />);

      expect(screen.queryByTitle("Verified Purchase")).not.toBeInTheDocument();
    });
  });

  describe("Date Display", () => {
    it("displays relative time", () => {
      // Mock a recent date
      const recentReview = {
        ...mockReview,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      };

      render(<ReviewCard review={recentReview} />);

      const timeElement = document.querySelector("time");
      expect(timeElement).toBeInTheDocument();
    });

    it("has datetime attribute on time element", () => {
      render(<ReviewCard review={mockReview} />);

      const timeElement = document.querySelector("time");
      expect(timeElement).toHaveAttribute("dateTime");
    });
  });

  describe("Content Truncation", () => {
    it("truncates long content", () => {
      render(<ReviewCard review={mockLongReview} maxContentLength={100} />);

      // Should show "Read more" button for truncated content
      expect(screen.getByText("Read more")).toBeInTheDocument();
    });

    it("does not truncate short content", () => {
      render(<ReviewCard review={mockReview} maxContentLength={500} />);

      // Should not show "Read more" button
      expect(screen.queryByText("Read more")).not.toBeInTheDocument();
    });

    it('expands content when "Read more" is clicked', () => {
      render(<ReviewCard review={mockLongReview} maxContentLength={100} />);

      const readMoreButton = screen.getByText("Read more");
      fireEvent.click(readMoreButton);

      // Should now show "Show less" button
      expect(screen.getByText("Show less")).toBeInTheDocument();
    });

    it('collapses content when "Show less" is clicked', () => {
      render(<ReviewCard review={mockLongReview} maxContentLength={100} />);

      // Expand first
      fireEvent.click(screen.getByText("Read more"));
      // Then collapse
      fireEvent.click(screen.getByText("Show less"));

      expect(screen.getByText("Read more")).toBeInTheDocument();
    });
  });

  describe("Review Without Title", () => {
    it("renders without title when not provided", () => {
      const reviewWithoutTitle = { ...mockReview, title: null };
      render(<ReviewCard review={reviewWithoutTitle} />);

      // Should not have the title element
      expect(screen.queryByText("Great quality poster!")).not.toBeInTheDocument();
      // But should still have content
      expect(screen.getByText(/The print quality is amazing/)).toBeInTheDocument();
    });
  });

  describe("Status Badges", () => {
    it("shows pending status badge", () => {
      const pendingReview = { ...mockReview, status: "pending" as const };
      render(<ReviewCard review={pendingReview} />);

      expect(screen.getByText("Pending Review")).toBeInTheDocument();
    });

    it("shows rejected status badge", () => {
      const rejectedReview = { ...mockReview, status: "rejected" as const };
      render(<ReviewCard review={rejectedReview} />);

      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });

    it("does not show badge for approved reviews", () => {
      const approvedReview = { ...mockReview, status: "approved" as const };
      render(<ReviewCard review={approvedReview} />);

      expect(screen.queryByText("Pending Review")).not.toBeInTheDocument();
      expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    });
  });

  describe("Actions Menu", () => {
    it("shows actions menu when showActions is true", () => {
      render(<ReviewCard review={mockReview} showActions />);

      expect(screen.getByLabelText("Review actions")).toBeInTheDocument();
    });

    it("hides actions menu when showActions is false", () => {
      render(<ReviewCard review={mockReview} showActions={false} />);

      expect(screen.queryByLabelText("Review actions")).not.toBeInTheDocument();
    });

    it("calls onReport when report is clicked", () => {
      const handleReport = vi.fn();
      render(<ReviewCard review={mockReview} showActions onReport={handleReport} />);

      // Open menu
      fireEvent.click(screen.getByLabelText("Review actions"));
      // Click report
      fireEvent.click(screen.getByText("Report"));

      expect(handleReport).toHaveBeenCalledWith("review-1");
    });

    it("calls onDelete when delete is clicked", () => {
      const handleDelete = vi.fn();
      render(<ReviewCard review={mockReview} showActions onDelete={handleDelete} />);

      // Open menu
      fireEvent.click(screen.getByLabelText("Review actions"));
      // Click delete
      fireEvent.click(screen.getByText("Delete"));

      expect(handleDelete).toHaveBeenCalledWith("review-1");
    });

    it("closes menu when clicking outside", () => {
      render(<ReviewCard review={mockReview} showActions onReport={() => {}} />);

      // Open menu
      fireEvent.click(screen.getByLabelText("Review actions"));
      expect(screen.getByText("Report")).toBeInTheDocument();

      // Click backdrop (fixed inset-0 div)
      const backdrop = document.querySelector(".fixed.inset-0");
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      // Menu should be closed
      expect(screen.queryByText("Report")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has accessible article role", () => {
      render(<ReviewCard review={mockReview} />);

      expect(screen.getByRole("article")).toBeInTheDocument();
    });

    it("has aria-label on article", () => {
      render(<ReviewCard review={mockReview} />);

      const article = screen.getByRole("article");
      expect(article).toHaveAttribute("aria-label", "Review by John Doe");
    });
  });

  describe("Custom ClassName", () => {
    it("applies custom className", () => {
      render(<ReviewCard review={mockReview} className="custom-review" />);

      const article = screen.getByRole("article");
      expect(article).toHaveClass("custom-review");
    });
  });
});

describe("ReviewCardSkeleton Component", () => {
  it("renders skeleton with animate-pulse", () => {
    render(<ReviewCardSkeleton />);

    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  it("has avatar placeholder", () => {
    render(<ReviewCardSkeleton />);

    const avatarPlaceholder = document.querySelector(".rounded-full.bg-muted");
    expect(avatarPlaceholder).toBeInTheDocument();
  });

  it("has star placeholders", () => {
    render(<ReviewCardSkeleton />);

    // Should have 5 star placeholders
    const starPlaceholders = document.querySelectorAll(".h-4.w-4.rounded.bg-muted");
    expect(starPlaceholders.length).toBeGreaterThanOrEqual(5);
  });

  it("applies custom className", () => {
    const { container } = render(<ReviewCardSkeleton className="my-skeleton" />);

    expect(container.querySelector(".my-skeleton")).toBeInTheDocument();
  });
});
