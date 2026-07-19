import { useEffect, useState } from 'react';
import {
  createCustomerInvoiceProfile,
  deleteCustomerInvoiceProfile,
  listCustomerInvoiceProfiles,
  listCustomerOrderInvoices,
  requestCustomerOrderInvoice,
  updateCustomerInvoiceProfile,
} from '@/lib/api';
import type {
  InvoiceProfile,
  InvoiceProfileInput,
  Order,
  OrderInvoiceRequest,
} from '@/types';

interface InvoicePanelProps {
  orders: Order[];
}

interface InvoiceFormState {
  titleType: 'personal' | 'company';
  title: string;
  taxNumber: string;
  email: string;
  recipientPhone: string;
  registeredAddress: string;
  bankName: string;
  bankAccount: string;
  isDefault: boolean;
}

const emptyForm = (): InvoiceFormState => ({
  titleType: 'personal',
  title: '',
  taxNumber: '',
  email: '',
  recipientPhone: '',
  registeredAddress: '',
  bankName: '',
  bankAccount: '',
  isDefault: false,
});

const inputClass =
  'w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors';

const invoiceStatusLabels: Record<string, string> = {
  requested: '已申请',
  processing: '开具中',
  issued: '已开具',
  rejected: '已拒绝',
  cancelled: '已取消',
};

function invoiceErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  const messages: Record<string, string> = {
    INVOICE_PROFILE_VERSION_CONFLICT: '发票资料已被更新，请刷新后重新编辑。',
    ORDER_NOT_INVOICE_ELIGIBLE: '该订单当前不能申请发票。',
    CONFLICT: '该订单已提交过开票申请，请刷新状态。',
  };
  return messages[code] || '操作失败，请检查资料后重试。';
}

function maskBankAccount(account: string | null) {
  if (!account) return '';
  return `****${account.slice(-4)}`;
}

