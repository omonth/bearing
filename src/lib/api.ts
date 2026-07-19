import type {
  AdminUser,
  AfterSalesCase,
  AuthUser,
  Bearing,
  ChatResponse,
  Customer,
  CustomerAddress,
  CustomerAddressInput,
  CustomerCoupon,
  CustomerOrderLogistics,
  InvoiceProfile,
  InvoiceProfileInput,
  Order,
  OrderInvoiceRequest,
} from '@/types';

const API_BASE = '/api';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiError {
  error?: string;
  code?: string;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export class ApiRequestError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error: unknown = await res.json().catch(() => ({ error: '请求失败' }));
    throw new ApiRequestError(
      isApiError(error) && error.error ? error.error : `HTTP ${res.status}`,
      res.status,
      isApiError(error) ? error.code : undefined
    );
  }
  const body: unknown = await res.json();
  // Backend wraps all success responses as { data: ... }
  return (body as ApiEnvelope<T>).data;
}

export const getAuthHeaders = (): Record<string, string> => {
  return {};
};

export type PaymentMethod = 'alipay' | 'wechat' | 'unionpay' | 'cod';

export interface CreateOrderRequest {
  customerName: string;
  customerPhone: string;
  province: string;
  city: string;
  district: string;
  addressDetail: string;
  items: Array<{ id: number; quantity: number }>;
}

export interface CreateOrderResponse {
  orderId: number;
  message: string;
  orderAccessToken: string;
}

export interface CreatePaymentRequest {
  orderId: number;
  paymentMethod: PaymentMethod;
  subject?: string;
}

export interface PaymentResponse {
  amount: number;
  formParams?: Record<string, unknown>;
  message?: string;
  orderNo: string;
  paymentMethod: PaymentMethod;
  paymentOrderId: number;
  payUrl?: string;
  qrCode?: string;
  qrUrl?: string;
  sandbox?: boolean;
}

export {
  getCategories,
  getProduct,
  getProducts,
  getSimilarProducts,
} from './productApi';

export const searchProducts = (params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString();
  return request<Bearing[]>(`/search?${qs}`);
};

// Orders
export const createOrder = (data: CreateOrderRequest) =>
  request<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

// Recommendations
export const getHotProducts = (limit = 10) =>
  request<Bearing[]>(`/recommendations/hot?limit=${limit}`);

// Auth (admin)
export const adminLogin = (username: string, password: string) =>
  request<{ token: string; user: AdminUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

// Customer auth
export interface CustomerRegistrationRequest {
  name?: string;
  phone: string;
  password: string;
}

export interface CustomerProfileUpdate {
  name: string;
  email: string;
  company: string;
}

export interface CustomerCancellationResult {
  orderId: number;
  status: 'cancelled';
  idempotent: boolean;
}

export interface PhoneVerificationResult {
  verified: boolean;
  notificationRequested?: boolean;
  idempotent?: boolean;
  verifiedAt?: number;
}

export interface CustomerAfterSalesCaseInput {
  clientRequestId: string;
  orderId?: number;
  type: 'return_refund' | 'refund_only' | 'order_exception';
  reason: string;
  description: string;
  requestedAmount?: number;
}

export const customerRegister = (data: CustomerRegistrationRequest) =>
  request<{ token: string; user: AuthUser }>('/customer/register', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  });

export const customerLogin = (phone: string, password: string) =>
  request<{ token: string; user: AuthUser }>('/customer/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
    headers: { 'Content-Type': 'application/json' },
  });

export const customerLogout = () =>
  request<{ loggedOut: boolean }>('/customer/logout', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });

export const requestCustomerPasswordReset = (phone: string) =>
  request<{ message: string }>('/customer/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ phone }),
    headers: { 'Content-Type': 'application/json' },
  });

export const resetCustomerPassword = (token: string, newPassword: string) =>
  request<{ message: string }>('/customer/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
    headers: { 'Content-Type': 'application/json' },
  });

