const fs = require('fs');
const { isStrongJwtSecret } = require('../services/authService');
const { isStrongAiJwtSecret } = require('../services/aiAuthService');

function hasStrongPassword(value) {
  return typeof value === 'string'
    && value.trim().length >= 16
    && value.toLowerCase() !== 'admin123';
}

function hasStrongSecret(value) {
  return typeof value === 'string' && value.trim().length >= 32;
}

function hasSecureOrigin(value) {
  if (typeof value !== 'string' || !value.trim() || hasDeploymentPlaceholder(value)) return false;
  try {
    const origin = new URL(value);
    return origin.protocol === 'https:' && origin.origin === value.replace(/\/$/, '');
  } catch {
    return false;
  }
}

function hasSecureUrl(value) {
  if (typeof value !== 'string' || !value.trim() || hasDeploymentPlaceholder(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hasDeploymentPlaceholder(value) {
  return /(?:REPLACE[_-]?WITH|example\.invalid|change-in-production)/i.test(String(value || ''));
}

function isReadableFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return false;
  try {
    fs.accessSync(filePath.trim(), fs.constants.R_OK);
    return fs.statSync(filePath.trim()).isFile();
  } catch {
    return false;
  }
}

function hasSecureWebhookUrl(value) {
  if (!hasSecureUrl(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
}

function numberInRange(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;
}

function hasAny(env, keys) {
  return keys.some((key) => typeof env[key] === 'string' && env[key].trim());
}

function validatePaymentProviders(env, issues) {
  const alipayKeys = ['ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY'];
  if (hasAny(env, [...alipayKeys, 'ALIPAY_NOTIFY_URL'])) {
    if (!alipayKeys.every((key) => typeof env[key] === 'string' && env[key].trim())) {
      issues.push('Alipay credentials must be configured as a complete set');
    }
    if (!hasSecureUrl(env.ALIPAY_NOTIFY_URL)) {
      issues.push('ALIPAY_NOTIFY_URL must be an HTTPS origin callback URL');
    }
  }

  const wechatKeys = [
    'WECHAT_APP_ID',
    'WECHAT_MCH_ID',
    'WECHAT_CERT_SERIAL',
    'WECHAT_PRIVATE_KEY',
    'WECHAT_PLATFORM_CERT_PATH',
  ];
  if (hasAny(env, [...wechatKeys, 'WECHAT_API_KEY_V3', 'WECHAT_NOTIFY_URL'])) {
    if (!wechatKeys.every((key) => typeof env[key] === 'string' && env[key].trim())) {
      issues.push('WeChat Pay credentials must be configured as a complete set');
    }
    if (typeof env.WECHAT_API_KEY_V3 !== 'string' || Buffer.byteLength(env.WECHAT_API_KEY_V3) !== 32) {
      issues.push('WECHAT_API_KEY_V3 must be exactly 32 bytes');
    }
    if (!hasSecureUrl(env.WECHAT_NOTIFY_URL)) {
      issues.push('WECHAT_NOTIFY_URL must be an HTTPS origin callback URL');
    }
    if (!isReadableFile(env.WECHAT_PLATFORM_CERT_PATH)) {
      issues.push('WECHAT_PLATFORM_CERT_PATH must reference a readable platform certificate file');
    }
    const maxAge = Number(env.WECHAT_CALLBACK_MAX_AGE_SECONDS || 300);
    if (!Number.isInteger(maxAge) || maxAge < 60 || maxAge > 600) {
      issues.push('WECHAT_CALLBACK_MAX_AGE_SECONDS must be between 60 and 600');
    }
  }

  const unionPayKeys = [
    'UNIONPAY_MERCHANT_ID',
    'UNIONPAY_CERT_PATH',
    'UNIONPAY_CERT_PWD',
    'UNIONPAY_VERIFY_CERT_PATH',
    'UNIONPAY_NOTIFY_URL',
  ];
  if (hasAny(env, unionPayKeys)) {
    issues.push('Real UnionPay is disabled until the ACP contract is implemented and accepted');
  }
}

function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const issues = [];
  if (env.DB_TYPE !== 'postgres') issues.push('DB_TYPE must be postgres');
  if (!hasStrongPassword(env.DB_PASSWORD)) issues.push('DB_PASSWORD must be a strong configured password');
  if (!hasStrongPassword(env.REDIS_PASSWORD)) issues.push('REDIS_PASSWORD must be a strong configured password');
  if (!hasSecureOrigin(env.CORS_ORIGIN)) issues.push('CORS_ORIGIN must be one HTTPS origin without a path');
  if (!isStrongJwtSecret(env.JWT_SECRET)) issues.push('JWT_SECRET must be a strong non-default secret');
  if (!isStrongAiJwtSecret(env.AI_JWT_SECRET)) issues.push('AI_JWT_SECRET must be a strong non-default secret');
  if (env.PAYMENT_MODE !== 'production') issues.push('PAYMENT_MODE must be production');
  if (!hasSecureWebhookUrl(env.ALERT_WEBHOOK_URL)) {
    issues.push('ALERT_WEBHOOK_URL must be an HTTPS URL without embedded credentials or fragments');
  }
  if (!numberInRange(env.ALERT_WEBHOOK_TIMEOUT_MS, 500, 10000)) {
    issues.push('ALERT_WEBHOOK_TIMEOUT_MS must be between 500 and 10000');
  }
  if (!numberInRange(env.CALLBACK_SIGNATURE_FAILURE_THRESHOLD, 2, 20)) {
    issues.push('CALLBACK_SIGNATURE_FAILURE_THRESHOLD must be between 2 and 20');
  }
  if (!numberInRange(env.ALERT_HTTP_WINDOW_SIZE, 20, 1000)) {
    issues.push('ALERT_HTTP_WINDOW_SIZE must be between 20 and 1000');
  }
  if (!numberInRange(env.ALERT_HTTP_MIN_SAMPLES, 10, Number(env.ALERT_HTTP_WINDOW_SIZE))) {
    issues.push('ALERT_HTTP_MIN_SAMPLES must be between 10 and ALERT_HTTP_WINDOW_SIZE');
  }
  if (!numberInRange(env.ALERT_ERROR_RATE_THRESHOLD, 0.01, 1)) {
    issues.push('ALERT_ERROR_RATE_THRESHOLD must be between 0.01 and 1');
  }
  if (!numberInRange(env.ALERT_LATENCY_THRESHOLD_MS, 100, 60000)) {
    issues.push('ALERT_LATENCY_THRESHOLD_MS must be between 100 and 60000');
  }
  if (!hasStrongSecret(env.CUSTOMER_SECURITY_PEPPER)) {
    issues.push('CUSTOMER_SECURITY_PEPPER must contain at least 32 characters');
  }
  if (!hasSecureWebhookUrl(env.CUSTOMER_NOTIFICATION_WEBHOOK_URL)) {
    issues.push('CUSTOMER_NOTIFICATION_WEBHOOK_URL must be an HTTPS URL without embedded credentials or fragments');
  }
  if (!hasStrongSecret(env.CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN)) {
    issues.push('CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN must contain at least 32 characters');
  }
  validatePaymentProviders(env, issues);

  if (!env.INITIAL_ADMIN_USERNAME || env.INITIAL_ADMIN_USERNAME.toLowerCase() === 'admin') {
    issues.push('INITIAL_ADMIN_USERNAME must be configured and must not be admin');
  }
  if (!hasStrongPassword(env.INITIAL_ADMIN_PASSWORD)) {
    issues.push('INITIAL_ADMIN_PASSWORD must be a strong configured password');
  }
  if (!env.AI_BOOTSTRAP_USERNAME || env.AI_BOOTSTRAP_USERNAME.toLowerCase() === 'admin') {
    issues.push('AI_BOOTSTRAP_USERNAME must be configured and must not be admin');
  }
  if (!hasStrongPassword(env.AI_BOOTSTRAP_PASSWORD)) {
    issues.push('AI_BOOTSTRAP_PASSWORD must be a strong configured password');
  }

  if (issues.length > 0) {
    throw new Error(`Invalid production configuration: ${issues.join('; ')}`);
  }
}

module.exports = { validateProductionEnvironment };
