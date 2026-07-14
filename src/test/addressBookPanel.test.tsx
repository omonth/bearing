import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddressBookPanel from '@/components/account/AddressBookPanel';
import {
  createCustomerAddress,
  deleteCustomerAddress,
  getCustomerAddresses,
  updateCustomerAddress,
} from '@/lib/api';

vi.mock('@/lib/api', () => ({
  createCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
  getCustomerAddresses: vi.fn(),
  updateCustomerAddress: vi.fn(),
}));

const savedAddress = {
  id: 1,
  customerId: 7,
  recipientName: '王工',
  recipientPhone: '13800000001',
  province: '广东省',
  city: '深圳市',
  district: '南山区',
  addressDetail: '科技园 1 号',
  postalCode: null,
  isDefault: true,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

describe('AddressBookPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCustomerAddresses).mockResolvedValue([savedAddress]);
  });

  it('lists saved addresses and creates a new address with stable controls', async () => {
    vi.mocked(createCustomerAddress).mockResolvedValue({
      ...savedAddress,
      id: 2,
      city: '广州市',
      district: '天河区',
      addressDetail: '体育西路 8 号',
      isDefault: false,
    });
    const user = userEvent.setup();

    render(<AddressBookPanel />);

    expect(await screen.findByTestId('address-card-1')).toBeInTheDocument();
    await user.click(screen.getByTestId('address-create'));
    await user.type(screen.getByTestId('address-recipient-name'), '李工');
    await user.type(screen.getByTestId('address-recipient-phone'), '13900000001');
    await user.type(screen.getByTestId('address-province'), '广东省');
    await user.type(screen.getByTestId('address-city'), '广州市');
    await user.type(screen.getByTestId('address-district'), '天河区');
    await user.type(screen.getByTestId('address-detail'), '体育西路 8 号');
    await user.click(screen.getByTestId('address-save'));

    await waitFor(() => {
      expect(createCustomerAddress).toHaveBeenCalledWith({
        recipientName: '李工',
        recipientPhone: '13900000001',
        province: '广东省',
        city: '广州市',
        district: '天河区',
        addressDetail: '体育西路 8 号',
        postalCode: undefined,
        isDefault: false,
      });
    });
  });

  it('updates and deletes a saved address through its stable controls', async () => {
    vi.mocked(updateCustomerAddress).mockResolvedValue({
      ...savedAddress,
      addressDetail: '科技园 2 号',
    });
    vi.mocked(deleteCustomerAddress).mockResolvedValue({ id: savedAddress.id });
    const user = userEvent.setup();

    render(<AddressBookPanel />);

    await screen.findByTestId('address-card-1');
    await user.click(screen.getByTestId('address-edit-1'));
    await user.clear(screen.getByTestId('address-detail'));
    await user.type(screen.getByTestId('address-detail'), '科技园 2 号');
    await user.click(screen.getByTestId('address-save'));

    await waitFor(() => {
      expect(updateCustomerAddress).toHaveBeenCalledWith(1, expect.objectContaining({
        addressDetail: '科技园 2 号',
        isDefault: true,
      }));
    });

    await user.click(screen.getByTestId('address-delete-1'));
    await waitFor(() => expect(deleteCustomerAddress).toHaveBeenCalledWith(1));
  });
});
