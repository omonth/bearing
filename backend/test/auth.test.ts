import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');

let app: any;
let db: any;

beforeAll(async () => {
  db = await createTestDb();
  await seedTestData(db);
  const authService = new AuthService(db);
  app = createApp(db, { authService });
});

afterAll(async () => {
  await db.close();
});

describe('Auth API', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
  });

  it('should reject invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('用户名或密码错误');
  });

  it('should reject nonexistent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'password' });
    expect(res.status).toBe(401);
  });

  it('should reject empty username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '', password: 'admin123' });
    expect(res.status).toBe(400);
  });

  it('should return current user with valid token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
  });

  it('should reject /me without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should change password', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ oldPassword: 'admin123', newPassword: 'newpass123' });
    expect(res.status).toBe(200);

    // Verify old password no longer works
    const oldRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(oldRes.status).toBe(401);

    // New password works
    const newRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'newpass123' });
    expect(newRes.status).toBe(200);
  });

  it('should reject admin endpoint with invalid token', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer invalid-token-here');
    expect(res.status).toBe(401);
  });

  it('should reject admin endpoint with invalid token', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer invalid-garbled-token');
    expect(res.status).toBe(401);
  });
});
