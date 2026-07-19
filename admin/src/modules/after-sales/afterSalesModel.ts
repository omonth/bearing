import type { AfterSalesCase, AfterSalesStatus } from './types';

export const afterSalesStatusLabels: Record<AfterSalesStatus, string> = {
  submitted: '待审核',
  under_review: '审核中',
  approved: '审核通过（待后续处理）',
  rejected: '审核拒绝',
  awaiting_return: '等待寄回',
  received: '已收到退货',
  refund_processing: '退款处理中',
  completed: '售后完成',
  cancelled: '已取消',
};

export const afterSalesStatusColors: Record<AfterSalesStatus, string> = {
  submitted: 'default',
  under_review: 'processing',
  approved: 'cyan',
  rejected: 'error',
  awaiting_return: 'gold',
  received: 'blue',
  refund_processing: 'purple',
  completed: 'success',
  cancelled: 'default',
};

export const afterSalesTypeLabels = {
  return_refund: '退货退款',
  refund_only: '仅退款',
  order_exception: '异常订单人工处理',
} as const;

export const refundStatusLabels = {
  requested: '已申请',
  processing: '渠道处理中',
  success: '支付渠道已确认成功',
  failed: '处理失败',
  manual_required: '需要人工处理',
} as const;

export function availableStatusTransitions(item: AfterSalesCase): AfterSalesStatus[] {
  switch (item.status) {
    case 'submitted':
      return ['under_review', 'cancelled'];
    case 'under_review':
      return ['approved', 'rejected', 'cancelled'];
    case 'approved':
      if (item.type === 'return_refund') return ['awaiting_return', 'cancelled'];
      if (item.type === 'order_exception') return ['completed', 'cancelled'];
      return ['cancelled'];
    case 'awaiting_return':
      return ['received', 'cancelled'];
    case 'received':
      return ['cancelled'];
    case 'refund_processing':
    case 'rejected':
    case 'completed':
    case 'cancelled':
      return [];
  }
}

export function canInitiateRefund(item: AfterSalesCase): boolean {
  return item.type !== 'order_exception'
    && ['approved', 'received'].includes(item.status)
    && item.refundId === null;
}

export function canSyncRefund(item: AfterSalesCase): boolean {
  return item.type !== 'order_exception'
    && item.refundId !== null
    && item.refundStatus !== 'success';
}

export function maskSensitiveText(value: string | null | undefined): string {
  if (!value) return '-';
  return value.replace(/(^|\D)(1\d{2})\d{4}(\d{4})(?!\d)/g, '$1$2****$3');
}

export function statusSuccessMessage(item: AfterSalesCase): string {
  if (item.status === 'approved') {
    return '审核已通过；退款尚未确认，仍须经统一支付流程和渠道确认';
  }
  if (item.status === 'rejected') return '售后申请已拒绝';
  if (item.status === 'completed') return '售后处理已完成';
  return `售后状态已更新为“${afterSalesStatusLabels[item.status]}”`;
}
