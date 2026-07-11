import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');
const BearingService = require('../services/bearingService');

let app: any;
let db: any;
let adminToken: string;

beforeAll(async () => {
  db = await createTestDb();
  await seedTestData(db);
  const authService = new AuthService(db);
  const bearingService = new BearingService(db, () => {});
  app = createApp(db, { authService, bearingService });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = res.body.data.token;
});

afterAll(async () => {
  await db.close();
});

describe('Admin Products API', () => {
  it('should create a new product', async () => {
    const res = await request(app)
      .post('/api/bearings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '测试轴承', model: 'TEST1', price: 99.99, category: '测试分类', stock: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeGreaterThan(0);
  });

  it('should update a product', async () => {
    const res = await request(app)
      .put('/api/bearings/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 19.99, stock: 200 });
    expect(res.status).toBe(200);

    const bearing = await db.get('SELECT price, stock FROM bearings WHERE id = ?', [1]);
    expect(bearing.price).toBe(19.99);
    expect(bearing.stock).toBe(200);
  });

  it('should delete a product', async () => {
    const res = await request(app)
      .delete('/api/bearings/2')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const bearing = await db.get('SELECT id FROM bearings WHERE id = ?', [2]);
    expect(bearing).toBeNull();
  });

  it('should reject create without auth', async () => {
    const res = await request(app)
      .post('/api/bearings')
      .send({ name: 'x', model: 'y', price: 1, category: 'z', stock: 1 });
    expect(res.status).toBe(401);
  });

  it('should reject update without auth', async () => {
    const res = await request(app)
      .put('/api/bearings/1')
      .send({ price: 1 });
    expect(res.status).toBe(401);
  });

  it('should reject delete without auth', async () => {
    const res = await request(app).delete('/api/bearings/1');
    expect(res.status).toBe(401);
  });

  it('should reject create with invalid fields', async () => {
    const res = await request(app)
      .post('/api/bearings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '', model: '', price: -5, category: '', stock: -1 });
    expect(res.status).toBe(400);
  });
});
