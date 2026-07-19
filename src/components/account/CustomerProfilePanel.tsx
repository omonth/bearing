import { useState } from 'react';
import {
  confirmCustomerPhoneVerification,
  requestCustomerPhoneVerification,
  updateCustomerProfile,
} from '@/lib/api';
import type { AuthUser } from '@/types';

interface CustomerProfilePanelProps {
  customer: AuthUser;
  onProfileUpdated: () => Promise<void> | void;
}

const inputClass =
  'w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors';

export default function CustomerProfilePanel({
  customer,
  onProfileUpdated,
}: CustomerProfilePanelProps) {
  const [name, setName] = useState(customer.name || '');
  const [email, setEmail] = useState(customer.email || '');
  const [company, setCompany] = useState(customer.company || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [confirmingVerification, setConfirmingVerification] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const resetFeedback = () => {
    setMessage('');
    setError('');
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    resetFeedback();
    const profile = {
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
    };
    if (!profile.name) {
      setError('姓名不能为空');
      return;
    }
    setSaving(true);
    try {
      await updateCustomerProfile(profile);
      await onProfileUpdated();
      setMessage('资料已更新');
    } catch {
      setError('资料更新失败，请检查输入后重试。');
    } finally {
      setSaving(false);
    }
  };

  const requestVerification = async () => {
    resetFeedback();
    setRequestingVerification(true);
    try {
      const result = await requestCustomerPhoneVerification();
      setMessage(result.verified
        ? '手机号已验证。'
        : '通知已请求，请查看受控渠道中的 6 位验证码。');
    } catch {
      setError('暂时无法请求验证通知，请稍后再试。');
    } finally {
      setRequestingVerification(false);
    }
  };

  const confirmVerification = async () => {
    resetFeedback();
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('请输入 6 位手机验证码');
      return;
    }
    setConfirmingVerification(true);
    try {
      const result = await confirmCustomerPhoneVerification(verificationCode);
      if (result.verified) {
        setVerificationCode('');
        setMessage('手机号验证成功。');
      } else {
        setError('手机验证未完成，请重新请求通知。');
      }
    } catch {
      setError('验证码无效或已过期，请重新请求。');
    } finally {
      setConfirmingVerification(false);
    }
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={saveProfile}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4"
      >
        <h2 className="text-base font-semibold text-white">顾客资料</h2>
        <div>
          <label htmlFor="profile-name" className="block text-xs text-neutral-400 mb-1.5">
            姓名
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-xs text-neutral-400 mb-1.5">
            邮箱
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            autoComplete="email"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-company" className="block text-xs text-neutral-400 mb-1.5">
            公司
          </label>
          <input
            id="profile-company"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={120}
            autoComplete="organization"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
        >
          {saving ? '保存中...' : '保存资料'}
        </button>
      </form>

      <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">手机号验证</h2>
          <p className="mt-1 text-xs text-neutral-500">当前手机号：{customer.phone}</p>
        </div>
        <button
          type="button"
          onClick={requestVerification}
          disabled={requestingVerification}
          className="px-4 py-2 text-sm text-amber-400 border border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-50 rounded-md transition-colors"
        >
          {requestingVerification ? '请求中...' : '请求手机验证通知'}
        </button>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-52">
            <label htmlFor="phone-verification-code" className="block text-xs text-neutral-400 mb-1.5">
              手机验证码
            </label>
            <input
              id="phone-verification-code"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={confirmVerification}
            disabled={confirmingVerification}
            className="px-4 py-2.5 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors"
          >
            {confirmingVerification ? '验证中...' : '确认手机验证'}
          </button>
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
    </div>
  );
}
