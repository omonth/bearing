import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const CustomerSelfService = require('../services/customerSelfService');
const CustomerService = require('../services/customerService');
const CustomerSecurityService = require('../services/customerSecurityService');
const {
  CaptureCustomerNotificationSender,
} = require('../services/customerNotificationSender');
const securityMigration = require('../migrations/202607190010_customer_security_self_service');
const verifiedPhoneGateMigration = require('../migrations/202607190030_verified_phone_authorization_gate');

let app: any;
let db: any;
let notifications: any;
let clockSeconds: number;

async function createCustomerTables(database: any) {
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.run(`
    CREATE TABLE customer_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.run(`
    CREATE TABLE customer_coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      coupon_id INTEGER NOT NULL,
      status TEXT DEFAULT 'unused',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await database.run(`
    CREATE TABLE coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      discount_value REAL NOT NULL
    )
  `);
}

async function login(phone = '13800000001', password = 'original123') {
  const response = await request(app)
    .post('/api/customer/login')
    .send({ phone, password })
    .expect(200);
  return response.body.data.token;
}

beforeEach(async () => {
  clockSeconds = 2_000_000_000;
  db = await createTestDb();
  await seedTestData(db);
  await createCustomerTables(db);
  await securityMigration.up({ db, dialect: 'sqlite' });
  await verifiedPhoneGateMigration.up({ db, dialect: 'sqlite' });

  const password = await bcrypt.hash('original123', 10);
  await db.run(
    `INSERT INTO customers (name, phone, password, email, tags, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Primary Customer',
      '13800000001',
      password,
      'old@example.com',
      '["internal-vip-tag"]',
      'Internal CRM note',
    ]
  );

  notifications = new CaptureCustomerNotificationSender();
  const securityService = new CustomerSecurityService({
    db,
    notificationSender: notifications,
    pepper: 'test-only-customer-security-pepper-with-32-bytes',
    now: () => clockSeconds,
    requestCooldownSeconds: 0,
    maxRequestsPerHour: 20,
  });
  const customerService = new CustomerService(db);
  const customerSelfService = new CustomerSelfService({
    db,
    customerService,
    securityService,
    orderService: {
      listForCustomer: async (customerId: number) => [{ id: 100, customerId }],
    },
  });
  app = createApp(db, {
    authService: new AuthService(db),
    customerService,
    customerSelfService,
  });
});

afterEach(async () => {
  await db.close();
});

describe('customer password recovery', () => {
  it('fails closed when production notification secrets are incomplete', () => {
    expect(() => new CustomerSecurityService({
      db,
      environment: { NODE_ENV: 'production' },
    })).toThrow('CUSTOMER_SECURITY_PEPPER');

    expect(() => new CustomerSecurityService({
      db,
      environment: {
        NODE_ENV: 'production',
        CUSTOMER_SECURITY_PEPPER: 'production-pepper-that-is-at-least-32-characters',
      },
    })).toThrow('CUSTOMER_NOTIFICATION_WEBHOOK_URL');

    expect(() => new CustomerSecurityService({
      db,
      environment: {
        NODE_ENV: 'production',
        CUSTOMER_SECURITY_PEPPER: 'production-pepper-that-is-at-least-32-characters',
        CUSTOMER_NOTIFICATION_WEBHOOK_URL: 'https://notifications.example.com/customer-security',
        CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN: 'notification-token-that-is-at-least-32-characters',
      },
    })).not.toThrow();
  });

  it('uses the same public response for known and unknown phones and stores only a hash', async () => {
    const known = await request(app)
      .post('/api/customer/password/forgot')
      .send({ phone: '13800000001' })
      .expect(202);
    const unknown = await request(app)
      .post('/api/customer/password/forgot')
      .send({ phone: '13900000009' })
      .expect(202);

    expect(known.body).toEqual(unknown.body);
    expect(notifications.messages).toHaveLength(1);
    expect(notifications.messages[0]).toMatchObject({
      kind: 'password_reset',
      destination: '13800000001',
      delivery: {
        path: '/login',
        credentialLocation: 'fragment',
        fragmentParameter: 'resetToken',
      },
    });

    const rows = await db.all(
      `SELECT customer_id, secret_hash, subject_key
       FROM customer_security_challenges
       WHERE purpose = ? ORDER BY id`,
      ['password_reset']
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].secret_hash).not.toContain(notifications.messages[0].secret);
    expect(JSON.stringify(rows)).not.toContain('13800000001');
  });

  it('does not expose account existence through notification gateway latency', async () => {
    const neverResolvingSender = { send: () => new Promise(() => {}) };
    const service = new CustomerSecurityService({
      db,
      notificationSender: neverResolvingSender,
      pepper: 'another-test-only-security-pepper-over-32-characters',
      now: () => clockSeconds,
      requestCooldownSeconds: 0,
    });

    const outcome = await Promise.race([
      service.requestPasswordReset({ phone: '13800000001' }).then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 100)),
    ]);

    expect(outcome).toBe('completed');
  });

  it('resets the password once and rejects replay or an expired token', async () => {
    const oldSessionToken = await login();
    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${oldSessionToken}`)
      .expect(200);

    await request(app)
      .post('/api/customer/password/forgot')
      .send({ phone: '13800000001' })
      .expect(202);
    const resetToken = notifications.messages[0].secret;

    await request(app)
      .post('/api/customer/password/reset')
      .send({ token: resetToken, newPassword: 'replacement123' })
      .expect(200);
    await request(app)
      .post('/api/customer/password/reset')
      .send({ token: resetToken, newPassword: 'replacement456' })
      .expect(400);

    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${oldSessionToken}`)
      .expect(401);

    const newLogin = await request(app)
      .post('/api/customer/login')
      .send({ phone: '13800000001', password: 'replacement123' })
      .expect(200);
    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${newLogin.body.data.token}`)
      .expect(200);

    const passwordRow = await db.get('SELECT password FROM customers WHERE id = ?', [1]);
    const decoded = jwt.decode(newLogin.body.data.token) as Record<string, unknown>;
    expect(decoded).toMatchObject({ userId: 1, role: 'customer', sessionProof: expect.any(String) });
    expect(JSON.stringify(decoded)).not.toContain(passwordRow.password);
    expect(decoded).not.toHaveProperty('password');
    expect(decoded).not.toHaveProperty('passwordHash');

    await request(app)
      .post('/api/customer/password/forgot')
      .send({ phone: '13800000001' })
      .expect(202);
    const expiredToken = notifications.messages.at(-1).secret;
    clockSeconds += 16 * 60;
    await request(app)
      .post('/api/customer/password/reset')
      .send({ token: expiredToken, newPassword: 'anotherpass123' })
      .expect(400);
  });
});

