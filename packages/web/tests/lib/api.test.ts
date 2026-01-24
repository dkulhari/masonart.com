/**
 * Tests for API Client Utilities
 *
 * This test suite validates the API client functions for the MasonArt frontend.
 * It tests HTTP request handling, error handling, and all API endpoint wrappers.
 *
 * Test Coverage:
 * - Configuration and setup
 * - Generic request function
 * - ApiError class
 * - Products API (list, get, variants, CRUD)
 * - Cart API (get, add, update, remove, clear)
 * - Orders API (list, get, create, update, cancel)
 * - Health check API
 * - Error handling and timeouts
 * - Authentication and cookies
 * - Query parameter building
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  request,
  ApiError,
  API_CONFIG,
  products,
  cart,
  orders,
  health,
  type RequestOptions,
  type PaginatedResponse,
  type PaginationMeta,
} from '../../src/lib/api';

/**
 * Mock fetch globally for testing API client functions.
 *
 * NOTE: When running this test file together with cart.test.ts (which uses vi.mock
 * on the api module), some tests may fail due to mock interference. Run this file
 * individually with `bun test tests/lib/api.test.ts` for full test coverage.
 */
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('API Client - Configuration', () => {
  it('should have correct default API configuration', () => {
    expect(API_CONFIG).toBeDefined();
    expect(API_CONFIG.baseUrl).toBeDefined();
    expect(API_CONFIG.timeout).toBe(30000);
    expect(API_CONFIG.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('should use environment variable for base URL', () => {
    expect(API_CONFIG.baseUrl).toContain('http');
  });

  it('should have default timeout of 30 seconds', () => {
    expect(API_CONFIG.timeout).toBe(30000);
  });

  it('should include JSON content-type header', () => {
    expect(API_CONFIG.headers['Content-Type']).toBe('application/json');
  });
});

describe('API Client - ApiError Class', () => {
  it('should create ApiError with message and status code', () => {
    const error = new ApiError('Not Found', 404);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Not Found');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('ApiError');
  });

  it('should create ApiError with response data', () => {
    const response = { error: 'Not Found', details: 'Resource not found' };
    const error = new ApiError('Not Found', 404, response);
    expect(error.response).toEqual(response);
  });

  it('should have correct error name', () => {
    const error = new ApiError('Test Error', 500);
    expect(error.name).toBe('ApiError');
  });

  it('should be throwable', () => {
    expect(() => {
      throw new ApiError('Test Error', 500);
    }).toThrow(ApiError);
  });
});

describe('API Client - Request Function', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should make GET request with correct headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    await request('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
      }),
    );
  });

  it('should make POST request with body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    const body = { name: 'Test' };
    await request('/test', { method: 'POST', body });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  });

  it('should include credentials for authentication', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  });

  it('should parse JSON response', async () => {
    const responseData = { id: '123', name: 'Test' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => responseData,
    });

    const result = await request('/test');
    expect(result).toEqual(responseData);
  });

  it('should throw ApiError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Resource not found' }),
    });

    await expect(request('/test')).rejects.toThrow(ApiError);

    // Need to mock again for second call
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Resource not found' }),
    });

    await expect(request('/test')).rejects.toThrow('Resource not found');
  });

  it('should throw ApiError with status code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Server error' }),
    });

    try {
      await request('/test');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(500);
    }
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(request('/test')).rejects.toThrow(ApiError);
  });

  it('should handle non-JSON responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain' }),
    });

    const result = await request('/test');
    expect(result).toBeNull();
  });

  it('should support custom headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test', {
      headers: { 'X-Custom-Header': 'value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'value',
        }),
      }),
    );
  });

  it('should support all HTTP methods', async () => {
    const methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'> = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
    ];

    for (const method of methods) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await request('/test', { method });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method }),
      );
    }
  });

  it('should handle timeout', async () => {
    // Simulate timeout by rejecting with AbortError
    mockFetch.mockRejectedValueOnce({
      name: 'AbortError',
      message: 'The operation was aborted',
    });

    try {
      await request('/test', { timeout: 100 });
      throw new Error('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(408);
      expect(error.message).toContain('timeout');
    }
  });

  it('should support custom abort signal', async () => {
    const controller = new AbortController();

    mockFetch.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    await expect(
      request('/test', { signal: controller.signal }),
    ).rejects.toThrow(ApiError);
  });
});

