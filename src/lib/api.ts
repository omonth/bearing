const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

// Auth
export const login = (username: string, password: string) =>
  request<{ token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
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

// GraphQL
export const graphql = (query: string, variables?: any) =>
  request<any>('/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
  });

export { getAuthHeaders };
