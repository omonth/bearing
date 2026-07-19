import { useEffect, useRef, useState } from 'react';
import {
  cancelCustomerAfterSalesCase,
  createCustomerAfterSalesCase,
  getCustomerAfterSalesCase,
  listCustomerAfterSalesCases,
} from '@/lib/api';
import type { CustomerAfterSalesCaseInput } from '@/lib/api';
import type { AfterSalesCase, AfterSalesCaseType, Order } from '@/types';

interface AfterSalesPanelProps {
  orders: Order[];
}

type CaseDraft = Omit<CustomerAfterSalesCaseInput, 'clientRequestId'>;

const inputClass =
  'w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-amber-500 transition-colors';

const typeLabels: Record<AfterSalesCaseType, string> = {
  return_refund: '退货退款',
  refund_only: '仅退款',
  order_exception: '异常订单人工工单',
};

const statusLabels: Record<string, string> = {
  submitted: '已提交',
  under_review: '审核中',
  approved: '已通过',
  rejected: '已拒绝',
  awaiting_return: '等待退货',
  received: '退货已收货',
  refund_processing: '退款处理中',
  completed: '已完成',
  cancelled: '已取消',
};

function newRequestId() {
  const suffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `case-${suffix}`;
}

function errorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  const messages: Record<string, string> = {
    AFTER_SALES_VERSION_CONFLICT: '申请进度已更新，正在刷新，请再次确认后操作。',
    AFTER_SALES_NOT_CANCELLABLE: '该申请已进入审核流程，不能再由顾客取消。',
    ORDER_NOT_AFTER_SALES_ELIGIBLE: '当前订单状态不支持该售后类型。',
  };
  return messages[code] || '操作未确认成功，请稍后使用相同内容重试或联系人工客服。';
}

