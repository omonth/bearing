import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AfterSalesPanel from '@/components/account/AfterSalesPanel';
import type { AfterSalesCase, Order } from '@/types';

const createCase = vi.fn();
const listCases = vi.fn();
const getCase = vi.fn();
const cancelCase = vi.fn();

vi.mock('@/lib/api', () => ({
  createCustomerAfterSalesCase: (...args: unknown[]) => createCase(...args),
  listCustomerAfterSalesCases: (...args: unknown[]) => listCases(...args),
  getCustomerAfterSalesCase: (...args: unknown[]) => getCase(...args),
  cancelCustomerAfterSalesCase: (...args: unknown[]) => cancelCase(...args),
}));

const order: Order = {
  id: 42,
  customer_name: '测试顾客',
  customer_phone: '13800138000',
  province: '浙江省',
  city: '杭州市',
  address_detail: '测试路 1 号',
  total_price: 128,
  status: 'paid',
  created_at: '2026-07-19 10:00:00',
};

const submittedCase: AfterSalesCase = {
  id: 5,
  caseNo: 'AS-TEST-5',
  clientRequestId: 'case-request-0005',
  customerId: 7,
  orderId: 42,
  type: 'refund_only',
  reason: '规格不符',
  description: '收到的商品规格与订单不一致，需要人工审核退款。',
  requestedAmount: 128,
  status: 'submitted',
  version: 1,
  paymentOrderId: null,
  refundId: null,
  refundStatus: null,
  resolutionNote: null,
  createdAt: '2026-07-19 10:00:00',
  updatedAt: '2026-07-19 10:00:00',
};

describe('AfterSalesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCases.mockResolvedValue([]);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits an order-linked refund request with an idempotency key', async () => {
    createCase.mockResolvedValueOnce({ ...submittedCase, idempotent: false });
    const user = userEvent.setup();

    render(<AfterSalesPanel orders={[order]} />);
    await user.selectOptions(screen.getByLabelText('关联订单'), '42');
    await user.type(screen.getByLabelText('申请原因'), '规格不符');
    await user.type(
      screen.getByLabelText('详细说明'),
      '收到的商品规格与订单不一致，需要人工审核退款。'
    );
    await user.type(screen.getByLabelText('申请金额（可选）'), '128');
    await user.click(screen.getByRole('button', { name: '提交售后申请' }));

    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: expect.stringMatching(/^case-/),
      orderId: 42,
      type: 'refund_only',
      reason: '规格不符',
      description: '收到的商品规格与订单不一致，需要人工审核退款。',
      requestedAmount: 128,
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('售后申请已提交');
    expect(screen.getByText('AS-TEST-5')).toBeInTheDocument();
  });

  it('reuses the same idempotency key when an uncertain request is retried unchanged', async () => {
    createCase
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({ ...submittedCase, idempotent: true });
    const user = userEvent.setup();

    render(<AfterSalesPanel orders={[order]} />);
    await user.selectOptions(screen.getByLabelText('关联订单'), '42');
    await user.type(screen.getByLabelText('申请原因'), '规格不符');
    await user.type(
      screen.getByLabelText('详细说明'),
      '收到的商品规格与订单不一致，需要人工审核退款。'
    );
    await user.click(screen.getByRole('button', { name: '提交售后申请' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: '提交售后申请' }));

    const firstInput = createCase.mock.calls[0][0];
    const secondInput = createCase.mock.calls[1][0];
    expect(secondInput.clientRequestId).toBe(firstInput.clientRequestId);
    expect(await screen.findByRole('status')).toHaveTextContent('该申请已提交，无需重复操作');
  });

  it('provides an order-exception ticket as the human support entry', async () => {
    createCase.mockResolvedValueOnce({
      ...submittedCase,
      orderId: null,
      type: 'order_exception',
      caseNo: 'AS-SUPPORT-1',
    });
    const user = userEvent.setup();

    render(<AfterSalesPanel orders={[order]} />);
    await user.click(screen.getByRole('button', { name: '异常订单人工处理' }));
    await user.type(screen.getByLabelText('申请原因'), '订单信息异常');
    await user.type(screen.getByLabelText('详细说明'), '无法确认异常订单编号，请客服协助人工核对处理。');
    await user.click(screen.getByRole('button', { name: '提交人工工单' }));

    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
      type: 'order_exception',
      reason: '订单信息异常',
      description: '无法确认异常订单编号，请客服协助人工核对处理。',
    }));
    expect(createCase.mock.calls[0][0]).not.toHaveProperty('requestedAmount');
    expect(createCase.mock.calls[0][0]).not.toHaveProperty('orderId');
  });

  it('loads status history and version-cancels a submitted request', async () => {
    listCases.mockResolvedValueOnce([submittedCase]);
    getCase.mockResolvedValueOnce({
      ...submittedCase,
      history: [
        {
          id: 1,
          caseId: 5,
          fromStatus: null,
          toStatus: 'submitted',
          actorType: 'customer',
          actorId: 7,
          note: '顾客提交售后申请',
          version: 1,
          createdAt: '2026-07-19 10:00:00',
        },
      ],
    });
    cancelCase.mockResolvedValueOnce({ ...submittedCase, status: 'cancelled', version: 2 });
    const user = userEvent.setup();

    render(<AfterSalesPanel orders={[order]} />);
    await user.click(await screen.findByRole('button', { name: '查看进度' }));
    expect(await screen.findByText(/顾客提交售后申请/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消申请' }));

    expect(cancelCase).toHaveBeenCalledWith(5, 1);
    expect(await screen.findByRole('status')).toHaveTextContent('售后申请已取消');
  });
});
