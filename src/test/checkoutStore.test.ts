import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCheckoutStore } from '@/store/checkoutStore';
import { REGION_DATA, ALL_PROVINCES } from '@/data/regions';

const mockCreateOrder = vi.fn();
const mockCreatePayment = vi.fn();
const mockApplyCustomerCoupon = vi.fn();
const mockQueryPaymentStatus = vi.fn();

vi.mock('@/lib/api', () => ({
  applyCustomerCoupon: (...args: any[]) => mockApplyCustomerCoupon(...args),
  createOrder: (...args: any[]) => mockCreateOrder(...args),
  createPayment: (...args: any[]) => mockCreatePayment(...args),
  queryPaymentStatus: (...args: any[]) => mockQueryPaymentStatus(...args),
}));

const mockItems = [
  { id: 1, name: '轴承 A', model: 'A1', price: 10, image: '', category: 'cat', specs: { innerDiameter: 1, outerDiameter: 2, width: 3 }, stock: 10, description: '', quantity: 2 },
];

describe('checkoutStore', () => {
  beforeEach(() => {
    useCheckoutStore.setState({
      customerName: '', customerPhone: '', province: '', city: '', district: '',
      addressDetail: '', paymentMethod: 'alipay', checkoutStep: 'cart',
      paymentInfo: null, submitting: false, paymentStatus: 'pending',
    });
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should start with default state', () => {
    const s = useCheckoutStore.getState();
    expect(s.checkoutStep).toBe('cart');
    expect(s.paymentMethod).toBe('alipay');
    expect(s.submitting).toBe(false);
  });

  it('should set a field', () => {
    useCheckoutStore.getState().setField('customerName', '张三');
    expect(useCheckoutStore.getState().customerName).toBe('张三');
  });

  it('should set province and reset city/district', () => {
    const store = useCheckoutStore.getState();
    store.setField('city', '广州市');
    store.setField('district', '天河区');
    store.setProvince('北京市');
    const s = useCheckoutStore.getState();
    expect(s.province).toBe('北京市');
    expect(s.city).toBe('');
    expect(s.district).toBe('');
  });

  it('should get cities for selected province', () => {
    useCheckoutStore.getState().setProvince('广东省');
    const province = useCheckoutStore.getState().province;
    const cities = REGION_DATA[province] || ['其他'];
    expect(cities).toContain('广州市');
    expect(cities).toContain('深圳市');
  });

  it('should return all provinces sorted', () => {
    const provinces = ALL_PROVINCES;
    expect(provinces).toContain('北京市');
    expect(provinces).toContain('广东省');
    expect(provinces[0] <= provinces[1]).toBe(true); // sorted
  });

  it('should set checkout step', () => {
    useCheckoutStore.getState().setCheckoutStep('form');
    expect(useCheckoutStore.getState().checkoutStep).toBe('form');
  });

  it('should throw if required fields are empty', async () => {
    await expect(
      useCheckoutStore.getState().submitOrder(mockItems as any, 20)
    ).rejects.toThrow('请填写完整的收货信息');
  });

  it('should submit order and transition to payment', async () => {
    mockCreateOrder.mockResolvedValueOnce({ orderId: 42, message: '订单创建成功' });
    mockCreatePayment.mockResolvedValueOnce({ paymentOrderId: 100, orderNo: 'ORD-42', qrUrl: 'http://qr.example.com' });
    mockQueryPaymentStatus.mockResolvedValue({ status: 'pending' });

    const store = useCheckoutStore.getState();
    store.setField('customerName', '张三');
    store.setField('customerPhone', '13800138000');
    store.setProvince('广东省');
    store.setField('city', '广州市');
    store.setField('district', '天河区');
    store.setField('addressDetail', '体育西路100号');

    await store.submitOrder(mockItems as any, 20);

    const s = useCheckoutStore.getState();
    expect(s.checkoutStep).toBe('payment');
    expect(s.submitting).toBe(false);
    expect(s.paymentInfo.paymentOrderId).toBe(100);
    expect(s.paymentInfo.orderNo).toBe('ORD-42');
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    expect(mockCreatePayment).toHaveBeenCalledTimes(1);
  });

  it('should poll payment status and detect paid', async () => {
    mockCreateOrder.mockResolvedValueOnce({ orderId: 43 });
    mockCreatePayment.mockResolvedValueOnce({ paymentOrderId: 101, orderNo: 'ORD-43', qrUrl: '' });
    mockQueryPaymentStatus
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'paid' });

    const store = useCheckoutStore.getState();
    store.setField('customerName', '李四');
    store.setField('customerPhone', '13900139000');
    store.setProvince('北京市');
    store.setField('city', '东城区');
    store.setField('district', '东华门街道');
    store.setField('addressDetail', '王府井');

    await store.submitOrder(mockItems as any, 20);
    expect(useCheckoutStore.getState().paymentStatus).toBe('pending');

    // First poll - still pending
    await vi.advanceTimersByTimeAsync(2000);
    expect(useCheckoutStore.getState().paymentStatus).toBe('pending');

    // Second poll - still pending
    await vi.advanceTimersByTimeAsync(2000);
    expect(useCheckoutStore.getState().paymentStatus).toBe('pending');

    // Third poll - paid
    await vi.advanceTimersByTimeAsync(2000);
    expect(useCheckoutStore.getState().paymentStatus).toBe('paid');
  });

  it('should reset checkout', () => {
    useCheckoutStore.setState({
      checkoutStep: 'payment', paymentInfo: { orderNo: 'X' }, paymentStatus: 'paid',
    });
    useCheckoutStore.getState().resetCheckout();
    const s = useCheckoutStore.getState();
    expect(s.checkoutStep).toBe('cart');
    expect(s.paymentInfo).toBeNull();
    expect(s.paymentStatus).toBe('pending');
  });

  it('should handle submit failure', async () => {
    mockCreateOrder.mockRejectedValueOnce(new Error('库存不足'));

    const store = useCheckoutStore.getState();
    store.setField('customerName', '王五');
    store.setField('customerPhone', '13700137000');
    store.setProvince('上海市');
    store.setField('city', '徐汇区');
    store.setField('district', '徐家汇街道');
    store.setField('addressDetail', '淮海中路');

    await expect(store.submitOrder(mockItems as any, 20)).rejects.toThrow('库存不足');
    expect(useCheckoutStore.getState().submitting).toBe(false);
  });
});
