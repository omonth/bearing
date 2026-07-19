import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const CustomerSelfService = require('../services/customerSelfService');
const OrderService = require('../services/orderService');
const {
  generateCustomerToken,
  generateToken,
} = require('../middleware/auth');

const CHECKOUT_PAYLOAD = {
  customerName: 'Checkout customer',
  customerPhone: '13900000009',
  province: 'Guangdong',
  city: 'Shenzhen',
  district: 'Nanshan',
  addressDetail: 'Verification Gate Road 1',
  items: [{ id: 1, quantity: 1 }],
};

describe('verified customer phone authorization gate', () => {
  let app: any;
  let db: any;
  let unverifiedToken: string;
  let verifiedToken: string;
  let adminToken: string;
  let paymentService: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
    await db.run(`
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        company TEXT,
        level TEXT DEFAULT 'bronze',
        points INTEGER DEFAULT 0,
        total_spent REAL DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        phone_verified_at BIGINT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const passwordHash = await bcrypt.hash('customer-pass-123', 10);
    await db.run(
      `INSERT INTO customers
        (name, phone, password, phone_verified_at)
       VALUES (?, ?, ?, ?)`,
      ['Unverified Customer', '13800000001', passwordHash, null]
    );
    await db.run(
      `INSERT INTO customers
        (name, phone, password, phone_verified_at)
       VALUES (?, ?, ?, ?)`,
      ['Verified Customer', '13800000002', passwordHash, 2_000_000_000]
    );
    await db.run(
      `INSERT INTO orders
        (customer_name, customer_phone, province, city, district, address_detail,
         total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Unverified Customer',
        '13800000001',
        'Guangdong',
        'Shenzhen',
        'Nanshan',
        'Owned Order Road 1',
        15,
        'pending',
      ]
    );

    unverifiedToken = generateCustomerToken(1, 'Unverified Customer', passwordHash);
    verifiedToken = generateCustomerToken(2, 'Verified Customer', passwordHash);
    adminToken = generateToken(1, 'admin', 'admin');

    const orderService = new OrderService(db);
    const customerSelfService = new CustomerSelfService({ db, orderService });
    paymentService = {
      createPayment: vi.fn().mockResolvedValue({
        paymentOrderId: 10,
        paymentMethod: 'balance',
        amount: 15,
      }),
      queryPaymentStatus: vi.fn().mockResolvedValue({
        status: 'pending',
        paymentMethod: 'balance',
        amount: 15,
        paidAt: null,
      }),
      queryExternalStatus: vi.fn().mockResolvedValue({ status: 'pending' }),
    };
    app = createApp(db, { orderService, customerSelfService, paymentService });
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps the unverified session restricted while allowing profile access', async () => {
    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .expect(200);

    const responses = await Promise.all([
      request(app)
        .get('/api/customer/orders')
        .set('Authorization', `Bearer ${unverifiedToken}`),
      request(app)
        .get('/api/customer/addresses')
        .set('Authorization', `Bearer ${unverifiedToken}`),
      request(app)
        .get('/api/customer/coupons')
        .set('Authorization', `Bearer ${unverifiedToken}`),
    ]);
    const expectedDenial = {
      status: 403,
      body: {
        error: '请先完成手机号验证',
        code: 'PHONE_VERIFICATION_REQUIRED',
      },
    };

    expect(responses.map(({ status, body }) => ({ status, body }))).toEqual([
      expectedDenial,
      expectedDenial,
      expectedDenial,
    ]);

    const verified = await request(app)
      .get('/api/customer/orders')
      .set('Authorization', `Bearer ${verifiedToken}`)
      .expect(200);
    expect(verified.body.data).toEqual([]);

    await request(app)
      .get('/api/customer/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('rejects an authenticated unverified checkout but preserves guest and admin checkout', async () => {
    const unverified = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${unverifiedToken}`)
      .send(CHECKOUT_PAYLOAD)
      .expect(403);
    const guest = await request(app)
      .post('/api/orders')
      .send(CHECKOUT_PAYLOAD)
      .expect(200);
    const verified = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${verifiedToken}`)
      .send(CHECKOUT_PAYLOAD)
      .expect(200);
    const admin = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...CHECKOUT_PAYLOAD, customerPhone: '13900000008' })
      .expect(200);

    expect({
      unverified: unverified.body,
      guest: guest.body.data.orderId,
      verified: await db.get(
        'SELECT customer_phone FROM orders WHERE id = ?',
        [verified.body.data.orderId]
      ),
      admin: admin.body.data.orderId,
    }).toEqual({
      unverified: {
        error: '请先完成手机号验证',
        code: 'PHONE_VERIFICATION_REQUIRED',
      },
      guest: expect.any(Number),
      verified: { customer_phone: '13800000002' },
      admin: expect.any(Number),
    });
  });

  it('applies the same gate to payment checkout, status, and external status', async () => {
    const guestOrder = await request(app)
      .post('/api/orders')
      .send(CHECKOUT_PAYLOAD)
      .expect(200);
    const accessToken = guestOrder.body.data.orderAccessToken;
    const paymentPayload = {
      orderId: guestOrder.body.data.orderId,
      paymentMethod: 'balance',
    };

    const deniedRequests = await Promise.all([
      request(app)
        .post('/api/payment/checkout')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .send(paymentPayload),
      request(app)
        .get('/api/payment/status/10')
        .set('Authorization', `Bearer ${unverifiedToken}`),
      request(app)
        .get('/api/payment/external-status/10')
        .set('Authorization', `Bearer ${unverifiedToken}`),
    ]);
    expect(deniedRequests.map(({ status, body }) => ({ status, body }))).toEqual(
      Array.from({ length: 3 }, () => ({
        status: 403,
        body: {
          error: '请先完成手机号验证',
          code: 'PHONE_VERIFICATION_REQUIRED',
        },
      }))
    );

    await request(app)
      .post('/api/payment/checkout')
      .set('x-order-access-token', accessToken)
      .send(paymentPayload)
      .expect(200);
    await request(app)
      .get('/api/payment/status/10')
      .set('x-order-access-token', accessToken)
      .expect(200);
    await request(app)
      .post('/api/payment/checkout')
      .set('Authorization', `Bearer ${verifiedToken}`)
      .send(paymentPayload)
      .expect(200);
    await request(app)
      .get('/api/payment/external-status/10')
      .set('Authorization', `Bearer ${verifiedToken}`)
      .expect(200);
    await request(app)
      .get('/api/payment/external-status/10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect({
      createPaymentCalls: paymentService.createPayment.mock.calls.length,
      statusCalls: paymentService.queryPaymentStatus.mock.calls.length,
      externalStatusCalls: paymentService.queryExternalStatus.mock.calls.length,
    }).toEqual({
      createPaymentCalls: 2,
      statusCalls: 1,
      externalStatusCalls: 2,
    });
  });
});
