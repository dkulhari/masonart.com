/**
 * Tests for Guest Order Lookup Form
 *
 * Tests the order lookup form component used on the /track page.
 * Since the form is embedded in the route file, we test the component
 * behavior through a standalone test wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState, useCallback } from "react";
import { Package, Search, Loader2, AlertCircle, Mail, Phone, Hash } from "lucide-react";
import { cn } from "~/lib/utils";

// ============================================================================
// Mock API
// ============================================================================

const mockLookup = vi.fn();

vi.mock("~/lib/api", () => ({
  trackingApi: {
    lookup: (...args: unknown[]) => mockLookup(...args),
  },
}));

// ============================================================================
// Test Component (Extracted from route file)
// ============================================================================

interface GuestOrderLookupFormProps {
  onSubmit: (data: { orderNumber: string; email?: string; phone?: string }) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function GuestOrderLookupForm({ onSubmit, isLoading, error }: GuestOrderLookupFormProps) {
  const [orderNumber, setOrderNumber] = useState("");
  const [contactMethod, setContactMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);

      if (!orderNumber.trim()) {
        setLocalError("Please enter your order number");
        return;
      }

      if (contactMethod === "email" && !email.trim()) {
        setLocalError("Please enter your email address");
        return;
      }

      if (contactMethod === "phone" && !phone.trim()) {
        setLocalError("Please enter your phone number");
        return;
      }

      await onSubmit({
        orderNumber: orderNumber.trim(),
        email: contactMethod === "email" ? email.trim() : undefined,
        phone: contactMethod === "phone" ? phone.trim() : undefined,
      });
    },
    [orderNumber, contactMethod, email, phone, onSubmit]
  );

  const displayError = localError || error;

  return (
    <div className="rounded-xl border border-border bg-card p-6" data-testid="guest-lookup-form">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
          <Package className="h-6 w-6 text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Look Up Your Order</h2>
          <p className="text-sm text-muted-foreground">
            Enter your order details to view tracking information
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Order Number */}
        <div>
          <label htmlFor="orderNumber" className="mb-1.5 block text-sm font-medium text-foreground">
            Order Number
          </label>
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="orderNumber"
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="MA-2024-001234"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              disabled={isLoading}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Find this in your order confirmation email
          </p>
        </div>

        {/* Contact Method Toggle */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Verify Using</label>
          <div className="flex rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setContactMethod("email")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                contactMethod === "email"
                  ? "bg-brand-500 text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
              disabled={isLoading}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setContactMethod("phone")}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                contactMethod === "phone"
                  ? "bg-brand-500 text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
              disabled={isLoading}
            >
              <Phone className="h-4 w-4" />
              Phone
            </button>
          </div>
        </div>

        {/* Email Input */}
        {contactMethod === "email" && (
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Email Address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {/* Phone Input */}
        {contactMethod === "phone" && (
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {displayError && (
          <div
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 text-red-500" />
            <p className="text-sm text-red-700">{displayError}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking up order...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Track Order
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("GuestOrderLookupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rendering", () => {
    it("renders the form with all required elements", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      expect(screen.getByTestId("guest-lookup-form")).toBeInTheDocument();
      expect(screen.getByText("Look Up Your Order")).toBeInTheDocument();
      expect(screen.getByLabelText("Order Number")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /track order/i })).toBeInTheDocument();
    });

    it("renders email input by default", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(screen.queryByLabelText("Phone Number")).not.toBeInTheDocument();
    });

    it("shows phone input when phone tab is selected", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      fireEvent.click(screen.getByRole("button", { name: /phone/i }));

      expect(screen.queryByLabelText("Email Address")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Phone Number")).toBeInTheDocument();
    });

    it("shows helpful placeholder text for order number", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      expect(screen.getByPlaceholderText("MA-2024-001234")).toBeInTheDocument();
    });
  });

  describe("Form Validation", () => {
    it("shows error when order number is empty", () => {
      const onSubmit = vi.fn();
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(screen.getByText("Please enter your order number")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("shows error when email is empty with email verification", () => {
      const onSubmit = vi.fn();
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "MA-2024-001234" },
      });
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(screen.getByText("Please enter your email address")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("shows error when phone is empty with phone verification", () => {
      const onSubmit = vi.fn();
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "MA-2024-001234" },
      });
      fireEvent.click(screen.getByRole("button", { name: /phone/i }));
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(screen.getByText("Please enter your phone number")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("Form Submission", () => {
    it("calls onSubmit with email verification data", () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "MA-2024-001234" },
      });
      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "test@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        orderNumber: "MA-2024-001234",
        email: "test@example.com",
        phone: undefined,
      });
    });

    it("calls onSubmit with phone verification data", () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "MA-2024-001234" },
      });
      fireEvent.click(screen.getByRole("button", { name: /phone/i }));
      fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "9876543210" } });
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        orderNumber: "MA-2024-001234",
        email: undefined,
        phone: "9876543210",
      });
    });

    it("trims whitespace from inputs", () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "  MA-2024-001234  " },
      });
      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "  test@example.com  " },
      });
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(onSubmit).toHaveBeenCalledWith({
        orderNumber: "MA-2024-001234",
        email: "test@example.com",
        phone: undefined,
      });
    });
  });

  describe("Loading State", () => {
    it("shows loading spinner when isLoading is true", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={true} error={null} />);

      expect(screen.getByText("Looking up order...")).toBeInTheDocument();
    });

    it("disables inputs during loading", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={true} error={null} />);

      expect(screen.getByLabelText("Order Number")).toBeDisabled();
      expect(screen.getByLabelText("Email Address")).toBeDisabled();
      expect(screen.getByRole("button", { name: /looking up order/i })).toBeDisabled();
    });

    it("disables contact method toggle during loading", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={true} error={null} />);

      const emailButton = screen
        .getAllByRole("button")
        .find((btn) => btn.textContent?.includes("Email"));
      const phoneButton = screen
        .getAllByRole("button")
        .find((btn) => btn.textContent?.includes("Phone"));

      expect(emailButton).toBeDisabled();
      expect(phoneButton).toBeDisabled();
    });
  });

  describe("Error Display", () => {
    it("displays external error from props", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error="Order not found" />);

      expect(screen.getByText("Order not found")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("clears local error on new submission", () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      // First submission - validation error
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));
      expect(screen.getByText("Please enter your order number")).toBeInTheDocument();

      // Fill form and submit again
      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "MA-2024-001234" },
      });
      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "test@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: /track order/i }));

      expect(screen.queryByText("Please enter your order number")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has accessible labels for all inputs", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      expect(screen.getByLabelText("Order Number")).toBeInTheDocument();
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    });

    it('error message has role="alert"', () => {
      render(
        <GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error="Something went wrong" />
      );

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("form can be submitted with form submit", () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<GuestOrderLookupForm onSubmit={onSubmit} isLoading={false} error={null} />);

      fireEvent.change(screen.getByLabelText("Order Number"), {
        target: { value: "MA-2024-001234" },
      });
      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "test@example.com" },
      });
      fireEvent.submit(screen.getByRole("button", { name: /track order/i }).closest("form")!);

      expect(onSubmit).toHaveBeenCalled();
    });
  });

  describe("Contact Method Toggle", () => {
    it("switches between email and phone inputs", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      // Initially shows email
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();

      // Click phone tab
      fireEvent.click(screen.getByRole("button", { name: /phone/i }));
      expect(screen.getByLabelText("Phone Number")).toBeInTheDocument();
      expect(screen.queryByLabelText("Email Address")).not.toBeInTheDocument();

      // Click email tab
      fireEvent.click(screen.getByRole("button", { name: /email/i }));
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
      expect(screen.queryByLabelText("Phone Number")).not.toBeInTheDocument();
    });

    it("preserves input values when switching tabs", () => {
      render(<GuestOrderLookupForm onSubmit={vi.fn()} isLoading={false} error={null} />);

      // Type email
      fireEvent.change(screen.getByLabelText("Email Address"), {
        target: { value: "test@example.com" },
      });

      // Switch to phone
      fireEvent.click(screen.getByRole("button", { name: /phone/i }));
      fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "9876543210" } });

      // Switch back to email
      fireEvent.click(screen.getByRole("button", { name: /email/i }));
      expect(screen.getByLabelText("Email Address")).toHaveValue("test@example.com");
    });
  });
});
