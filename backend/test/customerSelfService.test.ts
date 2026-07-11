import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createTestDb, seedTestData } from './helpers';

const CouponService = require('../services/couponService');
const CustomerSelfService = require('../services/customerSelfService');
const CustomerService = require('../services/customerService');
const OrderService = require('../services/orderService');

async function setupCustomerTables(db: any) {
  await db.run(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT,
      level TEXT DEFAULT 'bronze',
      points INTEGER DEFAULT 0,
      tags TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0,
      total_quantity INTEGER DEFAULT 1000,
      used_quantity INTEGER DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE customer_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      coupon_id INTEGER NOT NULL,
      status TEXT DEFAULT 'unused',
      used_order_id INTEGER,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE customer_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      operator TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function seedCustomers(db: any) {
  const hashed = await bcrypt.hash('test123', 10);
  await db.run(
    'INSERT INTO customers (name, phone, password, level, points) VALUES (?, ?, ?, ?, ?)',
    ['Primary Customer', '13800000001', hashed, 'gold', 3000]
  );
  await db.run(
    'INSERT INTO customers (name, phone, password, level, points) VALUES (?, ?, ?, ?, ?)',
    ['Other Customer', '13800000002', hashed, 'bronze', 100]
  );

  await db.run(
    'INSERT INTO coupons (code, name, type, discount_value, min_order_amount, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['SAVE10', 'Save 10', 'fixed', 10, 100, '2026-01-01', '2027-12-31', 'active']
  );
  await db.run(
    'INSERT INTO coupons (code, name, type, discount_value, min_order_amount, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['USED', 'Used coupon', 'fixed', 5, 0, '2026-01-01', '2027-12-31', 'active']
  );
  await db.run('INSERT INTO customer_coupons (customer_id, coupon_id, status) VALUES (?, ?, ?)', [1, 1, 'unused']);
  await db.run('INSERT INTO customer_coupons (customer_id, coupon_id, status) VALUES (?, ?, ?)', [1, 2, 'used']);

  await db.run(
    'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['Primary Customer', '13800000001', 'Guangdong', 'Shenzhen', 'Nanshan', 'Tech Park', 200, 'paid']
  );
  await db.run(
    'INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)',
    [1, 1, 2, 15]
  );
  await db.run(
    'INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)',
    [1, 'pending', 'paid', 'paid in test']
  );
  await db.run(
    'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['Other Customer', '13800000002', 'Guangdong', 'Shenzhen', 'Nanshan', 'Other Road', 80, 'pending']
  );
}

describe('Customer self-service module', () => {
  let customerSelfService: any;
  let couponService: any;
  let orderService: any;

  beforeAll(async () => {
    const db = await createTestDb();
    await seedTestData(db);
    await setupCustomerTables(db);
    await seedCustomers(db);

    orderService = new OrderService(db);
    couponService = new CouponService(db);
    customerSelfService = new CustomerSelfService({
      db,
      customerService: new CustomerService(db),
      couponService,
      orderService,
    });
  });

  it('OrderService lists orders for one customer without exposing phone lookup to callers', async () => {
    const data = await orderService.listForCustomer(1);

    expect(data).toMatchObject([{ customer_phone: '13800000001' }]);
  });

  it('OrderService returns a customer-owned order with items and history', async () => {
    const data = await orderService.getForCustomer(1, 1);

    expect(data).toMatchObject({
      id: 1,
      customer_phone: '13800000001',
      items: [{ order_id: 1, bearing_id: 1, quantity: 2 }],
      statusHistory: [{ order_id: 1, new_status: 'paid' }],
    });
  });

  it('OrderService rejects a customer reading another customer order', async () => {
    await expect(orderService.getForCustomer(2, 1)).rejects.toThrow('订单不存在');
  });

  it('CouponService lists only unused active coupons for one customer', async () => {
    const data = await couponService.listForCustomer(1);

    expect(data).toMatchObject([{ code: 'SAVE10', status: 'unused' }]);
  });

  it('registers a customer and returns the same public shape as the route', async () => {
    const data = await customerSelfService.register({
      name: 'New Customer',
      phone: '13900000001',
      password: 'secret123',
    });

    expect(data).toMatchObject({
      token: expect.any(String),
      user: {
        id: expect.any(Number),
        phone: '13900000001',
        name: 'New Customer',
        level: 'bronze',
        points: 0,
      },
    });
  });

  it('logs in and reads Customer self-service data through deep modules', async () => {
    const login = await customerSelfService.login({
      phone: '13800000001',
      password: 'test123',
    });
    const orders = await customerSelfService.listOrders(login.user.id);
    const coupons = await customerSelfService.listCoupons(login.user.id);

    expect(login.user).toMatchObject({ phone: '13800000001', level: 'gold' });
    expect(orders).toMatchObject([{ customer_phone: '13800000001' }]);
    expect(coupons).toMatchObject([{ code: 'SAVE10' }]);
  });
});
