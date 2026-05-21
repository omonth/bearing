import { create } from 'zustand';
import { createOrder, createPayment, queryPaymentStatus } from '@/lib/api';
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

  setField: (field: string, value: string) => void;
  setProvince: (value: string) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setCheckoutStep: (step: CheckoutStep) => void;
  submitOrder: (items: CartItem[], totalPrice: number) => Promise<void>;
  resetCheckout: () => void;
  getCities: () => string[];
  getAllProvinces: () => string[];
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

  setField: (field, value) => set({ [field]: value }),

  setProvince: (value) => set({ province: value, city: '', district: '' }),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setCheckoutStep: (step) => set({ checkoutStep: step }),

  getCities: () => {
    const { province } = get();
    return province ? (REGION_DATA[province] || ['其他']) : [];
  },

  getAllProvinces: () => ALL_PROVINCES,

  submitOrder: async (items, totalPrice) => {
    const state = get();
    if (!state.customerName || !state.customerPhone || !state.province || !state.city || !state.addressDetail) {
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
          price: item.price,
        })),
        totalPrice,
      });

      const payment = await createPayment({
        orderId: orderResult.orderId,
        amount: totalPrice,
        paymentMethod: state.paymentMethod,
        subject: `订单 #${orderResult.orderId}`,
      });

      const paymentInfo = {
        ...payment,
        amount: totalPrice,
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
    });
  },
}));
