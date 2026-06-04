import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');
const CustomerSelfService = require('../services/customerSelfService');
const CustomerService = require('../services/customerService');
const CouponService = require('../services/couponService');
const OrderService = require('../services/orderService');
const PointsService = require('../services/pointsService');

let app: any;
let db: any;

async function setupCustomerTables(d: any) {
  await d.run(`
    CREATE TABLE IF NOT EXISTS customers (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await d.run(`
    CREATE TABLE IF NOT EXISTS coupons (
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

  await d.run(`
    CREATE TABLE IF NOT EXISTS customer_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      coupon_id INTEGER NOT NULL,
      status TEXT DEFAULT 'unused',
      used_order_id INTEGER,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await d.run(`
    CREATE TABLE IF NOT EXISTS customer_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      min_points INTEGER NOT NULL,
      discount_rate REAL DEFAULT 0,
      perks TEXT,
      color TEXT
    )
  `);

  await d.run(`
    CREATE TABLE IF NOT EXISTS points_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await d.run(`
    CREATE TABLE IF NOT EXISTS customer_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      operator TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await d.run(`
    CREATE TABLE IF NOT EXISTS customer_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_id INTEGER,
      rating INTEGER,
      content TEXT,
      reply TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      replied_at DATETIME
    )
  `);
}

async function seedCustomerData(d: any) {
  const hashed = await bcrypt.hash('test123', 10);
  await d.run(
    'INSERT INTO customers (name, phone, password, level, points) VALUES (?, ?, ?, ?, ?)',
    ['测试顾客', '13800000001', hashed, 'gold', 3000]
  );
  await d.run(
    'INSERT INTO customers (name, phone, password, level, points) VALUES (?, ?, ?, ?, ?)',
    ['李四', '13800000002', hashed, 'bronze', 100]
  );

  await d.run(
    "INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['SAVE10', '满100减10', 'fixed', 10, 100, 100, '2026-01-01', '2027-12-31', 'active']
  );
  await d.run(
    "INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['PCT5', '5%折扣券', 'percentage', 5, 0, 50, '2026-01-01', '2027-12-31', 'active']
  );
  await d.run(
    "INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['EXPIRED', '已过期券', 'fixed', 20, 0, 100, '2025-01-01', '2025-12-31', 'active']
  );

  // Issue coupon SAVE10 to customer 1
  await d.run('INSERT INTO customer_coupons (customer_id, coupon_id, status) VALUES (?, ?, ?)', [1, 1, 'unused']);
  // Issue coupon PCT5 to customer 1
  await d.run('INSERT INTO customer_coupons (customer_id, coupon_id, status) VALUES (?, ?, ?)', [1, 2, 'unused']);
  // Issue coupon EXPIRED to customer 1
  await d.run('INSERT INTO customer_coupons (customer_id, coupon_id, status) VALUES (?, ?, ?)', [1, 3, 'unused']);

  await d.run(
    "INSERT INTO customer_levels (level, name, min_points) VALUES (?, ?, ?)",
    ['bronze', '青铜会员', 0]
  );
  await d.run(
    "INSERT INTO customer_levels (level, name, min_points) VALUES (?, ?, ?)",
    ['silver', '白银会员', 1000]
  );
  await d.run(
    "INSERT INTO customer_levels (level, name, min_points) VALUES (?, ?, ?)",
    ['gold', '黄金会员', 3000]
  );

  // Create an order for customer 1
  await d.run(
    'INSERT INTO orders (customer_name, customer_phone, province, city, address_detail, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['测试顾客', '13800000001', '广东', '深圳', '科技园路1号', 200, 'paid']
  );
}

beforeAll(async () => {
  db = await createTestDb();
  await seedTestData(db);
  await setupCustomerTables(db);
  await seedCustomerData(db);

  const authService = new AuthService(db);
  const customerService = new CustomerService(db);
  const couponService = new CouponService(db);
  const orderService = new OrderService(db);
  const pointsService = new PointsService(db);
  const customerSelfService = new CustomerSelfService({
    db,
    customerService,
    couponService,
    orderService,
  });

  app = createApp(db, { authService, customerService, customerSelfService, couponService, pointsService });
});

afterAll(async () => {
  await db.close();
});

describe('Customer Auth API', () => {
  describe('POST /api/customer/register', () => {
    it('should register a new customer', async () => {
      const res = await request(app)
        .post('/api/customer/register')
        .send({ name: '新顾客', phone: '13900000001', password: 'mypass123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.phone).toBe('13900000001');
      expect(res.body.user.level).toBe('bronze');
    });

    it('should reject duplicate phone', async () => {
      const res = await request(app)
        .post('/api/customer/register')
        .send({ name: '重复', phone: '13800000001', password: 'test123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('已注册');
    });

    it('should reject missing phone or password', async () => {
      const res = await request(app)
        .post('/api/customer/register')
        .send({ phone: '13900000002' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/customer/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.phone).toBe('13800000001');
      expect(res.body.user.level).toBe('gold');
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'wrong' });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('密码');
    });

    it('should reject unregistered phone', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ phone: '19900000000', password: 'test123' });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('未注册');
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/customer/me', () => {
    it('should return customer info with valid token', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .get('/api/customer/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe('13800000001');
      expect(res.body.level).toBe('gold');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/customer/me');
      expect(res.status).toBe(401);
    });

    it('should reject admin token for customer endpoint', async () => {
      const adminLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const res = await request(app)
        .get('/api/customer/me')
        .set('Authorization', `Bearer ${adminLoginRes.body.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/customer/orders', () => {
    it('should return only own orders', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .get('/api/customer/orders')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].customer_phone).toBe('13800000001');
    });

    it('should require customer role', async () => {
      const adminLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'admin123' });

      const res = await request(app)
        .get('/api/customer/orders')
        .set('Authorization', `Bearer ${adminLoginRes.body.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/customer/orders/:id', () => {
    it('should return order detail with items', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .get('/api/customer/orders/1')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(res.body.items).toBeDefined();
    });

    it('should return 404 for other customer order', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000002', password: 'test123' });

      const res = await request(app)
        .get('/api/customer/orders/1')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/customer/coupons', () => {
    it('should return available coupons', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .get('/api/customer/coupons')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/customer/coupons/use', () => {
    it('should use a valid coupon', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .post('/api/customer/coupons/use')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({ code: 'SAVE10', orderId: 1 });
      expect(res.status).toBe(200);
      expect(res.body.discountAmount).toBe(10);
    });

    it('should reject expired coupon', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .post('/api/customer/coupons/use')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({ code: 'EXPIRED', orderId: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('过期');
    });

    it('should reject missing code or orderId', async () => {
      const loginRes = await request(app)
        .post('/api/customer/login')
        .send({ phone: '13800000001', password: 'test123' });

      const res = await request(app)
        .post('/api/customer/coupons/use')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({ code: 'SAVE10' });
      expect(res.status).toBe(400);
    });
  });
});
