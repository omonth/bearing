const { isStrongJwtSecret } = require('../services/authService');
const { isStrongAiJwtSecret } = require('../services/aiAuthService');

function hasStrongPassword(value) {
  return typeof value === 'string'
    && value.trim().length >= 16
    && value.toLowerCase() !== 'admin123';
}

function hasSecureOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const origin = new URL(value);
    return origin.protocol === 'https:' && origin.origin === value.replace(/\/$/, '');
  } catch {
    return false;
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
