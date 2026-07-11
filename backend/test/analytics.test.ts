import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';
const createApp = require('../app');
const AuthService = require('../services/authService');
const Analytics = require('../utils/analytics');

let app: any;
let db: any;
let authToken: string;

beforeAll(async () => {
  db = await createTestDb();
  db.dateTrunc = (gran: string, col: string) => `date(${col})`;
  db.dateInterval = (offset: string) => `datetime('now', '${offset}')`;
  db.dateFormat = (_period: string, col: string) => `strftime('%Y-%m', ${col})`;
  await seedTestData(db);
  const authService = new AuthService(db);
  const analytics = new Analytics(db);
  app = createApp(db, { authService, analytics });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  authToken = res.body.data.token;
});

afterAll(async () => {
  await db.close();
});

describe('Analytics API', () => {
  it('should return dashboard summary', async () => {
    const res = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBeDefined();
    expect(res.body.revenue.total_orders).toBeDefined();
    expect(res.body.salesTrend).toBeDefined();
    expect(Array.isArray(res.body.salesTrend)).toBe(true);
    expect(Array.isArray(res.body.recentOrders)).toBe(true);
  });

  it('should reject dashboard without auth', async () => {
    const res = await request(app).get('/api/analytics/dashboard');
    expect(res.status).toBe(401);
  });
});
