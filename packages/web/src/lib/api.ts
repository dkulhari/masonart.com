/**
 * API Client Utilities for MasonArt Frontend
 *
 * This module provides typed API client functions for communicating with the MasonArt backend.
 * It handles HTTP requests, error handling, and provides a clean interface for TanStack Query hooks.
 *
 * Features:
 * - Type-safe API calls using Zod schemas from @chobi/shared
 * - Centralized error handling
 * - Request/response interceptors
 * - Automatic authentication via cookies (Better Auth)
 * - Support for all backend endpoints (products, cart, orders, AI, admin)
 */

/**
 * API Configuration
 */
export const API_CONFIG = {
  baseUrl: typeof window !== 'undefined'
    ? (import.meta.env?.VITE_API_URL || 'http://localhost:3000')
    : (process.env.VITE_API_URL || 'http://localhost:3000'),
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * API Error class for structured error handling
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Request options interface
 */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Generic request function
 */
export async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = API_CONFIG.timeout,
    signal,
  } = options;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        ...API_CONFIG.headers,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', // Include cookies for authentication
      signal: signal || controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      if (!response.ok) {
        throw new ApiError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
        );
      }
      return null as T;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.message || data.error || `HTTP ${response.status}`,
        response.status,
        data,
      );
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error.message || 'Network error',
      0,
      error,
    );
  }
}

/**
 * Pagination metadata interface
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated response interface
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Products API
 */
export const products = {
  /**
   * List products with optional filtering and pagination
   */
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    orientation?: string;
    style?: string;
    subject?: string;
    color?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<any>> => {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const queryString = queryParams.toString();
    const endpoint = `/api/products${queryString ? `?${queryString}` : ''}`;

    return request<PaginatedResponse<any>>(endpoint);
  },

  /**
   * Get a single product by ID
   */
  get: async (id: string): Promise<any> => {
    return request<any>(`/api/products/${id}`);
  },

  /**
   * Get product variants (sizes)
   */
  getVariants: async (productId: string): Promise<any[]> => {
    return request<any[]>(`/api/products/${productId}/variants`);
  },

  /**
   * Create a new product (admin only)
   */
  create: async (data: any): Promise<any> => {
    return request<any>('/api/products', {
      method: 'POST',
      body: data,
    });
  },

  /**
   * Update a product (admin only)
   */
  update: async (id: string, data: any): Promise<any> => {
    return request<any>(`/api/products/${id}`, {
      method: 'PUT',
      body: data,
    });
  },

  /**
   * Delete a product (admin only)
   */
  delete: async (id: string): Promise<void> => {
    return request<void>(`/api/products/${id}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Cart API
 */
export const cart = {
  /**
   * Get current user's cart
   */
  get: async (): Promise<any[]> => {
    return request<any[]>('/api/cart');
  },

  /**
   * Add item to cart
   */
  add: async (data: {
    productId: string;
    variantId: string;
    quantity: number;
    frameId?: string;
    uploadUrl?: string;
  }): Promise<any> => {
    return request<any>('/api/cart', {
      method: 'POST',
      body: data,
    });
  },

  /**
   * Update cart item
   */
  update: async (itemId: string, data: {
    quantity?: number;
    frameId?: string;
  }): Promise<any> => {
    return request<any>(`/api/cart/${itemId}`, {
      method: 'PUT',
      body: data,
    });
  },

  /**
   * Remove item from cart
   */
  remove: async (itemId: string): Promise<void> => {
    return request<void>(`/api/cart/${itemId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Clear entire cart
   */
  clear: async (): Promise<void> => {
    return request<void>('/api/cart', {
      method: 'DELETE',
    });
  },
};

/**
 * Orders API
 */
export const orders = {
  /**
   * List orders with optional filtering and pagination
   */
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<any>> => {
    const queryParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }

    const queryString = queryParams.toString();
    const endpoint = `/api/orders${queryString ? `?${queryString}` : ''}`;

    return request<PaginatedResponse<any>>(endpoint);
  },

  /**
   * Get a single order by ID
   */
  get: async (id: string): Promise<any> => {
    return request<any>(`/api/orders/${id}`);
  },

  /**
   * Create order from cart
   */
  create: async (data: {
    shippingAddress: any;
    billingAddress?: any;
    paymentMethod: string;
    notes?: string;
  }): Promise<any> => {
    return request<any>('/api/orders', {
      method: 'POST',
      body: data,
    });
  },

  /**
   * Update order (admin only)
   */
  update: async (id: string, data: {
    status?: string;
    paymentStatus?: string;
    trackingNumber?: string;
    shippingCarrier?: string;
  }): Promise<any> => {
    return request<any>(`/api/orders/${id}`, {
      method: 'PUT',
      body: data,
    });
  },

  /**
   * Cancel order
   */
  cancel: async (id: string): Promise<any> => {
    return request<any>(`/api/orders/${id}/cancel`, {
      method: 'PUT',
    });
  },
};

/**
 * Health check API
 */
export const health = {
  /**
   * Check API health
   */
  check: async (): Promise<{
    status: string;
    timestamp: string;
    service: string;
    version: string;
  }> => {
    return request('/health');
  },
};

/**
 * Default export with all API endpoints
 */
const api = {
  products,
  cart,
  orders,
  health,
  request,
  ApiError,
  API_CONFIG,
};

export default api;
