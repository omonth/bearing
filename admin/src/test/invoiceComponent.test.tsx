// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceList from '@/modules/invoices/InvoiceList';
import {
  getInvoiceRequest,
  listInvoiceRequests,
  updateInvoiceRequestStatus,
} from '@/modules/invoices/invoiceApi';
import type { InvoiceDetail, InvoiceRequest } from '@/modules/invoices/types';

vi.mock('@/modules/invoices/invoiceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/invoices/invoiceApi')>();
  return {
    ...actual,
    listInvoiceRequests: vi.fn(),
    getInvoiceRequest: vi.fn(),
    updateInvoiceRequestStatus: vi.fn(),
  };
});

const item: InvoiceRequest = {
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
  status: 'requested',
  invoiceNumber: null,
  resolutionNote: null,
  version: 1,
  issuedAt: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const detail: InvoiceDetail = {
  ...item,
  history: [{
    id: 1,
    invoiceId: 11,
    fromStatus: null,
    toStatus: 'requested',
    actorType: 'customer',
    actorId: 5,
    note: '顾客申请发票',
    version: 1,
    createdAt: '2026-07-19T00:00:00.000Z',
  }],
};

function configureDom() {
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
}

describe('InvoiceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureDom();
    vi.mocked(listInvoiceRequests).mockResolvedValue({
      items: [item],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(getInvoiceRequest).mockResolvedValue(detail);
  });

  it('submits the detail version and refreshes after an optimistic conflict', async () => {
    vi.mocked(updateInvoiceRequestStatus).mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: '发票申请已被更新，请刷新后重试',
          code: 'INVOICE_VERSION_CONFLICT',
        },
      },
    });

    render(<InvoiceList />);

    expect(await screen.findByText('杭州轴承采购有限公司')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('invoice-detail-11'));
    expect(await screen.findByTestId('invoice-detail-drawer')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('invoice-action-note'), {
      target: { value: '财务开始核对开票资料' },
    });
    fireEvent.click(screen.getByTestId('invoice-submit-status'));

    await waitFor(() => expect(updateInvoiceRequestStatus).toHaveBeenCalledWith(11, {
      status: 'processing',
      expectedVersion: 1,
      note: '财务开始核对开票资料',
    }));
    expect(await screen.findByTestId('invoice-conflict')).toHaveTextContent(
      '该发票申请已被其他管理员更新，已加载最新版本，请核对后重试。',
    );
    await waitFor(() => expect(getInvoiceRequest).toHaveBeenCalledTimes(2));
  });

  it('does not submit issued until a real invoice number is entered', async () => {
    const processingDetail: InvoiceDetail = {
      ...detail,
      status: 'processing',
      version: 2,
      resolutionNote: '财务处理中',
    };
    vi.mocked(getInvoiceRequest).mockResolvedValue(processingDetail);
    vi.mocked(updateInvoiceRequestStatus).mockResolvedValue({
      ...processingDetail,
      status: 'issued',
      version: 3,
      invoiceNumber: 'INV-20260719-001',
    });

    render(<InvoiceList />);
    fireEvent.click(await screen.findByTestId('invoice-detail-11'));
    expect(await screen.findByTestId('invoice-number')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('invoice-action-note'), {
      target: { value: '外部发票系统已实际开具' },
    });
    fireEvent.click(screen.getByTestId('invoice-submit-status'));
    expect(updateInvoiceRequestStatus).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('invoice-number'), {
      target: { value: 'INV-20260719-001' },
    });
    fireEvent.click(screen.getByTestId('invoice-submit-status'));

    await waitFor(() => expect(updateInvoiceRequestStatus).toHaveBeenCalledWith(11, {
      status: 'issued',
      expectedVersion: 2,
      note: '外部发票系统已实际开具',
      invoiceNumber: 'INV-20260719-001',
    }));
  });
});
