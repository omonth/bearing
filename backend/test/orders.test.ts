import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');
const OrderService = require('../services/orderService');

let app: any;
let db: any;
let authToken: string;

beforeAll(async () => {
  db = await createTestDb();
  await seedTestData(db);
  const authService = new AuthService(db);
  const orderService = new OrderService(db);
  app = createApp(db, { authService, orderService });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  authToken = res.body.token;
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
    expect(res.body.orderId).toBeDefined();
    expect(res.body.message).toBe('订单创建成功');

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
    expect(res.status).toBe(400);
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
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((o: any) => o.customer_name === '测试')).toBe(true);
  });

  it('should reject order list without auth', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('should update order status', async () => {
    const res = await request(app)
      .put('/api/orders/1/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'paid' });
    expect(res.status).toBe(200);
    expect(res.body.newStatus).toBe('paid');

    // Verify order status changed
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [1]);
    expect(order.status).toBe('paid');
  });

  it('should get order items', async () => {
    const res = await request(app)
      .get('/api/orders/1/items')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].bearing_id).toBeDefined();
  });

  it('should get order status history', async () => {
    const res = await request(app)
      .get('/api/orders/1/history')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].new_status).toBe('paid');
  });

  it('should reject deletion of paid order', async () => {
    const res = await request(app)
      .delete('/api/orders/1')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it('should delete a pending order and restore stock', async () => {
    // Create a new pending order
    const createRes = await request(app).post('/api/orders').send({
      customerName: '待删',
      customerPhone: '13400134000',
      province: '福建省',
      city: '福州市',
      district: '鼓楼区',
      addressDetail: '五四路',
      items: [{ id: 2, quantity: 3 }],
    });
    const orderId = createRes.body.orderId;

    // Check stock before delete
    const beforeBearing = await db.get('SELECT stock FROM bearings WHERE id = ?', [2]);
    const stockBefore = beforeBearing.stock;

    const res = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.restoredStock).toBe(true);

    // Verify stock restored
    const afterBearing = await db.get('SELECT stock FROM bearings WHERE id = ?', [2]);
    expect(afterBearing.stock).toBe(stockBefore + 3);
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
      .send({ orderIds: [a.body.orderId, b.body.orderId], status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  it('should reject batch status with nonexistent order (rollback)', async () => {
    const a = await request(app).post('/api/orders').send({
      customerName: '回滚测试', customerPhone: '13900000003', province: '广州', city: '广州', district: '天河', addressDetail: '体育西', items: [{ id: 1, quantity: 1 }],
    });

    const res = await request(app)
      .put('/api/orders/batch/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ orderIds: [a.body.orderId, 99999], status: 'shipped' });
    expect(res.status).toBe(404);

    // Verify first order NOT updated (rollback)
    const o = await db.get('SELECT status FROM orders WHERE id = ?', [a.body.orderId]);
    expect(o.status).toBe('pending');
  });
});
