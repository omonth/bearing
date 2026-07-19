import axios from 'axios';
import { useAuthStore } from './authStore';

const adminApi = axios.create({
  baseURL: '/api',
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearSession();
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
