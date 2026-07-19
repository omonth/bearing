import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/shared/lib/authStore';

const user = { id: 1, username: 'admin', role: 'admin' };

describe('cookie-backed adminAuthStore', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ user: null, initialized: false, loading: false });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores public administrator state without persisting a JWT', () => {
    useAuthStore.getState().login(user);

    expect(useAuthStore.getState()).toMatchObject({ user, initialized: true });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    expect(localStorage.getItem('admin-auth')).toBeNull();
  });

  it('calls the cookie logout endpoint and clears public state', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    useAuthStore.getState().login(user);

    await useAuthStore.getState().logout();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(useAuthStore.getState()).toMatchObject({ user: null, initialized: true });
  });

  it('discovers a current HttpOnly cookie session during initialization', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await useAuthStore.getState().initialize();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
    expect(useAuthStore.getState()).toMatchObject({ user, initialized: true, loading: false });
  });

  it('fails closed when the server-side session is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      initialized: true,
      loading: false,
    });
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
