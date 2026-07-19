import { create } from 'zustand';
import {
  customerLogin,
  customerLogout,
  customerRegister,
  getCustomerMe,
} from '@/lib/api';
import type { AuthUser } from '@/types';

interface AuthStore {
  user: AuthUser | null;
  authenticated: boolean;
  loading: boolean;
  _rehydrated: boolean;

  initialize: () => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: { name?: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  authenticated: false,
  loading: false,
  _rehydrated: false,

  initialize: async () => {
    if (get()._rehydrated || get().loading) return;
    set({ loading: true });
    try {
      const user = await getCustomerMe();
      set({ user, authenticated: true });
    } catch {
      set({ user: null, authenticated: false });
    } finally {
      set({ loading: false, _rehydrated: true });
    }
  },

  login: async (phone, password) => {
    const res = await customerLogin(phone, password);
    set({ authenticated: true, user: res.user, _rehydrated: true });
  },

  register: async (data) => {
    const res = await customerRegister(data);
    set({ authenticated: true, user: res.user, _rehydrated: true });
  },

  logout: async () => {
    try {
      await customerLogout();
    } finally {
      set({ authenticated: false, user: null, _rehydrated: true });
    }
  },

  fetchMe: async () => {
    try {
      const user = await getCustomerMe();
      set({ user, authenticated: true, _rehydrated: true });
    } catch {
      set({ authenticated: false, user: null, _rehydrated: true });
    }
  },
}));
