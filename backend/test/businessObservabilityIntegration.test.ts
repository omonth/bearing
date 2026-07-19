import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestDb, seedTestData } from './helpers';

const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');
const PaymentSettlement = require('../services/payment/PaymentSettlement');

function createAuditMock() {
  return {
    callbackSignatureFailed: vi.fn().mockResolvedValue({ delivered: false }),
    callbackSignatureVerified: vi.fn(),
    inventoryAnomaly: vi.fn().mockResolvedValue({ delivered: false }),
    orderCreated: vi.fn(),
    orderFailed: vi.fn(),
    paymentFailed: vi.fn(),
    paymentCreateUncertain: vi.fn(),
    paymentOrderSyncFailed: vi.fn().mockResolvedValue({ delivered: false }),
    paymentSucceeded: vi.fn(),
    refundFailed: vi.fn(),
    refundRequestUncertain: vi.fn(),
    refundOrderSyncFailed: vi.fn().mockResolvedValue({ delivered: false }),
    refundRequested: vi.fn(),
    refundStatus: vi.fn(),
    refundSucceeded: vi.fn(),
  };
}

describe('payment and refund observability integration', () => {
  it('alerts when provider-confirmed payment cannot update the local order transaction', async () => {
    const audit = createAuditMock();
    const transaction = {
      get: vi.fn().mockImplementation(async (sql) => {
        if (sql.includes('payment_orders')) {
          return {
            id: 7,
            order_id: 11,
            payment_method: 'wechat',
            status: 'processing',
          };
        }
        return { status: 'pending' };
      }),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    };
    const db = {
      transaction: vi.fn().mockImplementation(async (work) => work(transaction)),
    };
    const orderLifecycle = {
      finalize: vi.fn(),
      markPaid: vi.fn().mockRejectedValue(new Error('order update failed')),
    };
    const settlement = new PaymentSettlement(db, orderLifecycle, audit);

    const result = await settlement.settlePaid(7, { tradeNo: 'provider-trade-7' });

    expect(result).toEqual({ success: false, error: 'order update failed' });
    expect(audit.paymentOrderSyncFailed).toHaveBeenCalledWith('wechat', {
      paymentOrderId: 7,
      orderId: 11,
      provider: 'wechat',
      reasonCode: 'LOCAL_SETTLEMENT_TRANSACTION_FAILED',
    });
    expect(audit.paymentSucceeded).not.toHaveBeenCalled();
  });

  it('alerts when a provider-confirmed refund cannot settle the local order', async () => {
    const audit = createAuditMock();
    let currentStatus = 'requested';
    const refundContext = {
      id: 9,
      payment_order_id: 8,
      order_id: 12,
      payment_method: 'wechat',
      payment_status: 'paid',
      transaction_id: 'PAY-8',
      payment_amount: 100,
      refund_amount: 100,
      refund_reason: 'customer request',
      refund_no: 'REF-9',
      provider_refund_id: null,
      attempt_count: 1,
    };
    const db = {
      get: vi.fn().mockImplementation(async () => ({
        ...refundContext,
        status: currentStatus,
      })),
    };
    const orchestrator = new PaymentOrchestrator(db, {}, audit);
    orchestrator.providers.wechat = {
      createRefund: vi.fn().mockResolvedValue({
        status: 'success',
        providerRefundId: 'WX-REFUND-9',
      }),
    };
    orchestrator.settlement = {
      getPaymentOrder: vi.fn().mockResolvedValue({
        id: 8,
        amount: 100,
        payment_method: 'wechat',
        status: 'paid',
      }),
      requestRefund: vi.fn().mockResolvedValue({
        success: true,
        idempotent: false,
        refundId: 9,
        refundNo: 'REF-9',
        amount: 100,
        status: 'requested',
      }),
      claimRefundAttempt: vi.fn().mockResolvedValue({
        success: true,
        claimed: true,
        leaseToken: 'lease-9',
        attemptCount: 1,
        refund: { ...refundContext, status: 'processing' },
      }),
      settleRefundSuccess: vi.fn().mockResolvedValue({
        success: false,
        error: 'order update failed',
      }),
      completeRefundAttempt: vi.fn().mockImplementation(async (_refundId, _lease, input) => {
        currentStatus = input.status;
        return { success: true, status: input.status };
      }),
    };

    await expect(orchestrator.createRefund({
      paymentOrderId: 8,
      amount: 100,
      reason: 'customer request',
    })).resolves.toEqual(expect.objectContaining({
      refundId: 9,
      status: 'processing',
      retryScheduled: true,
    }));

    expect(audit.refundRequested).toHaveBeenCalledWith({
      refundId: 9,
      paymentOrderId: 8,
      provider: 'wechat',
    });
    expect(audit.refundOrderSyncFailed).toHaveBeenCalledWith({
      refundId: 9,
      paymentOrderId: 8,
      provider: 'wechat',
      reasonCode: 'LOCAL_REFUND_SETTLEMENT_FAILED',
    });
    expect(audit.refundRequestUncertain).toHaveBeenCalledWith({
      refundId: 9,
      paymentOrderId: 8,
      provider: 'wechat',
      attemptCount: 1,
      reasonCode: 'PROVIDER_REFUND_RESULT_UNKNOWN',
    });
    expect(audit.refundSucceeded).not.toHaveBeenCalled();
  });

  it('counts a cryptographic callback signature rejection on the provider boundary', async () => {
    const audit = createAuditMock();
    const orchestrator = new PaymentOrchestrator({}, {}, audit);
    const error = Object.assign(new Error('微信支付回调签名无效'), {
      code: 'WECHAT_CALLBACK_SIGNATURE_INVALID',
    });
    orchestrator.providers.wechat = {
      handleCallback: vi.fn().mockRejectedValue(error),
    };

    await expect(orchestrator.handleCallback({
      method: 'wechat',
      headers: {},
      body: {},
      rawBody: '{}',
    })).rejects.toThrow('微信支付回调签名无效');

    expect(audit.callbackSignatureFailed).toHaveBeenCalledWith('wechat', {
      reasonCode: 'WECHAT_CALLBACK_SIGNATURE_INVALID',
    });
    expect(audit.callbackSignatureVerified).not.toHaveBeenCalled();
  });

  it('records a provider-declared failed payment callback exactly once', async () => {
    const audit = createAuditMock();
    const db = {
      get: vi.fn().mockImplementation(async (sql) => {
        if (sql.includes('payment_orders')) {
          return {
            id: 10,
            order_id: 12,
            payment_method: 'alipay',
            status: 'processing',
          };
        }
        if (sql.includes('orders')) return { id: 12 };
        return null;
      }),
      run: vi.fn().mockResolvedValue({ lastID: 14, changes: 1 }),
    };
    const orchestrator = new PaymentOrchestrator(db, {}, audit);
    orchestrator.providers.alipay = {
      handleCallback: vi.fn().mockResolvedValue({
        eventId: 'event-14',
        transactionId: 'transaction-10',
        status: 'failed',
      }),
    };
    orchestrator.settlement = {
      settleFailed: vi.fn().mockResolvedValue({
        success: true,
        paymentOrderId: 10,
        status: 'failed',
      }),
    };

    const result = await orchestrator.handleCallback({
      method: 'alipay',
      headers: {},
      body: { out_trade_no: 'transaction-10' },
      rawBody: 'out_trade_no=transaction-10',
    });

    expect(result).toEqual({ success: true, idempotent: false });
    expect(audit.paymentFailed).toHaveBeenCalledWith('alipay', {
      paymentOrderId: 10,
      orderId: 12,
      reasonCode: 'PROVIDER_CALLBACK_FAILED',
    });
  });
});

describe('order and inventory observability integration', () => {
  let db: any;

  beforeAll(async () => {
    db = await createTestDb();
    await seedTestData(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('records successful orders and inventory reservation failures from the real service path', async () => {
    const audit = createAuditMock();
    const service = new OrderService(db, vi.fn(), audit);
    const baseOrder = {
      customerName: '测试客户',
      customerPhone: '13800138000',
      province: '广东省',
      city: '广州市',
      district: '天河区',
      addressDetail: '测试路 1 号',
    };

    const created = await service.create({
      ...baseOrder,
      items: [{ id: 1, quantity: 1 }],
    });
    await expect(service.create({
      ...baseOrder,
      items: [{ id: 1, quantity: 100000 }],
    })).rejects.toThrow('库存不足');

    expect(audit.orderCreated).toHaveBeenCalledWith({
      orderId: created.orderId,
      amount: 15,
      itemCount: 1,
    });
    expect(audit.inventoryAnomaly).toHaveBeenCalledWith('insufficient', {
      bearingId: 1,
      requestedQuantity: 100000,
    });
    expect(audit.orderFailed).toHaveBeenCalledWith({ reasonCode: 'BUSINESS_ERROR' });
  });
});
