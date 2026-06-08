import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestDb } from './helpers';
const createApp = require('../app');

const grayEnvKeys = [
  'GRAY_RELEASE_ENABLED',
  'GRAY_RELEASE_PERCENTAGE',
  'GRAY_RELEASE_VARIANT',
  'GRAY_RELEASE_FORCE_HEADER',
];

afterEach(() => {
  for (const key of grayEnvKeys) {
    delete process.env[key];
  }
});

describe('gray release runtime', () => {
  it('reports stable rollout by default', async () => {
    const db = await createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .get('/api/runtime/gray')
      .set('x-session-id', 'stable-user');

    expect(res.status).toBe(200);
    expect(res.headers['x-release-variant']).toBe('stable');
    expect(res.body).toEqual({
      enabled: false,
      percentage: 0,
      variant: 'canary',
      selectedVariant: 'stable',
      forced: false,
    });

    await db.close();
  });

  it('selects the gray variant when percentage is 100', async () => {
    process.env.GRAY_RELEASE_ENABLED = 'true';
    process.env.GRAY_RELEASE_PERCENTAGE = '100';
    process.env.GRAY_RELEASE_VARIANT = 'v2';

    const db = await createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .get('/api/runtime/gray')
      .set('x-session-id', 'canary-user');

    expect(res.status).toBe(200);
    expect(res.headers['x-release-variant']).toBe('v2');
    expect(res.body).toEqual({
      enabled: true,
      percentage: 100,
      variant: 'v2',
      selectedVariant: 'v2',
      forced: false,
    });

    await db.close();
  });

  it('allows operators to force the gray variant with a request header', async () => {
    process.env.GRAY_RELEASE_ENABLED = 'true';
    process.env.GRAY_RELEASE_PERCENTAGE = '0';
    process.env.GRAY_RELEASE_VARIANT = 'beta';

    const db = await createTestDb();
    const app = createApp(db);

    const res = await request(app)
      .get('/api/runtime/gray')
      .set('x-gray-release', 'beta')
      .set('x-session-id', 'stable-user');

    expect(res.status).toBe(200);
    expect(res.headers['x-release-variant']).toBe('beta');
    expect(res.body).toEqual({
      enabled: true,
      percentage: 0,
      variant: 'beta',
      selectedVariant: 'beta',
      forced: true,
    });

    await db.close();
  });
});