describe('API Client - Products API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should list products', async () => {
    const mockResponse: PaginatedResponse<any> = {
      data: [{ id: '1', title: 'Product 1' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await products.list();
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products'),
      expect.any(Object),
    );
  });

  it('should list products with pagination', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ page: 2, limit: 20 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=20'),
      expect.any(Object),
    );
  });

  it('should list products with filters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({
      status: 'active',
      orientation: 'portrait',
      style: 'botanical',
    });

    const call = mockFetch.mock.calls[0][0] as string;
    expect(call).toContain('status=active');
    expect(call).toContain('orientation=portrait');
    expect(call).toContain('style=botanical');
  });

  it('should list products with price range', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ minPrice: 100, maxPrice: 500 });

    const call = mockFetch.mock.calls[0][0] as string;
    expect(call).toContain('minPrice=100');
    expect(call).toContain('maxPrice=500');
  });

  it('should list products with search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ search: 'botanical' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('search=botanical'),
      expect.any(Object),
    );
  });

  it('should list products with sorting', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ sortBy: 'price', sortOrder: 'asc' });

    const call = mockFetch.mock.calls[0][0] as string;
    expect(call).toContain('sortBy=price');
    expect(call).toContain('sortOrder=asc');
  });

  it('should get single product', async () => {
    const mockProduct = { id: '123', title: 'Test Product' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockProduct,
    });

    const result = await products.get('123');
    expect(result).toEqual(mockProduct);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products/123'),
      expect.any(Object),
    );
  });

  it('should get product variants', async () => {
    const mockVariants = [
      { id: '1', sizeLabel: 'A4' },
      { id: '2', sizeLabel: 'A3' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockVariants,
    });

    const result = await products.getVariants('123');
    expect(result).toEqual(mockVariants);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products/123/variants'),
      expect.any(Object),
    );
  });

  it('should create product', async () => {
    const newProduct = { title: 'New Product', sku: 'NP-001' };
    const mockResponse = { id: '123', ...newProduct };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await products.create(newProduct);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(newProduct),
      }),
    );
  });

  it('should update product', async () => {
    const updates = { title: 'Updated Title' };
    const mockResponse = { id: '123', ...updates };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await products.update('123', updates);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products/123'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    );
  });

  it('should delete product', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => null,
    });

    await products.delete('123');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products/123'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });
});

describe('API Client - Cart API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should get cart', async () => {
    const mockCart = [
      { id: '1', productId: '123', quantity: 2 },
      { id: '2', productId: '456', quantity: 1 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockCart,
    });

    const result = await cart.get();
    expect(result).toEqual(mockCart);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cart'),
      expect.any(Object),
    );
  });

  it('should add item to cart', async () => {
    const newItem = {
      productId: '123',
      variantId: '456',
      quantity: 2,
    };
    const mockResponse = { id: '789', ...newItem };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await cart.add(newItem);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cart'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(newItem),
      }),
    );
  });

  it('should add item with frame', async () => {
    const newItem = {
      productId: '123',
      variantId: '456',
      quantity: 1,
      frameId: 'frame-1',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '789', ...newItem }),
    });

    await cart.add(newItem);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('frame-1'),
      }),
    );
  });

  it('should add item with upload URL', async () => {
    const newItem = {
      productId: '123',
      variantId: '456',
      quantity: 1,
      uploadUrl: 'https://cdn.example.com/upload.jpg',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '789', ...newItem }),
    });

    await cart.add(newItem);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('upload.jpg'),
      }),
    );
  });

  it('should update cart item', async () => {
    const updates = { quantity: 3 };
    const mockResponse = { id: '789', ...updates };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await cart.update('789', updates);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cart/789'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    );
  });

  it('should update cart item frame', async () => {
    const updates = { frameId: 'new-frame' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '789', ...updates }),
    });

    await cart.update('789', updates);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('new-frame'),
      }),
    );
  });

  it('should remove cart item', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => null,
    });

    await cart.remove('789');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cart/789'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('should clear cart', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => null,
    });

    await cart.clear();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/cart'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });
});

