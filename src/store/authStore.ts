import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { customerLogin, customerRegister, getCustomerMe } from '@/lib/api';
import type { AuthUser } from '@/types';

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  _rehydrated: boolean;

  login: (phone: string, password: string) => Promise<void>;
  register: (data: { name?: string; phone: string; password: string }) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      _rehydrated: false,

      login: async (phone, password) => {
        const res = await customerLogin(phone, password);
        localStorage.setItem('token', res.token);
        set({ token: res.token, user: res.user });
      },

      register: async (data) => {
        const res = await customerRegister(data);
        localStorage.setItem('token', res.token);
        set({ token: res.token, user: res.user });
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ token: null, user: null });
      },

      fetchMe: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const data = await getCustomerMe();
          set({ user: data });
        } catch {
          localStorage.removeItem('token');
          set({ token: null, user: null });
        }
      },
    }),
    {
      name: 'bearing-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state._rehydrated = true;
      },
    }
  )
);
