import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCustomerCoupon,
  createOrder,
  getCustomerMe,
  getProducts,
  searchProducts,
} from '@/lib/api';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches all products without a category query', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 1, model: '6200' }]));

    await expect(getProducts()).resolves.toEqual([{ id: 1, model: '6200' }]);

    expect(fetchMock).toHaveBeenCalledWith('/api/bearings', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('fetches products with a category query when a specific category is selected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 2, model: 'NU205' }]));

    await expect(getProducts('roller')).resolves.toEqual([{ id: 2, model: 'NU205' }]);

    expect(fetchMock).toHaveBeenCalledWith('/api/bearings?category=roller', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('serializes search parameters with URLSearchParams', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 3, model: '30205' }]));

    await searchProducts({ model: '30205', brand: 'SKF' });

    expect(fetchMock).toHaveBeenCalledWith('/api/search?model=30205&brand=SKF', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('posts orders as JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ orderId: 42, message: 'created' }));

    await expect(createOrder({ items: [{ id: 1, quantity: 2 }] })).resolves.toEqual({
      orderId: 42,
      message: 'created',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: 1, quantity: 2 }] }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('sends the stored bearer token for customer requests', async () => {
    localStorage.setItem('token', 'token-123');
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, phone: '13800138000' }));

    await getCustomerMe();

    expect(fetchMock).toHaveBeenCalledWith('/api/customer/me', {
      headers: {
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      },
    });
  });

  it('throws the API error message when the response is not ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'out of stock' }, 409));

    await expect(applyCustomerCoupon('SAVE10', 42)).rejects.toThrow('out of stock');
  });
});
