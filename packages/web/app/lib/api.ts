/**
 * Hono API Client
 *
 * Type-safe API client for communicating with the MasonArt backend API.
 * Uses Hono's RPC client for end-to-end type safety.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { hc } from "hono/client";
import { getApiUrl } from "./utils";

// ============================================================================
// Type Definitions
// ============================================================================

// Product filter parameters
export interface ProductFilters {
  page?: number;
  pageSize?: number;
  styles?: string;
  subjects?: string;
  colors?: string;
  rooms?: string;
  orientation?: "square" | "portrait" | "landscape" | "panoramic" | "round";
  priceMin?: number;
  priceMax?: number;
  isFeatured?: boolean;
  isAiGenerated?: boolean;
  sortBy?: "createdAt" | "updatedAt" | "title" | "basePrice" | "featuredOrder";
  sortOrder?: "asc" | "desc";
}

// Product search parameters
export interface ProductSearchParams {
  q: string;
  page?: number;
  pageSize?: number;
}

// Featured products parameters
export interface FeaturedProductsParams {
  limit?: number;
}

// Cart item input for adding to cart
export interface CartItemInput {
  productId: string;
  variantId: string;
  frameId?: string | null;
  quantity?: number;
  customizations?: {
    matWidth?: number;
    matColor?: string;
    mountingStyle?: string;
    glazingType?: string;
    notes?: string;
  };
  isAiGenerated?: boolean;
  aiGenerationId?: string;
  aiDetails?: {
    generationId: string;
    prompt: string;
    stylePreset?: string;
    thumbnailUrl?: string;
  };
}

// Cart item update input
export interface CartItemUpdate {
  quantity?: number;
  frameId?: string | null;
  customizations?: {
    matWidth?: number;
    matColor?: string;
    mountingStyle?: string;
    glazingType?: string;
    notes?: string;
  };
  isSavedForLater?: boolean;
}

// Order creation input
export interface OrderInput {
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    landmark?: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode?: string;
  };
  /** Legacy field for backward compatibility */
  shippingMethod?: "standard" | "express";
  /** New shipping option ID from shipping API */
  shippingOptionId?: string;
  customerNotes?: string;
  couponCode?: string;
}

// Order list parameters
export interface OrderListParams {
  page?: number;
  pageSize?: number;
  status?: string;
}

// AI generation input
export interface AIGenerationInput {
  prompt: string;
  stylePreset?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  colorMood?: string;
  colorPalette?: string[];
  variationCount?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  fromCache?: boolean;
}

export interface ApiError {
  error: string;
}

// ============================================================================
// Hono Client Setup
// ============================================================================

/**
 * Create a Hono client instance
 * Note: We use a generic client since the API types are in a separate package
 * For full type inference, you would import AppType from @masonart/api
 */
function createApiClient() {
  const baseUrl = getApiUrl();

  // Create base client - in production with proper type export from API:
  // return hc<AppType>(baseUrl);
  // For now, we create a generic client with typed helper methods
  return hc(baseUrl);
}

// ============================================================================
// API Client Instance
// ============================================================================

let clientInstance: ReturnType<typeof createApiClient> | null = null;

/**
 * Get the API client instance (singleton)
 * Note: Reserved for future use with type-safe Hono client
 */
export function getClient() {
  if (!clientInstance) {
    clientInstance = createApiClient();
  }
  return clientInstance;
}

// ============================================================================
// Type-Safe API Methods
// ============================================================================

/**
 * Products API
 */
