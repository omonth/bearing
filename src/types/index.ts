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
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  tracking_number?: string;
  shipped_at?: string;
  completed_at?: string;
  created_at: string;
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
