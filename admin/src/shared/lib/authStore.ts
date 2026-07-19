import { create } from 'zustand';

interface AdminUser {
  id: number;
  username: string;
  role: string;
}

interface AuthState {
  user: AdminUser | null;
  initialized: boolean;
  loading: boolean;
  login: (user: AdminUser) => void;
  logout: () => Promise<void>;
  clearSession: () => void;
  initialize: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  initialized: false,
  loading: false,
  login: (user) => set({ user, initialized: true, loading: false }),
  clearSession: () => set({ user: null, initialized: true, loading: false }),
  logout: async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } finally {
      get().clearSession();
    }
  },
  initialize: async () => {
    if (get().initialized || get().loading) return;
    set({ loading: true });
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) throw new Error('session unavailable');
      const body = await response.json();
      set({ user: body.data, initialized: true, loading: false });
    } catch {
      set({ user: null, initialized: true, loading: false });
    }
  },
  isAuthenticated: () => Boolean(get().user),
}));
