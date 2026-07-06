/**
 * API Client Tests
 *
 * Tests for the fetch-based API client in app/lib/api.ts, covering the core
 * sub-APIs (products, cart, orders, health). The remaining sub-APIs follow the
 * same thin fetch-wrapper pattern and are exercised end-to-end by Playwright.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { productsApi, cartApi, ordersApi, healthApi } from '../../app/lib/api';
import type { CartItemInput, OrderInput } from '../../app/lib/api';

const API_URL = 'http://localhost:3000';

const fetchMock = vi.fn();

function mockJsonResponse(body: unknown, init?: { status?: number }) {
  const status = init?.status ?? 200;
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

/** URL and RequestInit of the nth fetch call */
function fetchCall(n = 0): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[n]!;
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('productsApi', () => {
  describe('list', () => {
    it('requests /api/products without a query string when no params given', async () => {
      mockJsonResponse({ items: [], total: 0 });

      await productsApi.list();

      const { url, init } = fetchCall();
      expect(url).toBe(`${API_URL}/api/products`);
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('include');
    });

    it('serializes filters and pagination into the query string', async () => {
      mockJsonResponse({ items: [], total: 0 });

      await productsApi.list({
        page: 2,
        pageSize: 24,
        styles: 'abstract,modern',
        colors: 'blue',
        priceMin: 500,
        isFeatured: true,
        sortBy: 'basePrice',
        sortOrder: 'asc',
      });

      const { url } = fetchCall();
      const params = new URL(url).searchParams;
      expect(params.get('page')).toBe('2');
      expect(params.get('pageSize')).toBe('24');
      expect(params.get('styles')).toBe('abstract,modern');
      expect(params.get('colors')).toBe('blue');
      expect(params.get('priceMin')).toBe('500');
      expect(params.get('isFeatured')).toBe('true');
      expect(params.get('sortBy')).toBe('basePrice');
      expect(params.get('sortOrder')).toBe('asc');
    });

    it('omits undefined filters from the query string', async () => {
      mockJsonResponse({ items: [], total: 0 });

      await productsApi.list({ page: 1, styles: undefined });

      const params = new URL(fetchCall().url).searchParams;
      expect(params.get('page')).toBe('1');
      expect(params.has('styles')).toBe(false);
    });

    it('returns the parsed JSON payload', async () => {
      const payload = { items: [{ id: 'p1' }], total: 1, page: 1 };
      mockJsonResponse(payload);

      await expect(productsApi.list()).resolves.toEqual(payload);
    });

    it('throws the server-provided error message on failure', async () => {
      mockJsonResponse({ error: 'Invalid page parameter' }, { status: 400 });

      await expect(productsApi.list()).rejects.toThrow('Invalid page parameter');
    });

    it('falls back to a generic error message when the body has no error field', async () => {
      mockJsonResponse({}, { status: 500 });

      await expect(productsApi.list()).rejects.toThrow('Failed to fetch products');
    });
  });

  describe('search', () => {
    it('requires q and includes optional pagination', async () => {
      mockJsonResponse({ items: [] });

      await productsApi.search({ q: 'sunset', page: 3 });

      const { url } = fetchCall();
      expect(url).toContain('/api/products/search?');
      const params = new URL(url).searchParams;
      expect(params.get('q')).toBe('sunset');
      expect(params.get('page')).toBe('3');
      expect(params.has('pageSize')).toBe(false);
    });
  });

  describe('getBySlug', () => {
    it('returns the product on success', async () => {
      mockJsonResponse({ id: 'p1', slug: 'sunset' });

      await expect(productsApi.getBySlug('sunset')).resolves.toEqual({
        id: 'p1',
        slug: 'sunset',
      });
      expect(fetchCall().url).toBe(`${API_URL}/api/products/sunset`);
    });

    it('returns null on 404 instead of throwing', async () => {
      mockJsonResponse({ error: 'Not found' }, { status: 404 });

      await expect(productsApi.getBySlug('missing')).resolves.toBeNull();
    });

    it('throws on non-404 errors', async () => {
      mockJsonResponse({ error: 'boom' }, { status: 500 });

      await expect(productsApi.getBySlug('sunset')).rejects.toThrow('boom');
    });
  });

  describe('featured / variants / frames', () => {
    it('featured passes the limit param', async () => {
      mockJsonResponse([]);

      await productsApi.featured({ limit: 6 });

      expect(fetchCall().url).toBe(`${API_URL}/api/products/featured?limit=6`);
    });

    it('getVariants targets the slug-scoped endpoint', async () => {
      mockJsonResponse([]);

      await productsApi.getVariants('sunset');

      expect(fetchCall().url).toBe(`${API_URL}/api/products/sunset/variants`);
    });

    it('getByIds POSTs the id list', async () => {
      mockJsonResponse([]);

      await productsApi.getByIds(['a', 'b']);

      const { url, init } = fetchCall();
      expect(url).toBe(`${API_URL}/api/products/by-ids`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ ids: ['a', 'b'] });
    });
  });
});

