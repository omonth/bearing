import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerOrderList from '@/components/account/CustomerOrderList';
import type { Order } from '@/types';

const cancelOrder = vi.fn();
const getLogistics = vi.fn();

vi.mock('@/lib/api', () => ({
  cancelCustomerOrder: (...args: unknown[]) => cancelOrder(...args),
  getCustomerOrderLogistics: (...args: unknown[]) => getLogistics(...args),
}));

const pendingOrder: Order = {
  id: 42,
  customer_name: '测试顾客',
  customer_phone: '13800138000',
  province: '广东省',
  city: '深圳市',
  address_detail: '测试地址',
  total_price: 128,
  status: 'pending',
  created_at: '2026-07-19 10:00:00',
};

describe('CustomerOrderList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('confirms, cancels a pending order, and refreshes the customer order list', async () => {
    cancelOrder.mockResolvedValueOnce({ orderId: 42, status: 'cancelled', idempotent: false });
    const onRefresh = vi.fn();
    const user = userEvent.setup();

    render(<CustomerOrderList orders={[pendingOrder]} onRefresh={onRefresh} />);
    await user.click(screen.getByRole('button', { name: '取消未支付订单' }));

    expect(confirm).toHaveBeenCalledWith('确定取消订单 #42 吗？取消后库存将恢复。');
    expect(cancelOrder).toHaveBeenCalledWith(42);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('订单已取消。');
  });

  it.each([
    ['PAYMENT_CLOSE_REQUIRED', '外部支付单仍需关单，请联系客服处理，订单尚未取消。'],
    ['PAYMENT_IN_PROGRESS', '支付正在处理中，请稍后刷新后再尝试。'],
    ['PAYMENT_ALREADY_SETTLED', '订单已支付，请通过售后退款流程处理。'],
  ])('maps %s to a safe actionable message', async (code, expectedMessage) => {
    cancelOrder.mockRejectedValueOnce({
      code,
      message: 'raw backend detail must not be rendered',
    });
    const user = userEvent.setup();

    render(<CustomerOrderList orders={[pendingOrder]} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '取消未支付订单' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(screen.queryByText('raw backend detail must not be rendered')).not.toBeInTheDocument();
  });

  it('treats an idempotent cancellation response as already cancelled and refreshes', async () => {
    cancelOrder.mockResolvedValueOnce({ orderId: 42, status: 'cancelled', idempotent: true });
    const onRefresh = vi.fn();
    const user = userEvent.setup();

    render(<CustomerOrderList orders={[pendingOrder]} onRefresh={onRefresh} />);
    await user.click(screen.getByRole('button', { name: '取消未支付订单' }));

    expect(await screen.findByRole('status')).toHaveTextContent('订单已是取消状态。');
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('queries and renders owned logistics history without claiming live carrier tracking', async () => {
    getLogistics.mockResolvedValueOnce({
      orderId: 42,
      orderStatus: 'shipped',
      shippingStatus: 'in_transit',
      trackingNumber: 'SF1234567890',
      shippedAt: '2026-07-19 12:00:00',
      completedAt: null,
      history: [
        {
          oldStatus: 'paid',
          newStatus: 'shipped',
          note: '顺丰已揽收',
          createdAt: '2026-07-19 12:00:00',
        },
      ],
    });
    const user = userEvent.setup();

    render(
      <CustomerOrderList
        orders={[{ ...pendingOrder, status: 'shipped', tracking_number: 'SF1234567890' }]}
        onRefresh={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: '查看物流详情' }));

    expect(getLogistics).toHaveBeenCalledWith(42);
    expect(await screen.findByText('运输中')).toBeInTheDocument();
    expect(screen.getByText(/顺丰已揽收/)).toBeInTheDocument();
    expect(screen.getByText('承运商实时轨迹需接入对应物流服务商。')).toBeInTheDocument();
  });
});
