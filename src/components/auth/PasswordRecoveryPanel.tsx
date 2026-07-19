import { useState } from 'react';
import {
  requestCustomerPasswordReset,
  resetCustomerPassword,
} from '@/lib/api';

interface PasswordRecoveryPanelProps {
  mode: 'request' | 'reset';
  resetToken?: string;
  onBack: () => void;
  onResetComplete?: () => void;
}

const inputClass =
  'w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors';

function publicError(error: unknown, operation: 'request' | 'reset') {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  if (code === 'INVALID_OR_EXPIRED_RESET') return '重置链接无效或已过期，请重新申请。';
  if (code === 'SECURITY_REQUEST_RATE_LIMITED') return '请求过于频繁，请稍后再试。';
  return operation === 'request'
    ? '暂时无法受理请求，请稍后再试。'
    : '密码重置失败，请重新申请重置链接。';
}

export default function PasswordRecoveryPanel({
  mode,
  resetToken,
  onBack,
  onResetComplete,
}: PasswordRecoveryPanelProps) {
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedPhone = phone.trim();
    setError('');
    setMessage('');
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      setError('请输入正确的手机号');
      return;
    }
    setSubmitting(true);
    try {
      await requestCustomerPasswordReset(normalizedPhone);
      setMessage('如果该手机号已注册，请查看受控通知渠道中的密码重置通知。');
    } catch (requestError) {
      setError(publicError(requestError, 'request'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!resetToken) {
      setError('重置链接无效或已过期，请重新申请。');
      return;
    }
    if (newPassword !== confirmation) {
      setError('两次输入的密码不一致');
      return;
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('密码至少 8 位，并同时包含字母和数字');
      return;
    }
    setSubmitting(true);
    try {
      await resetCustomerPassword(resetToken, newPassword);
      setNewPassword('');
      setConfirmation('');
      setMessage('密码已重置，请使用新密码登录。');
      onResetComplete?.();
    } catch (resetError) {
      setError(publicError(resetError, 'reset'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={mode === 'request' ? handleRequest : handleReset}
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 space-y-5"
    >
      <div>
        <h1 className="text-lg font-semibold text-white">
          {mode === 'request' ? '找回密码' : '设置新密码'}
        </h1>
        <p className="mt-2 text-xs leading-5 text-neutral-500">
          {mode === 'request'
            ? '提交后，无论账号是否存在都会显示相同结果。'
            : '请设置至少 8 位且同时包含字母和数字的新密码。'}
        </p>
      </div>

      {mode === 'request' ? (
        <div>
          <label htmlFor="recovery-phone" className="block text-xs text-neutral-400 mb-1.5">
            手机号
          </label>
          <input
            id="recovery-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={inputClass}
          />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="new-password" className="block text-xs text-neutral-400 mb-1.5">
              新密码
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-xs text-neutral-400 mb-1.5">
              确认新密码
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={inputClass}
            />
          </div>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-400 text-center">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-400 text-center">{message}</p>}

      <button
        type="submit"
        disabled={submitting || (mode === 'reset' && !resetToken)}
        className="w-full py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
      >
        {submitting
          ? '请稍候...'
          : mode === 'request'
            ? '申请重置密码'
            : '重置密码'}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        返回登录
      </button>
    </form>
  );
}