export const productsApi = {
  /**
   * List products with optional filters and pagination
   */
  async list(params?: ProductFilters) {
    const queryParams: Record<string, string> = {};

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/api/products?${queryString}` : "/api/products";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch products");
    }

    return response.json();
  },

  /**
   * Search products by query
   */
  async search(params: ProductSearchParams) {
    const queryString = new URLSearchParams({
      q: params.q,
      ...(params.page && { page: String(params.page) }),
      ...(params.pageSize && { pageSize: String(params.pageSize) }),
    }).toString();

    const response = await fetch(`${getApiUrl()}/api/products/search?${queryString}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to search products");
    }

    return response.json();
  },

  /**
   * Get featured products
   */
  async featured(params?: FeaturedProductsParams) {
    const queryString = params?.limit
      ? new URLSearchParams({ limit: String(params.limit) }).toString()
      : "";
    const url = queryString
      ? `/api/products/featured?${queryString}`
      : "/api/products/featured";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch featured products");
    }

    return response.json();
  },

  /**
   * Get product by slug
   */
  async getBySlug(slug: string) {
    const response = await fetch(`${getApiUrl()}/api/products/${slug}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch product");
    }

    return response.json();
  },

  /**
   * Get product variants by slug
   */
  async getVariants(slug: string) {
    const response = await fetch(`${getApiUrl()}/api/products/${slug}/variants`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch product variants");
    }

    return response.json();
  },

  /**
   * Get available frames
   */
  async getFrames() {
    const response = await fetch(`${getApiUrl()}/api/products/frames`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch frames");
    }

    return response.json();
  },

  /**
   * Fetch products by IDs
   */
  async getByIds(ids: string[]) {
    const response = await fetch(`${getApiUrl()}/api/products/by-ids`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch products by IDs");
    }

    return response.json();
  },
};

/**
 * Cart API
 */
export const cartApi = {
  /**
   * Get current cart
   */
  async get() {
    const response = await fetch(`${getApiUrl()}/api/cart`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch cart");
    }

    return response.json();
  },

  /**
   * Add item to cart
   */
  async addItem(data: CartItemInput) {
    const response = await fetch(`${getApiUrl()}/api/cart/items`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to add item to cart");
    }

    return response.json();
  },

  /**
   * Update cart item
   */
  async updateItem(id: string, data: CartItemUpdate) {
    const response = await fetch(`${getApiUrl()}/api/cart/items/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update cart item");
    }

    return response.json();
  },

  /**
   * Remove item from cart
   */
  async removeItem(id: string) {
    const response = await fetch(`${getApiUrl()}/api/cart/items/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to remove cart item");
    }

    return response.json();
  },

  /**
   * Clear entire cart
   */
  async clear() {
    const response = await fetch(`${getApiUrl()}/api/cart`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to clear cart");
    }

    return response.json();
  },

  /**
   * Merge guest cart into user cart after login
   */
  async merge(guestSessionId: string) {
    const response = await fetch(`${getApiUrl()}/api/cart/merge`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ guestSessionId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to merge cart");
    }

    return response.json();
  },
};

// Payment initiation response
export interface PaymentInitiationResponse {
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: string;
  orderNumber: string;
  orderId: string;
  prefill: {
    email?: string;
    name?: string;
  };
}

// Payment verification input
export interface PaymentVerificationInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

// Payment verification response
export interface PaymentVerificationResponse {
  success: boolean;
  message: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
  };
}

/**
 * Orders API
 */
export const ordersApi = {
  /**
   * Create a new order
   */
  async create(data: OrderInput) {
    const response = await fetch(`${getApiUrl()}/api/orders`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create order");
    }

    return response.json();
  },

  /**
   * List user orders
   */
  async list(params?: OrderListParams) {
    const queryParams: Record<string, string> = {};

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/api/orders?${queryString}` : "/api/orders";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch orders");
    }

    return response.json();
  },

  /**
   * Get order by ID or order number
   */
  async getById(id: string) {
    const response = await fetch(`${getApiUrl()}/api/orders/${id}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch order");
    }

    return response.json();
  },

  /**
   * Initiate payment for an order
   * Creates a Razorpay order and returns checkout configuration
   */
  async initiatePayment(orderId: string): Promise<PaymentInitiationResponse> {
    const response = await fetch(`${getApiUrl()}/api/orders/${orderId}/payment`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to initiate payment");
    }

    return response.json();
  },

  /**
   * Verify payment after Razorpay checkout completion
   */
  async verifyPayment(
    orderId: string,
    data: PaymentVerificationInput
  ): Promise<PaymentVerificationResponse> {
    const response = await fetch(`${getApiUrl()}/api/orders/${orderId}/payment/verify`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to verify payment");
    }

    return response.json();
  },
};

// AI generations list parameters
export interface AIGenerationsListParams {
  page?: number;
  pageSize?: number;
  status?: "queued" | "processing" | "completed" | "failed" | "cancelled";
  stylePreset?: string;
}

// AI gallery list parameters
export interface AIGalleryListParams {
  page?: number;
  pageSize?: number;
  stylePreset?: string;
  sortBy?: "createdAt" | "likes";
}

/**
 * AI Generation API
 */
export const aiApi = {
  /**
   * Generate AI poster
   */
  async generate(data: AIGenerationInput) {
    const response = await fetch(`${getApiUrl()}/api/ai/generate`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to generate AI poster");
    }

    return response.json();
  },

  /**
   * Get user's AI generations with pagination and filters
   */
  async list(params?: AIGenerationsListParams) {
    const queryParams: Record<string, string> = {};

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/api/ai/generations?${queryString}` : "/api/ai/generations";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch AI generations");
    }

    return response.json();
  },

  /**
   * Get user's AI generations (legacy, uses list)
   */
  async getGenerations() {
    return this.list();
  },

  /**
   * Get generation by ID
   */
  async getById(id: string) {
    const response = await fetch(`${getApiUrl()}/api/ai/generations/${id}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch generation");
    }

    return response.json();
  },

  /**
   * Get generation status by ID (for polling)
   */
  async getGenerationStatus(id: string) {
    const response = await fetch(`${getApiUrl()}/api/ai/status/${id}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch generation status");
    }

    return response.json();
  },

  /**
   * Select an image from a generation
   */
  async selectImage(generationId: string, imageId: string) {
    const response = await fetch(`${getApiUrl()}/api/ai/generations/${generationId}/select`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to select image");
    }

    return response.json();
  },

  /**
   * Update generation visibility
   */
  async updateVisibility(generationId: string, visibility: "private" | "public" | "unlisted") {
    const response = await fetch(`${getApiUrl()}/api/ai/generations/${generationId}/visibility`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visibility }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update visibility");
    }

    return response.json();
  },

  /**
   * Delete a generation
   */
  async delete(generationId: string) {
    const response = await fetch(`${getApiUrl()}/api/ai/generations/${generationId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete generation");
    }

    return response.json();
  },

  /**
   * Get public AI gallery
   */
  async gallery(params?: AIGalleryListParams) {
    const queryParams: Record<string, string> = {};

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/api/ai/gallery?${queryString}` : "/api/ai/gallery";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch gallery");
    }

    return response.json();
  },
};