export const getCustomerMe = () =>
  request<Customer>('/customer/me', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const updateCustomerProfile = (data: CustomerProfileUpdate) =>
  request<Customer>('/customer/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const requestCustomerPhoneVerification = () =>
  request<PhoneVerificationResult>('/customer/phone-verification/request', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const confirmCustomerPhoneVerification = (code: string) =>
  request<PhoneVerificationResult>('/customer/phone-verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerOrders = () =>
  request<Order[]>('/customer/orders', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerOrderDetail = (id: number) =>
  request<Order>(`/customer/orders/${id}`, {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const cancelCustomerOrder = (id: number) =>
  request<CustomerCancellationResult>(`/customer/orders/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

// After-sales, logistics, and invoices
export const createCustomerAfterSalesCase = (data: CustomerAfterSalesCaseInput) =>
  request<AfterSalesCase>('/after-sales/cases', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
      'Idempotency-Key': data.clientRequestId,
    },
  });

export const listCustomerAfterSalesCases = () =>
  request<AfterSalesCase[]>('/after-sales/cases', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerAfterSalesCase = (id: number) =>
  request<AfterSalesCase>(`/after-sales/cases/${id}`, {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const cancelCustomerAfterSalesCase = (id: number, expectedVersion: number) =>
  request<AfterSalesCase>(`/after-sales/cases/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerOrderLogistics = (orderId: number) =>
  request<CustomerOrderLogistics>(`/after-sales/orders/${orderId}/logistics`, {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const listCustomerInvoiceProfiles = () =>
  request<InvoiceProfile[]>('/after-sales/invoice-profiles', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const createCustomerInvoiceProfile = (data: InvoiceProfileInput) =>
  request<InvoiceProfile>('/after-sales/invoice-profiles', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const updateCustomerInvoiceProfile = (
  id: number,
  expectedVersion: number,
  data: Partial<InvoiceProfileInput>
) => request<InvoiceProfile>(`/after-sales/invoice-profiles/${id}`, {
  method: 'PATCH',
  body: JSON.stringify({ expectedVersion, ...data }),
  headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
});

export const deleteCustomerInvoiceProfile = (id: number, expectedVersion: number) =>
  request<{ id: number; deleted: boolean }>(`/after-sales/invoice-profiles/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ expectedVersion }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const requestCustomerOrderInvoice = (orderId: number, profileId: number) =>
  request<OrderInvoiceRequest>(`/after-sales/orders/${orderId}/invoices`, {
    method: 'POST',
    body: JSON.stringify({ profileId }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const listCustomerOrderInvoices = () =>
  request<OrderInvoiceRequest[]>('/after-sales/invoices', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerCoupons = () =>
  request<CustomerCoupon[]>('/customer/coupons', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const applyCustomerCoupon = (code: string, orderId: number) =>
  request<{ discountAmount: number }>('/customer/coupons/use', {
    method: 'POST',
    body: JSON.stringify({ code, orderId }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerAddresses = () =>
  request<CustomerAddress[]>('/customer/addresses', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const createCustomerAddress = (data: CustomerAddressInput) =>
  request<CustomerAddress>('/customer/addresses', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const updateCustomerAddress = (id: number, data: CustomerAddressInput) =>
  request<CustomerAddress>(`/customer/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const deleteCustomerAddress = (id: number) =>
  request<{ id: number }>(`/customer/addresses/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

// Payment
export const createPayment = (data: CreatePaymentRequest, orderAccessToken: string) =>
  request<PaymentResponse>('/payment/checkout', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
      'X-Order-Access-Token': orderAccessToken,
    },
  });

export const queryPaymentStatus = (paymentOrderId: number, orderAccessToken: string) =>
  request<{ status: string; paymentMethod: string; amount: number; paidAt: string | null }>(
    `/payment/status/${paymentOrderId}`,
    {
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
        'X-Order-Access-Token': orderAccessToken,
      },
    }
  );

// AI
export const chatWithBot = (message: string, context?: Record<string, unknown>) =>
  request<ChatResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, context }),
  });

// Search suggestions
export const getSearchSuggestions = (q: string) =>
  request<{ name: string; model: string }[]>(`/search/suggestions?q=${encodeURIComponent(q)}`);
