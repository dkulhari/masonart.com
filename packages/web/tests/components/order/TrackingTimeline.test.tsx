/**
 * Tests for TrackingTimeline Component
 *
 * Tests visual timeline rendering and step progression.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrackingTimeline } from "~/components/order/TrackingTimeline";
import type { TrackingTimelineStep } from "~/lib/api";

// ============================================================================
// Test Data
// ============================================================================

const mockSteps: TrackingTimelineStep[] = [
  {
    status: "pending",
    label: "Order Received",
    completed: true,
    timestamp: "2024-02-01T10:00:00Z",
  },
  {
    status: "label_created",
    label: "Shipping Label Created",
    completed: true,
    timestamp: null,
  },
  {
    status: "shipped",
    label: "Shipped",
    completed: true,
    timestamp: "2024-02-02T14:30:00Z",
  },
  {
    status: "in_transit",
    label: "In Transit",
    completed: false,
    timestamp: null,
  },
  {
    status: "out_for_delivery",
    label: "Out for Delivery",
    completed: false,
    timestamp: null,
  },
  {
    status: "delivered",
    label: "Delivered",
    completed: false,
    timestamp: null,
  },
];

// ============================================================================
// Tests
// ============================================================================

describe("TrackingTimeline Component", () => {
  describe("Step Rendering", () => {
    it("renders all timeline steps", () => {
      render(
        <TrackingTimeline
          currentStatus="in_transit"
          steps={mockSteps}
          estimatedDelivery="2024-02-10T00:00:00Z"
        />
      );

      expect(screen.getByText("Order Received")).toBeInTheDocument();
      expect(screen.getByText("Shipping Label Created")).toBeInTheDocument();
      expect(screen.getByText("Shipped")).toBeInTheDocument();
      expect(screen.getByText("In Transit")).toBeInTheDocument();
      expect(screen.getByText("Out for Delivery")).toBeInTheDocument();
      expect(screen.getByText("Delivered")).toBeInTheDocument();
    });

    it("shows timestamps for completed steps that have them", () => {
      render(
        <TrackingTimeline
          currentStatus="shipped"
          steps={mockSteps}
          estimatedDelivery="2024-02-10T00:00:00Z"
        />
      );

      // Should show dates for steps with timestamps (en-IN format)
      expect(screen.getByText(/1 February/i)).toBeInTheDocument();
      expect(screen.getByText(/2 February/i)).toBeInTheDocument();
    });
  });

  describe("Completion State", () => {
    it("marks completed steps correctly", () => {
      const { container } = render(
        <TrackingTimeline
          currentStatus="in_transit"
          steps={mockSteps}
          estimatedDelivery="2024-02-10T00:00:00Z"
        />
      );

      // Completed step icons should have brand-500 background (rounded-full class distinguishes icons from connectors)
      const completedIcons = container.querySelectorAll(".rounded-full.bg-brand-500");
      expect(completedIcons.length).toBe(3); // First 3 steps are completed
    });

    it("highlights current step", () => {
      const { container } = render(
        <TrackingTimeline
          currentStatus="in_transit"
          steps={mockSteps}
          estimatedDelivery="2024-02-10T00:00:00Z"
        />
      );

      // Current step text should have brand color
      const inTransitText = screen.getByText("In Transit");
      expect(inTransitText).toHaveClass("text-brand-600");
    });
  });

  describe("Fully Completed Timeline", () => {
    it("handles all steps completed", () => {
      const completedSteps = mockSteps.map((step) => ({ ...step, completed: true }));

      render(
        <TrackingTimeline
          currentStatus="delivered"
          steps={completedSteps}
          estimatedDelivery={null}
        />
      );

      expect(screen.getByText("Delivered")).toBeInTheDocument();
    });
  });

  describe("Empty Timeline", () => {
    it("handles empty steps array", () => {
      const { container } = render(
        <TrackingTimeline currentStatus="pending" steps={[]} estimatedDelivery={null} />
      );

      // Should render without errors
      expect(container).toBeInTheDocument();
    });
  });

  describe("Compact Mode", () => {
    it("renders in compact mode", () => {
      const { container } = render(
        <TrackingTimeline
          currentStatus="shipped"
          steps={mockSteps}
          estimatedDelivery="2024-02-10T00:00:00Z"
          compact
        />
      );

      // Compact mode uses smaller padding
      const timelineSteps = container.querySelectorAll('[class*="pb-4"]');
      expect(timelineSteps.length).toBeGreaterThan(0);
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <TrackingTimeline
          currentStatus="shipped"
          steps={mockSteps}
          estimatedDelivery={null}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("renders connector lines between steps", () => {
      const { container } = render(
        <TrackingTimeline currentStatus="shipped" steps={mockSteps} estimatedDelivery={null} />
      );

      // Connector lines have width-0.5
      const connectors = container.querySelectorAll('[class*="w-0.5"]');
      expect(connectors.length).toBe(5); // One less than total steps
    });

    it("colors connector lines correctly", () => {
      const { container } = render(
        <TrackingTimeline currentStatus="in_transit" steps={mockSteps} estimatedDelivery={null} />
      );

      // Some connectors should be colored (completed), some should be gray
      const coloredConnectors = container.querySelectorAll('[class*="bg-brand-500"]');
      expect(coloredConnectors.length).toBeGreaterThan(0);
    });
  });
});
