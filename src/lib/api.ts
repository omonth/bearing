import type {
  AdminUser,
  AuthUser,
  Bearing,
  ChatResponse,
  Customer,
  CustomerAddress,
  CustomerAddressInput,
  CustomerCoupon,
  Order,
} from '@/types';

const API_BASE = '/api';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiError {
  error?: string;
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error: unknown = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(isApiError(error) && error.error ? error.error : `HTTP ${res.status}`);
  }
  const body: unknown = await res.json();
  // Backend wraps all success responses as { data: ... }
  return (body as ApiEnvelope<T>).data;
}

export const getAuthHeaders = (): Record<string, string> => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
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

export const getCustomerMe = () =>
  request<Customer>('/customer/me', {
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
