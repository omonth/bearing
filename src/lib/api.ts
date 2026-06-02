const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const getAuthHeaders = () => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  return {};
};

// Products
export const getProducts = (category?: string) =>
  request<any[]>(`/bearings${category && category !== '全部' ? `?category=${category}` : ''}`);

export const getProduct = (id: number) => request<any>(`/bearings/${id}`);

export const getCategories = () => request<string[]>('/categories');

export const searchProducts = (params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString();
  return request<any>(`/search?${qs}`);
};

// Orders
export const createOrder = (data: any) =>
  request<{ orderId: number; message: string }>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// Recommendations
export const getHotProducts = (limit = 10) =>
  request<any[]>(`/recommendations/hot?limit=${limit}`);

export const getSimilarProducts = (productId: number, limit = 5) =>
  request<any[]>(`/recommendations/similar/${productId}?limit=${limit}`);

// Auth (admin)
export const adminLogin = (username: string, password: string) =>
  request<{ token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

// Customer auth
export const customerRegister = (data: { name?: string; phone: string; password: string }) =>
  request<{ token: string; user: any }>('/customer/register', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  });

export const customerLogin = (phone: string, password: string) =>
  request<{ token: string; user: any }>('/customer/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
    headers: { 'Content-Type': 'application/json' },
  });

export const getCustomerMe = () =>
  request<any>('/customer/me', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerOrders = () =>
  request<any[]>('/customer/orders', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerOrderDetail = (id: number) =>
  request<any>(`/customer/orders/${id}`, {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const getCustomerCoupons = () =>
  request<any[]>('/customer/coupons', {
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

export const applyCustomerCoupon = (code: string, orderId: number) =>
  request<any>('/customer/coupons/use', {
    method: 'POST',
    body: JSON.stringify({ code, orderId }),
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
  });

// Payment
export const createPayment = (data: any) =>
  request<any>('/payment/checkout', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const queryPaymentStatus = (paymentOrderId: number) =>
  request<{ status: string; paymentMethod: string; amount: number; paidAt: string | null }>(
    `/payment/status/${paymentOrderId}`
  );

// AI
export const chatWithBot = (message: string, context?: any) =>
  request<any>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, context }),
  });

export { getAuthHeaders };
