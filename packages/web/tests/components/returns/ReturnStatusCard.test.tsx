/**
 * Tests for ReturnStatusCard Component
 *
 * Tests status display, timeline, and cancellation.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ReturnStatusCard,
  STATUS_CONFIG,
  REASON_LABELS,
} from "~/components/returns/ReturnStatusCard";
import type { ReturnRequest, ReturnStatus } from "~/lib/api";

// ============================================================================
// Test Data
// ============================================================================

const createMockReturn = (overrides: Partial<ReturnRequest> = {}): ReturnRequest => ({
  id: "ret-123",
  orderId: "order-123",
  reason: "defective",
  reasonDetails: "The product arrived with scratches on the surface.",
  status: "pending",
  requestedAt: "2024-02-01T10:00:00Z",
  approvedAt: null,
  processedAt: null,
  refundAmount: null,
  createdAt: "2024-02-01T10:00:00Z",
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe("ReturnStatusCard Component", () => {
  describe("Header Display", () => {
    it("shows correct status label", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn({ status: "pending" })} />);

      expect(screen.getByText("Pending Review")).toBeInTheDocument();
    });

    it("shows order number when provided", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} orderNumber="ORD-12345" />);

      expect(screen.getByText("Order ORD-12345")).toBeInTheDocument();
    });

    it("shows return ID when no order number", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} />);

      expect(screen.getByText(/Return ID: RET-123/i)).toBeInTheDocument();
    });
  });

  describe("Status States", () => {
    const statuses: ReturnStatus[] = [
      "pending",
      "approved",
      "rejected",
      "shipped_back",
      "received",
      "processing",
      "refunded",
      "closed",
    ];

    statuses.forEach((status) => {
      it(`renders ${status} status correctly`, () => {
        render(<ReturnStatusCard returnRequest={createMockReturn({ status })} />);

        const config = STATUS_CONFIG[status];
        expect(screen.getByText(config.label)).toBeInTheDocument();
      });
    });
  });

  describe("Expansion", () => {
    it("expands when header is clicked", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} />);

      // Initially collapsed - reason details not visible
      expect(screen.queryByText(/The product arrived with scratches/)).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByText("Pending Review"));

      // Now details should be visible
      expect(screen.getByText(/The product arrived with scratches/)).toBeInTheDocument();
    });

    it("collapses when header is clicked again", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} />);

      // Click to expand
      fireEvent.click(screen.getByText("Pending Review"));
      expect(screen.getByText(/The product arrived with scratches/)).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByText("Pending Review"));
      expect(screen.queryByText(/The product arrived with scratches/)).not.toBeInTheDocument();
    });

    it("is expanded by default when defaultExpanded is true", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} defaultExpanded />);

      expect(screen.getByText(/The product arrived with scratches/)).toBeInTheDocument();
    });
  });

  describe("Reason Display", () => {
    it("shows reason label", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ reason: "defective" })}
          defaultExpanded
        />
      );

      expect(screen.getByText(REASON_LABELS.defective)).toBeInTheDocument();
    });

    it("shows reason details", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} defaultExpanded />);

      expect(
        screen.getByText("The product arrived with scratches on the surface.")
      ).toBeInTheDocument();
    });
  });

  describe("Timeline", () => {
    it("shows timeline for non-terminal states", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ status: "approved" })}
          defaultExpanded
        />
      );

      expect(screen.getByText("Progress")).toBeInTheDocument();
      expect(screen.getByText("Request Submitted")).toBeInTheDocument();
      // "Approved" appears in both status badge and timeline
      const approvedElements = screen.getAllByText("Approved");
      expect(approvedElements.length).toBeGreaterThanOrEqual(1);
    });

    it("shows request date in timeline", () => {
      render(<ReturnStatusCard returnRequest={createMockReturn()} defaultExpanded />);

      // Should show the formatted date (may appear multiple times)
      const dateElements = screen.getAllByText(/1 February 2024/i);
      expect(dateElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Refund Amount", () => {
    it("shows refund amount for refunded returns", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({
            status: "refunded",
            refundAmount: "1500.00",
            processedAt: "2024-02-10T10:00:00Z",
          })}
        />
      );

      // The refund amount might be visible in header
      fireEvent.click(screen.getByText("Refunded"));

      // Expect the refund amount to be shown
      const amounts = screen.getAllByText(/₹1,500/);
      expect(amounts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Rejection Message", () => {
    it("shows rejection reason when rejected", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({
            status: "rejected",
            adminNotes: "Item was used and does not meet return conditions.",
          })}
          defaultExpanded
        />
      );

      expect(screen.getByText("Rejection Reason")).toBeInTheDocument();
      expect(
        screen.getByText("Item was used and does not meet return conditions.")
      ).toBeInTheDocument();
    });
  });

  describe("Cancel Button", () => {
    it("shows cancel button for pending returns when onCancel provided", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ status: "pending" })}
          onCancel={() => {}}
          defaultExpanded
        />
      );

      expect(screen.getByRole("button", { name: /cancel request/i })).toBeInTheDocument();
    });

    it("hides cancel button for non-pending returns", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ status: "approved" })}
          onCancel={() => {}}
          defaultExpanded
        />
      );

      expect(screen.queryByRole("button", { name: /cancel request/i })).not.toBeInTheDocument();
    });

    it("hides cancel button when onCancel not provided", () => {
      render(
        <ReturnStatusCard returnRequest={createMockReturn({ status: "pending" })} defaultExpanded />
      );

      expect(screen.queryByRole("button", { name: /cancel request/i })).not.toBeInTheDocument();
    });

    it("calls onCancel when cancel button clicked", () => {
      const onCancel = vi.fn();
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ status: "pending" })}
          onCancel={onCancel}
          defaultExpanded
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /cancel request/i }));

      expect(onCancel).toHaveBeenCalled();
    });

    it("shows cancelling state when isCancelling is true", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ status: "pending" })}
          onCancel={() => {}}
          isCancelling
          defaultExpanded
        />
      );

      expect(screen.getByText("Cancelling...")).toBeInTheDocument();
    });

    it("disables cancel button when cancelling", () => {
      render(
        <ReturnStatusCard
          returnRequest={createMockReturn({ status: "pending" })}
          onCancel={() => {}}
          isCancelling
          defaultExpanded
        />
      );

      expect(screen.getByRole("button", { name: /cancelling/i })).toBeDisabled();
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <ReturnStatusCard returnRequest={createMockReturn()} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("uses amber styling for pending status", () => {
      const { container } = render(
        <ReturnStatusCard returnRequest={createMockReturn({ status: "pending" })} />
      );

      expect(container.querySelector('[class*="amber"]')).toBeInTheDocument();
    });

    it("uses green styling for approved status", () => {
      const { container } = render(
        <ReturnStatusCard returnRequest={createMockReturn({ status: "approved" })} />
      );

      expect(container.querySelector('[class*="green"]')).toBeInTheDocument();
    });

    it("uses red styling for rejected status", () => {
      const { container } = render(
        <ReturnStatusCard returnRequest={createMockReturn({ status: "rejected" })} />
      );

      expect(container.querySelector('[class*="red"]')).toBeInTheDocument();
    });
  });
});
