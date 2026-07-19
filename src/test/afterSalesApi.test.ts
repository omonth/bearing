import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCustomerAfterSalesCase,
  createCustomerAfterSalesCase,
  createCustomerInvoiceProfile,
  deleteCustomerInvoiceProfile,
  getCustomerAfterSalesCase,
  getCustomerOrderLogistics,
  listCustomerAfterSalesCases,
  listCustomerInvoiceProfiles,
  listCustomerOrderInvoices,
  requestCustomerOrderInvoice,
  updateCustomerInvoiceProfile,
} from '@/lib/api';

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('customer after-sales API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, lists, reads, and version-cancels an after-sales case', async () => {
    const input = {
      clientRequestId: 'case-request-0001',
      orderId: 42,
      type: 'refund_only' as const,
      reason: '规格不符',
      description: '收到的商品规格与订单不一致，需要人工审核退款。',
      requestedAmount: 128,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 1, status: 'submitted', version: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, status: 'submitted', version: 1 }]))
      .mockResolvedValueOnce(jsonResponse({ id: 1, history: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 1, status: 'cancelled', version: 2 }));

    await createCustomerAfterSalesCase(input);
    await listCustomerAfterSalesCases();
    await getCustomerAfterSalesCase(1);
    await cancelCustomerAfterSalesCase(1, 1);

    const authHeaders = {
      'Content-Type': 'application/json',
    };
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/after-sales/cases', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(input),
      headers: { ...authHeaders, 'Idempotency-Key': input.clientRequestId },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/after-sales/cases', {
      credentials: 'include',
      headers: authHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/after-sales/cases/1', {
      credentials: 'include',
      headers: authHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/after-sales/cases/1/cancel', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ expectedVersion: 1 }),
      headers: authHeaders,
    });
  });

  it('queries customer-owned logistics details', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      orderId: 42,
      shippingStatus: 'in_transit',
      trackingNumber: 'SF1234567890',
      history: [],
    }));

    await getCustomerOrderLogistics(42);

    expect(fetchMock).toHaveBeenCalledWith('/api/after-sales/orders/42/logistics', {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('performs versioned invoice profile CRUD', async () => {
    const input = {
      titleType: 'company' as const,
      title: '示例轴承有限公司',
      taxNumber: '91330100123456789X',
      email: 'invoice@example.com',
      recipientPhone: '13800138000',
      registeredAddress: '浙江省杭州市测试路 1 号',
      bankName: '测试银行',
      bankAccount: '622200000000000001',
      isDefault: true,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 3, ...input, version: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: 3, ...input, email: 'new@example.com', version: 2 }))
      .mockResolvedValueOnce(jsonResponse({ id: 3, deleted: true }));

    await listCustomerInvoiceProfiles();
    await createCustomerInvoiceProfile(input);
    await updateCustomerInvoiceProfile(3, 1, { email: 'new@example.com' });
    await deleteCustomerInvoiceProfile(3, 2);

    const authHeaders = {
      'Content-Type': 'application/json',
    };
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/after-sales/invoice-profiles', {
      credentials: 'include',
      headers: authHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/after-sales/invoice-profiles', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(input),
      headers: authHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/after-sales/invoice-profiles/3', {
      method: 'PATCH',
      credentials: 'include',
      body: JSON.stringify({ expectedVersion: 1, email: 'new@example.com' }),
      headers: authHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/after-sales/invoice-profiles/3', {
      method: 'DELETE',
      credentials: 'include',
      body: JSON.stringify({ expectedVersion: 2 }),
      headers: authHeaders,
    });
  });

  it('requests an order invoice and lists its status', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 7, orderId: 42, status: 'requested' }, 201))
      .mockResolvedValueOnce(jsonResponse([{ id: 7, orderId: 42, status: 'requested' }]));

    await requestCustomerOrderInvoice(42, 3);
    await listCustomerOrderInvoices();

    const authHeaders = {
      'Content-Type': 'application/json',
    };
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/after-sales/orders/42/invoices', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ profileId: 3 }),
      headers: authHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/after-sales/invoices', {
      credentials: 'include',
      headers: authHeaders,
    });
  });
});
