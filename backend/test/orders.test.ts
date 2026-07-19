import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');
const OrderService = require('../services/orderService');

let app: any;
let db: any;
let authToken: string;
let orderService: any;

async function createApiOrder(phone: string, quantity = 1) {
  const response = await orderService.createOrder({
    customerName: `订单-${phone}`,
    customerPhone: phone,
    province: '广东省',
    city: '深圳市',
    district: '南山区',
    addressDetail: '测试路 1 号',
    items: [{ id: 1, quantity }],
  });
  return response.orderId;
}

beforeAll(async () => {
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const authService = new AuthService(db);
  orderService = new OrderService(db);
  app = createApp(db, { authService, orderService });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  authToken = res.body.data.token;
});

afterAll(async () => {
  await db.close();
});

describe('Orders API', () => {
  it('should create an order and decrement stock', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerName: '张三',
        customerPhone: '13800138000',
        province: '广东省',
        city: '广州市',
        district: '天河区',
        addressDetail: '体育西路100号',
        items: [{ id: 1, quantity: 2 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBeDefined();
    expect(res.body.data.message).toBe('订单创建成功');

    // Verify stock decremented
    const bearing = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);
    expect(bearing.stock).toBe(98);
  });

  it('should reject order with insufficient stock', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerName: '李四',
        customerPhone: '13900139000',
        province: '北京市',
        city: '东城区',
        district: '东城区',
        addressDetail: '王府井大街1号',
        items: [{ id: 1, quantity: 999 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('库存不足');
  });

  it('should reject order with nonexistent product', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerName: '王五',
        customerPhone: '13700137000',
        province: '上海市',
        city: '徐汇区',
        district: '测试区',
        addressDetail: '淮海中路200号',
        items: [{ id: 999, quantity: 1 }],
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('不存在');
  });

  it('should reject order with invalid phone', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerName: '赵六',
        customerPhone: '12345',
        province: '浙江省',
        city: '杭州市',
        district: '测试区',
        addressDetail: '西湖区',
        items: [{ id: 1, quantity: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it('should reject order with empty items', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        customerName: '钱七',
        customerPhone: '13600136000',
        province: '江苏省',
        city: '南京市',
        district: '测试区',
        addressDetail: '新街口',
        items: [],
      });
    expect(res.status).toBe(400);
  });

  it('should list orders (admin only)', async () => {
    // Create an order first
    await request(app).post('/api/orders').send({
      customerName: '测试',
      customerPhone: '13500135000',
      province: '湖北省',
      city: '武汉市',
      district: '测试区',
      addressDetail: '光谷',
      items: [{ id: 1, quantity: 1 }],
    });

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((o: any) => o.customer_name === '测试')).toBe(true);
  });

  it('should reject order list without auth', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('should reject an admin paid transition and leave settlement to the payment transaction', async () => {
    const res = await request(app)
      .put('/api/orders/1/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'paid' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_SETTLEMENT_REQUIRED');

    const order = await db.get('SELECT status FROM orders WHERE id = ?', [1]);
    expect(order.status).toBe('pending');

    await db.transaction((transaction: any) => orderService.updateOrderStatusInTransaction({
      transaction,
      orderId: 1,
      status: 'paid',
      note: '支付结算测试',
    }));
    await expect(db.get('SELECT status FROM orders WHERE id = ?', [1]))
      .resolves.toEqual({ status: 'paid' });
  });

  it('should reject shipping without a valid tracking number', async () => {
    const res = await request(app)
      .put('/api/orders/1/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'shipped' });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'trackingNumber' }),
    ]));
    await expect(db.get('SELECT status, tracking_number FROM orders WHERE id = ?', [1]))
      .resolves.toEqual({ status: 'paid', tracking_number: null });
  });

  it('should get order items', async () => {
    const res = await request(app)
      .get('/api/orders/1/items')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].bearing_id).toBeDefined();
  });

  it('should get order status history', async () => {
    const res = await request(app)
      .get('/api/orders/1/history')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].new_status).toBe('paid');
  });

  it('should reject hard deletion of a paid order', async () => {
    const res = await request(app)
      .delete('/api/orders/1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_HARD_DELETE_DISABLED');
    await expect(db.get('SELECT status FROM orders WHERE id = ?', [1]))
      .resolves.toEqual({ status: 'paid' });
  });

  it('should reject hard deletion of a pending order without changing stock or items', async () => {
    const createRes = await request(app).post('/api/orders').send({
      customerName: '待删',
      customerPhone: '13400134000',
      province: '福建省',
      city: '福州市',
      district: '鼓楼区',
      addressDetail: '五四路',
      items: [{ id: 2, quantity: 3 }],
    });
    const orderId = createRes.body.data.orderId;
    const before = {
      stock: await db.get('SELECT stock FROM bearings WHERE id = ?', [2]),
      order: await db.get('SELECT id, status FROM orders WHERE id = ?', [orderId]),
      items: await db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]),
    };

    const res = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: 'ORDER_HARD_DELETE_DISABLED',
      error: expect.stringContaining('取消或归档'),
    });
    expect({
      stock: await db.get('SELECT stock FROM bearings WHERE id = ?', [2]),
      order: await db.get('SELECT id, status FROM orders WHERE id = ?', [orderId]),
      items: await db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]),
    }).toEqual(before);
  });

  it('should reject batch hard deletion atomically while a payment is processing', async () => {
    const safeOrderId = await createApiOrder('13750000001');
    const processingOrderId = await createApiOrder('13750000002');
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [processingOrderId, 'wechat', 15, 'processing', `API-DELETE-${processingOrderId}`]
    );
    const before = {
      safe: await db.get('SELECT id, status FROM orders WHERE id = ?', [safeOrderId]),
      processing: await db.get('SELECT id, status FROM orders WHERE id = ?', [processingOrderId]),
      payment: await db.get('SELECT status FROM payment_orders WHERE order_id = ?', [processingOrderId]),
    };

    const res = await request(app)
      .delete('/api/orders/batch')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ orderIds: [safeOrderId, processingOrderId] });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_HARD_DELETE_DISABLED');
    expect({
      safe: await db.get('SELECT id, status FROM orders WHERE id = ?', [safeOrderId]),
      processing: await db.get('SELECT id, status FROM orders WHERE id = ?', [processingOrderId]),
      payment: await db.get('SELECT status FROM payment_orders WHERE order_id = ?', [processingOrderId]),
    }).toEqual(before);
  });

  it('should export orders to Excel through the orders route', async () => {
    const res = await request(app)
      .get('/api/orders/export/excel')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers['content-disposition']).toContain('orders-');
  });

  it('should export one order to PDF through the orders route', async () => {
    const res = await request(app)
      .get('/api/orders/1/export/pdf')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('order-1');
  });

  // ==================== Batch operations ====================

  it('should batch update order status', async () => {
    const a = await request(app).post('/api/orders').send({
      customerName: '批量A', customerPhone: '13900000001', province: '北京', city: '北京', district: '东城', addressDetail: '测试路', items: [{ id: 1, quantity: 1 }],
    });
    const b = await request(app).post('/api/orders').send({
      customerName: '批量B', customerPhone: '13900000002', province: '上海', city: '上海', district: '静安', addressDetail: '测试路', items: [{ id: 1, quantity: 1 }],
    });

    const res = await request(app)
      .put('/api/orders/batch/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ orderIds: [a.body.data.orderId, b.body.data.orderId], status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
  });

  it('should reject an admin batch paid transition', async () => {
    const orderId = await createApiOrder('13710000001');
    const res = await request(app)
      .put('/api/orders/batch/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ orderIds: [orderId], status: 'paid' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_SETTLEMENT_REQUIRED');
    await expect(db.get('SELECT status FROM orders WHERE id = ?', [orderId]))
      .resolves.toEqual({ status: 'pending' });
  });

  it.each([
    ['pending', 'alipay'],
    ['processing', 'wechat'],
  ])('should reject admin cancellation while an external payment is %s', async (status, method) => {
    const orderId = await createApiOrder(`1372000000${status === 'pending' ? 1 : 2}`, 2);
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, method, 30, status, `API-EXTERNAL-${orderId}`]
    );
    const stockBefore = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);

    const res = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_CLOSE_REQUIRED');
    expect({
      order: await db.get('SELECT status FROM orders WHERE id = ?', [orderId]),
      payment: await db.get('SELECT status FROM payment_orders WHERE order_id = ?', [orderId]),
      stock: await db.get('SELECT stock FROM bearings WHERE id = ?', [1]),
    }).toEqual({
      order: { status: 'pending' },
      payment: { status },
      stock: stockBefore,
    });
  });

  it('should transactionally cancel a local payment and make retries idempotent', async () => {
    const orderId = await createApiOrder('13730000001', 2);
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, 'cod', 30, 'processing', `API-LOCAL-${orderId}`]
    );
    const stockBefore = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);

    const first = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'cancelled', note: '管理员取消' })
      .expect(200);
    const stockAfterFirst = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);
    const second = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'cancelled', note: '管理员重试' })
      .expect(200);

    expect({
      first: first.body.data.idempotent,
      second: second.body.data.idempotent,
      order: await db.get('SELECT status FROM orders WHERE id = ?', [orderId]),
      payment: await db.get('SELECT status FROM payment_orders WHERE order_id = ?', [orderId]),
      stockDelta: stockAfterFirst.stock - stockBefore.stock,
      stockAfterRetry: await db.get('SELECT stock FROM bearings WHERE id = ?', [1]),
    }).toEqual({
      first: false,
      second: true,
      order: { status: 'cancelled' },
      payment: { status: 'cancelled' },
      stockDelta: 2,
      stockAfterRetry: stockAfterFirst,
    });
  });

  it('should roll back a batch cancellation when one order needs provider close', async () => {
    const safeOrderId = await createApiOrder('13740000001');
    const externalOrderId = await createApiOrder('13740000002');
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [externalOrderId, 'unionpay', 15, 'pending', `API-BATCH-${externalOrderId}`]
    );
    const stockBefore = await db.get('SELECT stock FROM bearings WHERE id = ?', [1]);

    const res = await request(app)
      .put('/api/orders/batch/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ orderIds: [safeOrderId, externalOrderId], status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_CLOSE_REQUIRED');
    expect({
      safe: await db.get('SELECT status FROM orders WHERE id = ?', [safeOrderId]),
      external: await db.get('SELECT status FROM orders WHERE id = ?', [externalOrderId]),
      payment: await db.get('SELECT status FROM payment_orders WHERE order_id = ?', [externalOrderId]),
      stock: await db.get('SELECT stock FROM bearings WHERE id = ?', [1]),
    }).toEqual({
      safe: { status: 'pending' },
      external: { status: 'pending' },
      payment: { status: 'pending' },
      stock: stockBefore,
    });
  });

  it('should reject batch status with nonexistent order (rollback)', async () => {
    const a = await request(app).post('/api/orders').send({
      customerName: '回滚测试', customerPhone: '13900000003', province: '广州', city: '广州', district: '天河', addressDetail: '体育西', items: [{ id: 1, quantity: 1 }],
    });

    const res = await request(app)
      .put('/api/orders/batch/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ orderIds: [a.body.data.orderId, 99999], status: 'cancelled' });
    expect(res.status).toBe(404);

    // Verify first order NOT updated (rollback)
    const o = await db.get('SELECT status FROM orders WHERE id = ?', [a.body.data.orderId]);
    expect(o.status).toBe('pending');
  });
});
