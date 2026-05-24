import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminUser {
  id: number;
  username: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
  getToken: () => string | null;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      getToken: () => get().token,
      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'admin-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
