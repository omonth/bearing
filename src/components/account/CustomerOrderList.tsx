import { useState } from 'react';
import { cancelCustomerOrder, getCustomerOrderLogistics } from '@/lib/api';
import type { CustomerOrderLogistics, Order } from '@/types';

interface CustomerOrderListProps {
  orders: Order[];
  onRefresh: () => Promise<void> | void;
}

const statusLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  paid: 'bg-blue-500/20 text-blue-400',
  shipped: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-neutral-500/20 text-neutral-400',
  refunded: 'bg-amber-500/20 text-amber-300',
};

const cancellationMessages: Record<string, string> = {
  PAYMENT_CLOSE_REQUIRED: '外部支付单仍需关单，请联系客服处理，订单尚未取消。',
  PAYMENT_IN_PROGRESS: '支付正在处理中，请稍后刷新后再尝试。',
  PAYMENT_ALREADY_SETTLED: '订单已支付，请通过售后退款流程处理。',
  ORDER_NOT_CANCELLABLE: '当前订单状态不可取消，请刷新订单后重试。',
};

const shippingStatusLabels: Record<string, string> = {
  not_shipped: '未发货',
  awaiting_shipment: '等待发货',
  label_created: '运单已创建',
  in_transit: '运输中',
  out_for_delivery: '派送中',
  delivered: '已送达',
  exception: '物流异常',
  returned: '已退回',
  cancelled: '已取消',
  unknown: '状态未知',
};

function cancellationErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  return cancellationMessages[code] || '取消失败，请稍后重试或联系客服。';
}

export default function CustomerOrderList({ orders, onRefresh }: CustomerOrderListProps) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [loadingLogisticsId, setLoadingLogisticsId] = useState<number | null>(null);
  const [expandedLogisticsId, setExpandedLogisticsId] = useState<number | null>(null);
  const [logistics, setLogistics] = useState<Record<number, CustomerOrderLogistics>>({});
  const [logisticsErrors, setLogisticsErrors] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const cancelOrder = async (order: Order) => {
    if (!window.confirm(`确定取消订单 #${order.id} 吗？取消后库存将恢复。`)) return;
    setMessage('');
    setError('');
    setCancellingId(order.id);
    try {
      const result = await cancelCustomerOrder(order.id);
      setMessage(result.idempotent ? '订单已是取消状态。' : '订单已取消。');
      await Promise.resolve(onRefresh()).catch(() => undefined);
    } catch (cancellationError) {
      setError(cancellationErrorMessage(cancellationError));
    } finally {
      setCancellingId(null);
    }
  };

  const loadLogistics = async (orderId: number) => {
    if (expandedLogisticsId === orderId) {
      setExpandedLogisticsId(null);
      return;
    }
    setExpandedLogisticsId(orderId);
    setLoadingLogisticsId(orderId);
    setLogisticsErrors((current) => ({ ...current, [orderId]: '' }));
    try {
      const detail = await getCustomerOrderLogistics(orderId);
      setLogistics((current) => ({ ...current, [orderId]: detail }));
    } catch {
      setLogisticsErrors((current) => ({
        ...current,
        [orderId]: '物流详情加载失败，请稍后重试。',
      }));
    } finally {
      setLoadingLogisticsId(null);
    }
  };

  return (
    <div className="space-y-3">
      {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {orders.map((order) => (
        <div
          key={order.id}
          data-testid="account-order"
          className="bg-neutral-900 border border-neutral-800 rounded-lg p-5"
        >
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div>
              <span className="text-xs text-neutral-500">订单号 </span>
              <strong className="text-sm text-white">#{order.id}</strong>
            </div>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                statusColors[order.status] || statusColors.cancelled
              }`}
            >
              {statusLabels[order.status] || order.status}
            </span>
          </div>
          <p className="text-sm text-neutral-400 mb-3">
            {order.province} {order.city} {order.address_detail}
          </p>
          {order.tracking_number && (
            <p className="text-xs text-neutral-400 mb-3">
              物流单号：<span className="text-neutral-200">{order.tracking_number}</span>
            </p>
          )}
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-xs text-neutral-600">{order.created_at}</span>
            <div className="flex items-center gap-3">
              {['paid', 'shipped', 'completed'].includes(order.status) && (
                <button
                  type="button"
                  onClick={() => loadLogistics(order.id)}
                  disabled={loadingLogisticsId === order.id}
                  className="px-3 py-1.5 text-xs text-amber-400 border border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-50 rounded-md transition-colors"
                >
                  {loadingLogisticsId === order.id
                    ? '物流加载中...'
                    : expandedLogisticsId === order.id
                      ? '收起物流详情'
                      : '查看物流详情'}
                </button>
              )}
              {order.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => cancelOrder(order)}
                  disabled={cancellingId !== null}
                  className="px-3 py-1.5 text-xs text-red-400 border border-red-400/60 hover:bg-red-400/10 disabled:opacity-50 rounded-md transition-colors"
                >
                  {cancellingId === order.id ? '取消处理中...' : '取消未支付订单'}
                </button>
              )}
              <span className="text-lg font-bold text-amber-400">
                ¥{order.total_price?.toFixed(2)}
              </span>
            </div>
          </div>
          {expandedLogisticsId === order.id && (
            <section className="mt-4 border-t border-neutral-800 pt-4">
              {logisticsErrors[order.id] ? (
                <p role="alert" className="text-xs text-red-400">{logisticsErrors[order.id]}</p>
              ) : logistics[order.id] ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                    <span className="text-amber-400">
                      {shippingStatusLabels[logistics[order.id].shippingStatus]
                        || logistics[order.id].shippingStatus}
                    </span>
                    <span className="text-neutral-400">
                      {logistics[order.id].carrier ? `${logistics[order.id].carrier} · ` : ''}
                      物流单号：{logistics[order.id].trackingNumber || '暂未生成'}
                    </span>
                  </div>
                  {logistics[order.id].lastLocation && (
                    <p className="text-xs text-neutral-400">最近位置：{logistics[order.id].lastLocation}</p>
                  )}
                  <p className="text-xs text-neutral-600">承运商实时轨迹需接入对应物流服务商。</p>
                  {(logistics[order.id].events?.length || 0) > 0 ? (
                    <ol className="space-y-2 border-l border-neutral-700 pl-4">
                      {logistics[order.id].events?.map((event) => (
                        <li key={event.id} className="text-xs text-neutral-400">
                          <span className="text-neutral-200">
                            {shippingStatusLabels[event.status] || event.status}
                          </span>
                          {event.location ? ` · ${event.location}` : ''}
                          {event.note ? ` · ${event.note}` : ''}
                          <span className="ml-2 text-neutral-600">{event.occurredAt}</span>
                        </li>
                      ))}
                    </ol>
                  ) : logistics[order.id].history.length > 0 ? (
                    <ol className="space-y-2 border-l border-neutral-700 pl-4">
                      {logistics[order.id].history.map((event, index) => (
                        <li key={`${event.createdAt}-${index}`} className="text-xs text-neutral-400">
                          <span className="text-neutral-200">
                            {statusLabels[event.newStatus] || event.newStatus}
                          </span>
                          {event.note ? ` · ${event.note}` : ''}
                          <span className="ml-2 text-neutral-600">{event.createdAt}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-neutral-500">暂无物流状态记录。</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">物流加载中...</p>
              )}
            </section>
          )}
        </div>
      ))}
    </div>
  );
}