describe('API Client - Orders API', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should list orders', async () => {
    const mockResponse: PaginatedResponse<any> = {
      data: [{ id: '1', orderNumber: 'ORD-12345678' }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await orders.list();
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders'),
      expect.any(Object),
    );
  });

  it('should list orders with pagination', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await orders.list({ page: 2, limit: 20 });

    const call = mockFetch.mock.calls[0][0] as string;
    expect(call).toContain('page=2');
    expect(call).toContain('limit=20');
  });

  it('should list orders with status filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await orders.list({ status: 'shipped' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=shipped'),
      expect.any(Object),
    );
  });

  it('should get single order', async () => {
    const mockOrder = {
      id: '123',
      orderNumber: 'ORD-12345678',
      items: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockOrder,
    });

    const result = await orders.get('123');
    expect(result).toEqual(mockOrder);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/123'),
      expect.any(Object),
    );
  });

  it('should create order', async () => {
    const orderData = {
      shippingAddress: {
        fullName: 'John Doe',
        addressLine1: '123 Main St',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
        phone: '+919876543210',
      },
      paymentMethod: 'razorpay',
    };
    const mockResponse = { id: '123', orderNumber: 'ORD-12345678' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await orders.create(orderData);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(orderData),
      }),
    );
  });

  it('should create order with billing address', async () => {
    const orderData = {
      shippingAddress: { fullName: 'John Doe' },
      billingAddress: { fullName: 'Jane Doe' },
      paymentMethod: 'razorpay',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    await orders.create(orderData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('billingAddress'),
      }),
    );
  });

  it('should create order with notes', async () => {
    const orderData = {
      shippingAddress: { fullName: 'John Doe' },
      paymentMethod: 'razorpay',
      notes: 'Please deliver after 6 PM',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    await orders.create(orderData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('Please deliver after 6 PM'),
      }),
    );
  });

  it('should update order', async () => {
    const updates = {
      status: 'shipped',
      trackingNumber: 'TRACK123',
      shippingCarrier: 'Delhivery',
    };
    const mockResponse = { id: '123', ...updates };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await orders.update('123', updates);
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/123'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    );
  });

  it('should update order payment status', async () => {
    const updates = { paymentStatus: 'paid' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123', ...updates }),
    });

    await orders.update('123', updates);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('paid'),
      }),
    );
  });

  it('should cancel order', async () => {
    const mockResponse = {
      id: '123',
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockResponse,
    });

    const result = await orders.cancel('123');
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/123/cancel'),
      expect.objectContaining({
        method: 'PUT',
      }),
    );
  });
});

describe('API Client - Health Check', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should check health', async () => {
    const mockHealth = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'MasonArt API',
      version: '1.0.0',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockHealth,
    });

    const result = await health.check();
    expect(result).toEqual(mockHealth);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.any(Object),
    );
  });

  it('should return health with all required fields', async () => {
    const mockHealth = {
      status: 'ok',
      timestamp: '2024-01-01T00:00:00Z',
      service: 'MasonArt API',
      version: '1.0.0',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockHealth,
    });

    const result = await health.check();
    expect(result.status).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(result.service).toBeDefined();
    expect(result.version).toBeDefined();
  });
});

describe('API Client - Error Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle 401 Unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Authentication required' }),
    });

    try {
      await request('/api/protected');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain('Authentication required');
    }
  });

  it('should handle 403 Forbidden', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Access denied' }),
    });

    await expect(request('/api/admin')).rejects.toThrow(ApiError);
  });

  it('should handle 404 Not Found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Resource not found' }),
    });

    await expect(request('/api/missing')).rejects.toThrow(ApiError);
  });

  it('should handle 500 Internal Server Error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Server error' }),
    });

    await expect(request('/api/error')).rejects.toThrow(ApiError);
  });

  it('should handle validation errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'Validation failed',
        details: ['Field is required'],
      }),
    });

    try {
      await request('/api/products', { method: 'POST' });
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(400);
      expect(error.response).toBeDefined();
      expect(error.response.details).toBeDefined();
    }
  });
});

describe('API Client - Query Parameter Building', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should build query string from parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ page: 1, limit: 10, status: 'active' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('?');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
    expect(url).toContain('status=active');
  });

  it('should handle undefined parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ page: 1, status: undefined });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('status');
  });

  it('should handle null parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ page: 1, status: null as any });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('status');
  });

  it('should handle multiple filter parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({
      status: 'active',
      orientation: 'portrait',
      style: 'botanical',
      minPrice: 100,
      maxPrice: 500,
      search: 'flower',
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('status=active');
    expect(url).toContain('orientation=portrait');
    expect(url).toContain('style=botanical');
    expect(url).toContain('minPrice=100');
    expect(url).toContain('maxPrice=500');
    expect(url).toContain('search=flower');
  });
});

