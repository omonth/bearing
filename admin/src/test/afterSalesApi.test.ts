import { beforeEach, describe, expect, it, vi } from 'vitest';
import adminApi from '@/shared/lib/adminApi';
import {
  getAfterSalesCase,
  initiateAfterSalesRefund,
  listAfterSalesCases,
  parseAfterSalesApiError,
  syncAfterSalesRefund,
  updateAfterSalesStatus,
} from '@/modules/after-sales/afterSalesApi';
import {
  availableStatusTransitions,
  canInitiateRefund,
  maskSensitiveText,
  statusSuccessMessage,
} from '@/modules/after-sales/afterSalesModel';
import type { AfterSalesCase } from '@/modules/after-sales/types';

vi.mock('@/shared/lib/adminApi', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

const baseCase: AfterSalesCase = {
  id: 7,
  caseNo: 'AS-7',
  clientRequestId: 'case-request-7',
  customerId: 3,
  orderId: 12,
  type: 'refund_only',
  reason: '规格不符',
  description: '申请退款',
  requestedAmount: 88,
  status: 'under_review',
  version: 2,
  paymentOrderId: null,
  refundId: null,
  refundStatus: null,
  resolutionNote: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

describe('after-sales admin API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the admin list and detail endpoints with server-side filters', async () => {
    vi.mocked(adminApi.get)
      .mockResolvedValueOnce({
        data: { data: { items: [baseCase], total: 1, page: 2, pageSize: 20 } },
      })
      .mockResolvedValueOnce({ data: { data: { ...baseCase, history: [] } } });

    const page = await listAfterSalesCases({
      status: 'under_review',
      type: 'refund_only',
      page: 2,
      pageSize: 20,
    });
    const detail = await getAfterSalesCase(7);

    expect(adminApi.get).toHaveBeenNthCalledWith(1, '/after-sales/admin/cases', {
      params: {
        status: 'under_review',
        type: 'refund_only',
        page: 2,
        pageSize: 20,
      },
    });
    expect(adminApi.get).toHaveBeenNthCalledWith(2, '/after-sales/admin/cases/7');
    expect({ page, detail }).toEqual({
      page: { items: [baseCase], total: 1, page: 2, pageSize: 20 },
      detail: { ...baseCase, history: [] },
    });
  });

  it('sends expectedVersion for status, refund, and refund-sync mutations', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { data: baseCase } });
    vi.mocked(adminApi.post).mockResolvedValue({ data: { data: baseCase } });

    await updateAfterSalesStatus(7, {
      status: 'approved',
      expectedVersion: 2,
      note: '凭证审核通过',
    });
    await initiateAfterSalesRefund(7, {
      expectedVersion: 3,
      note: '提交统一退款流程',
    });
    await syncAfterSalesRefund(7, 4);

    expect(adminApi.patch).toHaveBeenCalledWith('/after-sales/admin/cases/7/status', {
      status: 'approved',
      expectedVersion: 2,
      note: '凭证审核通过',
    });
    expect(adminApi.post).toHaveBeenNthCalledWith(1, '/after-sales/admin/cases/7/refund', {
      expectedVersion: 3,
      note: '提交统一退款流程',
    });
    expect(adminApi.post).toHaveBeenNthCalledWith(2, '/after-sales/admin/cases/7/refund/sync', {
      expectedVersion: 4,
    });
  });

  it('recognizes optimistic concurrency conflicts without hiding provider errors', () => {
    expect(parseAfterSalesApiError({
      response: {
        status: 409,
        data: {
          error: '售后申请已被更新，请刷新后重试',
          code: 'AFTER_SALES_VERSION_CONFLICT',
        },
      },
    })).toEqual({
      status: 409,
      code: 'AFTER_SALES_VERSION_CONFLICT',
      message: '售后申请已被更新，请刷新后重试',
      versionConflict: true,
    });
  });
});

describe('after-sales UI safety model', () => {
  it('keeps approval separate from a confirmed refund and masks phone numbers', () => {
    const approved = { ...baseCase, status: 'approved', version: 3 } as AfterSalesCase;

    expect({
      transitions: availableStatusTransitions(approved),
      canRefund: canInitiateRefund(approved),
      message: statusSuccessMessage(approved),
      masked: maskSensitiveText('请联系 13812345678 处理'),
    }).toEqual({
      transitions: ['cancelled'],
      canRefund: true,
      message: '审核已通过；退款尚未确认，仍须经统一支付流程和渠道确认',
      masked: '请联系 138****5678 处理',
    });
  });
});
