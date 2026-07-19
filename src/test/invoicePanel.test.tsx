import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InvoicePanel from '@/components/account/InvoicePanel';
import type { InvoiceProfile, Order } from '@/types';

const listProfiles = vi.fn();
const createProfile = vi.fn();
const updateProfile = vi.fn();
const deleteProfile = vi.fn();
const requestInvoice = vi.fn();
const listInvoices = vi.fn();

vi.mock('@/lib/api', () => ({
  listCustomerInvoiceProfiles: (...args: unknown[]) => listProfiles(...args),
  createCustomerInvoiceProfile: (...args: unknown[]) => createProfile(...args),
  updateCustomerInvoiceProfile: (...args: unknown[]) => updateProfile(...args),
  deleteCustomerInvoiceProfile: (...args: unknown[]) => deleteProfile(...args),
  requestCustomerOrderInvoice: (...args: unknown[]) => requestInvoice(...args),
  listCustomerOrderInvoices: (...args: unknown[]) => listInvoices(...args),
}));

const profile: InvoiceProfile = {
  id: 3,
  customerId: 7,
  titleType: 'personal',
  title: '测试顾客',
  taxNumber: null,
  email: 'invoice@example.com',
  recipientPhone: '13800138000',
  registeredAddress: null,
  bankName: null,
  bankAccount: null,
  isDefault: true,
  version: 1,
  createdAt: '2026-07-19 10:00:00',
  updatedAt: '2026-07-19 10:00:00',
};

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

describe('InvoicePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listProfiles.mockResolvedValue([]);
    listInvoices.mockResolvedValue([]);
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a customer invoice profile', async () => {
    createProfile.mockResolvedValueOnce(profile);
    const user = userEvent.setup();

    render(<InvoicePanel orders={[order]} />);
    await user.type(screen.getByLabelText('发票抬头'), '测试顾客');
    await user.type(screen.getByLabelText('接收邮箱'), 'invoice@example.com');
    await user.type(screen.getByLabelText('联系电话（可选）'), '13800138000');
    await user.click(screen.getByRole('button', { name: '保存发票资料' }));

    expect(createProfile).toHaveBeenCalledWith(expect.objectContaining({
      titleType: 'personal',
      title: '测试顾客',
      email: 'invoice@example.com',
      recipientPhone: '13800138000',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('发票资料已保存');
    expect(screen.getAllByText('测试顾客').length).toBeGreaterThan(0);
  });

  it('updates and version-deletes an invoice profile', async () => {
    listProfiles.mockResolvedValueOnce([profile]);
    updateProfile.mockResolvedValueOnce({
      ...profile,
      email: 'finance@example.com',
      version: 2,
    });
    deleteProfile.mockResolvedValueOnce({ id: 3, deleted: true });
    const user = userEvent.setup();

    render(<InvoicePanel orders={[order]} />);
    await user.click(await screen.findByRole('button', { name: '编辑发票资料' }));
    await user.clear(screen.getByLabelText('接收邮箱'));
    await user.type(screen.getByLabelText('接收邮箱'), 'finance@example.com');
    await user.click(screen.getByRole('button', { name: '更新发票资料' }));

    expect(updateProfile).toHaveBeenCalledWith(3, 1, expect.objectContaining({
      email: 'finance@example.com',
    }));
    await user.click(screen.getByRole('button', { name: '删除发票资料' }));
    expect(deleteProfile).toHaveBeenCalledWith(3, 2);
    expect(await screen.findByRole('status')).toHaveTextContent('发票资料已删除');
  });

  it('requests an invoice for an eligible order and displays issuance status', async () => {
    listProfiles.mockResolvedValueOnce([profile]);
    requestInvoice.mockResolvedValueOnce({
      id: 9,
      customerId: 7,
      orderId: 42,
      profileId: 3,
      profileSnapshot: { titleType: 'personal', title: '测试顾客', email: 'invoice@example.com' },
      status: 'requested',
      invoiceNumber: null,
      issuedAt: null,
      createdAt: '2026-07-19 10:00:00',
      updatedAt: '2026-07-19 10:00:00',
    });
    const user = userEvent.setup();

    render(<InvoicePanel orders={[order]} />);
    await user.selectOptions(await screen.findByLabelText('开票订单'), '42');
    await user.selectOptions(screen.getByLabelText('使用发票资料'), '3');
    await user.click(screen.getByRole('button', { name: '申请订单发票' }));

    expect(requestInvoice).toHaveBeenCalledWith(42, 3);
    expect(await screen.findByRole('status')).toHaveTextContent('开票申请已提交');
    expect(screen.getByText('已申请')).toBeInTheDocument();
  });

  it('shows an issued invoice number from the status query', async () => {
    listProfiles.mockResolvedValueOnce([profile]);
    listInvoices.mockResolvedValueOnce([{
      id: 9,
      customerId: 7,
      orderId: 42,
      profileId: 3,
      profileSnapshot: { titleType: 'personal', title: '测试顾客', email: 'invoice@example.com' },
      status: 'issued',
      invoiceNumber: 'INV-2026-0009',
      issuedAt: '2026-07-19 12:00:00',
      createdAt: '2026-07-19 10:00:00',
      updatedAt: '2026-07-19 12:00:00',
    }]);

    render(<InvoicePanel orders={[order]} />);

    expect(await screen.findByText('已开具')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-0009')).toBeInTheDocument();
  });
});
