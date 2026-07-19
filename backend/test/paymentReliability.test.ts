import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, seedTestData } from './helpers';

const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');

describe('payment provider uncertainty handling', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
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
        coupon_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        used_order_id INTEGER,
        used_at TEXT
      )
    `);
  });

  afterEach(async () => {
    await db.close();
  });

  it('keeps a payment reconcilable when the provider may have accepted a timed-out request', async () => {
    const order = await db.run(
      `INSERT INTO orders
        (customer_name, customer_phone, province, city, district, address_detail, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['timeout customer', '13800000000', 'Zhejiang', 'Hangzhou', 'Xihu', 'test address', 15, 'pending']
    );
    const paymentService = new PaymentOrchestrator(db, new OrderService(db));
    paymentService.providers.wechat = {
      createPayment: vi.fn().mockRejectedValue(new Error('provider timeout')),
    };

    await expect(paymentService.createPayment({
      orderId: order.lastID,
      paymentMethod: 'wechat',
      subject: 'bearing',
    })).rejects.toThrow('provider timeout');

    const payment = await db.get('SELECT id, status FROM payment_orders WHERE order_id = ?', [order.lastID]);
    const settlement = await paymentService.settlement.settlePaid(payment.id, {
      tradeNo: 'WX-LATE-SUCCESS',
      payer: {},
    });
    expect({ payment, settlement }).toEqual({
      payment: { id: payment.id, status: 'processing' },
      settlement: expect.objectContaining({ success: true, status: 'paid' }),
    });
  });

  it('locks PostgreSQL order then active payments before dispatching to a provider', async () => {
    const queries: string[] = [];
    const transaction = {
      get: vi.fn().mockImplementation(async (sql) => {
        queries.push(sql);
        if (sql.includes('FROM orders')) {
          return { id: 21, status: 'pending', total_price: 15 };
        }
        if (sql.includes('FROM payment_orders')) return null;
        if (sql.includes('FROM customer_coupons')) return null;
        return null;
      }),
      run: vi.fn().mockResolvedValue({ lastID: 22, changes: 1 }),
    };
    const postgresDb = {
      type: 'postgres',
      get: vi.fn().mockResolvedValue({ id: 21, status: 'pending', total_price: 15 }),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      transaction: vi.fn().mockImplementation(async (work) => work(transaction)),
    };
    const paymentService = new PaymentOrchestrator(postgresDb, {});
    paymentService.providers.wechat = {
      createPayment: vi.fn().mockResolvedValue({ codeUrl: 'weixin://test' }),
    };

    await paymentService.createPayment({
      orderId: 21,
      paymentMethod: 'wechat',
      subject: 'bearing',
    });

    const orderLockIndex = queries.findIndex((sql) => sql.includes('FROM orders'));
    const paymentLockIndex = queries.findIndex((sql) => sql.includes('FROM payment_orders'));
    expect(orderLockIndex).toBeGreaterThanOrEqual(0);
    expect(paymentLockIndex).toBeGreaterThan(orderLockIndex);
    expect(queries[orderLockIndex]).toContain('FOR UPDATE');
    expect(queries[paymentLockIndex]).toContain('FOR UPDATE');
  });
});
