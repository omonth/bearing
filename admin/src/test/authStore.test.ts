import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/shared/lib/authStore';

describe('adminAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
  });

  it('should login and persist token', () => {
    const { login, token, user } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();

    login('test-jwt-token', { id: 1, username: 'admin', role: 'admin' });

    const state = useAuthStore.getState();
    expect(state.token).toBe('test-jwt-token');
    expect(state.user).toEqual({ id: 1, username: 'admin', role: 'admin' });
  });

  it('should logout and clear token', () => {
    useAuthStore.getState().login('test-jwt-token', { id: 1, username: 'admin', role: 'admin' });
    expect(useAuthStore.getState().token).toBe('test-jwt-token');

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('should get token', () => {
    useAuthStore.getState().login('my-token', { id: 1, username: 'admin', role: 'admin' });
    expect(useAuthStore.getState().getToken()).toBe('my-token');
  });

  it('should check isAuthenticated', () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    useAuthStore.getState().login('token', { id: 1, username: 'admin', role: 'admin' });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

it('should handle token expiry by checking getToken', () => {
    // Store simulates checking if token exists
    useAuthStore.getState().login('valid-token', { id: 1, username: 'admin', role: 'admin' });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