describe('API Client - Performance', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should make requests within reasonable time', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    const startTime = Date.now();
    await request('/test');
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(1000);
  });

  it('should handle multiple concurrent requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    const requests = [
      request('/test1'),
      request('/test2'),
      request('/test3'),
    ];

    const results = await Promise.all(requests);
    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('API Client - TypeScript Types', () => {
  it('should export PaginationMeta type', () => {
    const meta: PaginationMeta = {
      page: 1,
      limit: 10,
      total: 100,
      totalPages: 10,
    };

    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(10);
    expect(meta.total).toBe(100);
    expect(meta.totalPages).toBe(10);
  });

  it('should export PaginatedResponse type', () => {
    const response: PaginatedResponse<{ id: string }> = {
      data: [{ id: '1' }, { id: '2' }],
      meta: {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      },
    };

    expect(response.data).toHaveLength(2);
    expect(response.meta.total).toBe(2);
  });

  it('should export RequestOptions type', () => {
    const options: RequestOptions = {
      method: 'POST',
      body: { test: 'data' },
      headers: { 'X-Custom': 'value' },
      timeout: 5000,
    };

    expect(options.method).toBe('POST');
    expect(options.body).toBeDefined();
    expect(options.headers).toBeDefined();
    expect(options.timeout).toBe(5000);
  });
});

describe('API Client - Default Export', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should export default api object', async () => {
    const api = await import('../../src/lib/api');
    expect(api.default).toBeDefined();
  });

  it('should include all API endpoints in default export', async () => {
    const api = await import('../../src/lib/api');
    expect(api.default.products).toBeDefined();
    expect(api.default.cart).toBeDefined();
    expect(api.default.orders).toBeDefined();
    expect(api.default.health).toBeDefined();
  });

  it('should include utility functions in default export', async () => {
    const api = await import('../../src/lib/api');
    expect(api.default.request).toBeDefined();
    expect(api.default.ApiError).toBeDefined();
    expect(api.default.API_CONFIG).toBeDefined();
  });

  it('should have products object with all methods', async () => {
    const api = await import('../../src/lib/api');
    expect(typeof api.default.products.list).toBe('function');
    expect(typeof api.default.products.get).toBe('function');
    expect(typeof api.default.products.getVariants).toBe('function');
    expect(typeof api.default.products.create).toBe('function');
    expect(typeof api.default.products.update).toBe('function');
    expect(typeof api.default.products.delete).toBe('function');
  });

  it('should have cart object with all methods', async () => {
    const api = await import('../../src/lib/api');
    expect(typeof api.default.cart.get).toBe('function');
    expect(typeof api.default.cart.add).toBe('function');
    expect(typeof api.default.cart.update).toBe('function');
    expect(typeof api.default.cart.remove).toBe('function');
    expect(typeof api.default.cart.clear).toBe('function');
  });

  it('should have orders object with all methods', async () => {
    const api = await import('../../src/lib/api');
    expect(typeof api.default.orders.list).toBe('function');
    expect(typeof api.default.orders.get).toBe('function');
    expect(typeof api.default.orders.create).toBe('function');
    expect(typeof api.default.orders.update).toBe('function');
    expect(typeof api.default.orders.cancel).toBe('function');
  });

  it('should have health object with check method', async () => {
    const api = await import('../../src/lib/api');
    expect(typeof api.default.health.check).toBe('function');
  });
});

describe('API Client - Module Exports', () => {
  it('should export request function', () => {
    expect(typeof request).toBe('function');
  });

  it('should export ApiError class', () => {
    expect(ApiError).toBeDefined();
    expect(typeof ApiError).toBe('function');
  });

  it('should export API_CONFIG object', () => {
    expect(API_CONFIG).toBeDefined();
    expect(typeof API_CONFIG).toBe('object');
  });

  it('should export products object', () => {
    expect(products).toBeDefined();
    expect(typeof products).toBe('object');
  });

  it('should export cart object', () => {
    expect(cart).toBeDefined();
    expect(typeof cart).toBe('object');
  });

  it('should export orders object', () => {
    expect(orders).toBeDefined();
    expect(typeof orders).toBe('object');
  });

  it('should export health object', () => {
    expect(health).toBeDefined();
    expect(typeof health).toBe('object');
  });
});