describe('cartApi', () => {
  const itemInput: CartItemInput = {
    productId: 'prod_1',
    variantId: 'var_1',
    frameId: null,
    quantity: 2,
  };

  it('get fetches the current cart with credentials', async () => {
    mockJsonResponse({ items: [] });

    await cartApi.get();

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/cart`);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('addItem POSTs the item payload', async () => {
    mockJsonResponse({ id: 'item_1' });

    await cartApi.addItem(itemInput);

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/cart/items`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(itemInput);
  });

  it('updateItem PATCHes the item by id', async () => {
    mockJsonResponse({ id: 'item_1', quantity: 5 });

    await cartApi.updateItem('item_1', { quantity: 5 });

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/cart/items/item_1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ quantity: 5 });
  });

  it('removeItem DELETEs the item by id', async () => {
    mockJsonResponse({ success: true });

    await cartApi.removeItem('item_1');

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/cart/items/item_1`);
    expect(init.method).toBe('DELETE');
  });

  it('clear DELETEs the whole cart', async () => {
    mockJsonResponse({ success: true });

    await cartApi.clear();

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/cart`);
    expect(init.method).toBe('DELETE');
  });

  it('merge POSTs the guest session id', async () => {
    mockJsonResponse({ merged: true });

    await cartApi.merge('guest_123');

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/cart/merge`);
    expect(JSON.parse(String(init.body))).toEqual({ guestSessionId: 'guest_123' });
  });

  it('propagates server error messages', async () => {
    mockJsonResponse({ error: 'Variant out of stock' }, { status: 409 });

    await expect(cartApi.addItem(itemInput)).rejects.toThrow('Variant out of stock');
  });
});

describe('ordersApi', () => {
  const orderInput: OrderInput = {
    shippingAddress: {
      fullName: 'Asha Verma',
      phone: '+919876543210',
      addressLine1: '12 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
    },
    shippingOptionId: 'ship_standard',
  };

  it('create POSTs the order payload', async () => {
    mockJsonResponse({ id: 'order_1', status: 'pending' });

    const result = await ordersApi.create(orderInput);

    const { url, init } = fetchCall();
    expect(url).toBe(`${API_URL}/api/orders`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(orderInput);
    expect(result).toEqual({ id: 'order_1', status: 'pending' });
  });

  it('create surfaces the server error message', async () => {
    mockJsonResponse({ error: 'Cart is empty' }, { status: 400 });

    await expect(ordersApi.create(orderInput)).rejects.toThrow('Cart is empty');
  });

  it('list serializes pagination and status filters', async () => {
    mockJsonResponse({ items: [] });

    await ordersApi.list({ page: 2, status: 'shipped' });

    const params = new URL(fetchCall().url).searchParams;
    expect(params.get('page')).toBe('2');
    expect(params.get('status')).toBe('shipped');
  });
});

describe('healthApi', () => {
  it('check returns the health payload', async () => {
    mockJsonResponse({ status: 'ok' });

    await expect(healthApi.check()).resolves.toEqual({ status: 'ok' });
    expect(fetchCall().url).toBe(`${API_URL}/api/health`);
  });

  it('check throws when the API is unhealthy', async () => {
    mockJsonResponse({ status: 'degraded' }, { status: 503 });

    await expect(healthApi.check()).rejects.toThrow('API health check failed');
  });
});