export default function InvoicePanel({ orders }: InvoicePanelProps) {
  const [profiles, setProfiles] = useState<InvoiceProfile[]>([]);
  const [invoices, setInvoices] = useState<OrderInvoiceRequest[]>([]);
  const [form, setForm] = useState<InvoiceFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingInvoice, setRequestingInvoice] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCustomerInvoiceProfiles(), listCustomerOrderInvoices()])
      .then(([profileData, invoiceData]) => {
        if (cancelled) return;
        setProfiles(profileData);
        setInvoices(invoiceData);
      })
      .catch(() => {
        if (!cancelled) setError('发票资料或开票状态加载失败，请稍后重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = <K extends keyof InvoiceFormState>(field: K, value: InvoiceFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const clearFeedback = () => {
    setMessage('');
    setError('');
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const buildInput = (): InvoiceProfileInput | null => {
    const title = form.title.trim();
    const email = form.email.trim().toLowerCase();
    const taxNumber = form.taxNumber.trim().toUpperCase();
    if (!title || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请填写发票抬头和有效的接收邮箱。');
      return null;
    }
    if (form.titleType === 'company' && !/^[A-Z0-9]{15,20}$/.test(taxNumber)) {
      setError('企业发票请填写 15 至 20 位有效税号。');
      return null;
    }
    const bankName = form.bankName.trim();
    const bankAccount = form.bankAccount.trim();
    if (Boolean(bankName) !== Boolean(bankAccount)) {
      setError('开户行和银行账号必须同时填写。');
      return null;
    }
    return {
      titleType: form.titleType,
      title,
      taxNumber: form.titleType === 'company' ? taxNumber : null,
      email,
      recipientPhone: form.recipientPhone.trim() || null,
      registeredAddress: form.registeredAddress.trim() || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      isDefault: form.isDefault,
    };
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    const input = buildInput();
    if (!input) return;
    setSaving(true);
    try {
      if (editingId !== null) {
        const current = profiles.find((profile) => profile.id === editingId);
        if (!current) {
          setError('发票资料已不存在，请刷新。');
          return;
        }
        const updated = await updateCustomerInvoiceProfile(current.id, current.version, input);
        setProfiles((items) => items.map((item) => item.id === updated.id ? updated : item));
        setMessage('发票资料已更新。');
      } else {
        const created = await createCustomerInvoiceProfile(input);
        setProfiles((items) => [created, ...items.map((item) => ({
          ...item,
          isDefault: created.isDefault ? false : item.isDefault,
        }))]);
        setMessage('发票资料已保存。');
      }
      resetForm();
    } catch (saveError) {
      setError(invoiceErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const editProfile = (profile: InvoiceProfile) => {
    clearFeedback();
    setEditingId(profile.id);
    setForm({
      titleType: profile.titleType,
      title: profile.title,
      taxNumber: profile.taxNumber || '',
      email: profile.email,
      recipientPhone: profile.recipientPhone || '',
      registeredAddress: profile.registeredAddress || '',
      bankName: profile.bankName || '',
      bankAccount: profile.bankAccount || '',
      isDefault: profile.isDefault,
    });
  };

  const deleteProfile = async (profile: InvoiceProfile) => {
    if (!window.confirm(`确定删除发票资料“${profile.title}”吗？`)) return;
    clearFeedback();
    setDeletingId(profile.id);
    try {
      await deleteCustomerInvoiceProfile(profile.id, profile.version);
      setProfiles((items) => items.filter((item) => item.id !== profile.id));
      if (editingId === profile.id) resetForm();
      if (selectedProfileId === String(profile.id)) setSelectedProfileId('');
      setMessage('发票资料已删除。');
    } catch (deleteError) {
      setError(invoiceErrorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  const submitInvoiceRequest = async () => {
    clearFeedback();
    const orderId = Number(selectedOrderId);
    const profileId = Number(selectedProfileId);
    if (!Number.isSafeInteger(orderId) || !Number.isSafeInteger(profileId)) {
      setError('请选择开票订单和发票资料。');
      return;
    }
    setRequestingInvoice(true);
    try {
      const created = await requestCustomerOrderInvoice(orderId, profileId);
      setInvoices((items) => [created, ...items.filter((item) => item.orderId !== orderId)]);
      setSelectedOrderId('');
      setMessage('开票申请已提交，请在下方查看状态。');
    } catch (requestError) {
      setError(invoiceErrorMessage(requestError));
    } finally {
      setRequestingInvoice(false);
    }
  };

  const refreshInvoiceStatuses = async () => {
    clearFeedback();
    try {
      setInvoices(await listCustomerOrderInvoices());
      setMessage('开票状态已刷新。');
    } catch {
      setError('开票状态刷新失败，请稍后重试。');
    }
  };

  const requestedOrderIds = new Set(invoices.map((invoice) => invoice.orderId));
  const eligibleOrders = orders.filter((order) =>
    ['paid', 'shipped', 'completed'].includes(order.status)
    && !requestedOrderIds.has(order.id)
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={saveProfile}
        className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">
            {editingId === null ? '新增发票资料' : '编辑发票资料'}
          </h2>
          {editingId !== null && (
            <button type="button" onClick={resetForm} className="text-xs text-neutral-400 hover:text-white">
              取消编辑
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invoice-title-type" className="block text-xs text-neutral-400 mb-1.5">发票类型</label>
            <select
              id="invoice-title-type"
              value={form.titleType}
              onChange={(event) => setField('titleType', event.target.value as 'personal' | 'company')}
              className={inputClass}
            >
              <option value="personal">个人</option>
              <option value="company">企业</option>
            </select>
          </div>
          <div>
            <label htmlFor="invoice-title" className="block text-xs text-neutral-400 mb-1.5">发票抬头</label>
            <input id="invoice-title" value={form.title} onChange={(event) => setField('title', event.target.value)} maxLength={160} className={inputClass} />
          </div>
          {form.titleType === 'company' && (
            <div>
              <label htmlFor="invoice-tax-number" className="block text-xs text-neutral-400 mb-1.5">企业税号</label>
              <input id="invoice-tax-number" value={form.taxNumber} onChange={(event) => setField('taxNumber', event.target.value)} maxLength={20} className={inputClass} />
            </div>
          )}
          <div>
            <label htmlFor="invoice-email" className="block text-xs text-neutral-400 mb-1.5">接收邮箱</label>
            <input id="invoice-email" type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} maxLength={254} className={inputClass} />
          </div>
          <div>
            <label htmlFor="invoice-phone" className="block text-xs text-neutral-400 mb-1.5">联系电话（可选）</label>
            <input id="invoice-phone" value={form.recipientPhone} onChange={(event) => setField('recipientPhone', event.target.value)} maxLength={20} className={inputClass} />
          </div>
          <div>
            <label htmlFor="invoice-address" className="block text-xs text-neutral-400 mb-1.5">注册地址（可选）</label>
            <input id="invoice-address" value={form.registeredAddress} onChange={(event) => setField('registeredAddress', event.target.value)} maxLength={300} className={inputClass} />
          </div>
          <div>
            <label htmlFor="invoice-bank" className="block text-xs text-neutral-400 mb-1.5">开户行（可选）</label>
            <input id="invoice-bank" value={form.bankName} onChange={(event) => setField('bankName', event.target.value)} maxLength={160} className={inputClass} />
          </div>
          <div>
            <label htmlFor="invoice-account" className="block text-xs text-neutral-400 mb-1.5">银行账号（可选）</label>
            <input id="invoice-account" value={form.bankAccount} onChange={(event) => setField('bankAccount', event.target.value.replace(/\D/g, ''))} maxLength={32} inputMode="numeric" className={inputClass} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={form.isDefault} onChange={(event) => setField('isDefault', event.target.checked)} />
          设为默认发票资料
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md"
        >
          {saving ? '保存中...' : editingId === null ? '保存发票资料' : '更新发票资料'}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">我的发票资料</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">加载中...</p>
        ) : profiles.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-500">暂无发票资料</p>
        ) : profiles.map((profile) => (
          <article key={profile.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <strong className="text-sm text-white">{profile.title}</strong>
                <p className="mt-1 text-xs text-neutral-400">{profile.email}</p>
                {profile.taxNumber && <p className="mt-1 text-xs text-neutral-500">税号：{profile.taxNumber}</p>}
                {profile.bankAccount && <p className="mt-1 text-xs text-neutral-500">银行账号：{maskBankAccount(profile.bankAccount)}</p>}
              </div>
              {profile.isDefault && <span className="text-xs text-amber-400">默认</span>}
            </div>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={() => editProfile(profile)} className="text-xs text-amber-400 hover:text-amber-300">编辑发票资料</button>
              <button type="button" onClick={() => deleteProfile(profile)} disabled={deletingId === profile.id} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">删除发票资料</button>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 space-y-4">
        <h2 className="text-base font-semibold text-white">申请订单发票</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invoice-order" className="block text-xs text-neutral-400 mb-1.5">开票订单</label>
            <select id="invoice-order" value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} className={inputClass}>
              <option value="">请选择未申请发票的已支付订单</option>
              {eligibleOrders.map((order) => <option key={order.id} value={order.id}>#{order.id} · ¥{order.total_price.toFixed(2)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="invoice-profile" className="block text-xs text-neutral-400 mb-1.5">使用发票资料</label>
            <select id="invoice-profile" value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} className={inputClass}>
              <option value="">请选择发票资料</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.title}</option>)}
            </select>
          </div>
        </div>
        <button type="button" onClick={submitInvoiceRequest} disabled={requestingInvoice} className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md">
          {requestingInvoice ? '申请中...' : '申请订单发票'}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">开票状态</h2>
          <button type="button" onClick={refreshInvoiceStatuses} className="text-xs text-amber-400 hover:text-amber-300">刷新发票状态</button>
        </div>
        {invoices.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-500">暂无开票申请</p>
        ) : invoices.map((invoice) => (
          <article key={invoice.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="text-sm text-white">订单 #{invoice.orderId}</strong>
                <p className="mt-1 text-xs text-neutral-400">{invoice.profileSnapshot.title}</p>
                {invoice.invoiceNumber && <p className="mt-2 text-xs text-neutral-200">{invoice.invoiceNumber}</p>}
                {invoice.issuedAt && <p className="mt-1 text-xs text-neutral-500">开具时间：{invoice.issuedAt}</p>}
                {invoice.resolutionNote && <p className="mt-1 text-xs text-neutral-400">处理说明：{invoice.resolutionNote}</p>}
              </div>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-400">
                {invoiceStatusLabels[invoice.status] || invoice.status}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
