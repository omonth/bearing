import adminApi from '@/shared/lib/adminApi';
import type {
  AfterSalesCase,
  AfterSalesDetail,
  AfterSalesFilters,
  AfterSalesPage,
  AfterSalesStatus,
} from './types';

const ADMIN_CASES_PATH = '/after-sales/admin/cases';

function unwrapData<T>(response: { data: T | { data: T } }): T {
  const payload = response.data;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload as T;
}

export async function listAfterSalesCases(filters: AfterSalesFilters): Promise<AfterSalesPage> {
  const response = await adminApi.get(ADMIN_CASES_PATH, {
    params: {
      status: filters.status,
      type: filters.type,
      page: filters.page,
      pageSize: filters.pageSize,
    },
  });
  return unwrapData<AfterSalesPage>(response);
}

export async function getAfterSalesCase(caseId: number): Promise<AfterSalesDetail> {
  const response = await adminApi.get(`${ADMIN_CASES_PATH}/${caseId}`);
  return unwrapData<AfterSalesDetail>(response);
}

export async function updateAfterSalesStatus(
  caseId: number,
  input: { status: AfterSalesStatus; expectedVersion: number; note: string },
): Promise<AfterSalesCase> {
  const response = await adminApi.patch(`${ADMIN_CASES_PATH}/${caseId}/status`, input);
  return unwrapData<AfterSalesCase>(response);
}

export async function initiateAfterSalesRefund(
  caseId: number,
  input: { expectedVersion: number; note: string },
): Promise<AfterSalesCase> {
  const response = await adminApi.post(`${ADMIN_CASES_PATH}/${caseId}/refund`, input);
  return unwrapData<AfterSalesCase>(response);
}

export async function syncAfterSalesRefund(
  caseId: number,
  expectedVersion: number,
): Promise<AfterSalesCase> {
  const response = await adminApi.post(`${ADMIN_CASES_PATH}/${caseId}/refund/sync`, {
    expectedVersion,
  });
  return unwrapData<AfterSalesCase>(response);
}

export interface AfterSalesApiError {
  status: number | null;
  code: string | null;
  message: string;
  versionConflict: boolean;
}

export function parseAfterSalesApiError(error: unknown): AfterSalesApiError {
  const response = (error as {
    response?: { status?: number; data?: { error?: string; message?: string; code?: string } };
    message?: string;
  } | null)?.response;
  const status = typeof response?.status === 'number' ? response.status : null;
  const code = typeof response?.data?.code === 'string' ? response.data.code : null;
  const message = response?.data?.error
    || response?.data?.message
    || (error as { message?: string } | null)?.message
    || '售后操作失败';

  return {
    status,
    code,
    message,
    versionConflict: status === 409 && code === 'AFTER_SALES_VERSION_CONFLICT',
  };
}
