import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';

const mockCustomerLogin = vi.fn();
const mockCustomerRegister = vi.fn();
const mockGetCustomerMe = vi.fn();

vi.mock('@/lib/api', () => ({
  customerLogin: (...args: unknown[]) => mockCustomerLogin(...args),
  customerRegister: (...args: unknown[]) => mockCustomerRegister(...args),
  getCustomerMe: (...args: unknown[]) => mockGetCustomerMe(...args),
}));

const user = {
  id: 1,
  phone: '13800138000',
  name: 'Test User',
  level: 'silver',
  points: 120,
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      loading: false,
      _rehydrated: false,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('stores the token and user after login', async () => {
    mockCustomerLogin.mockResolvedValueOnce({ token: 'login-token', user });

    await useAuthStore.getState().login('13800138000', 'secret');

    expect(useAuthStore.getState()).toMatchObject({
      token: 'login-token',
      user,
    });
    expect(localStorage.getItem('token')).toBe('login-token');
    expect(mockCustomerLogin).toHaveBeenCalledWith('13800138000', 'secret');
  });

  it('stores the token and user after registration', async () => {
    mockCustomerRegister.mockResolvedValueOnce({ token: 'register-token', user });
    const registration = {
      name: 'Test User',
      phone: '13800138000',
      password: 'secret',
    };

    await useAuthStore.getState().register(registration);

    expect(useAuthStore.getState()).toMatchObject({
      token: 'register-token',
      user,
    });
    expect(localStorage.getItem('token')).toBe('register-token');
    expect(mockCustomerRegister).toHaveBeenCalledWith(registration);
  });

  it('clears the token and user on logout', () => {
    localStorage.setItem('token', 'saved-token');
    useAuthStore.setState({ token: 'saved-token', user });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
    });
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('does not fetch the current customer when there is no token', async () => {
    await useAuthStore.getState().fetchMe();

    expect(mockGetCustomerMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
    });
  });

  it('refreshes the current customer when a token exists', async () => {
    const refreshedUser = { ...user, points: 150 };
    useAuthStore.setState({ token: 'saved-token', user });
    mockGetCustomerMe.mockResolvedValueOnce(refreshedUser);

    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState()).toMatchObject({
      token: 'saved-token',
      user: refreshedUser,
    });
  });

  it('clears authentication when refreshing the current customer fails', async () => {
    localStorage.setItem('token', 'expired-token');
    useAuthStore.setState({ token: 'expired-token', user });
    mockGetCustomerMe.mockRejectedValueOnce(new Error('expired'));

    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      user: null,
    });
    expect(localStorage.getItem('token')).toBeNull();
  });
});
