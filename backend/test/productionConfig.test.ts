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
  ALERT_WEBHOOK_URL: 'https://alerts.example.com/bearing-sales',
  ALERT_WEBHOOK_TIMEOUT_MS: '3000',
  CALLBACK_SIGNATURE_FAILURE_THRESHOLD: '5',
  ALERT_HTTP_WINDOW_SIZE: '100',
  ALERT_HTTP_MIN_SAMPLES: '20',
  ALERT_ERROR_RATE_THRESHOLD: '0.05',
  ALERT_LATENCY_THRESHOLD_MS: '2000',
  CUSTOMER_SECURITY_PEPPER: 'customer-security-pepper-that-is-long-enough',
  CUSTOMER_NOTIFICATION_WEBHOOK_URL: 'https://notifications.example.com/customer',
  CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN: 'customer-notification-token-that-is-long-enough',
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

  it('rejects unresolved deployment placeholder URLs', () => {
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      CORS_ORIGIN: 'https://REPLACE_WITH_PUBLIC_ORIGIN',
      CUSTOMER_NOTIFICATION_WEBHOOK_URL: 'https://example.invalid/customer',
    })).toThrow('Invalid production configuration');
  });

  it('rejects missing, insecure, or unreasonable alerting configuration', () => {
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      ALERT_WEBHOOK_URL: 'http://user:password@alerts.example.com/hook#secret',
      CALLBACK_SIGNATURE_FAILURE_THRESHOLD: '1',
      ALERT_HTTP_MIN_SAMPLES: '101',
      ALERT_ERROR_RATE_THRESHOLD: '0',
    })).toThrow('ALERT_WEBHOOK_URL must be an HTTPS URL');
  });

  it('rejects missing or insecure customer verification delivery configuration', () => {
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      CUSTOMER_SECURITY_PEPPER: 'short',
      CUSTOMER_NOTIFICATION_WEBHOOK_URL: 'http://notifications.example.com/customer',
      CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN: '',
    })).toThrow('CUSTOMER_SECURITY_PEPPER must contain at least 32 characters');
  });

  it('rejects partial or insecure real payment provider configuration', () => {
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      WECHAT_APP_ID: 'wx-app',
      WECHAT_API_KEY_V3: 'short',
      WECHAT_NOTIFY_URL: 'http://localhost/wechat/notify',
    })).toThrow('WeChat Pay credentials must be configured as a complete set');
  });

  it('refuses to enable the unverified real UnionPay integration', () => {
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      UNIONPAY_MERCHANT_ID: 'merchant-1',
    })).toThrow('Real UnionPay is disabled');
  });
});
