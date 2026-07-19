import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const AuthService = require('../services/authService');
const CustomerSelfService = require('../services/customerSelfService');
const { JWT_SECRET } = require('../middleware/auth');
const { getCookieOptions } = require('../middleware/sessionCookies');

describe('browser session security', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('uses an HttpOnly strict cookie and revokes old administrator sessions immediately', async () => {
    const app = createApp(db, { authService: new AuthService(db) });
    const browser = request.agent(app);
    const login = await browser
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    const cookie = login.headers['set-cookie'][0];

    expect(cookie).toContain('admin_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    await browser.get('/api/auth/me').expect(200);

    await browser
      .post('/api/auth/change-password')
      .send({ oldPassword: 'admin123', newPassword: 'new-admin-password-123' })
      .expect(403, {
        error: '浏览器会话来源校验失败',
        code: 'CSRF_ORIGIN_REJECTED',
      });

    await browser
      .post('/api/auth/change-password')
      .set('Origin', 'http://localhost:3000')
      .send({ oldPassword: 'admin123', newPassword: 'new-admin-password-123' })
      .expect(200);

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .expect(401);
    await browser.get('/api/auth/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'new-admin-password-123' })
      .expect(200);
  });

  it('fails closed for historical administrator JWTs and rejects common passwords', async () => {
    const app = createApp(db, { authService: new AuthService(db) });
    const historicalToken = jwt.sign(
      { userId: 1, username: 'admin', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${historicalToken}`)
      .expect(401);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .send({ oldPassword: 'admin123', newPassword: 'password1234' })
      .expect(400);
  });

  it('sets and clears the customer HttpOnly session without exposing it to JavaScript', async () => {
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
    const passwordHash = await bcrypt.hash('customer-password-123', 10);
    await db.run(
      'INSERT INTO customers (name, phone, password) VALUES (?, ?, ?)',
      ['Cookie Customer', '13800000001', passwordHash]
    );
    const customerSelfService = new CustomerSelfService({ db });
    const app = createApp(db, { customerSelfService });
    const browser = request.agent(app);

    const login = await browser
      .post('/api/customer/login')
      .send({ phone: '13800000001', password: 'customer-password-123' })
      .expect(200);
    expect(login.headers['set-cookie'][0]).toContain('customer_session=');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Strict');
    await browser.get('/api/customer/me').expect(200);

    const logout = await browser
      .post('/api/customer/logout')
      .set('Origin', 'http://localhost:3000')
      .send({})
      .expect(200);
    expect(logout.headers['set-cookie'][0]).toMatch(/customer_session=;/);
    await browser.get('/api/customer/me').expect(401);
  });

  it('marks production session cookies Secure', () => {
    expect(getCookieOptions({ NODE_ENV: 'production' })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
  });
});
