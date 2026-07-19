// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AfterSalesList from '@/modules/after-sales/AfterSalesList';
import {
  getAfterSalesCase,
  listAfterSalesCases,
  updateAfterSalesStatus,
} from '@/modules/after-sales/afterSalesApi';
import type { AfterSalesCase, AfterSalesDetail } from '@/modules/after-sales/types';

vi.mock('@/modules/after-sales/afterSalesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/after-sales/afterSalesApi')>();
  return {
    ...actual,
    listAfterSalesCases: vi.fn(),
    getAfterSalesCase: vi.fn(),
    updateAfterSalesStatus: vi.fn(),
    initiateAfterSalesRefund: vi.fn(),
    syncAfterSalesRefund: vi.fn(),
  };
});

const item: AfterSalesCase = {
  id: 1,
  caseNo: 'AS-20260719-1',
  clientRequestId: 'case-request-1',
  customerId: 5,
  orderId: 99,
  type: 'refund_only',
  reason: '联系电话 13812345678，规格不符',
  description: '收到的轴承型号与订单不一致，请协助处理。',
  requestedAmount: 199,
  status: 'submitted',
  version: 1,
  paymentOrderId: null,
  refundId: null,
  refundStatus: null,
  resolutionNote: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const detail: AfterSalesDetail = {
  ...item,
  history: [{
    id: 1,
    caseId: 1,
    fromStatus: null,
    toStatus: 'submitted',
    actorType: 'customer',
    actorId: 5,
    note: '顾客提交售后申请',
    version: 1,
    createdAt: '2026-07-19T00:00:00.000Z',
  }],
};

describe('AfterSalesList', () => {
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
    vi.mocked(listAfterSalesCases).mockResolvedValue({
      items: [item],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(getAfterSalesCase).mockResolvedValue(detail);
  });

  it('renders a masked case and submits the detail version with the review action', async () => {
    vi.mocked(updateAfterSalesStatus).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: '售后申请已被更新，请刷新后重试',
          code: 'AFTER_SALES_VERSION_CONFLICT',
        },
      },
    });

    render(<AfterSalesList />);

    expect(await screen.findByText('AS-20260719-1')).toBeInTheDocument();
    expect(screen.getByText(/138\*\*\*\*5678/)).toBeInTheDocument();
    expect(screen.queryByText(/13812345678/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('after-sales-detail-1'));
    expect(await screen.findByTestId('after-sales-detail-drawer')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('after-sales-action-note'), {
      target: { value: '开始核对订单和申请凭证' },
    });
    fireEvent.click(screen.getByTestId('after-sales-submit-status'));

    await waitFor(() => expect(updateAfterSalesStatus).toHaveBeenCalledWith(1, {
      status: 'under_review',
      expectedVersion: 1,
      note: '开始核对订单和申请凭证',
    }));
    expect(await screen.findByTestId('after-sales-conflict')).toHaveTextContent(
      '该售后单已被其他管理员更新，已加载最新版本，请核对后重试。',
    );
    await waitFor(() => expect(getAfterSalesCase).toHaveBeenCalledTimes(2));
  });
});
