import adminApi from '@/shared/lib/adminApi';
import type {
  InvoiceDetail,
  InvoiceFilters,
  InvoicePage,
  InvoiceRequest,
  UpdateInvoiceStatusInput,
} from './types';

const ADMIN_INVOICES_PATH = '/after-sales/admin/invoices';

function unwrapData<T>(response: { data: T | { data: T } }): T {
  const payload = response.data;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload as T;
}

export async function listInvoiceRequests(filters: InvoiceFilters): Promise<InvoicePage> {
  const response = await adminApi.get(ADMIN_INVOICES_PATH, {
    params: {
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
    },
  });
  return unwrapData<InvoicePage>(response);
}

export async function getInvoiceRequest(invoiceId: number): Promise<InvoiceDetail> {
  const response = await adminApi.get(`${ADMIN_INVOICES_PATH}/${invoiceId}`);
  return unwrapData<InvoiceDetail>(response);
}

export async function updateInvoiceRequestStatus(
  invoiceId: number,
  input: UpdateInvoiceStatusInput,
): Promise<InvoiceRequest> {
  const response = await adminApi.patch(`${ADMIN_INVOICES_PATH}/${invoiceId}/status`, input);
  return unwrapData<InvoiceRequest>(response);
}

export interface InvoiceApiError {
  status: number | null;
  code: string | null;
  message: string;
  versionConflict: boolean;
}

export function parseInvoiceApiError(error: unknown): InvoiceApiError {
  const response = (error as {
    response?: { status?: number; data?: { error?: string; message?: string; code?: string } };
    message?: string;
  } | null)?.response;
  const status = typeof response?.status === 'number' ? response.status : null;
  const code = typeof response?.data?.code === 'string' ? response.data.code : null;
  const message = response?.data?.error
    || response?.data?.message
    || (error as { message?: string } | null)?.message
    || '发票操作失败';

  return {
    status,
    code,
    message,
    versionConflict: status === 409 && code === 'INVOICE_VERSION_CONFLICT',
  };
}