describe('customer and administrator authentication boundaries', () => {
  it('keeps administrator tokens valid and rejects them from customer-only endpoints', async () => {
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    const customerToken = await login();

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .expect(200);
    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .expect(403);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });
});

describe('customer registration security', () => {
  it('rejects weak passwords and malformed phone numbers', async () => {
    await request(app)
      .post('/api/customer/register')
      .send({ name: 'Weak Password', phone: '13900000001', password: '1234567' })
      .expect(400);
    await request(app)
      .post('/api/customer/register')
      .send({ name: 'Bad Phone', phone: 'not-a-phone', password: 'securepass123' })
      .expect(400);
  });
});

describe('customer phone verification', () => {
  it('accepts a one-time code and reports subsequent confirmation as idempotent', async () => {
    const token = await login();
    await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const restricted = await request(app)
      .get('/api/customer/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(restricted.body).toEqual({
      error: '请先完成手机号验证',
      code: 'PHONE_VERIFICATION_REQUIRED',
    });

    await request(app)
      .post('/api/customer/phone-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(202);
    const code = notifications.messages.at(-1).secret;

    const confirmed = await request(app)
      .post('/api/customer/phone-verification/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code })
      .expect(200);
    const repeated = await request(app)
      .post('/api/customer/phone-verification/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code })
      .expect(200);
    const allowed = await request(app)
      .get('/api/customer/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect({
      confirmed: confirmed.body.data,
      repeated: repeated.body.data,
      allowed: allowed.body.data,
      customer: await db.get('SELECT phone_verified_at FROM customers WHERE id = ?', [1]),
    }).toEqual({
      confirmed: expect.objectContaining({ verified: true, idempotent: false }),
      repeated: expect.objectContaining({ verified: true, idempotent: true }),
      allowed: [{ id: 100, customerId: 1 }],
      customer: { phone_verified_at: clockSeconds },
    });
  });

  it('locks a code after the configured attempts and rejects expired codes', async () => {
    const token = await login();
    await request(app)
      .post('/api/customer/phone-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(202);
    const firstCode = notifications.messages.at(-1).secret;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/customer/phone-verification/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' })
        .expect(400);
    }
    await request(app)
      .post('/api/customer/phone-verification/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: firstCode })
      .expect(400);

    clockSeconds += 61;
    await request(app)
      .post('/api/customer/phone-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(202);
    const secondCode = notifications.messages.at(-1).secret;
    clockSeconds += 11 * 60;
    await request(app)
      .post('/api/customer/phone-verification/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: secondCode })
      .expect(400);
  });
});

describe('customer profile update', () => {
  it('returns only the customer-facing profile projection', async () => {
    const token = await login();
    const response = await request(app)
      .get('/api/customer/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: 1,
      name: 'Primary Customer',
      phone: '13800000001',
      email: 'old@example.com',
    });
    expect(response.body.data).not.toHaveProperty('password');
    expect(response.body.data).not.toHaveProperty('notes');
    expect(response.body.data).not.toHaveProperty('tags');
    expect(response.body.data).not.toHaveProperty('recentInteractions');
    expect(response.body.data).not.toHaveProperty('recentOrders');
  });

  it('updates only validated public profile fields', async () => {
    const token = await login();
    const response = await request(app)
      .patch('/api/customer/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', email: 'new@example.com', company: 'ACME Bearings' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      name: 'Updated Name',
      email: 'new@example.com',
      company: 'ACME Bearings',
    });
    expect(response.body.data).not.toHaveProperty('password');
  });

  it('rejects privileged, unknown, and invalid fields', async () => {
    const token = await login();
    await request(app)
      .patch('/api/customer/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'vip' })
      .expect(400);
    await request(app)
      .patch('/api/customer/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
