/**
 * Tests for ShippingSelector Component
 *
 * Tests shipping option display, selection, and state management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShippingSelector, type ShippingOptionData } from '~/components/checkout/ShippingSelector';

// ============================================================================
// Mocks
// ============================================================================

const mockShippingOptions: ShippingOptionData[] = [
  {
    id: 'opt-standard',
    name: 'Standard Delivery',
    carrier: 'India Post',
    baseCost: '99.00',
    finalCost: 99,
    estimatedDaysMin: 5,
    estimatedDaysMax: 7,
    isFree: false,
  },
  {
    id: 'opt-express',
    name: 'Express Delivery',
    carrier: 'Delhivery',
    baseCost: '199.00',
    finalCost: 199,
    estimatedDaysMin: 2,
    estimatedDaysMax: 3,
    isFree: false,
  },
  {
    id: 'opt-free',
    name: 'Free Shipping',
    carrier: 'India Post',
    baseCost: '0.00',
    finalCost: 0,
    estimatedDaysMin: 7,
    estimatedDaysMax: 10,
    isFree: true,
  },
];

const mockEstimateResponse = {
  options: mockShippingOptions,
  freeShippingThreshold: 1000,
  qualifiesForFreeShipping: false,
  cartTotal: 500,
};

// Mock the API module
vi.mock('~/lib/api', () => ({
  api: {
    shipping: {
      getEstimate: vi.fn(),
    },
  },
}));

// Get reference to mocked api
import { api } from '~/lib/api';
const mockedApi = vi.mocked(api);

// ============================================================================
// Tests
// ============================================================================

describe('ShippingSelector Component', () => {
  const defaultProps = {
    cartTotal: 500,
    selectedOptionId: null,
    onSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.shipping.getEstimate.mockResolvedValue(mockEstimateResponse);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching options', async () => {
      // Delay the response to see loading state
      mockedApi.shipping.getEstimate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockEstimateResponse), 100))
      );

      render(<ShippingSelector {...defaultProps} />);

      expect(screen.getByText(/loading shipping options/i)).toBeInTheDocument();
    });

    it('hides loading after options are fetched', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText(/loading shipping options/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Options Rendering', () => {
    it('renders all shipping options', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Standard Delivery')).toBeInTheDocument();
        expect(screen.getByText('Express Delivery')).toBeInTheDocument();
        expect(screen.getByText('Free Shipping')).toBeInTheDocument();
      });
    });

    it('displays carrier name for each option', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('India Post')).toHaveLength(2);
        expect(screen.getByText('Delhivery')).toBeInTheDocument();
      });
    });

    it('shows pricing correctly', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('FREE')).toBeInTheDocument(); // Free option
      });
    });

    it('shows estimated delivery', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        // Should show "Arrives" text for each option
        const arrivesTexts = screen.getAllByText(/arrives/i);
        expect(arrivesTexts.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Selection', () => {
    it('selecting option updates state', async () => {
      const onSelect = vi.fn();
      render(<ShippingSelector {...defaultProps} onSelect={onSelect} />);

      await waitFor(() => {
        expect(screen.getByText('Express Delivery')).toBeInTheDocument();
      });

      // Click on Express option
      fireEvent.click(screen.getByText('Express Delivery'));

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'opt-express',
          name: 'Express Delivery',
        })
      );
    });

    it('highlights selected option', async () => {
      render(<ShippingSelector {...defaultProps} selectedOptionId="opt-express" />);

      await waitFor(() => {
        const expressButton = screen.getByText('Express Delivery').closest('button');
        expect(expressButton).toHaveClass('border-brand-500');
      });
    });

    it('auto-selects first option if none selected', async () => {
      const onSelect = vi.fn();
      render(<ShippingSelector {...defaultProps} onSelect={onSelect} selectedOptionId={null} />);

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'opt-standard',
          })
        );
      });
    });
  });

  describe('Badges', () => {
    it('shows "Free" badge for free shipping option', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        // Should have a Free badge
        const freeBadges = screen.getAllByText('Free');
        expect(freeBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows "Fastest" badge for fastest option', async () => {
      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Fastest')).toBeInTheDocument();
      });
    });
  });

  describe('Free Shipping Progress', () => {
    it('shows progress bar when not qualifying for free shipping', async () => {
      render(<ShippingSelector {...defaultProps} cartTotal={500} />);

      await waitFor(() => {
        expect(screen.getByText(/add .* more for free shipping/i)).toBeInTheDocument();
      });
    });

    it('shows free shipping notice when qualified', async () => {
      mockedApi.shipping.getEstimate.mockResolvedValue({
        ...mockEstimateResponse,
        qualifiesForFreeShipping: true,
        cartTotal: 1500,
      });

      render(<ShippingSelector {...defaultProps} cartTotal={1500} />);

      await waitFor(() => {
        expect(screen.getByText(/you qualify for free shipping/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message when API fails', async () => {
      mockedApi.shipping.getEstimate.mockRejectedValue(new Error('Network error'));

      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load shipping options/i)).toBeInTheDocument();
      });
    });

    it('shows "Try again" button on error', async () => {
      mockedApi.shipping.getEstimate.mockRejectedValue(new Error('Network error'));

      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/try again/i)).toBeInTheDocument();
      });
    });
  });

  describe('No Options', () => {
    it('shows message when no shipping options available', async () => {
      mockedApi.shipping.getEstimate.mockResolvedValue({
        ...mockEstimateResponse,
        options: [],
      });

      render(<ShippingSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/no shipping options available/i)).toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('passes cartTotal to API', async () => {
      render(<ShippingSelector {...defaultProps} cartTotal={2500} />);

      await waitFor(() => {
        expect(mockedApi.shipping.getEstimate).toHaveBeenCalledWith(
          expect.objectContaining({
            cartTotal: 2500,
          })
        );
      });
    });

    it('passes postalCode to API when provided', async () => {
      render(<ShippingSelector {...defaultProps} postalCode="110001" />);

      await waitFor(() => {
        expect(mockedApi.shipping.getEstimate).toHaveBeenCalledWith(
          expect.objectContaining({
            zipCode: '110001',
          })
        );
      });
    });

    it('refetches when cartTotal changes', async () => {
      const { rerender } = render(<ShippingSelector {...defaultProps} cartTotal={500} />);

      await waitFor(() => {
        expect(mockedApi.shipping.getEstimate).toHaveBeenCalledTimes(1);
      });

      rerender(<ShippingSelector {...defaultProps} cartTotal={1500} />);

      await waitFor(() => {
        expect(mockedApi.shipping.getEstimate).toHaveBeenCalledTimes(2);
      });
    });
  });
});