/**
 * Auth API (Better Auth endpoints)
 */
export const authApi = {
  /**
   * Get current session
   */
  async getSession() {
    const response = await fetch(`${getApiUrl()}/api/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  },

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string) {
    const response = await fetch(`${getApiUrl()}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Sign in failed");
    }

    return response.json();
  },

  /**
   * Sign up with email and password
   */
  async signUp(data: { email: string; password: string; name: string }) {
    const response = await fetch(`${getApiUrl()}/api/auth/sign-up/email`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Sign up failed");
    }

    return response.json();
  },

  /**
   * Sign out
   */
  async signOut() {
    const response = await fetch(`${getApiUrl()}/api/auth/sign-out`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Sign out failed");
    }

    return response.json();
  },

  /**
   * Get OAuth sign-in URL
   */
  getGoogleSignInUrl() {
    return `${getApiUrl()}/api/auth/sign-in/social?provider=google`;
  },
};

/**
 * Health check API
 */
export const healthApi = {
  /**
   * Check API health
   */
  async check() {
    const response = await fetch(`${getApiUrl()}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("API health check failed");
    }

    return response.json();
  },
};

// ============================================================================
// Wallet Types
// ============================================================================

export interface WalletBalance {
  balance: {
    paise: number;
    rupees: number;
    formatted: string;
  };
  freeGenerationsRemaining: number;
  stats: {
    totalTopUpsPaise: number;
    totalTopUpsRupees: number;
    totalSpentPaise: number;
    totalSpentRupees: number;
  };
  exchangeRate: {
    usdToInr: number;
    source: string;
    fetchedAt: string;
  };
  topUpPresets: Array<{ amountPaise: number; label: string }>;
  razorpayKeyId: string;
  isPaymentConfigured: boolean;
}

export interface WalletTransaction {
  id: string;
  type: "credit" | "debit" | "refund" | "bonus" | "adjustment";
  status: "pending" | "completed" | "failed" | "reversed";
  amount: {
    paise: number;
    rupees: number;
    formatted: string;
  };
  balanceAfter: {
    paise: number;
    rupees: number;
  };
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

export interface WalletTransactionsParams {
  page?: number;
  pageSize?: number;
  type?: "credit" | "debit" | "refund" | "bonus" | "adjustment";
  status?: "pending" | "completed" | "failed" | "reversed";
  fromDate?: string;
  toDate?: string;
}

export interface TopUpOrderResponse {
  orderId: string;
  amount: {
    paise: number;
    rupees: number;
    formatted: string;
  };
  currency: string;
  keyId: string;
  prefill: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes: Record<string, string>;
}

export interface TopUpVerifyResponse {
  message: string;
  transaction: {
    id: string;
    type: string;
    status: string;
    amount: {
      paise: number;
      rupees: number;
      formatted: string;
    };
  };
  balance: {
    paise: number;
    rupees: number;
    formatted: string;
  };
}

export interface CostEstimate {
  cost: {
    apiCostPaise: number;
    apiCostRupees: number;
    markupPercentage: number;
    userPricePaise: number;
    userPriceRupees: number;
    formatted: string;
  };
  exchangeRate: number;
  canUseFreeGeneration: boolean;
  provider: string;
  variationCount: number;
}

export interface CostEstimateParams {
  provider?: string;
  variationCount?: number;
  falModel?: string;
  stylePreset?: string;
}

/**
 * Wallet API
 */
export const walletApi = {
  /**
   * Get wallet balance and stats
   */
  async getBalance(): Promise<WalletBalance> {
    const response = await fetch(`${getApiUrl()}/api/wallet`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch wallet");
    }

    return response.json();
  },

  /**
   * Get transaction history
   */
  async getTransactions(
    params?: WalletTransactionsParams
  ): Promise<PaginatedResponse<WalletTransaction>> {
    const queryParams: Record<string, string> = {};

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString
      ? `/api/wallet/transactions?${queryString}`
      : "/api/wallet/transactions";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch transactions");
    }

    return response.json();
  },

  /**
   * Create a top-up order
   */
  async createTopUp(amountPaise: number): Promise<TopUpOrderResponse> {
    const response = await fetch(`${getApiUrl()}/api/wallet/topup`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amountPaise }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create top-up");
    }

    return response.json();
  },

  /**
   * Verify top-up payment
   */
  async verifyTopUp(data: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<TopUpVerifyResponse> {
    const response = await fetch(`${getApiUrl()}/api/wallet/topup/verify`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to verify payment");
    }

    return response.json();
  },

  /**
   * Estimate AI generation cost
   */
  async estimateCost(params?: CostEstimateParams): Promise<CostEstimate> {
    const queryParams: Record<string, string> = {};

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams[key] = String(value);
        }
      });
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString
      ? `/api/wallet/estimate-cost?${queryString}`
      : "/api/wallet/estimate-cost";

    const response = await fetch(`${getApiUrl()}${url}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to estimate cost");
    }

    return response.json();
  },
};