describe('API Client - URL Construction', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should construct URL with base URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/api/test');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain(API_CONFIG.baseUrl);
    expect(url).toContain('/api/test');
  });

  it('should handle endpoint with leading slash', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(`${API_CONFIG.baseUrl}/test`);
  });

  it('should construct products list URL without query string when no params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/products');
    expect(url).not.toContain('?');
  });

  it('should construct products list URL with query string when params provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ page: 1 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/products?');
    expect(url).toContain('page=1');
  });

  it('should construct product get URL with ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await products.get('product-123');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/products/product-123');
  });

  it('should construct variants URL with product ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [],
    });

    await products.getVariants('product-123');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/products/product-123/variants');
  });

  it('should construct cart item URL with item ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await cart.update('item-456', { quantity: 2 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/cart/item-456');
  });

  it('should construct order cancel URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await orders.cancel('order-789');

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/orders/order-789/cancel');
  });
});

describe('API Client - Non-JSON Error Responses', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle non-JSON error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'text/html' }),
    });

    try {
      await request('/api/error');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(500);
      expect(error.message).toContain('HTTP 500');
    }
  });

  it('should handle empty content-type header on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({}),
    });

    try {
      await request('/api/error');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(400);
    }
  });

  it('should handle plain text error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'content-type': 'text/plain' }),
    });

    try {
      await request('/api/error');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(503);
    }
  });
});

describe('API Client - Empty Response Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle empty cart response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [],
    });

    const result = await cart.get();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle empty products list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    });

    const result = await products.list();
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('should handle empty orders list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    });

    const result = await orders.list();
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('should handle null body on 204 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => null,
    });

    const result = await cart.remove('123');
    expect(result).toBeNull();
  });
});

describe('API Client - Network Errors', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle fetch rejection', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

    try {
      await request('/test');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(0);
      expect(error.message).toContain('Failed to fetch');
    }
  });

  it('should handle DNS resolution failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('ERR_NAME_NOT_RESOLVED'));

    try {
      await request('/test');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(0);
    }
  });

  it('should handle connection refused', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    try {
      await request('/test');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.statusCode).toBe(0);
      expect(error.message).toContain('Connection refused');
    }
  });

  it('should preserve original error in response on network errors', async () => {
    const originalError = new Error('Network failure');
    mockFetch.mockRejectedValueOnce(originalError);

    try {
      await request('/test');
      expect.fail('Should have thrown ApiError');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.response).toBe(originalError);
    }
  });
});

describe('API Client - Request Body Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should not include body for GET requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test', { method: 'GET' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: undefined,
      }),
    );
  });

  it('should serialize object body to JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    const body = { name: 'Test', value: 123, nested: { key: 'value' } };
    await request('/test', { method: 'POST', body });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(body),
      }),
    );
  });

  it('should serialize array body to JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    const body = [{ id: 1 }, { id: 2 }];
    await request('/test', { method: 'POST', body });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(body),
      }),
    );
  });
});

describe('API Client - Header Merging', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should merge custom headers with default headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test', {
      headers: { 'X-Custom': 'custom-value' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Custom': 'custom-value',
        }),
      }),
    );
  });

  it('should allow custom headers to override default headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test', {
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'text/plain',
        }),
      }),
    );
  });

  it('should support authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test', {
      headers: { 'Authorization': 'Bearer token123' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer token123',
        }),
      }),
    );
  });
});

describe('API Client - Products API Edge Cases', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle product with special characters in ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'prod-123_test' }),
    });

    await products.get('prod-123_test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/products/prod-123_test'),
      expect.any(Object),
    );
  });

  it('should handle search with special characters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ search: 'flower & plant' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('search=flower');
  });

  it('should handle multiple color filters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await products.list({ color: 'blue,green' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('color=blue');
  });

  it('should handle create with minimal data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    await products.create({ title: 'Test' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('should handle update with empty object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    await products.update('123', {});

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PUT',
        body: '{}',
      }),
    );
  });
});

describe('API Client - Cart API Edge Cases', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle add with quantity of 1', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '1' }),
    });

    await cart.add({
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 1,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"quantity":1'),
      }),
    );
  });

  it('should handle add with large quantity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '1' }),
    });

    await cart.add({
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 100,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"quantity":100'),
      }),
    );
  });

  it('should handle update with quantity only', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '1', quantity: 5 }),
    });

    await cart.update('item-1', { quantity: 5 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: '{"quantity":5}',
      }),
    );
  });

  it('should handle update with frameId only', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '1', frameId: 'frame-oak' }),
    });

    await cart.update('item-1', { frameId: 'frame-oak' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: '{"frameId":"frame-oak"}',
      }),
    );
  });
});

