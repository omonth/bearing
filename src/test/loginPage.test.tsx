import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../pages/login';

const resetPassword = vi.fn();

vi.mock('@/lib/api', () => ({
  requestCustomerPasswordReset: vi.fn(),
  resetCustomerPassword: (...args: unknown[]) => resetPassword(...args),
}));

vi.mock('@/components/Header', () => ({
  default: () => <div data-testid="header" />,
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: () => ({ toggleCart: vi.fn() }),
  useTotalCount: () => 0,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    login: vi.fn(),
    register: vi.fn(),
    _rehydrated: true,
  }),
}));

describe('LoginPage password reset route', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/login');
  });

  it('consumes a fragment credential in memory and immediately clears browser history', async () => {
    window.history.replaceState({}, '', '/login#resetToken=opaque-reset-token-from-fragment');
    resetPassword.mockResolvedValueOnce({ message: '密码已重置' });
    const user = userEvent.setup();

    render(<LoginPage />);
    await user.type(await screen.findByLabelText('新密码'), 'replacement123');
    await user.type(screen.getByLabelText('确认新密码'), 'replacement123');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(resetPassword).toHaveBeenCalledWith(
      'opaque-reset-token-from-fragment',
      'replacement123'
    );
    expect(screen.queryByText('opaque-reset-token-from-fragment')).not.toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/login');
  });

  it('does not accept legacy query-string reset credentials', async () => {
    window.history.replaceState({}, '', '/login?token=query-token-must-be-ignored');

    render(<LoginPage />);

    expect(await screen.findByTestId('customer-auth-mode-login')).toBeInTheDocument();
    expect(screen.queryByLabelText('新密码')).not.toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/login');
  });
});