// ============================================================================
// Shipping Types
// ============================================================================

/**
 * Shipping option from the API
 */
export interface ShippingOption {
  id: string;
  name: string;
  carrier: string;
  description: string | null;
  baseCost: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  sortOrder: number;
}

/**
 * Shipping options list response
 */
export interface ShippingOptionsResponse {
  options: ShippingOption[];
  fromCache: boolean;
}

/**
 * Shipping estimate parameters
 */
export interface ShippingEstimateParams {
  cartTotal: number;
  zipCode?: string;
}

/**
 * Shipping estimate response
 */
export interface ShippingEstimateResponse {
  options: Array<{
    id: string;
    name: string;
    carrier: string;
    baseCost: string;
    finalCost: number;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
    isFree: boolean;
  }>;
  freeShippingThreshold: number;
  qualifiesForFreeShipping: boolean;
  cartTotal: number;
}

/**
 * Shipping API
 */
export const shippingApi = {
  /**
   * Get active shipping options
   */
  async getOptions(): Promise<ShippingOptionsResponse> {
    const response = await fetch(`${getApiUrl()}/api/shipping/options`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch shipping options");
    }

    return response.json();
  },

  /**
   * Get a single shipping option by ID
   */
  async getOptionById(id: string): Promise<{ option: ShippingOption }> {
    const response = await fetch(`${getApiUrl()}/api/shipping/options/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch shipping option");
    }

    return response.json();
  },

  /**
   * Get shipping cost estimate for cart
   */
  async getEstimate(params: ShippingEstimateParams): Promise<ShippingEstimateResponse> {
    const queryParams = new URLSearchParams({
      cartTotal: String(params.cartTotal),
    });

    if (params.zipCode) {
      queryParams.append("zipCode", params.zipCode);
    }

    const response = await fetch(`${getApiUrl()}/api/shipping/estimate?${queryParams}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to estimate shipping");
    }

    return response.json();
  },
};

