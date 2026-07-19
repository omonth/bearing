// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrderList from '@/modules/orders/OrderList';
import adminApi from '@/shared/lib/adminApi';

vi.mock('@/shared/lib/adminApi', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

const paidOrder = {
  id: 21,
  customer_name: '测试顾客',
  customer_phone: '13812345678',
  province: '浙江省',
  city: '杭州市',
  district: '滨江区',
  address_detail: '测试路 1 号',
  total_price: 200,
  status: 'paid',
  tracking_number: null,
  created_at: '2026-07-19T00:00:00.000Z',
};

describe('OrderList logistics action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const getComputedStyle = window.getComputedStyle.bind(window);
    window.getComputedStyle = (element) => getComputedStyle(element);
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    vi.mocked(adminApi.get).mockImplementation(async (url) => {
      if (url === '/orders') return { data: [paidOrder] };
      if (url === '/orders/21/items') return { data: [] };
      if (url === '/orders/21/history') return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(adminApi.put).mockResolvedValue({ data: { data: { message: 'ok' } } });
    vi.mocked(adminApi.post).mockResolvedValue({
      data: { data: { status: 'paid', orderStatus: 'completed' } },
    });
  });

  it('requires an individual tracking number and sends it when shipping a paid order', async () => {
    render(<OrderList />);

    fireEvent.click(await screen.findByRole('button', { name: '填写物流并发货' }));
    const input = await screen.findByTestId('admin-order-tracking-number');
    expect(screen.getByText('已支付订单不能直接取消；退款或退货必须从售后管理进入。')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'SF-1234567890' } });
    fireEvent.click(screen.getByTestId('admin-order-ship-with-tracking'));
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));

    await waitFor(() => expect(adminApi.put).toHaveBeenCalledWith('/orders/21/status', {
      status: 'shipped',
      trackingNumber: 'SF-1234567890',
      note: '管理员填写物流单号并确认发货',
    }));
  });

  it('confirms COD collection only after evidence is accepted by the protected endpoint', async () => {
    const codOrder = {
      ...paidOrder,
      id: 22,
      status: 'shipped',
      payment_order_id: 122,
      payment_method: 'cod',
      payment_status: 'processing',
      tracking_number: 'SF-COD-22',
    };
    vi.mocked(adminApi.get).mockImplementation(async (url) => {
      if (url === '/orders') return { data: [codOrder] };
      if (url === '/orders/22/items') return { data: [] };
      if (url === '/orders/22/history') return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });

    render(<OrderList />);
    fireEvent.click(await screen.findByRole('button', { name: '详情' }));
    fireEvent.change(await screen.findByTestId('admin-cod-collection-reference'), {
      target: { value: 'COD-UI-RECEIPT-22' },
    });
    fireEvent.change(screen.getByTestId('admin-cod-collection-evidence'), {
      target: { value: '快递员回单与现金收款记录已经双人核验。' },
    });
    fireEvent.click(screen.getByTestId('admin-cod-confirm-collection'));
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));

    await waitFor(() => expect(adminApi.post).toHaveBeenCalledWith(
      '/payment/cod/122/confirm-collection',
      {
        evidence: '快递员回单与现金收款记录已经双人核验。',
        externalReference: 'COD-UI-RECEIPT-22',
      }
    ));
    await waitFor(() => expect(screen.getByText('已收款')).toBeInTheDocument());
  });

  it('does not display COD payment or completion success when confirmation fails', async () => {
    const codOrder = {
      ...paidOrder,
      id: 23,
      status: 'shipped',
      payment_order_id: 123,
      payment_method: 'cod',
      payment_status: 'processing',
      tracking_number: 'SF-COD-23',
    };
    vi.mocked(adminApi.get).mockImplementation(async (url) => {
      if (url === '/orders') return { data: [codOrder] };
      if (url === '/orders/23/items') return { data: [] };
      if (url === '/orders/23/history') return { data: [] };
      throw new Error(`unexpected GET ${url}`);
    });
    vi.mocked(adminApi.post).mockRejectedValue(new Error('settlement conflict'));

    render(<OrderList />);
    fireEvent.click(await screen.findByRole('button', { name: '详情' }));
    fireEvent.change(await screen.findByTestId('admin-cod-collection-reference'), {
      target: { value: 'COD-UI-RECEIPT-23' },
    });
    fireEvent.change(screen.getByTestId('admin-cod-collection-evidence'), {
      target: { value: '该凭证用于验证失败时不会显示成功状态。' },
    });
    fireEvent.click(screen.getByTestId('admin-cod-confirm-collection'));
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));

    await waitFor(() => expect(adminApi.post).toHaveBeenCalledOnce());
    expect(screen.queryByText('已收款')).not.toBeInTheDocument();
    expect(screen.getAllByText('已发货').length).toBeGreaterThan(0);
  });
});
