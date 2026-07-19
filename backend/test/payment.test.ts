import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');
const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');

let app: any;
let db: any;
let adminToken: string;

beforeAll(async () => {
  db = await createTestDb();
  await seedTestData(db);

  await db.run(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      transaction_id TEXT,
      trade_no TEXT,
      payer_info TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS refund_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_order_id INTEGER NOT NULL,
      refund_amount REAL NOT NULL,
      refund_reason TEXT,
      status TEXT DEFAULT 'pending',
      refund_no TEXT,
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
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS refund_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, refund_id INTEGER NOT NULL,
      from_status TEXT, to_status TEXT NOT NULL, event_type TEXT NOT NULL,
      source TEXT NOT NULL, actor_id INTEGER, attempt_count INTEGER DEFAULT 0,
      provider_refund_id TEXT, external_reference TEXT, evidence TEXT,
      error_message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      max_discount REAL,
      min_order_amount REAL DEFAULT 0,
      total_quantity INTEGER DEFAULT 1000,
      used_quantity INTEGER DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS customer_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      coupon_id INTEGER NOT NULL,
      status TEXT DEFAULT 'unused',
      used_order_id INTEGER,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const authService = new AuthService(db);
  const orderService = new OrderService(db);
  const paymentService = new PaymentOrchestrator(db, orderService);
  paymentService.enable();

  app = createApp(db, { authService, orderService, paymentService });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = res.body.data.token;
});

afterAll(async () => {
  await db.close();
});

describe('Payment Sandbox API', () => {
  let orderId: number;
  let paymentOrderId: number;

  it('should create a payment order', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerName: '支付测试',
        customerPhone: '13800000099',
        province: '浙江',
        city: '杭州',
        district: '西湖区',
        addressDetail: '测试路99号',
        items: [{ id: 1, quantity: 2 }],
      });
    expect(orderRes.status).toBe(200);
    orderId = orderRes.body.data.orderId;

    const res = await request(app)
      .post('/api/payment/checkout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, amount: 30, paymentMethod: 'alipay', subject: '轴承' });

    expect(res.status).toBe(200);
    expect(res.body.data.paymentOrderId).toBeGreaterThan(0);
    paymentOrderId = res.body.data.paymentOrderId;
  });

  it('should simulate payment and sync order status', async () => {
    const res = await request(app)
      .post(`/api/payment/simulate/${paymentOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');

    const payment = await db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
    expect(payment.status).toBe('paid');
    expect(payment.trade_no).toBeTruthy();

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    expect(order.status).toBe('paid');
  });

  it('derives amounts on the server and requires guest order access tokens', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerName: 'Guest Payment Access',
        customerPhone: '13900000911',
        province: 'P',
        city: 'C',
        district: 'D',
        addressDetail: 'A',
        items: [{ id: 1, quantity: 1 }],
      });
    const guestOrderId = orderRes.body.data.orderId;
    const orderAccessToken = orderRes.body.data.orderAccessToken;

    await request(app)
      .post('/api/payment/checkout')
      .send({ orderId: guestOrderId, paymentMethod: 'alipay' })
      .expect(401);

    const paymentRes = await request(app)
      .post('/api/payment/checkout')
      .send({
        orderId: guestOrderId,
        orderAccessToken,
        amount: 0.01,
        paymentMethod: 'alipay',
      })
      .expect(200);

    expect(paymentRes.body.data.amount).toBe(15);

    await request(app)
      .get(`/api/payment/status/${paymentRes.body.data.paymentOrderId}`)
      .expect(401);

    const statusRes = await request(app)
      .get(`/api/payment/status/${paymentRes.body.data.paymentOrderId}`)
      .set('X-Order-Access-Token', orderAccessToken)
      .expect(200);
    expect(statusRes.body.data.amount).toBe(15);

    await request(app)
      .post('/api/payment/checkout')
      .send({ orderId: guestOrderId, orderAccessToken, paymentMethod: 'alipay' })
      .expect(409);
  });

  it('should use the order lifecycle status interface when payment is simulated', async () => {
    const calls: any[] = [];
    const orderLifecycle = {
      updateOrderStatusInTransaction: async ({
        transaction,
        orderId: nextOrderId,
        status,
      }: {
        transaction: any;
        orderId: number;
        status: string;
      }) => {
        calls.push({ orderId: nextOrderId, status });
        await transaction.run('UPDATE orders SET status = ? WHERE id = ?', [status, nextOrderId]);
        return { data: { oldStatus: 'pending', newStatus: status }, error: null };
      },
    };
    const paymentService = new PaymentOrchestrator(db, orderLifecycle);
    paymentService.enable();

    const orderRes = await request(app).post('/api/orders').send({
      customerName: 'Lifecycle Payment',
      customerPhone: '13900000903',
      province: 'P',
      city: 'C',
      district: 'D',
      addressDetail: 'A',
      items: [{ id: 1, quantity: 1 }],
    });

    const createPayment = await paymentService.createPayment({
      orderId: orderRes.body.data.orderId,
      amount: 15,
      paymentMethod: 'alipay',
      subject: 'bearing',
    });

    await paymentService.simulatePayment(createPayment.paymentOrderId);
    await paymentService.simulatePayment(createPayment.paymentOrderId);

    expect(calls).toEqual([{ orderId: orderRes.body.data.orderId, status: 'paid' }]);
  });

  it('should not write duplicate order status history for repeated paid events', async () => {
    const orderRes = await request(app).post('/api/orders').send({
      customerName: 'Idempotent Payment',
      customerPhone: '13900000904',
      province: 'P',
      city: 'C',
      district: 'D',
      addressDetail: 'A',
      items: [{ id: 1, quantity: 1 }],
    });

    const createPayment = await request(app)
      .post('/api/payment/checkout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: orderRes.body.data.orderId,
        amount: 15,
        paymentMethod: 'alipay',
        subject: 'bearing',
      });

    await request(app)
      .post(`/api/payment/simulate/${createPayment.body.data.paymentOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app)
      .post(`/api/payment/simulate/${createPayment.body.data.paymentOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const history = await db.all(
      'SELECT old_status, new_status FROM order_status_history WHERE order_id = ?',
      [orderRes.body.data.orderId]
    );

    expect(history).toEqual([{ old_status: 'pending', new_status: 'paid' }]);
  });

  it('should refund a paid order and sync order status', async () => {
    const res = await request(app)
      .post('/api/payment/refund')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentOrderId, amount: 30, reason: '测试退款' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('success');

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    expect(payment.status).toBe('refunded');

    const refund = await db.get('SELECT * FROM refund_records WHERE payment_order_id = ?', [paymentOrderId]);
    expect(refund).toBeTruthy();
    expect(refund.refund_amount).toBe(30);

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    expect(order.status).toBe('cancelled');
  });

  it('should not revive a refunded payment when a paid event is replayed', async () => {
    const replayRes = await request(app)
      .post(`/api/payment/simulate/${paymentOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(replayRes.status).toBe(200);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    expect(payment.status).toBe('refunded');

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    expect(order.status).toBe('cancelled');
  });

  it('should not change order status when payment creation fails', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerName: '失败测试',
        customerPhone: '13900000088',
        province: '广东',
        city: '深圳',
        district: '南山区',
        addressDetail: '测试路88号',
        items: [{ id: 1, quantity: 1 }],
      });
    const failOrderId = orderRes.body.data.orderId;

    // Create payment with an unsupported method to trigger failure
    const res = await request(app)
      .post('/api/payment/checkout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId: failOrderId, amount: 15, paymentMethod: 'bitcoin', subject: 'test' });

    expect(res.status).toBe(400);

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [failOrderId]);
    expect(order.status).toBe('pending');
  });

  it('should simulate payment for wechat sandbox', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        customerName: '微信支付',
        customerPhone: '13700000077',
        province: '北京',
        city: '北京',
        district: '海淀区',
        addressDetail: '测试路77号',
        items: [{ id: 1, quantity: 1 }],
      });
    const wxOrderId = orderRes.body.data.orderId;

    const createRes = await request(app)
      .post('/api/payment/checkout')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId: wxOrderId, amount: 15, paymentMethod: 'wechat', subject: '轴承' });

    expect(createRes.status).toBe(200);
    const wxPaymentId = createRes.body.data.paymentOrderId;

    const simRes = await request(app)
      .post(`/api/payment/simulate/${wxPaymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(simRes.status).toBe(200);
    expect(simRes.body.data.status).toBe('paid');

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [wxOrderId]);
    expect(order.status).toBe('paid');
  });
});