// ============================================================================
// Combined API Object (for convenience)
// ============================================================================

/**
 * Combined API client with all endpoints
 *
 * @example
 * import { api } from '~/lib/api';
 *
 * // Fetch products
 * const products = await api.products.list({ page: 1, pageSize: 24 });
 *
 * // Add to cart
 * await api.cart.addItem({ productId, variantId, quantity: 1 });
 *
 * // Create order
 * await api.orders.create({ shippingAddress: {...} });
 *
 * // Get shipping options
 * const shipping = await api.shipping.getEstimate({ cartTotal: 2500 });
 */
// ============================================================================
// Shipments Types (Order Tracking)
// ============================================================================

/**
 * Shipment status values
 */
export type ShipmentStatus =
  | "pending"
  | "label_created"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled";

/**
 * Shipment data from the API
 */
export interface Shipment {
  id: string;
  orderId: string;
  trackingNumber: string | null;
  carrier: string;
  trackingUrl: string | null;
  status: ShipmentStatus;
  shippedAt: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  shippingOption: {
    id: string;
    name: string;
    carrier: string;
  } | null;
}

/**
 * Order shipments list response
 */
export interface OrderShipmentsResponse {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  shipments: Shipment[];
  totalShipments: number;
}

/**
 * Tracking timeline step
 */
export interface TrackingTimelineStep {
  status: string;
  label: string;
  completed: boolean;
  timestamp: string | null;
}

/**
 * Tracking timeline data
 */
export interface TrackingTimeline {
  currentStatus: string;
  steps: TrackingTimelineStep[];
  estimatedDelivery: string | null;
}

/**
 * Shipment tracking response
 */
export interface ShipmentTrackingResponse {
  shipment: {
    id: string;
    orderId: string;
    orderNumber: string;
    trackingNumber: string | null;
    carrier: string;
    trackingUrl: string | null;
    status: ShipmentStatus;
    shippedAt: string | null;
    estimatedDeliveryAt: string | null;
    deliveredAt: string | null;
    shippingOption: {
      id: string;
      name: string;
      carrier: string;
    } | null;
  };
  tracking: TrackingTimeline;
}

/**
 * Shipments API
 */
export const shipmentsApi = {
  /**
   * Get shipments for an order
   */
  async getOrderShipments(orderId: string): Promise<OrderShipmentsResponse> {
    const response = await fetch(`${getApiUrl()}/api/orders/${orderId}/shipments`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch shipments");
    }

    return response.json();
  },

  /**
   * Get tracking details for a shipment
   */
  async getTracking(shipmentId: string): Promise<ShipmentTrackingResponse> {
    const response = await fetch(`${getApiUrl()}/api/shipments/${shipmentId}/track`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch tracking");
    }

    return response.json();
  },
};

// ============================================================================
// Returns Types
// ============================================================================

/**
 * Return reason values
 */
export type ReturnReason =
  | "defective"
  | "wrong_item"
  | "not_as_described"
  | "changed_mind"
  | "damaged_in_transit"
  | "late_delivery"
  | "other";

/**
 * Return status values
 */
export type ReturnStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "shipped_back"
  | "received"
  | "processing"
  | "refunded"
  | "closed";

/**
 * Return request data
 */
export interface ReturnRequest {
  id: string;
  orderId: string;
  reason: ReturnReason;
  reasonDetails: string;
  status: ReturnStatus;
  requestedAt: string;
  approvedAt: string | null;
  processedAt: string | null;
  refundAmount: string | null;
  createdAt: string;
  adminNotes?: string | null;
}

/**
 * Order returns response
 */
export interface OrderReturnsResponse {
  orderId: string;
  orderNumber: string;
  returns: ReturnRequest[];
  totalReturns: number;
  canRequestReturn: boolean;
  eligibilityMessage?: string;
  daysRemaining?: number;
}

