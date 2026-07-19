import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');
const UnionPayProvider = require('../services/payment/providers/UnionPayProvider');

async function createPaymentTables(db: any) {
  await db.run(`
    CREATE TABLE payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT UNIQUE,
      trade_no TEXT,
      payer_info TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.run(`
    CREATE TABLE refund_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_order_id INTEGER NOT NULL,
      refund_amount REAL NOT NULL,
      refund_reason TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      refund_no TEXT UNIQUE,
      provider_refund_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT,
      lease_expires_at INTEGER,
      next_reconcile_at INTEGER,
      last_attempt_at TEXT,
      last_error TEXT,
      manual_evidence TEXT,
      external_reference TEXT,
      manual_completed_by INTEGER,
      manual_completed_at TEXT,
      refunded_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.run(`
    CREATE TABLE refund_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      actor_id INTEGER,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      provider_refund_id TEXT,
      external_reference TEXT,
      evidence TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createPaidOrder(db: any, paymentMethod: string, orderStatus = 'paid') {
  const order = await db.run(
    `INSERT INTO orders
      (customer_name, customer_phone, province, city, district, address_detail, total_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['refund customer', '13800000000', 'Zhejiang', 'Hangzhou', 'Xihu', 'test address', 15, orderStatus]
  );
  const payment = await db.run(
    `INSERT INTO payment_orders
      (order_id, payment_method, amount, status, transaction_id)
     VALUES (?, ?, ?, ?, ?)`,
    [order.lastID, paymentMethod, 15, 'paid', `PAY-${paymentMethod}-${order.lastID}`]
  );
  return { orderId: order.lastID, paymentOrderId: payment.lastID };
}

describe('refund workflow', () => {
  let db: any;
  let orderService: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
    await db.run('UPDATE admins SET session_version = 1 WHERE session_version IS NULL');
    await createPaymentTables(db);
    orderService = new OrderService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns manual_required for UnionPay without changing payment or order state', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'unionpay');
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.unionpay = new UnionPayProvider({ merchantId: 'union-test' });
    const authService = new AuthService(db);
    const app = createApp(db, { authService, orderService, paymentService });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    const response = await request(app)
      .post('/api/payment/refund')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .send({ paymentOrderId, amount: 15, reason: 'customer return' })
      .expect(202);

    expect(response.body.data).toEqual(expect.objectContaining({
      paymentOrderId,
      status: 'manual_required',
    }));
    expect(response.body.data.message).not.toContain('退款成功');

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get(
      'SELECT payment_order_id, status FROM refund_records WHERE payment_order_id = ?',
      [paymentOrderId]
    );
    expect({ payment, order, refund }).toEqual({
      payment: { status: 'paid' },
      order: { status: 'paid' },
      refund: { payment_order_id: paymentOrderId, status: 'manual_required' },
    });
  });

  it.each(['cod', 'balance'])('requires manual handling for %s refunds', async (paymentMethod) => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, paymentMethod);
    const paymentService = new PaymentOrchestrator(db, orderService);

    const result = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'customer return',
    });

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get('SELECT status FROM refund_records WHERE payment_order_id = ?', [paymentOrderId]);
    expect({ result, payment, order, refund }).toEqual({
      result: expect.objectContaining({ status: 'manual_required', paymentOrderId }),
      payment: { status: 'paid' },
      order: { status: 'paid' },
      refund: { status: 'manual_required' },
    });
  });

  it('keeps a WeChat refund in processing until the provider confirms success', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'wechat');
    const createRefund = vi.fn().mockResolvedValue({
      status: 'processing',
      providerRefundId: 'WX-REFUND-1',
    });
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.wechat = { createRefund };

    const result = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'customer return',
    });

    expect(result).toEqual(expect.objectContaining({ status: 'processing', paymentOrderId }));
    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get('SELECT status FROM refund_records WHERE payment_order_id = ?', [paymentOrderId]);
    expect({ payment, order, refund }).toEqual({
      payment: { status: 'paid' },
      order: { status: 'paid' },
      refund: { status: 'processing' },
    });
    expect(createRefund).toHaveBeenCalledOnce();
  });

  it('retries an uncertain provider request with the same stable refund number', async () => {
    const { paymentOrderId } = await createPaidOrder(db, 'wechat');
    const createRefund = vi.fn()
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValueOnce({ status: 'processing', providerRefundId: 'WX-RETRY-1' });
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.wechat = { createRefund };

    const uncertain = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });
    const retry = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });

    const refund = await db.get(
      `SELECT id, refund_no, status, provider_refund_id, attempt_count, lease_token, last_error
       FROM refund_records WHERE payment_order_id = ?`,
      [paymentOrderId]
    );
    const history = await db.all(
      `SELECT from_status, to_status, event_type, attempt_count
       FROM refund_status_history WHERE refund_id = ? ORDER BY id`,
      [refund.id]
    );
    expect(uncertain).toEqual(expect.objectContaining({
      refundId: refund.id,
      refundNo: refund.refund_no,
      status: 'requested',
    }));
    expect(retry).toEqual(expect.objectContaining({
      refundId: refund.id,
      refundNo: refund.refund_no,
      status: 'processing',
    }));
    expect(createRefund).toHaveBeenCalledTimes(2);
    expect(createRefund.mock.calls.map(([input]) => input.refundNo)).toEqual([
      refund.refund_no,
      refund.refund_no,
    ]);
    expect(refund).toEqual(expect.objectContaining({
      status: 'processing',
      provider_refund_id: 'WX-RETRY-1',
      attempt_count: 2,
      lease_token: null,
      last_error: null,
    }));
    expect(history.map((entry: any) => entry.event_type)).toEqual([
      'refund_requested',
      'attempt_started',
      'provider_error',
      'attempt_started',
      'provider_response',
    ]);
  });

  it('reuses an active refund request instead of calling the provider twice', async () => {
    const { paymentOrderId } = await createPaidOrder(db, 'wechat');
    const createRefund = vi.fn().mockResolvedValue({ status: 'processing' });
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.wechat = { createRefund };

    const first = await paymentService.createRefund({ paymentOrderId, amount: 15, reason: 'return' });
    const second = await paymentService.createRefund({ paymentOrderId, amount: 15, reason: 'return' });

    expect(second).toEqual(expect.objectContaining({
      refundId: first.refundId,
      refundNo: first.refundNo,
      status: 'processing',
      idempotent: true,
    }));
    expect(createRefund).toHaveBeenCalledOnce();
  });

  it('reconciles a provider processing result to success without creating another refund request', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'wechat');
    const provider = {
      createRefund: vi.fn().mockResolvedValue({
        status: 'processing',
        providerRefundId: 'WX-REFUND-PENDING-1',
      }),
      queryRefund: vi.fn().mockResolvedValue({
        status: 'success',
        providerRefundId: 'WX-REFUND-CONFIRMED-1',
      }),
    };
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.wechat = provider;

    const created = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });
    await db.run('UPDATE refund_records SET next_reconcile_at = 0 WHERE id = ?', [created.refundId]);
    const batch = await paymentService.reconcilePendingRefunds();
    const reconciled = batch.results[0];
    expect(batch.scanned).toBe(1);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get(
      `SELECT status, refund_no, provider_refund_id, attempt_count
       FROM refund_records WHERE id = ?`,
      [created.refundId]
    );
    expect({ reconciled, payment, order, refund }).toEqual({
      reconciled: expect.objectContaining({ status: 'success', paymentOrderId }),
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
      refund: {
        status: 'success',
        refund_no: created.refundNo,
        provider_refund_id: 'WX-REFUND-CONFIRMED-1',
        attempt_count: 2,
      },
    });
    expect(provider.createRefund).toHaveBeenCalledOnce();
    expect(provider.queryRefund).toHaveBeenCalledOnce();
    expect(provider.queryRefund.mock.calls[0][0].refund.refund_no).toBe(created.refundNo);
  });

  it('escalates repeated unknown provider results to manual_required and stops automatic calls', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'alipay');
    const provider = {
      createRefund: vi.fn().mockRejectedValue(new Error('provider timeout')),
    };
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.refundMaxAttempts = 2;
    paymentService.providers.alipay = provider;

    const first = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });
    const second = await paymentService.reconcileRefund(first.refundId);
    const third = await paymentService.reconcileRefund(first.refundId);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get(
      `SELECT status, attempt_count, lease_token, last_error
       FROM refund_records WHERE id = ?`,
      [first.refundId]
    );
    expect({ first, second, third, payment, order, refund }).toEqual({
      first: expect.objectContaining({ status: 'requested', retryScheduled: true }),
      second: expect.objectContaining({ status: 'manual_required', retryScheduled: false }),
      third: expect.objectContaining({ status: 'manual_required', idempotent: true }),
      payment: { status: 'paid' },
      order: { status: 'paid' },
      refund: {
        status: 'manual_required',
        attempt_count: 2,
        lease_token: null,
        last_error: 'provider timeout',
      },
    });
    expect(provider.createRefund).toHaveBeenCalledTimes(2);
  });

  it('escalates a provider status that remains processing instead of leaving it permanent', async () => {
    const { paymentOrderId } = await createPaidOrder(db, 'wechat');
    const provider = {
      createRefund: vi.fn().mockResolvedValue({ status: 'processing', providerRefundId: 'WX-STUCK-1' }),
      queryRefund: vi.fn().mockResolvedValue({ status: 'processing', providerRefundId: 'WX-STUCK-1' }),
    };
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.refundMaxAttempts = 2;
    paymentService.providers.wechat = provider;

    const created = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });
    const reconciled = await paymentService.reconcileRefund(created.refundId);
    const refund = await db.get(
      `SELECT status, provider_refund_id, attempt_count, next_reconcile_at
       FROM refund_records WHERE id = ?`,
      [created.refundId]
    );

    expect({ created, reconciled, refund }).toEqual({
      created: expect.objectContaining({ status: 'processing' }),
      reconciled: expect.objectContaining({ status: 'manual_required' }),
      refund: {
        status: 'manual_required',
        provider_refund_id: 'WX-STUCK-1',
        attempt_count: 2,
        next_reconcile_at: null,
      },
    });
  });

  it('ignores an older failed attempt after a newer lease already confirmed success', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'wechat');
    const paymentService = new PaymentOrchestrator(db, orderService);
    const requestResult = await paymentService.settlement.requestRefund(paymentOrderId, {
      amount: 15,
      reason: 'return',
      refundNo: 'REF-LEASE-ORDERING-1',
    });
    const firstClaim = await paymentService.settlement.claimRefundAttempt(requestResult.refundId, {
      leaseSeconds: 60,
    });
    await db.run(
      'UPDATE refund_records SET lease_expires_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000) - 1, requestResult.refundId]
    );
    const secondClaim = await paymentService.settlement.claimRefundAttempt(requestResult.refundId, {
      leaseSeconds: 60,
    });
    const success = await paymentService.settlement.settleRefundSuccess(requestResult.refundId, {
      leaseToken: secondClaim.leaseToken,
      providerRefundId: 'WX-NEWER-CONFIRMATION',
    });
    const staleFailure = await paymentService.settlement.completeRefundAttempt(
      requestResult.refundId,
      firstClaim.leaseToken,
      { status: 'failed', error: new Error('older provider response') }
    );

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get(
      'SELECT status, provider_refund_id FROM refund_records WHERE id = ?',
      [requestResult.refundId]
    );
    expect({ success, staleFailure, payment, order, refund }).toEqual({
      success: expect.objectContaining({ success: true, status: 'success' }),
      staleFailure: expect.objectContaining({
        success: true,
        status: 'success',
        idempotent: true,
        outOfOrder: true,
      }),
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
      refund: { status: 'success', provider_refund_id: 'WX-NEWER-CONFIRMATION' },
    });
  });

  it('requires evidence to manually confirm a manual_required refund and settles transactionally', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'unionpay');
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.unionpay = new UnionPayProvider({ merchantId: 'union-test' });
    const manual = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });

    await expect(paymentService.confirmManualRefund({
      refundId: manual.refundId,
      adminId: 9,
      evidence: 'too short',
      externalReference: 'ACP-1',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const confirmed = await paymentService.confirmManualRefund({
      refundId: manual.refundId,
      adminId: 9,
      evidence: '银行退款凭证已由两名管理员核验并归档。',
      externalReference: 'ACP-MANUAL-20260719-0001',
    });

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get(
      `SELECT status, external_reference, manual_completed_by, manual_completed_at
       FROM refund_records WHERE id = ?`,
      [manual.refundId]
    );
    const history = await db.all(
      `SELECT event_type, source, actor_id, external_reference
       FROM refund_status_history WHERE refund_id = ? ORDER BY id`,
      [manual.refundId]
    );
    expect({ confirmed, payment, order, refund, history: history.at(-1) }).toEqual({
      confirmed: expect.objectContaining({ status: 'success' }),
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
      refund: {
        status: 'success',
        external_reference: 'ACP-MANUAL-20260719-0001',
        manual_completed_by: 9,
        manual_completed_at: expect.any(String),
      },
      history: {
        event_type: 'manual_completion_confirmed',
        source: 'admin',
        actor_id: 9,
        external_reference: 'ACP-MANUAL-20260719-0001',
      },
    });
  });

  it('exposes authenticated admin reconcile and manual-evidence endpoints', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'wechat');
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.wechat = {
      createRefund: vi.fn().mockResolvedValue({ status: 'processing', providerRefundId: 'WX-API-1' }),
      queryRefund: vi.fn().mockResolvedValue({ status: 'manual_required', providerRefundId: 'WX-API-1' }),
    };
    const created = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });
    const authService = new AuthService(db);
    const app = createApp(db, { authService, orderService, paymentService });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    const token = login.body.data.token;

    const reconciled = await request(app)
      .post(`/api/payment/refunds/${created.refundId}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    expect(reconciled.body.data).toEqual(expect.objectContaining({
      refundId: created.refundId,
      status: 'manual_required',
    }));

    await request(app)
      .post(`/api/payment/refunds/${created.refundId}/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resolution: 'confirm_completed',
        evidence: '商户后台退款凭证和银行流水已完成双人复核。',
        externalReference: 'WX-MANUAL-API-20260719-1',
      })
      .expect(200);
    const detail = await request(app)
      .get(`/api/payment/refunds/${created.refundId}/detail`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    expect({ detail: detail.body.data, payment, order }).toEqual({
      detail: expect.objectContaining({
        id: created.refundId,
        status: 'success',
        external_reference: 'WX-MANUAL-API-20260719-1',
        history: expect.arrayContaining([
          expect.objectContaining({ event_type: 'manual_completion_confirmed' }),
        ]),
      }),
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
    });
  });

  it('projects only non-sensitive fields in the administrator payment list', async () => {
    const { paymentOrderId } = await createPaidOrder(db, 'alipay');
    await db.run(
      'UPDATE payment_orders SET payer_info = ?, trade_no = ? WHERE id = ?',
      [JSON.stringify({ buyer_id: 'sensitive-payer-identity' }), 'ALI-PRIVATE-TRADE', paymentOrderId]
    );
    const paymentService = new PaymentOrchestrator(db, orderService);

    const list = await paymentService.getPaymentList({ page: 1, pageSize: 20 });

    expect(list.items).toEqual([
      {
        id: paymentOrderId,
        order_id: expect.any(Number),
        payment_method: 'alipay',
        amount: 15,
        status: 'paid',
        paid_at: null,
        created_at: expect.any(String),
      },
    ]);
    expect(JSON.stringify(list)).not.toContain('sensitive-payer-identity');
    expect(JSON.stringify(list)).not.toContain('ALI-PRIVATE-TRADE');
  });

  it('only updates local payment and order after a confirmed provider success', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'alipay');
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.alipay = {
      createRefund: vi.fn().mockResolvedValue({ status: 'success', providerRefundId: 'ALI-REFUND-1' }),
    };

    const result = await paymentService.createRefund({ paymentOrderId, amount: 15, reason: 'return' });

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get('SELECT status FROM refund_records WHERE payment_order_id = ?', [paymentOrderId]);
    expect({ result: result.status, payment, order, refund }).toEqual({
      result: 'success',
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
      refund: { status: 'success' },
    });
  });

  it.each(['shipped', 'completed'])(
    'settles a provider-confirmed refund for a %s order without forcing cancellation',
    async (orderStatus) => {
      const { orderId, paymentOrderId } = await createPaidOrder(db, 'alipay', orderStatus);
      const paymentService = new PaymentOrchestrator(db, orderService);
      paymentService.providers.alipay = {
        createRefund: vi.fn().mockResolvedValue({
          status: 'success',
          providerRefundId: `ALI-${orderStatus}-REFUND`,
        }),
      };

      const result = await paymentService.createRefund({
        paymentOrderId,
        amount: 15,
        reason: 'post-fulfillment refund',
      });

      expect({
        result,
        payment: await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]),
        order: await db.get('SELECT status FROM orders WHERE id = ?', [orderId]),
        refund: await db.get('SELECT status FROM refund_records WHERE payment_order_id = ?', [paymentOrderId]),
      }).toEqual({
        result: expect.objectContaining({ status: 'success' }),
        payment: { status: 'refunded' },
        order: { status: 'refunded' },
        refund: { status: 'success' },
      });
    }
  );

  it('keeps the refund reconcilable when local order settlement fails', async () => {
    const { orderId, paymentOrderId } = await createPaidOrder(db, 'alipay');
    const failingOrderService = {
      updateOrderStatus: vi.fn().mockRejectedValue(new Error('order update failed')),
      updateOrderStatusInTransaction: vi.fn().mockRejectedValue(new Error('order update failed')),
    };
    const paymentService = new PaymentOrchestrator(db, failingOrderService);
    paymentService.providers.alipay = {
      createRefund: vi.fn().mockResolvedValue({ status: 'success', providerRefundId: 'ALI-REFUND-2' }),
    };

    const result = await paymentService.createRefund({
      paymentOrderId,
      amount: 15,
      reason: 'return',
    });

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const refund = await db.get('SELECT status FROM refund_records WHERE payment_order_id = ?', [paymentOrderId]);
    expect({ result, payment, order, refund }).toEqual({
      result: expect.objectContaining({
        status: 'processing',
        retryScheduled: true,
      }),
      payment: { status: 'paid' },
      order: { status: 'paid' },
      refund: { status: 'processing' },
    });
  });
});
