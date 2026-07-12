import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCustomerCoupon,
  createPayment,
  createOrder,
  getCustomerMe,
  getProducts,
  queryPaymentStatus,
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, model: '6200' }] }));

    await expect(getProducts()).resolves.toEqual([{ id: 1, model: '6200' }]);

    expect(fetchMock).toHaveBeenCalledWith('/api/bearings', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('fetches products with a category query when a specific category is selected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 2, model: 'NU205' }] }));

    await expect(getProducts('roller')).resolves.toEqual([{ id: 2, model: 'NU205' }]);

    expect(fetchMock).toHaveBeenCalledWith('/api/bearings?category=roller', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('serializes search parameters with URLSearchParams', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 3, model: '30205' }] }));

    await searchProducts({ model: '30205', brand: 'SKF' });

    expect(fetchMock).toHaveBeenCalledWith('/api/search?model=30205&brand=SKF', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('posts orders with the current customer authorization', async () => {
    localStorage.setItem('token', 'customer-token');
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: { orderId: 42, message: 'created', orderAccessToken: 'order-access-token' },
    }));

    const order = {
      customerName: 'Test Customer',
      customerPhone: '13800138000',
      province: 'Guangdong',
      city: 'Shenzhen',
      district: 'Nanshan',
      addressDetail: 'Test address',
      items: [{ id: 1, quantity: 2 }],
    };

    await expect(createOrder(order)).resolves.toEqual({
      orderId: 42,
      message: 'created',
      orderAccessToken: 'order-access-token',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order),
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('creates a payment with an order access token and no client amount', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: { amount: 20, orderNo: 'PAY-42', paymentOrderId: 100, paymentMethod: 'alipay' },
    }));

    await createPayment(
      { orderId: 42, paymentMethod: 'alipay', subject: 'order 42' },
      'order-access-token'
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/payment/checkout', {
      method: 'POST',
      body: JSON.stringify({ orderId: 42, paymentMethod: 'alipay', subject: 'order 42' }),
      headers: {
        'Content-Type': 'application/json',
        'X-Order-Access-Token': 'order-access-token',
      },
    });
  });

  it('uses the order access token when polling payment status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: { amount: 20, paidAt: null, paymentMethod: 'alipay', status: 'pending' },
    }));

    await queryPaymentStatus(100, 'order-access-token');

    expect(fetchMock).toHaveBeenCalledWith('/api/payment/status/100', {
      headers: {
        'Content-Type': 'application/json',
        'X-Order-Access-Token': 'order-access-token',
      },
    });
  });

  it('sends the stored bearer token for customer requests', async () => {
    localStorage.setItem('token', 'token-123');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 7, phone: '13800138000' } }));

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
