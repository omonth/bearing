import type { InvoiceStatus } from './types';

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  requested: '待处理',
  processing: '开票处理中',
  issued: '已开票（已记录号码）',
  rejected: '已拒绝',
  cancelled: '已取消',
};

export const invoiceStatusColors: Record<InvoiceStatus, string> = {
  requested: 'default',
  processing: 'processing',
  issued: 'success',
  rejected: 'error',
  cancelled: 'default',
};

export const invoiceTitleTypeLabels = {
  personal: '个人',
  company: '企业',
} as const;

export function availableInvoiceTransitions(status: InvoiceStatus): InvoiceStatus[] {
  switch (status) {
    case 'requested':
      return ['processing', 'rejected', 'cancelled'];
    case 'processing':
      return ['issued', 'rejected', 'cancelled'];
    case 'issued':
    case 'rejected':
    case 'cancelled':
      return [];
  }
}

export function validateInvoiceAction(
  status: InvoiceStatus,
  note: string,
  invoiceNumber: string,
): string | null {
  if (note.trim().length < 2) return '请填写至少 2 个字符的处理说明';
  if (status !== 'issued') return null;
  const normalizedInvoiceNumber = invoiceNumber.trim();
  if (!normalizedInvoiceNumber) return '请填写外部发票系统返回的真实发票号码';
  if (!/^[A-Za-z0-9._:-]{4,100}$/.test(normalizedInvoiceNumber)) {
    return '发票号码须为 4-100 位字母、数字、点、下划线、冒号或短横线';
  }
  return null;
}

export function invoiceStatusSuccessMessage(status: InvoiceStatus): string {
  switch (status) {
    case 'requested':
      return '发票申请保持待处理状态';
    case 'processing':
      return '发票申请已进入处理中；尚未开票';
    case 'issued':
      return '已记录外部系统真实开票结果和发票号码';
    case 'rejected':
      return '发票申请已拒绝';
    case 'cancelled':
      return '发票申请已取消';
  }
}
