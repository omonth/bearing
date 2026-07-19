export type AfterSalesType = 'return_refund' | 'refund_only' | 'order_exception';

export type AfterSalesStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'awaiting_return'
  | 'received'
  | 'refund_processing'
  | 'completed'
  | 'cancelled';

export type RefundStatus =
  | 'requested'
  | 'processing'
  | 'success'
  | 'failed'
  | 'manual_required'
  | null;

export interface AfterSalesHistory {
  id: number;
  caseId: number;
  fromStatus: AfterSalesStatus | null;
  toStatus: AfterSalesStatus;
  actorType: 'customer' | 'admin' | 'system';
  actorId: number | null;
  note: string | null;
  version: number;
  createdAt: string;
}

export interface AfterSalesCase {
  id: number;
  caseNo: string;
  clientRequestId: string;
  customerId: number;
  orderId: number | null;
  type: AfterSalesType;
  reason: string | null;
  description: string | null;
  requestedAmount: number | null;
  status: AfterSalesStatus;
  version: number;
  paymentOrderId: number | null;
  refundId: number | null;
  refundStatus: RefundStatus;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AfterSalesDetail extends AfterSalesCase {
  history: AfterSalesHistory[];
}

export interface AfterSalesPage {
  items: AfterSalesCase[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AfterSalesFilters {
  status?: AfterSalesStatus;
  type?: AfterSalesType;
  page: number;
  pageSize: number;
}