describe('API Client - Orders API Edge Cases', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle get order by order number format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123', orderNumber: 'ORD-12345678' }),
    });

    await orders.get('ORD-12345678');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/orders/ORD-12345678'),
      expect.any(Object),
    );
  });

  it('should handle list with all parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: [], meta: {} }),
    });

    await orders.list({ page: 2, limit: 25, status: 'processing' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('limit=25');
    expect(url).toContain('status=processing');
  });

  it('should handle create with all optional fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123' }),
    });

    const orderData = {
      shippingAddress: { fullName: 'John' },
      billingAddress: { fullName: 'Jane' },
      paymentMethod: 'razorpay',
      notes: 'Gift wrap please',
    };

    await orders.create(orderData);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(orderData),
      }),
    );
  });

  it('should handle update with tracking info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '123', status: 'shipped' }),
    });

    const updates = {
      status: 'shipped',
      trackingNumber: 'TRACK123456',
      shippingCarrier: 'BlueDart',
    };

    await orders.update('123', updates);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(updates),
      }),
    );
  });
});

describe('API Client - Integration Style Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should support typical product listing flow', async () => {
    // First list products
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        data: [{ id: 'prod-1', title: 'Test Product' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
    });

    const list = await products.list({ page: 1, limit: 10 });
    expect(list.data).toHaveLength(1);

    // Then get single product
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'prod-1', title: 'Test Product', description: 'Full details' }),
    });

    const product = await products.get(list.data[0].id);
    expect(product.id).toBe('prod-1');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should support typical cart flow', async () => {
    // Add item to cart
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'cart-item-1', productId: 'prod-1', quantity: 1 }),
    });

    const addedItem = await cart.add({
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 1,
    });
    expect(addedItem.id).toBe('cart-item-1');

    // Update quantity
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'cart-item-1', quantity: 3 }),
    });

    const updatedItem = await cart.update(addedItem.id, { quantity: 3 });
    expect(updatedItem.quantity).toBe(3);

    // Get cart
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [{ id: 'cart-item-1', productId: 'prod-1', quantity: 3 }],
    });

    const cartItems = await cart.get();
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0].quantity).toBe(3);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should support typical order flow', async () => {
    // Create order
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'order-1', orderNumber: 'ORD-12345678', status: 'pending' }),
    });

    const order = await orders.create({
      shippingAddress: { fullName: 'John Doe' },
      paymentMethod: 'razorpay',
    });
    expect(order.status).toBe('pending');

    // Get order details
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: 'order-1', orderNumber: 'ORD-12345678', status: 'pending', items: [] }),
    });

    const orderDetails = await orders.get(order.id);
    expect(orderDetails.orderNumber).toBe('ORD-12345678');

    // List orders
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        data: [{ id: 'order-1', orderNumber: 'ORD-12345678' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }),
    });

    const ordersList = await orders.list();
    expect(ordersList.data).toHaveLength(1);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('API Client - Timeout Configuration', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should use default timeout from config', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    await request('/test');

    // The timeout should be applied via AbortController
    expect(API_CONFIG.timeout).toBe(30000);
  });

  it('should allow custom timeout in request options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    // This should not throw even with short timeout if request completes quickly
    await request('/test', { timeout: 5000 });

    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('API Client - JSON Parsing', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should handle JSON with nested objects', async () => {
    const nestedData = {
      user: {
        profile: {
          address: {
            city: 'Mumbai',
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => nestedData,
    });

    const result = await request('/test');
    expect(result.user.profile.address.city).toBe('Mumbai');
  });

  it('should handle JSON arrays', async () => {
    const arrayData = [1, 2, 3, 4, 5];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => arrayData,
    });

    const result = await request('/test');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(5);
  });

  it('should handle JSON with special characters in values', async () => {
    const specialData = {
      message: 'Hello "World" & <Goodbye>',
      emoji: '🎨',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => specialData,
    });

    const result = await request('/test');
    expect(result.message).toBe('Hello "World" & <Goodbye>');
    expect(result.emoji).toBe('🎨');
  });
});
