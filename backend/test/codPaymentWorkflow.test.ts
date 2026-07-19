import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');

describe('cash-on-delivery fulfillment workflow', () => {
  let db: any;
  let app: any;
  let adminToken: string;
  let orderService: any;
  let paymentService: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
    await db.run('UPDATE admins SET session_version = 1 WHERE session_version IS NULL');
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
      CREATE TABLE coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        discount_value REAL NOT NULL,
        max_discount REAL
      )
    `);
    await db.run(`
      CREATE TABLE customer_coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        coupon_id INTEGER NOT NULL,
        status TEXT DEFAULT 'unused',
        used_order_id INTEGER,
        used_at TEXT
      )
    `);

    orderService = new OrderService(db);
    paymentService = new PaymentOrchestrator(db, orderService);
    app = createApp(db, {
      authService: new AuthService(db),
      orderService,
      paymentService,
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    adminToken = login.body.data.token;
  });

  afterEach(async () => {
    await db.close();
  });

  async function createCodOrder() {
    const stockBefore = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);
    const order = await orderService.create({
      customerName: 'COD customer',
      customerPhone: '13800000088',
      province: 'Zhejiang',
      city: 'Hangzhou',
      district: 'Xihu',
      addressDetail: 'COD test address',
      items: [{ id: 1, quantity: 2 }],
    });
    const payment = await paymentService.createPayment({
      orderId: order.orderId,
      paymentMethod: 'cod',
      subject: 'COD bearings',
    });
    return {
      orderId: order.orderId,
      paymentOrderId: payment.paymentOrderId,
      stockBefore: stockBefore.stock,
    };
  }

  it('requires admin auth, shipment, and evidence before atomically collecting and completing', async () => {
    const { orderId, paymentOrderId, stockBefore } = await createCodOrder();
    const payload = {
      evidence: 'Courier receipt and cash collection were independently verified.',
      externalReference: 'COD-RECEIPT-20260719-001',
    };

    await request(app)
      .post(`/api/payment/cod/${paymentOrderId}/confirm-collection`)
      .send(payload)
      .expect(401);

    await request(app)
      .post(`/api/payment/cod/${paymentOrderId}/confirm-collection`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(409);
    expect({
      payment: await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]),
      order: await db.get('SELECT status FROM orders WHERE id = ?', [orderId]),
    }).toEqual({ payment: { status: 'processing' }, order: { status: 'pending' } });

    await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shipped', trackingNumber: 'SF-COD-0001' })
      .expect(200);
    await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('COD_COLLECTION_CONFIRMATION_REQUIRED');
      });

    const confirmed = await request(app)
      .post(`/api/payment/cod/${paymentOrderId}/confirm-collection`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);
    const retry = await request(app)
      .post(`/api/payment/cod/${paymentOrderId}/confirm-collection`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(200);

    const payment = await db.get(
      'SELECT status, trade_no, payer_info, paid_at FROM payment_orders WHERE id = ?',
      [paymentOrderId]
    );
    expect({
      confirmed: confirmed.body.data,
      retry: retry.body.data,
      payment: { ...payment, payer_info: JSON.parse(payment.payer_info) },
      order: await db.get('SELECT status FROM orders WHERE id = ?', [orderId]),
      stock: await db.get('SELECT stock FROM bearings WHERE id = ?', [1]),
      history: await db.all(
        'SELECT old_status, new_status FROM order_status_history WHERE order_id = ? ORDER BY id',
        [orderId]
      ),
    }).toEqual({
      confirmed: expect.objectContaining({
        paymentOrderId,
        orderId,
        status: 'paid',
        orderStatus: 'completed',
        idempotent: false,
      }),
      retry: expect.objectContaining({ idempotent: true }),
      payment: {
        status: 'paid',
        trade_no: payload.externalReference,
        payer_info: expect.objectContaining({
          confirmation: 'admin',
          evidence: payload.evidence,
        }),
        paid_at: expect.any(String),
      },
      order: { status: 'completed' },
      stock: { stock: stockBefore - 2 },
      history: [
        { old_status: 'pending', new_status: 'shipped' },
        { old_status: 'shipped', new_status: 'completed' },
      ],
    });

    await request(app)
      .post(`/api/payment/cod/${paymentOrderId}/confirm-collection`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, externalReference: 'COD-DIFFERENT-REFERENCE' })
      .expect(409);
  });

  it('rolls back payment collection when the order lifecycle update fails', async () => {
    const { orderId, paymentOrderId } = await createCodOrder();
    await orderService.updateStatus(orderId, 'shipped', 'ship COD order', 'SF-COD-ROLLBACK');
    const failingOrderService = {
      updateOrderStatusInTransaction: async () => {
        throw new Error('simulated order completion failure');
      },
      finalizeOrderStatusUpdate: () => {},
    };
    const failingPaymentService = new PaymentOrchestrator(db, failingOrderService);

    await expect(failingPaymentService.confirmCodCollection({
      paymentOrderId,
      adminId: 1,
      evidence: 'Collection evidence exists but order completion is forced to fail.',
      externalReference: 'COD-ROLLBACK-001',
    })).rejects.toMatchObject({ code: 'COD_COLLECTION_CONFLICT' });
    expect({
      payment: await db.get('SELECT status, trade_no FROM payment_orders WHERE id = ?', [paymentOrderId]),
      order: await db.get('SELECT status FROM orders WHERE id = ?', [orderId]),
    }).toEqual({
      payment: { status: 'processing', trade_no: null },
      order: { status: 'shipped' },
    });
  });
});
