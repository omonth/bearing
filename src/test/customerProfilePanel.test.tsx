import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerProfilePanel from '@/components/account/CustomerProfilePanel';

const updateProfile = vi.fn();
const requestPhoneVerification = vi.fn();
const confirmPhoneVerification = vi.fn();

vi.mock('@/lib/api', () => ({
  updateCustomerProfile: (...args: unknown[]) => updateProfile(...args),
  requestCustomerPhoneVerification: (...args: unknown[]) => requestPhoneVerification(...args),
  confirmCustomerPhoneVerification: (...args: unknown[]) => confirmPhoneVerification(...args),
}));

const customer = {
  id: 7,
  name: '旧姓名',
  phone: '13800138000',
  email: 'old@example.com',
  company: '旧公司',
  level: 'bronze',
  points: 0,
};

describe('CustomerProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only the editable customer profile fields and refreshes the account', async () => {
    updateProfile.mockResolvedValueOnce({
      ...customer,
      name: '新姓名',
      email: 'new@example.com',
      company: '新公司',
    });
    const onProfileUpdated = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomerProfilePanel
        customer={customer}
        onProfileUpdated={onProfileUpdated}
      />
    );
    await user.clear(screen.getByLabelText('姓名'));
    await user.type(screen.getByLabelText('姓名'), '新姓名');
    await user.clear(screen.getByLabelText('邮箱'));
    await user.type(screen.getByLabelText('邮箱'), 'new@example.com');
    await user.clear(screen.getByLabelText('公司'));
    await user.type(screen.getByLabelText('公司'), '新公司');
    await user.click(screen.getByRole('button', { name: '保存资料' }));

    expect(updateProfile).toHaveBeenCalledWith({
      name: '新姓名',
      email: 'new@example.com',
      company: '新公司',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('资料已更新');
    expect(onProfileUpdated).toHaveBeenCalledOnce();
  });

  it('requests a controlled verification notification without rendering a returned code', async () => {
    requestPhoneVerification.mockResolvedValueOnce({
      verified: false,
      notificationRequested: true,
      code: '654321',
    });
    const user = userEvent.setup();

    render(<CustomerProfilePanel customer={customer} onProfileUpdated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '请求手机验证通知' }));

    expect(requestPhoneVerification).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent(
      '通知已请求，请查看受控渠道中的 6 位验证码。'
    );
    expect(screen.queryByText('654321')).not.toBeInTheDocument();
  });

  it('confirms a six-digit phone verification code', async () => {
    confirmPhoneVerification.mockResolvedValueOnce({ verified: true, idempotent: false });
    const user = userEvent.setup();

    render(<CustomerProfilePanel customer={customer} onProfileUpdated={vi.fn()} />);
    await user.type(screen.getByLabelText('手机验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '确认手机验证' }));

    expect(confirmPhoneVerification).toHaveBeenCalledWith('123456');
    expect(await screen.findByRole('status')).toHaveTextContent('手机号验证成功。');
  });
});
