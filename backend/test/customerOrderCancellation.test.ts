import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const CustomerSelfService = require('../services/customerSelfService');
const CustomerService = require('../services/customerService');
const OrderService = require('../services/orderService');

let app: any;
let db: any;
let token: string;

async function createTables(database: any) {
  await database.run(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT,
      email TEXT,
      company TEXT,
      address TEXT,
      level TEXT DEFAULT 'bronze',
      points INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      tags TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      phone_verified_at BIGINT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.run(`
    CREATE TABLE payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createPendingOrder(phone: string, quantity = 3) {
  await db.run('UPDATE bearings SET stock = stock - ? WHERE id = ?', [quantity, 1]);
  const order = await db.run(
    `INSERT INTO orders
      (customer_name, customer_phone, province, city, district, address_detail, total_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Customer', phone, 'Guangdong', 'Shenzhen', 'Nanshan', 'Road 1', 45, 'pending']
  );
  await db.run(
    'INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)',
    [order.lastID, 1, quantity, 15]
  );
  return order.lastID;
}

beforeEach(async () => {
  db = await createTestDb();
  await seedTestData(db);
  await createTables(db);
  const password = await bcrypt.hash('original123', 10);
  await db.run(
    'INSERT INTO customers (name, phone, password, phone_verified_at) VALUES (?, ?, ?, ?)',
    ['Primary Customer', '13800000001', password, 2_000_000_000]
  );
  await db.run(
    'INSERT INTO customers (name, phone, password, phone_verified_at) VALUES (?, ?, ?, ?)',
    ['Other Customer', '13800000002', password, 2_000_000_000]
  );

  const orderService = new OrderService(db);
  const customerService = new CustomerService(db);
  const customerSelfService = new CustomerSelfService({ db, customerService, orderService });
  app = createApp(db, {
    authService: new AuthService(db),
    customerService,
    customerSelfService,
    orderService,
  });
  const login = await request(app)
    .post('/api/customer/login')
    .send({ phone: '13800000001', password: 'original123' })
    .expect(200);
  token = login.body.data.token;
});

afterEach(async () => {
  await db.close();
});

describe('customer unpaid order cancellation', () => {
  it('does not authorize a matching phone until the customer has verified it', async () => {
    const orderId = await createPendingOrder('13800000001');
    await db.run('UPDATE customers SET phone_verified_at = NULL WHERE id = ?', [1]);

    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const responses = await Promise.all([
      request(app)
        .get('/api/customer/orders')
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .get(`/api/customer/orders/${orderId}`)
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .post(`/api/customer/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({}),
    ]);

    expect(responses.map(({ status, body }) => ({ status, body }))).toEqual([
      {
        status: 403,
        body: {
          error: '请先完成手机号验证',
          code: 'PHONE_VERIFICATION_REQUIRED',
        },
      },
      {
        status: 403,
        body: {
          error: '请先完成手机号验证',
          code: 'PHONE_VERIFICATION_REQUIRED',
        },
      },
      {
        status: 403,
        body: {
          error: '请先完成手机号验证',
          code: 'PHONE_VERIFICATION_REQUIRED',
        },
      },
    ]);
    await expect(db.get('SELECT status FROM orders WHERE id = ?', [orderId]))
      .resolves.toEqual({ status: 'pending' });
  });

  it('cancels an owned pending order transactionally and restores stock once', async () => {
    const orderId = await createPendingOrder('13800000001');
    const stockBeforeCancel = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);

    const first = await request(app)
      .post(`/api/customer/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    const second = await request(app)
      .post(`/api/customer/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const stockAfterCancel = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);
    const history = await db.all(
      'SELECT old_status, new_status FROM order_status_history WHERE order_id = ?',
      [orderId]
    );
    expect({
      first: first.body.data,
      second: second.body.data,
      order,
      stockDelta: stockAfterCancel.stock - stockBeforeCancel.stock,
      history,
    }).toEqual({
      first: { orderId, status: 'cancelled', idempotent: false },
      second: { orderId, status: 'cancelled', idempotent: true },
      order: { status: 'cancelled' },
      stockDelta: 3,
      history: [{ old_status: 'pending', new_status: 'cancelled' }],
    });
  });

  it('does not disclose or cancel another customer order', async () => {
    const orderId = await createPendingOrder('13800000002');
    await request(app)
      .post(`/api/customer/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(404);
    expect(await db.get('SELECT status FROM orders WHERE id = ?', [orderId]))
      .toEqual({ status: 'pending' });
  });

  it('closes a local pending payment in the same cancellation transaction', async () => {
    const orderId = await createPendingOrder('13800000001');
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, 'balance', 45, 'pending', 'LOCAL-BALANCE-PENDING']
    );

    await request(app)
      .post(`/api/customer/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);

    expect(await db.get(
      'SELECT status FROM payment_orders WHERE order_id = ?',
      [orderId]
    )).toEqual({ status: 'cancelled' });
  });

  it.each([
    ['processing', 'wechat', 'PAYMENT_IN_PROGRESS'],
    ['paid', 'alipay', 'PAYMENT_ALREADY_SETTLED'],
    ['pending', 'wechat', 'PAYMENT_CLOSE_REQUIRED'],
  ])('rejects %s %s payments without changing order or stock', async (status, method, code) => {
    const orderId = await createPendingOrder('13800000001');
    const stockBefore = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, method, 45, status, `PAY-${status}-${method}`]
    );

    const response = await request(app)
      .post(`/api/customer/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(409);

    expect(response.body.code).toBe(code);
    expect(await db.get('SELECT status FROM orders WHERE id = ?', [orderId]))
      .toEqual({ status: 'pending' });
    expect(await db.get('SELECT stock FROM bearings WHERE id = ?', [1]))
      .toEqual(stockBefore);
  });
});
