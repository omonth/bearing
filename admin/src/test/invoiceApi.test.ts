import { beforeEach, describe, expect, it, vi } from 'vitest';
import adminApi from '@/shared/lib/adminApi';
import {
  getInvoiceRequest,
  listInvoiceRequests,
  parseInvoiceApiError,
  updateInvoiceRequestStatus,
} from '@/modules/invoices/invoiceApi';
import {
  availableInvoiceTransitions,
  invoiceStatusSuccessMessage,
  validateInvoiceAction,
} from '@/modules/invoices/invoiceModel';
import type { InvoiceRequest } from '@/modules/invoices/types';

vi.mock('@/shared/lib/adminApi', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const invoice: InvoiceRequest = {
  id: 11,
  customerId: 5,
  orderId: 99,
  profileId: 3,
  profileSnapshot: {
    titleType: 'company',
    title: '杭州轴承采购有限公司',
    taxNumber: '91330100123456789X',
    email: 'invoice@example.com',
    recipientPhone: '13800000001',
    registeredAddress: '浙江省杭州市测试路 1 号',
    bankName: '测试银行杭州分行',
    bankAccount: '622200000000000001',
  },
  status: 'processing',
  invoiceNumber: null,
  resolutionNote: '财务正在处理',
  version: 2,
  issuedAt: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

describe('invoice admin API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses server-side status pagination and the detail endpoint', async () => {
    vi.mocked(adminApi.get)
      .mockResolvedValueOnce({
        data: { data: { items: [invoice], total: 21, page: 2, pageSize: 20 } },
      })
      .mockResolvedValueOnce({ data: { data: { ...invoice, history: [] } } });

    const page = await listInvoiceRequests({ status: 'processing', page: 2, pageSize: 20 });
    const detail = await getInvoiceRequest(11);

    expect(adminApi.get).toHaveBeenNthCalledWith(1, '/after-sales/admin/invoices', {
      params: { status: 'processing', page: 2, pageSize: 20 },
    });
    expect(adminApi.get).toHaveBeenNthCalledWith(2, '/after-sales/admin/invoices/11');
    expect({ page, detail }).toEqual({
      page: { items: [invoice], total: 21, page: 2, pageSize: 20 },
      detail: { ...invoice, history: [] },
    });
  });

  it('submits the exact expectedVersion and real invoice number', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({
      data: { data: { ...invoice, status: 'issued', invoiceNumber: 'INV-20260719-001', version: 3 } },
    });

    const result = await updateInvoiceRequestStatus(11, {
      status: 'issued',
      expectedVersion: 2,
      note: '外部发票系统已实际开具',
      invoiceNumber: 'INV-20260719-001',
    });

    expect(adminApi.patch).toHaveBeenCalledWith('/after-sales/admin/invoices/11/status', {
      status: 'issued',
      expectedVersion: 2,
      note: '外部发票系统已实际开具',
      invoiceNumber: 'INV-20260719-001',
    });
    expect(result).toMatchObject({ status: 'issued', version: 3 });
  });

  it('recognizes invoice version conflicts', () => {
    expect(parseInvoiceApiError({
      response: {
        status: 409,
        data: {
          error: '发票申请已被更新，请刷新后重试',
          code: 'INVOICE_VERSION_CONFLICT',
        },
      },
    })).toEqual({
      status: 409,
      code: 'INVOICE_VERSION_CONFLICT',
      message: '发票申请已被更新，请刷新后重试',
      versionConflict: true,
    });
  });
});

describe('invoice UI safety model', () => {
  it('allows issued only after processing and requires an actual invoice number', () => {
    expect({
      requested: availableInvoiceTransitions('requested'),
      processing: availableInvoiceTransitions('processing'),
      missingNumber: validateInvoiceAction('issued', '已在外部系统开票', ''),
      validIssued: validateInvoiceAction(
        'issued',
        '已在外部系统开票',
        'INV-20260719-001',
      ),
      successMessage: invoiceStatusSuccessMessage('issued'),
    }).toEqual({
      requested: ['processing', 'rejected', 'cancelled'],
      processing: ['issued', 'rejected', 'cancelled'],
      missingNumber: '请填写外部发票系统返回的真实发票号码',
      validIssued: null,
      successMessage: '已记录外部系统真实开票结果和发票号码',
    });
  });
});
