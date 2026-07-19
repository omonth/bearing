import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  cancelCustomerOrder,
  confirmCustomerPhoneVerification,
  requestCustomerPasswordReset,
  requestCustomerPhoneVerification,
  resetCustomerPassword,
  updateCustomerProfile,
} from '@/lib/api';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('customer self-service API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests password recovery without authentication', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: { message: '如果该手机号已注册，您将收到密码重置通知' },
    }, 202));

    await requestCustomerPasswordReset('13800138000');

    expect(fetchMock).toHaveBeenCalledWith('/api/customer/password/forgot', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ phone: '13800138000' }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('resets a password with the opaque URL token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { message: '密码已重置' } }));

    await resetCustomerPassword('opaque-reset-token', 'replacement123');

    expect(fetchMock).toHaveBeenCalledWith('/api/customer/password/reset', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ token: 'opaque-reset-token', newPassword: 'replacement123' }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('updates only the editable profile fields with customer authentication', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: { id: 7, name: '张三', email: 'buyer@example.com', company: '示例公司' },
    }));
    const profile = { name: '张三', email: 'buyer@example.com', company: '示例公司' };

    await updateCustomerProfile(profile);

    expect(fetchMock).toHaveBeenCalledWith('/api/customer/me', {
      method: 'PATCH',
      credentials: 'include',
      body: JSON.stringify(profile),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('requests and confirms phone verification through authenticated endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: { verified: false, notificationRequested: true },
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        data: { verified: true, idempotent: false },
      }));

    await requestCustomerPhoneVerification();
    await confirmCustomerPhoneVerification('123456');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/customer/phone-verification/request', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/customer/phone-verification/confirm', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ code: '123456' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('cancels a customer order and preserves the backend error code for safe UI mapping', async () => {
    localStorage.setItem('token', 'customer-token');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        data: { orderId: 42, status: 'cancelled', idempotent: false },
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: '外部支付单尚未关单，暂时不能取消订单',
        code: 'PAYMENT_CLOSE_REQUIRED',
      }, 409));

    await expect(cancelCustomerOrder(42)).resolves.toEqual({
      orderId: 42,
      status: 'cancelled',
      idempotent: false,
    });
    const failedCancellation = cancelCustomerOrder(42);
    await expect(failedCancellation).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'PAYMENT_CLOSE_REQUIRED',
      status: 409,
    });
    await expect(failedCancellation).rejects.toBeInstanceOf(ApiRequestError);
  });
});
