import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';

const mockCustomerLogin = vi.fn();
const mockCustomerLogout = vi.fn();
const mockCustomerRegister = vi.fn();
const mockGetCustomerMe = vi.fn();

vi.mock('@/lib/api', () => ({
  customerLogin: (...args: unknown[]) => mockCustomerLogin(...args),
  customerLogout: (...args: unknown[]) => mockCustomerLogout(...args),
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

describe('cookie-backed authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      authenticated: false,
      loading: false,
      _rehydrated: false,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps only public user state after login', async () => {
    mockCustomerLogin.mockResolvedValueOnce({ token: 'must-not-be-stored', user });

    await useAuthStore.getState().login('13800138000', 'secret');

    expect(useAuthStore.getState()).toMatchObject({ authenticated: true, user });
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockCustomerLogin).toHaveBeenCalledWith('13800138000', 'secret');
  });

  it('keeps only public user state after registration', async () => {
    mockCustomerRegister.mockResolvedValueOnce({ token: 'must-not-be-stored', user });
    const registration = { name: 'Test User', phone: '13800138000', password: 'secret' };

    await useAuthStore.getState().register(registration);

    expect(useAuthStore.getState()).toMatchObject({ authenticated: true, user });
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockCustomerRegister).toHaveBeenCalledWith(registration);
  });

  it('calls the cookie logout endpoint and clears public session state', async () => {
    mockCustomerLogout.mockResolvedValueOnce({ loggedOut: true });
    useAuthStore.setState({ authenticated: true, user });

    await useAuthStore.getState().logout();

    expect(mockCustomerLogout).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({ authenticated: false, user: null });
  });

  it('discovers an existing HttpOnly cookie session on initialization', async () => {
    mockGetCustomerMe.mockResolvedValueOnce(user);

    await useAuthStore.getState().initialize();

    expect(mockGetCustomerMe).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({
      authenticated: true,
      user,
      _rehydrated: true,
    });
  });

  it('refreshes the current customer without a JavaScript-readable token', async () => {
    const refreshedUser = { ...user, points: 150 };
    mockGetCustomerMe.mockResolvedValueOnce(refreshedUser);

    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState()).toMatchObject({ authenticated: true, user: refreshedUser });
  });

  it('clears authentication when the server-side session is unavailable', async () => {
    useAuthStore.setState({ authenticated: true, user });
    mockGetCustomerMe.mockRejectedValueOnce(new Error('expired'));

    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState()).toMatchObject({ authenticated: false, user: null });
    expect(localStorage.getItem('token')).toBeNull();
  });
});
