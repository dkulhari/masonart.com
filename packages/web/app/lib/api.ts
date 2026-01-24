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
  shippingMethod?: "standard" | "express";
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
 */
export const api = {
  products: productsApi,
  cart: cartApi,
  orders: ordersApi,
  ai: aiApi,
  auth: authApi,
  health: healthApi,
};

export default api;
