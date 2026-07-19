import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const logger = require('../logger');
const { loginLimiter } = require('../middleware/rateLimiter');

describe('rate limiter logging security', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not log the submitted administrator username when login throttling triggers', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const app = express();
    app.use(express.json());
    app.post('/login', loginLimiter, (_req, res) => res.status(401).json({ error: 'invalid' }));
    const username = 'administrator@example.com';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/login').send({ username }).expect(401);
    }
    await request(app).post('/login').send({ username }).expect(429);

    const warning = warn.mock.calls.find(([message]) => message === '登录限流触发');
    expect(warning).toBeDefined();
    expect(warning?.[1]).toEqual(expect.objectContaining({ usernameProvided: true }));
    expect(JSON.stringify(warning?.[1])).not.toContain(username);
  });
});