export default function AfterSalesPanel({ orders }: AfterSalesPanelProps) {
  const [cases, setCases] = useState<AfterSalesCase[]>([]);
  const [details, setDetails] = useState<Record<number, AfterSalesCase>>({});
  const [type, setType] = useState<AfterSalesCaseType>('refund_only');
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pendingRequest = useRef<{ fingerprint: string; clientRequestId: string } | null>(null);

  const eligibleOrders = orders.filter((order) =>
    ['paid', 'shipped', 'completed'].includes(order.status)
  );

  useEffect(() => {
    let cancelled = false;
    listCustomerAfterSalesCases()
      .then((data) => {
        if (!cancelled) setCases(data);
      })
      .catch(() => {
        if (!cancelled) setError('售后记录加载失败，请稍后重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectType = (nextType: AfterSalesCaseType) => {
    setType(nextType);
    if (nextType === 'order_exception') {
      setOrderId('');
      setRequestedAmount('');
    }
    setMessage('');
    setError('');
  };

  const submitCase = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    const normalizedReason = reason.trim();
    const normalizedDescription = description.trim();
    if (normalizedReason.length < 2 || normalizedDescription.length < 10) {
      setError('请填写至少 2 个字符的原因和至少 10 个字符的详细说明。');
      return;
    }
    if (type !== 'order_exception' && !orderId) {
      setError('退货或退款申请必须选择关联订单。');
      return;
    }
    const amount = requestedAmount ? Number(requestedAmount) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      setError('申请金额必须大于 0。');
      return;
    }
    const draft: CaseDraft = {
      type,
      reason: normalizedReason,
      description: normalizedDescription,
      ...(orderId ? { orderId: Number(orderId) } : {}),
      ...(type !== 'order_exception' && amount !== undefined ? { requestedAmount: amount } : {}),
    };
    const fingerprint = JSON.stringify(draft);
    if (!pendingRequest.current || pendingRequest.current.fingerprint !== fingerprint) {
      pendingRequest.current = { fingerprint, clientRequestId: newRequestId() };
    }
    const input: CustomerAfterSalesCaseInput = {
      clientRequestId: pendingRequest.current.clientRequestId,
      ...draft,
    };
    setSubmitting(true);
    try {
      const created = await createCustomerAfterSalesCase(input);
      setCases((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setMessage(created.idempotent
        ? '该申请已提交，无需重复操作。'
        : type === 'order_exception'
          ? '人工工单已提交，请在下方查看处理进度。'
          : '售后申请已提交，请在下方查看审核进度。');
      setReason('');
      setDescription('');
      setRequestedAmount('');
      pendingRequest.current = null;
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const loadProgress = async (caseId: number) => {
    setMessage('');
    setError('');
    setActiveCaseId(caseId);
    try {
      const detail = await getCustomerAfterSalesCase(caseId);
      setDetails((current) => ({ ...current, [caseId]: detail }));
    } catch {
      setError('申请进度加载失败，请稍后重试。');
    } finally {
      setActiveCaseId(null);
    }
  };

  const cancelCase = async (item: AfterSalesCase) => {
    if (!window.confirm(`确定取消售后申请 ${item.caseNo} 吗？`)) return;
    setMessage('');
    setError('');
    setActiveCaseId(item.id);
    try {
      const cancelled = await cancelCustomerAfterSalesCase(item.id, item.version);
      setCases((current) => current.map((entry) => entry.id === item.id ? cancelled : entry));
      setDetails((current) => ({ ...current, [item.id]: cancelled }));
      setMessage('售后申请已取消。');
    } catch (cancelError) {
      setError(errorMessage(cancelError));
      if (typeof cancelError === 'object' && cancelError !== null && 'code' in cancelError
        && cancelError.code === 'AFTER_SALES_VERSION_CONFLICT') {
        void loadProgress(item.id);
      }
    } finally {
      setActiveCaseId(null);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={submitCase}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white">售后与人工处理</h2>
            <p className="mt-1 text-xs text-neutral-500">提交后可持续查看审核、退款或人工处理进度。</p>
          </div>
          <button
            type="button"
            onClick={() => selectType('order_exception')}
            className="px-3 py-1.5 text-xs text-amber-400 border border-amber-500/50 rounded-md hover:bg-amber-500/10"
          >
            异常订单人工处理
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="after-sales-type" className="block text-xs text-neutral-400 mb-1.5">申请类型</label>
            <select
              id="after-sales-type"
              value={type}
              onChange={(event) => selectType(event.target.value as AfterSalesCaseType)}
              className={inputClass}
            >
              <option value="refund_only">仅退款</option>
              <option value="return_refund">退货退款</option>
              <option value="order_exception">异常订单人工工单</option>
            </select>
          </div>
          {type !== 'order_exception' && (
            <div>
              <label htmlFor="after-sales-order" className="block text-xs text-neutral-400 mb-1.5">关联订单</label>
              <select
                id="after-sales-order"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                className={inputClass}
              >
                <option value="">请选择已支付订单</option>
                {eligibleOrders.map((order) => (
                  <option key={order.id} value={order.id}>#{order.id} · ¥{order.total_price.toFixed(2)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="after-sales-reason" className="block text-xs text-neutral-400 mb-1.5">申请原因</label>
          <input
            id="after-sales-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={120}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="after-sales-description" className="block text-xs text-neutral-400 mb-1.5">详细说明</label>
          <textarea
            id="after-sales-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={4}
            className={inputClass}
          />
        </div>
        {type !== 'order_exception' && (
          <div>
            <label htmlFor="after-sales-amount" className="block text-xs text-neutral-400 mb-1.5">申请金额（可选）</label>
            <input
              id="after-sales-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={requestedAmount}
              onChange={(event) => setRequestedAmount(event.target.value)}
              className={inputClass}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md"
        >
          {submitting
            ? '提交中...'
            : type === 'order_exception'
              ? '提交人工工单'
              : '提交售后申请'}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">申请与处理进度</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">加载中...</p>
        ) : cases.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-500">暂无售后或人工工单</p>
        ) : cases.map((item) => {
          const detail = details[item.id];
          return (
            <article key={item.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <strong className="text-sm text-white">{item.caseNo}</strong>
                  <p className="mt-1 text-xs text-neutral-500">
                    {typeLabels[item.type]}{item.orderId ? ` · 订单 #${item.orderId}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-400">
                  {statusLabels[item.status] || item.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-neutral-300">{item.reason}</p>
              {item.refundStatus && (
                <p className="mt-2 text-xs text-neutral-400">退款状态：{item.refundStatus}</p>
              )}
              {item.resolutionNote && (
                <p className="mt-2 text-xs text-neutral-400">处理说明：{item.resolutionNote}</p>
              )}
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => loadProgress(item.id)}
                  disabled={activeCaseId === item.id}
                  className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
                >
                  查看进度
                </button>
                {item.status === 'submitted' && (
                  <button
                    type="button"
                    onClick={() => cancelCase(item)}
                    disabled={activeCaseId === item.id}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    取消申请
                  </button>
                )}
              </div>
              {detail?.history && (
                <ol className="mt-4 space-y-2 border-l border-neutral-700 pl-4">
                  {detail.history.map((event) => (
                    <li key={event.id} className="text-xs text-neutral-400">
                      <span className="text-neutral-200">{statusLabels[event.toStatus] || event.toStatus}</span>
                      {event.note ? ` · ${event.note}` : ''}
                      <span className="ml-2 text-neutral-600">{event.createdAt}</span>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
