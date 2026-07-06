/**
 * Tests for OrderTrackingCard Component
 *
 * Tests shipment card rendering, expansion, and API integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OrderTrackingCard } from "~/components/order/OrderTrackingCard";
import type { Shipment, ShipmentTrackingResponse } from "~/lib/api";

// ============================================================================
// Mocks
// ============================================================================

const mockShipment: Shipment = {
  id: "ship-001",
  orderId: "order-001",
  trackingNumber: "TRK123456789",
  carrier: "delhivery",
  trackingUrl: "https://track.delhivery.com/TRK123456789",
  status: "in_transit",
  shippedAt: "2024-02-05T10:00:00Z",
  estimatedDeliveryAt: "2024-02-10T00:00:00Z",
  deliveredAt: null,
  createdAt: "2024-02-01T10:00:00Z",
  shippingOption: {
    id: "opt-001",
    name: "Express Delivery",
    carrier: "Delhivery",
  },
};

const mockTrackingResponse: ShipmentTrackingResponse = {
  shipment: {
    id: "ship-001",
    orderId: "order-001",
    orderNumber: "ORD-12345",
    trackingNumber: "TRK123456789",
    carrier: "delhivery",
    trackingUrl: "https://track.delhivery.com/TRK123456789",
    status: "in_transit",
    shippedAt: "2024-02-05T10:00:00Z",
    estimatedDeliveryAt: "2024-02-10T00:00:00Z",
    deliveredAt: null,
    shippingOption: {
      id: "opt-001",
      name: "Express Delivery",
      carrier: "Delhivery",
    },
  },
  tracking: {
    currentStatus: "in_transit",
    steps: [
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
      { status: "shipped", label: "Shipped", completed: true, timestamp: "2024-02-05T10:00:00Z" },
      { status: "in_transit", label: "In Transit", completed: false, timestamp: null },
      { status: "out_for_delivery", label: "Out for Delivery", completed: false, timestamp: null },
      { status: "delivered", label: "Delivered", completed: false, timestamp: null },
    ],
    estimatedDelivery: "2024-02-10T00:00:00Z",
  },
};

// Mock the API module
vi.mock("~/lib/api", async () => {
  const actual = await vi.importActual("~/lib/api");
  return {
    ...actual,
    shipmentsApi: {
      getOrderShipments: vi.fn(),
      getTracking: vi.fn(),
    },
  };
});

// Get reference to mocked api
import { shipmentsApi } from "~/lib/api";
const mockedApi = vi.mocked(shipmentsApi);

// ============================================================================
// Tests
// ============================================================================

describe("OrderTrackingCard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getOrderShipments.mockResolvedValue({
      orderId: "order-001",
      orderNumber: "ORD-12345",
      orderStatus: "shipped",
      shipments: [mockShipment],
      totalShipments: 1,
    });
    mockedApi.getTracking.mockResolvedValue(mockTrackingResponse);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Loading State", () => {
    it("shows loading while fetching shipments", async () => {
      mockedApi.getOrderShipments.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  orderId: "order-001",
                  orderNumber: "ORD-12345",
                  orderStatus: "shipped",
                  shipments: [mockShipment],
                  totalShipments: 1,
                }),
              100
            )
          )
      );

      render(<OrderTrackingCard orderId="order-001" />);

      expect(screen.getByText(/loading tracking information/i)).toBeInTheDocument();
    });

    it("hides loading after shipments are fetched", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.queryByText(/loading tracking information/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("With Initial Shipments", () => {
    it("does not fetch when initialShipments provided", async () => {
      render(<OrderTrackingCard orderId="order-001" initialShipments={[mockShipment]} />);

      // Should not show loading
      expect(screen.queryByText(/loading tracking information/i)).not.toBeInTheDocument();

      // Should not have called the API
      expect(mockedApi.getOrderShipments).not.toHaveBeenCalled();
    });
  });

  describe("Shipment Display", () => {
    it("displays carrier name", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });
    });

    it("displays tracking number", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/TRK123456789/)).toBeInTheDocument();
      });
    });

    it("displays status badge", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("In Transit")).toBeInTheDocument();
      });
    });

    it("displays shipment count in header", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/Shipment \(1\)/)).toBeInTheDocument();
      });
    });
  });

  describe("Shipment Expansion", () => {
    it("expands shipment on click", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByText("Delhivery"));

      // Should fetch tracking details
      await waitFor(() => {
        expect(mockedApi.getTracking).toHaveBeenCalledWith("ship-001");
      });
    });

    it("shows timeline when expanded", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByText("Delhivery"));

      await waitFor(() => {
        expect(screen.getByText("Order Received")).toBeInTheDocument();
        expect(screen.getByText("Shipped")).toBeInTheDocument();
      });
    });

    it("collapses shipment on second click", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByText("Delhivery"));

      await waitFor(() => {
        expect(screen.getByText("Order Received")).toBeInTheDocument();
      });

      // Click to collapse
      fireEvent.click(screen.getByText("Delhivery"));

      await waitFor(() => {
        expect(screen.queryByText("Order Received")).not.toBeInTheDocument();
      });
    });
  });

  describe("Default Expanded", () => {
    it("auto-expands when defaultExpanded is true", async () => {
      render(<OrderTrackingCard orderId="order-001" defaultExpanded />);

      await waitFor(() => {
        expect(mockedApi.getTracking).toHaveBeenCalledWith("ship-001");
      });
    });
  });

  describe("External Tracking Link", () => {
    it("shows external tracking button when expanded", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByText("Delhivery"));

      await waitFor(() => {
        const trackButton = screen.getByText(/Track on Delhivery/i);
        expect(trackButton).toBeInTheDocument();
        expect(trackButton.closest("a")).toHaveAttribute(
          "href",
          "https://track.delhivery.com/TRK123456789"
        );
      });
    });
  });

  describe("No Shipments State", () => {
    it("shows empty state when no shipments", async () => {
      mockedApi.getOrderShipments.mockResolvedValue({
        orderId: "order-001",
        orderNumber: "ORD-12345",
        orderStatus: "confirmed",
        shipments: [],
        totalShipments: 0,
      });

      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/no shipping information yet/i)).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling", () => {
    it("shows error state when fetch fails", async () => {
      mockedApi.getOrderShipments.mockRejectedValue(new Error("Network error"));

      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load tracking/i)).toBeInTheDocument();
      });
    });

    it("shows retry button on error", async () => {
      mockedApi.getOrderShipments.mockRejectedValue(new Error("Network error"));

      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/try again/i)).toBeInTheDocument();
      });
    });

    it("retries fetch when retry button clicked", async () => {
      mockedApi.getOrderShipments.mockRejectedValueOnce(new Error("Network error"));
      mockedApi.getOrderShipments.mockResolvedValue({
        orderId: "order-001",
        orderNumber: "ORD-12345",
        orderStatus: "shipped",
        shipments: [mockShipment],
        totalShipments: 1,
      });

      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/try again/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/try again/i));

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });
    });
  });

  describe("Refresh", () => {
    it("shows refresh button", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Refresh")).toBeInTheDocument();
      });
    });

    it("refreshes data when refresh clicked", async () => {
      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText("Delhivery")).toBeInTheDocument();
      });

      // Click refresh
      fireEvent.click(screen.getByText("Refresh"));

      await waitFor(() => {
        expect(mockedApi.getOrderShipments).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Multiple Shipments", () => {
    it("shows plural header for multiple shipments", async () => {
      const secondShipment: Shipment = {
        ...mockShipment,
        id: "ship-002",
        carrier: "bluedart",
      };

      mockedApi.getOrderShipments.mockResolvedValue({
        orderId: "order-001",
        orderNumber: "ORD-12345",
        orderStatus: "shipped",
        shipments: [mockShipment, secondShipment],
        totalShipments: 2,
      });

      render(<OrderTrackingCard orderId="order-001" />);

      await waitFor(() => {
        expect(screen.getByText(/Shipments \(2\)/)).toBeInTheDocument();
      });
    });
  });

  describe("Styling", () => {
    it("applies custom className", async () => {
      const { container } = render(
        <OrderTrackingCard
          orderId="order-001"
          initialShipments={[mockShipment]}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });
});
