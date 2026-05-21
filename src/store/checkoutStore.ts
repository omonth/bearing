import { create } from 'zustand';
import { createOrder, createPayment, queryPaymentStatus, useCustomerCoupon } from '@/lib/api';
import { REGION_DATA, ALL_PROVINCES } from '@/data/regions';
import type { CartItem } from '@/types';

export type CheckoutStep = 'cart' | 'form' | 'payment';
export type PaymentMethod = 'alipay' | 'wechat' | 'unionpay' | 'cod';
export type PaymentStatus = 'pending' | 'paid';

interface CheckoutStore {
  customerName: string;
  customerPhone: string;
  province: string;
  city: string;
  district: string;
  addressDetail: string;
  paymentMethod: PaymentMethod;
  checkoutStep: CheckoutStep;
  paymentInfo: any;
  submitting: boolean;
  paymentStatus: PaymentStatus;
  selectedCoupon: string;
  couponDiscount: number;

  setField: (field: string, value: string) => void;
  setProvince: (value: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setCheckoutStep: (step: CheckoutStep) => void;
  setSelectedCoupon: (code: string) => void;
  submitOrder: (items: CartItem[], totalPrice: number) => Promise<void>;
  resetCheckout: () => void;
  getCities: () => string[];
  getAllProvinces: () => string[];
  getFinalPrice: (totalPrice: number) => number;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

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

  getCities: () => {
    const { province } = get();
    return province ? (REGION_DATA[province] || ['其他']) : [];
  },

  getAllProvinces: () => ALL_PROVINCES,

  getFinalPrice: (totalPrice) => {
    const { couponDiscount } = get();
    return Math.max(0, totalPrice - couponDiscount);
  },

  submitOrder: async (items, totalPrice) => {
    const state = get();
    if (!state.customerName || !state.customerPhone || !state.province || !state.city || !state.addressDetail) {
      throw new Error('请填写完整的收货信息');
    }

    set({ submitting: true });
    try {
      const finalPrice = Math.max(0, totalPrice - state.couponDiscount);
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
          price: item.price,
        })),
        totalPrice: Math.max(0, finalPrice),
      });

      // Apply coupon if selected
      if (state.selectedCoupon) {
        try {
          const couponResult = await useCustomerCoupon(state.selectedCoupon, orderResult.orderId);
          if (couponResult.discountAmount) {
            set({ couponDiscount: couponResult.discountAmount });
          }
        } catch {}
      }

      const payment = await createPayment({
        orderId: orderResult.orderId,
        amount: Math.max(0, finalPrice),
        paymentMethod: state.paymentMethod,
        subject: `订单 #${orderResult.orderId}`,
      });

      const paymentInfo = {
        ...payment,
        amount: finalPrice,
        paymentOrderId: payment.paymentOrderId,
      };

      set({
        paymentInfo,
        checkoutStep: 'payment',
        submitting: false,
        paymentStatus: 'pending',
      });

      // Start polling
      clearPolling();
      pollingTimer = setInterval(async () => {
        try {
          const result = await queryPaymentStatus(paymentInfo.paymentOrderId);
          if (result.status === 'paid') {
            set({ paymentStatus: 'paid' });
            clearPolling();
          }
        } catch {}
      }, 2000);
    } catch (error: any) {
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
}));
