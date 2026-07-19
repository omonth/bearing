export interface BearingSpecs {
  innerDiameter: number | string;
  outerDiameter: number | string;
  width: number | string;
}

export interface LocalizedField {
  zh: string;
  en: string;
}

export interface Bearing {
  id: number;
  name: LocalizedField;
  model: string;
  price: number;
  image: string;
  category: string;
  specs: BearingSpecs;
  stock: number;
  description: LocalizedField;
}

export interface CartItem extends Bearing {
  quantity: number;
}

export interface Order {
  id: number;
  customer_name: string;
  customer_phone: string;
  province: string;
  city: string;
  district?: string;
  address_detail: string;
  total_price: number;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded';
  tracking_number?: string;
  shipped_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface CustomerAddress {
  id: number;
  customerId: number;
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  district: string;
  addressDetail: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddressInput {
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  district: string;
  addressDetail: string;
  postalCode?: string;
  isDefault?: boolean;
}

export interface AuthUser {
  id: number;
  phone: string;
  name: string;
  email?: string | null;
  company?: string | null;
  level: string;
  points: number;
}

export interface AdminUser {
  id: number;
  username: string;
  role: string;
}

export interface CustomerCoupon {
  id: number;
  code: string;
  coupon_name?: string;
  type: 'fixed' | 'percentage';
  discount_value: number;
  min_order_amount: number;
  status: 'unused' | 'used' | 'expired';
  valid_from?: string;
  valid_until?: string;
}

export interface OrderItem {
  id: number;
  bearing_id: number;
  quantity: number;
  price: number;
  name?: string;
  model?: string;
}

export interface PaymentOrder {
  id: number;
  order_id: number;
  payment_method: string;
  amount: number;
  status: string;
  transaction_id: string;
  trade_no: string;
}

export type AfterSalesCaseType = 'return_refund' | 'refund_only' | 'order_exception';

export type AfterSalesCaseStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'awaiting_return'
  | 'received'
  | 'refund_processing'
  | 'completed'
  | 'cancelled';

export interface AfterSalesHistory {
  id: number;
  caseId: number;
  fromStatus: AfterSalesCaseStatus | null;
  toStatus: AfterSalesCaseStatus;
  actorType: 'customer' | 'admin' | 'payment_system';
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
  type: AfterSalesCaseType;
  reason: string;
  description: string;
  requestedAmount: number | null;
  status: AfterSalesCaseStatus;
  version: number;
  paymentOrderId: number | null;
  refundId: number | null;
  refundStatus: 'requested' | 'processing' | 'success' | 'failed' | 'manual_required' | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  idempotent?: boolean;
  history?: AfterSalesHistory[];
}

export interface CustomerLogisticsHistory {
  oldStatus: Order['status'] | null;
  newStatus: Order['status'];
  note: string | null;
  createdAt: string;
}

export interface CustomerOrderLogistics {
  orderId: number;
  orderStatus: Order['status'];
  shippingStatus:
    | 'not_shipped'
    | 'awaiting_shipment'
    | 'label_created'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'exception'
    | 'returned'
    | 'cancelled'
    | 'unknown';
  trackingNumber: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  history: CustomerLogisticsHistory[];
  carrier?: string;
  shipmentVersion?: number;
  lastLocation?: string | null;
  latestNote?: string | null;
  occurredAt?: string | null;
  events?: Array<{
    id: number;
    status: string;
    carrier: string;
    trackingNumber: string;
    location: string | null;
    note: string | null;
    version: number;
    occurredAt: string;
  }>;
}

export interface InvoiceProfileInput {
  titleType: 'personal' | 'company';
  title: string;
  taxNumber?: string | null;
  email: string;
  recipientPhone?: string | null;
  registeredAddress?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  isDefault?: boolean;
}

export interface InvoiceProfile extends InvoiceProfileInput {
  id: number;
  customerId: number;
  taxNumber: string | null;
  recipientPhone: string | null;
  registeredAddress: string | null;
  bankName: string | null;
  bankAccount: string | null;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderInvoiceRequest {
  id: number;
  customerId: number;
  orderId: number;
  profileId: number | null;
  profileSnapshot: Omit<InvoiceProfileInput, 'isDefault'>;
  status: 'requested' | 'processing' | 'issued' | 'rejected' | 'cancelled';
  invoiceNumber: string | null;
  resolutionNote?: string | null;
  version?: number;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  level: string;
  points: number;
  total_spent: number;
  total_orders: number;
  tags: string[];
  status: string;
}

export interface Coupon {
  id: number;
  code: string;
  name: string;
  type: string;
  discount_value: number;
  min_order_amount: number;
  total_quantity: number;
  used_quantity: number;
  valid_from: string;
  valid_until: string;
  status: string;
}

export interface ChatResponse {
  message: string;
  suggestions: string[];
  intent: string;
  timestamp: string;
}

export interface DemandPrediction {
  productId: number;
  productName: string;
  model: string;
  currentStock: number;
  avgDailySales: number;
  predictedDemand: number;
  trend: 'up' | 'down' | 'stable';
  daysUntilEmpty: number;
  needsRestock: boolean;
  recommendedRestock: number;
}
