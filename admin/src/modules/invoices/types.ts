export type InvoiceStatus = 'requested' | 'processing' | 'issued' | 'rejected' | 'cancelled';

export type InvoiceTitleType = 'personal' | 'company';

export interface InvoiceProfileSnapshot {
  titleType: InvoiceTitleType;
  title: string;
  taxNumber: string | null;
  email: string;
  recipientPhone: string | null;
  registeredAddress: string | null;
  bankName: string | null;
  bankAccount: string | null;
}

export interface InvoiceRequest {
  id: number;
  customerId: number;
  orderId: number;
  profileId: number | null;
  profileSnapshot: InvoiceProfileSnapshot;
  status: InvoiceStatus;
  invoiceNumber: string | null;
  resolutionNote: string | null;
  version: number;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceHistory {
  id: number;
  invoiceId: number;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus;
  actorType: 'customer' | 'admin';
  actorId: number;
  note: string | null;
  version: number;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceRequest {
  history: InvoiceHistory[];
}

export interface InvoicePage {
  items: InvoiceRequest[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  page: number;
  pageSize: number;
}

export interface UpdateInvoiceStatusInput {
  status: InvoiceStatus;
  expectedVersion: number;
  note: string;
  invoiceNumber?: string;
}
