import { create } from 'zustand';
import {
  applyCustomerCoupon,
  createOrder,
  createPayment,
  queryPaymentStatus,
  type PaymentResponse,
} from '@/lib/api';
import { REGION_DATA, ALL_PROVINCES } from '@/data/regions';
import type { CartItem } from '@/types';

export type CheckoutStep = 'cart' | 'form' | 'payment';
export type PaymentMethod = 'alipay' | 'wechat' | 'unionpay' | 'cod';
export type PaymentStatus = 'pending' | 'processing' | 'paid';

export type CheckoutPaymentInfo = Omit<PaymentResponse, 'paymentMethod'> & {
  orderAccessToken: string;
  paymentMethod: PaymentMethod;
};

interface CheckoutStore {
  customerName: string;
  customerPhone: string;
  province: string;
  city: string;
  district: string;
  addressDetail: string;
  paymentMethod: PaymentMethod;
  checkoutStep: CheckoutStep;
  paymentInfo: CheckoutPaymentInfo | null;
  submitting: boolean;
  paymentStatus: PaymentStatus;
  selectedCoupon: string;
  couponDiscount: number;

  setField: (field: string, value: string) => void;
  setProvince: (value: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setCheckoutStep: (step: CheckoutStep) => void;
  setSelectedCoupon: (code: string) => void;
  submitOrder: (items: CartItem[]) => Promise<void>;
  resetCheckout: () => void;
  clearPolling: () => void;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;
const EMPTY_CITIES: string[] = [];
const OTHER_CITIES = ['其他'];

function clearPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

export const useCheckoutStore = create<CheckoutStore>()((set, get) => ({
  customerName: '',
  customerPhone: '',
  province: '',
  city: '',
  district: '',
  addressDetail: '',
  paymentMethod: 'alipay',
  checkoutStep: 'cart',
  paymentInfo: null,
  submitting: false,
  paymentStatus: 'pending',
  selectedCoupon: '',
  couponDiscount: 0,

  setField: (field, value) => set({ [field]: value }),

  setProvince: (value) => set({ province: value, city: '', district: '' }),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setCheckoutStep: (step) => set({ checkoutStep: step }),

  setSelectedCoupon: (code) => set({ selectedCoupon: code, couponDiscount: 0 }),

  submitOrder: async (items) => {
    const state = get();
    if (!state.customerName || !state.customerPhone || !state.province || !state.city || !state.district || !state.addressDetail) {
      throw new Error('请填写完整的收货信息');
    }

    set({ submitting: true });
    try {
      const orderResult = await createOrder({
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        province: state.province,
        city: state.city,
        district: state.district,
        addressDetail: state.addressDetail,
        items: items.map(item => ({
          id: item.id,
          quantity: item.quantity,
        })),
      });

      if (!orderResult.orderAccessToken) {
        throw new Error('订单支付授权信息缺失，请重新提交订单');
      }

      // Apply coupon if selected — must run before payment
      let discountAmount = 0;
      if (state.selectedCoupon) {
        try {
          const couponResult = await applyCustomerCoupon(state.selectedCoupon, orderResult.orderId);
          if (couponResult.discountAmount) {
            discountAmount = couponResult.discountAmount;
            set({ couponDiscount: discountAmount });
          }
        } catch {}
      }

      const payment = await createPayment({
        orderId: orderResult.orderId,
        paymentMethod: state.paymentMethod,
        subject: `订单 #${orderResult.orderId}`,
      }, orderResult.orderAccessToken);

      const paymentInfo: CheckoutPaymentInfo = {
        ...payment,
        orderAccessToken: orderResult.orderAccessToken,
        paymentMethod: state.paymentMethod,
      };
      const isCashOnDelivery = paymentInfo.paymentMethod === 'cod';

      set({
        paymentInfo,
        checkoutStep: 'payment',
        submitting: false,
        paymentStatus: isCashOnDelivery ? 'processing' : 'pending',
      });

      clearPolling();
      if (isCashOnDelivery) {
        return;
      }

      // Start polling for online payments only.
      pollingTimer = setInterval(async () => {
        try {
          const result = await queryPaymentStatus(
            paymentInfo.paymentOrderId,
            paymentInfo.orderAccessToken
          );
          if (result.status === 'paid') {
            set({ paymentStatus: 'paid' });
            clearPolling();
          }
        } catch {}
      }, 2000);
    } catch (error) {
      set({ submitting: false });
      throw error;
    }
  },

  resetCheckout: () => {
    clearPolling();
    set({
      checkoutStep: 'cart',
      paymentInfo: null,
      paymentStatus: 'pending',
      submitting: false,
      selectedCoupon: '',
      couponDiscount: 0,
    });
  },

  clearPolling: () => {
    clearPolling();
  },
}));

/** Reactive selector — only re-renders when province changes. */
export const useCities = () =>
  useCheckoutStore((s) =>
    s.province ? (REGION_DATA[s.province] || OTHER_CITIES) : EMPTY_CITIES
  );

/** Stable list of all provinces — never changes, so no re-render cost. */
export const useAllProvinces = () => ALL_PROVINCES;

/** Reactive selector — only re-renders when couponDiscount changes. */
export const useFinalPrice = (totalPrice: number) =>
  useCheckoutStore((s) => Math.max(0, totalPrice - s.couponDiscount));
