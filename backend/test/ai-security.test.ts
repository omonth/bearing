import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestDb } from './helpers';

const createApp = require('../app');
const AIAuthService = require('../services/aiAuthService');
const AIService = require('../services/aiService');

const TEST_AI_JWT_SECRET = 'test-ai-jwt-secret-with-more-than-thirty-two-characters';

describe('AI management security', () => {
  let app: any;
  let db: any;
  let aiAuthService: any;
  let aiService: any;

  beforeEach(async () => {
    db = await createTestDb();
    aiAuthService = new AIAuthService(db, {
      jwtSecret: TEST_AI_JWT_SECRET,
      bootstrapUsername: 'ai-admin-test',
      bootstrapPassword: 'bootstrap-password-for-tests',
    });
    await aiAuthService.ready;

    aiService = {
      chat: vi.fn().mockResolvedValue({ message: '公开客服回复' }),
      ragEngine: { buildIndex: vi.fn().mockResolvedValue(undefined) },
      adminChat: vi.fn().mockResolvedValue({ message: '管理查询结果', type: 'result', data: [] }),
      predictDemand: vi.fn().mockResolvedValue({ productId: 1 }),
      predictAllDemand: vi.fn().mockResolvedValue([]),
      getSmartRecommendations: vi.fn().mockResolvedValue([]),
      forecastSales: vi.fn().mockResolvedValue({ forecast: [] }),
    };
    app = createApp(db, { aiAuthService, aiService });
  });

  afterEach(async () => {
    await db.close();
  });

  it('rejects unauthenticated AI management, forecast, and recommendation requests', async () => {
    await request(app).post('/api/ai/admin-chat').send({ message: '查询订单' }).expect(401);
    await request(app).post('/api/ai/reindex').expect(401);
    await request(app).get('/api/ai/predict-demand').expect(401);
    await request(app).get('/api/ai/recommendations').expect(401);
    await request(app).post('/api/ai/image-recognize').send({ description: '6200' }).expect(401);
    await request(app).get('/api/ai/forecast').expect(401);

    expect(aiService.adminChat).not.toHaveBeenCalled();
    expect(aiService.ragEngine.buildIndex).not.toHaveBeenCalled();
  });

  it('allows an AI viewer to read forecasts but not use administrator-only endpoints', async () => {
    const passwordHash = await bcrypt.hash('viewer-password-for-tests', 10);
    await db.run(
      'INSERT INTO ai_users (username, password_hash, role) VALUES (?, ?, ?)',
      ['ai-viewer-test', passwordHash, 'viewer']
    );
    const login = await aiAuthService.login('ai-viewer-test', 'viewer-password-for-tests');
    const token = login.data.token;

    await request(app)
      .get('/api/ai/forecast')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app)
      .post('/api/ai/admin-chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '查询订单' })
      .expect(403);

    await request(app)
      .get('/api/ai/recommendations')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(aiService.forecastSales).toHaveBeenCalledOnce();
    expect(aiService.adminChat).not.toHaveBeenCalled();
  });

  it('allows the bootstrapped AI administrator to use protected management endpoints', async () => {
    const login = await request(app)
      .post('/api/ai/auth/login')
      .send({ username: 'ai-admin-test', password: 'bootstrap-password-for-tests' })
      .expect(200);
    const token = login.body.token;

    await request(app)
      .post('/api/ai/admin-chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '查询订单' })
      .expect(200);

    await request(app)
      .post('/api/ai/reindex')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(aiService.adminChat).toHaveBeenCalledOnce();
    expect(aiService.ragEngine.buildIndex).toHaveBeenCalledOnce();
  });

  it('supports an HttpOnly AI management cookie with the same Origin gate', async () => {
    const browser = request.agent(app);
    const login = await browser
      .post('/api/ai/auth/login')
      .send({ username: 'ai-admin-test', password: 'bootstrap-password-for-tests' })
      .expect(200);

    expect(login.headers['set-cookie'][0]).toContain('ai_session=');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Strict');
    await browser.post('/api/ai/reindex').expect(403);
    await browser
      .post('/api/ai/reindex')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
  });

  it('does not create a default AI administrator when bootstrap credentials are absent', async () => {
    const isolatedDb = await createTestDb();
    const service = new AIAuthService(isolatedDb, {
      jwtSecret: TEST_AI_JWT_SECRET,
      bootstrapUsername: '',
      bootstrapPassword: '',
    });
    await service.ready;

    const count: any = await isolatedDb.get('SELECT COUNT(*) as count FROM ai_users');
    expect(count.count).toBe(0);
    expect(await service.login('ai_admin', 'admin123')).toEqual({
      error: '用户名或密码错误',
      status: 401,
    });

    await isolatedDb.close();
  });

  it('does not expose orders when a public chat message is a phone number', async () => {
    const service = new AIService({
      all: vi.fn(),
      get: vi.fn(),
    });

    const result = await service.chat('13800138000');

    expect(result).toEqual({
      message: '为保护订单隐私，请登录客户账户后在“我的订单”中查询订单状态。',
      suggestions: ['查看产品', '帮助'],
      intent: 'order_lookup_requires_auth',
      fastPath: true,
    });
    expect(service.db.all).not.toHaveBeenCalled();
  });

  it('rejects missing and known weak production AI JWT secrets', () => {
    const { resolveAiJwtSecret } = AIAuthService;

    expect(() => resolveAiJwtSecret({ NODE_ENV: 'production' })).toThrow('AI_JWT_SECRET');
    expect(() => resolveAiJwtSecret({
      NODE_ENV: 'production',
      AI_JWT_SECRET: 'ai-jwt-secret-change-me',
    })).toThrow('AI_JWT_SECRET');
    expect(resolveAiJwtSecret({
      NODE_ENV: 'production',
      AI_JWT_SECRET: TEST_AI_JWT_SECRET,
    })).toBe(TEST_AI_JWT_SECRET);
  });
});