/**
 * Return request with order details
 */
export interface ReturnRequestDetails extends ReturnRequest {
  order: {
    id: string;
    orderNumber: string;
    total: string;
  };
}

/**
 * Return policy data
 */
export interface ReturnPolicy {
  id: string;
  name: string;
  description: string | null;
  daysAllowed: number;
  conditionRequired: string | null;
  refundType: string;
  refundPercentage: number;
}

/**
 * Return policies response
 */
export interface ReturnPoliciesResponse {
  policies: ReturnPolicy[];
  fromCache: boolean;
}

/**
 * Create return request input
 */
export interface CreateReturnInput {
  reason: ReturnReason;
  reasonDetails: string;
}

/**
 * Returns API
 */
export const returnsApi = {
  /**
   * Get return requests for an order (includes eligibility check)
   */
  async getOrderReturns(orderId: string): Promise<OrderReturnsResponse> {
    const response = await fetch(`${getApiUrl()}/api/orders/${orderId}/returns`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch returns");
    }

    return response.json();
  },

  /**
   * Create a return request
   */
  async createReturn(
    orderId: string,
    data: CreateReturnInput
  ): Promise<{ message: string; return: ReturnRequest }> {
    const response = await fetch(`${getApiUrl()}/api/orders/${orderId}/returns`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create return request");
    }

    return response.json();
  },

  /**
   * Get return request details
   */
  async getReturn(returnId: string): Promise<{ return: ReturnRequestDetails }> {
    const response = await fetch(`${getApiUrl()}/api/returns/${returnId}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch return request");
    }

    return response.json();
  },

  /**
   * Cancel a pending return request
   */
  async cancelReturn(returnId: string): Promise<{ message: string; returnId: string }> {
    const response = await fetch(`${getApiUrl()}/api/returns/${returnId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to cancel return request");
    }

    return response.json();
  },

  /**
   * Get active return policies
   */
  async getPolicies(): Promise<ReturnPoliciesResponse> {
    const response = await fetch(`${getApiUrl()}/api/return-policies`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch return policies");
    }

    return response.json();
  },
};

// ============================================================================
// Tracking API (Public/Guest Order Lookup)
// ============================================================================

/**
 * Guest order lookup response
 */
export interface GuestOrderLookupResponse {
  orderNumber: string;
  status: string;
  itemCount: number;
  shippingAddress: {
    city?: string;
    state?: string;
    postalCode?: string;
  };
  tracking: {
    carrier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: ShipmentStatus;
    shippedAt: string | null;
    estimatedDeliveryAt: string | null;
    deliveredAt: string | null;
  } | null;
  timeline: {
    orderedAt: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
}

/**
 * Guest order lookup parameters
 */
export interface GuestOrderLookupParams {
  orderNumber: string;
  email?: string;
  phone?: string;
}

/**
 * Tracking API (public endpoints for guest order lookup)
 */
export const trackingApi = {
  /**
   * Look up an order by order number and email/phone (no auth required)
   */
  async lookup(params: GuestOrderLookupParams): Promise<GuestOrderLookupResponse> {
    const queryParams = new URLSearchParams({
      orderNumber: params.orderNumber,
    });

    if (params.email) {
      queryParams.set("email", params.email);
    }
    if (params.phone) {
      queryParams.set("phone", params.phone);
    }

    const response = await fetch(`${getApiUrl()}/api/tracking/lookup?${queryParams}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 404) {
        throw new Error("Order not found. Please check your order number and email/phone.");
      }
      throw new Error(error.error || "Failed to look up order");
    }

    return response.json();
  },

  /**
   * Look up an order by tracking token (from email link)
   */
  async lookupByToken(token: string): Promise<GuestOrderLookupResponse> {
    const response = await fetch(`${getApiUrl()}/api/tracking/token/${token}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 404 || response.status === 410) {
        throw new Error("This tracking link has expired or is invalid.");
      }
      throw new Error(error.error || "Failed to look up order");
    }

    return response.json();
  },
};

export const api = {
  products: productsApi,
  cart: cartApi,
  orders: ordersApi,
  ai: aiApi,
  auth: authApi,
  health: healthApi,
  wallet: walletApi,
  shipping: shippingApi,
  shipments: shipmentsApi,
  returns: returnsApi,
  tracking: trackingApi,
};

export default api;
