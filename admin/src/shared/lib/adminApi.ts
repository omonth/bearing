import axios from 'axios';
import { useAuthStore } from './authStore';

const adminApi = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

adminApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  },
);

export function toProTable<T>(res: { data: { total?: number; results?: T[]; data?: T[] } }) {
  return {
    data: res.data?.results || res.data?.data || [],
    success: true,
    total: res.data?.total || 0,
  };
}

export default adminApi;
