import { describe, expect, it } from 'vitest';

const { validateProductionEnvironment } = require('../config/production');

const validProductionEnv = {
  NODE_ENV: 'production',
  DB_TYPE: 'postgres',
  DB_PASSWORD: 'database-password-that-is-long-enough',
  REDIS_PASSWORD: 'redis-password-that-is-long-enough',
  CORS_ORIGIN: 'https://shop.example.com',
  JWT_SECRET: 'jwt-secret-that-is-long-enough-to-be-secure-123',
  AI_JWT_SECRET: 'ai-jwt-secret-that-is-long-enough-to-be-secure-456',
  PAYMENT_MODE: 'production',
  INITIAL_ADMIN_USERNAME: 'ops-admin',
  INITIAL_ADMIN_PASSWORD: 'initial-admin-password-is-long-enough',
  AI_BOOTSTRAP_USERNAME: 'ai-ops-admin',
  AI_BOOTSTRAP_PASSWORD: 'ai-bootstrap-password-is-long-enough',
};

describe('production configuration', () => {
  it('rejects missing production credentials, insecure CORS, and sandbox payment mode', () => {
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      DB_TYPE: 'sqlite',
      DB_PASSWORD: '',
      REDIS_PASSWORD: '',
      CORS_ORIGIN: 'http://shop.example.com/path',
      PAYMENT_MODE: 'sandbox',
      INITIAL_ADMIN_USERNAME: 'admin',
      INITIAL_ADMIN_PASSWORD: 'admin123',
    })).toThrow('Invalid production configuration');
  });

  it('accepts an explicitly configured production environment', () => {
    expect(() => validateProductionEnvironment(validProductionEnv)).not.toThrow();
  });
});
