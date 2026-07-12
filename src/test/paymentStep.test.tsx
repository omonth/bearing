import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PaymentStep from '@/components/checkout/PaymentStep';

describe('PaymentStep', () => {
  it('shows cash-on-delivery guidance and lets the customer complete the order', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(
      <PaymentStep
        paymentStatus="processing"
        paymentInfo={{
          amount: 20,
          orderNo: 'ORD-44',
          paymentMethod: 'cod',
        }}
        paymentMethod="cod"
        onComplete={onComplete}
      />
    );

    expect(screen.getByRole('heading', { name: '货到付款' })).toBeInTheDocument();
    expect(screen.getByText('订单已提交，配送时支付即可。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '完成订单' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
