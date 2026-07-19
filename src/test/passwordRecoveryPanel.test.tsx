import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordRecoveryPanel from '@/components/auth/PasswordRecoveryPanel';

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();

vi.mock('@/lib/api', () => ({
  requestCustomerPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  resetCustomerPassword: (...args: unknown[]) => resetPassword(...args),
}));

describe('PasswordRecoveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only a generic recovery acknowledgement and never renders returned secrets', async () => {
    requestPasswordReset.mockResolvedValueOnce({
      message: '如果该手机号已注册，您将收到密码重置通知',
      token: 'server-secret-must-not-be-rendered',
      code: '654321',
    });
    const user = userEvent.setup();

    render(<PasswordRecoveryPanel mode="request" onBack={vi.fn()} />);
    await user.type(screen.getByLabelText('手机号'), '13800138000');
    await user.click(screen.getByRole('button', { name: '申请重置密码' }));

    expect(requestPasswordReset).toHaveBeenCalledWith('13800138000');
    expect(await screen.findByRole('status')).toHaveTextContent(
      '如果该手机号已注册，请查看受控通知渠道中的密码重置通知。'
    );
    expect(screen.queryByText('server-secret-must-not-be-rendered')).not.toBeInTheDocument();
    expect(screen.queryByText('654321')).not.toBeInTheDocument();
  });

  it('uses the opaque URL token to reset a matching strong password without displaying it', async () => {
    resetPassword.mockResolvedValueOnce({ message: '密码已重置' });
    const onResetComplete = vi.fn();
    const user = userEvent.setup();
    const resetToken = 'opaque-secret-token-from-url-query';

    render(
      <PasswordRecoveryPanel
        mode="reset"
        resetToken={resetToken}
        onBack={vi.fn()}
        onResetComplete={onResetComplete}
      />
    );
    await user.type(screen.getByLabelText('新密码'), 'replacement123');
    await user.type(screen.getByLabelText('确认新密码'), 'replacement123');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(resetPassword).toHaveBeenCalledWith(resetToken, 'replacement123');
    expect(await screen.findByRole('status')).toHaveTextContent('密码已重置，请使用新密码登录。');
    expect(screen.queryByText(resetToken)).not.toBeInTheDocument();
    expect(onResetComplete).toHaveBeenCalledOnce();
  });

  it('rejects mismatched passwords before sending a reset request', async () => {
    const user = userEvent.setup();

    render(
      <PasswordRecoveryPanel
        mode="reset"
        resetToken="opaque-secret-token-from-url-query"
        onBack={vi.fn()}
      />
    );
    await user.type(screen.getByLabelText('新密码'), 'replacement123');
    await user.type(screen.getByLabelText('确认新密码'), 'replacement456');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致');
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
