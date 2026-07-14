import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddressFormStep from '@/components/checkout/AddressFormStep';

const savedAddress = {
  id: 8,
  customerId: 1,
  recipientName: '陈工',
  recipientPhone: '13800000001',
  province: '广东省',
  city: '深圳市',
  district: '南山区',
  addressDetail: '科技园 9 号',
  postalCode: null,
  isDefault: true,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

describe('AddressFormStep', () => {
  it('selects a saved address and exposes saving a newly filled address', async () => {
    const onSelectSavedAddress = vi.fn();
    const onSaveAddress = vi.fn();
    const user = userEvent.setup();

    render(
      <AddressFormStep
        values={{
          customerName: '',
          customerPhone: '',
          province: '',
          city: '',
          district: '',
          addressDetail: '',
          paymentMethod: 'alipay',
        }}
        provinces={['广东省']}
        cities={['深圳市']}
        finalPrice={10}
        discountAmount={0}
        submitting={false}
        formError={null}
        savedAddresses={[savedAddress]}
        savingAddress={false}
        onChangeField={vi.fn()}
        onSelectProvince={vi.fn()}
        onSelectPaymentMethod={vi.fn()}
        onSelectSavedAddress={onSelectSavedAddress}
        onSaveAddress={onSaveAddress}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByTestId('checkout-saved-address'), '8');
    expect(onSelectSavedAddress).toHaveBeenCalledWith(8);

    await user.click(screen.getByTestId('checkout-save-address'));
    expect(onSaveAddress).toHaveBeenCalledTimes(1);
  });
});
