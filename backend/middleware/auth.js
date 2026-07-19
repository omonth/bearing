const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../logger');
const {
  ADMIN_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  parseCookies,
} = require('./sessionCookies');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ADMIN_EXPIRES_IN = process.env.JWT_ADMIN_EXPIRES_IN || '8h';
const JWT_CUSTOMER_EXPIRES_IN = process.env.JWT_CUSTOMER_EXPIRES_IN || '7d';
const ORDER_ACCESS_EXPIRES_IN = process.env.ORDER_ACCESS_EXPIRES_IN || '24h';

class SessionAuthenticationError extends Error {}

const generateToken = (userId, username, role = 'admin', sessionVersion = 1) => {
  const expiresIn = role === 'customer' ? JWT_CUSTOMER_EXPIRES_IN : JWT_ADMIN_EXPIRES_IN;
  const claims = { userId, username, role };
  if (role === 'admin') claims.sessionVersion = sessionVersion;
  return jwt.sign(claims, JWT_SECRET, { expiresIn });
};

const customerSessionProof = (userId, passwordHash) => crypto
  .createHmac('sha256', JWT_SECRET)
  .update(`customer-session:${userId}:${passwordHash}`)
  .digest('hex');

const generateCustomerToken = (userId, username, passwordHash) => {
  if (!Number.isSafeInteger(Number(userId)) || !passwordHash) {
    throw new Error('Customer token requires an id and current credential');
  }
  return jwt.sign(
    {
      userId: Number(userId),
      username,
      role: 'customer',
      sessionProof: customerSessionProof(userId, passwordHash),
    },
    JWT_SECRET,
    { expiresIn: JWT_CUSTOMER_EXPIRES_IN }
  );
};

const hasCurrentCustomerSession = (decoded, passwordHash) => {
  if (typeof decoded?.sessionProof !== 'string'
    || !/^[a-f0-9]{64}$/.test(decoded.sessionProof)
    || !passwordHash) {
    return false;
  }
  const expected = Buffer.from(customerSessionProof(decoded.userId, passwordHash), 'hex');
  const supplied = Buffer.from(decoded.sessionProof, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

function verifySignedToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!Number.isSafeInteger(decoded?.userId) || decoded.userId <= 0) {
      throw new SessionAuthenticationError('invalid subject');
    }
    return decoded;
  } catch (error) {
    if (error instanceof SessionAuthenticationError) throw error;
    throw new SessionAuthenticationError('invalid token');
  }
}

async function verifyAdminSession(decoded, db) {
  if (!Number.isSafeInteger(decoded.sessionVersion) || decoded.sessionVersion < 1) {
    throw new SessionAuthenticationError('legacy administrator token');
  }
  const admin = await db.get(
    'SELECT role, session_version FROM admins WHERE id = ?',
    [decoded.userId]
  );
  if (!admin
    || decoded.role !== 'admin'
    || admin.role !== 'admin'
    || Number(admin.session_version) !== decoded.sessionVersion) {
    throw new SessionAuthenticationError('administrator session revoked');
  }
}

async function verifyCustomerSession(decoded, db, { requireVerifiedPhone = false } = {}) {
  const customer = await db.get(
    `SELECT password, status${requireVerifiedPhone ? ', phone_verified_at' : ''}
     FROM customers WHERE id = ?`,
    [decoded.userId]
  );
  if (!customer
    || customer.status !== 'active'
    || !hasCurrentCustomerSession(decoded, customer.password)) {
    throw new SessionAuthenticationError('customer session revoked');
  }
  if (requireVerifiedPhone && customer.phone_verified_at == null) {
    const error = new Error('phone verification required');
    error.code = 'PHONE_VERIFICATION_REQUIRED';
    throw error;
  }
}

async function verifySessionToken(token, db, options = {}) {
  if (!db || typeof db.get !== 'function') {
    throw new SessionAuthenticationError('session database unavailable');
  }
  const decoded = verifySignedToken(token);
  await verifySessionClaims(decoded, db, options);
  return decoded;
}

async function verifySessionClaims(decoded, db, options = {}) {
  if (!db || typeof db.get !== 'function') {
    throw new SessionAuthenticationError('session database unavailable');
  }
  if (decoded.role === 'admin') {
    await verifyAdminSession(decoded, db);
  } else if (decoded.role === 'customer') {
    await verifyCustomerSession(decoded, db, options);
  } else {
    throw new SessionAuthenticationError('unsupported role');
  }
  return decoded;
}

function extractRequestToken(req, { cookieName, preferCustomer = false } = {}) {
  const authorization = req.headers.authorization;
  if (authorization) {
    if (!authorization.startsWith('Bearer ')) return { malformed: true };
    const token = authorization.slice(7).trim();
    return token ? { token, source: 'bearer' } : { malformed: true };
  }

  const cookies = parseCookies(req.headers.cookie);
  if (cookieName && cookies[cookieName]) {
    return { token: cookies[cookieName], source: 'cookie' };
  }
  const orderedNames = preferCustomer
    ? [CUSTOMER_SESSION_COOKIE, ADMIN_SESSION_COOKIE]
    : [ADMIN_SESSION_COOKIE, CUSTOMER_SESSION_COOKIE];
  const matchedName = orderedNames.find((name) => cookies[name]);
  return matchedName
    ? { token: cookies[matchedName], source: 'cookie' }
    : {};
}

function rejectAuthentication(res, message = '令牌无效或已过期') {
  return res.status(401).json({ error: message });
}

function logAuthenticationFailure(req, error) {
  logger.warn('会话验证失败', {
    reason: error instanceof SessionAuthenticationError ? error.message : 'verification error',
    path: req.path,
    ip: req.ip,
  });
}

const generateOrderAccessToken = (orderId) => jwt.sign(
  { orderId, purpose: 'order-payment' },
  JWT_SECRET,
  { expiresIn: ORDER_ACCESS_EXPIRES_IN }
);

const verifyOrderAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'order-payment' || !Number.isInteger(decoded.orderId)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

const verifyToken = async (req, res, next) => {
  const candidate = extractRequestToken(req);
  if (!candidate.token || candidate.malformed) {
    logger.warn('未提供认证令牌', { path: req.path, ip: req.ip });
    return rejectAuthentication(res, '未授权访问，请先登录');
  }

  try {
    const decoded = verifySignedToken(candidate.token);
    if (decoded.role === 'admin') {
      await verifyAdminSession(decoded, req.app?.locals?.db);
    }
    req.user = decoded;
    req.authTransport = candidate.source;
    return next();
  } catch (error) {
    logAuthenticationFailure(req, error);
    return rejectAuthentication(res);
  }
};

const optionalToken = (req, res, next) => {
  const candidate = extractRequestToken(req, { preferCustomer: true });
  if (!candidate.token && !candidate.malformed) return next();
  if (candidate.malformed) return rejectAuthentication(res, '认证令牌格式无效');
  try {
    req.user = verifySignedToken(candidate.token);
    req.authTransport = candidate.source;
    return next();
  } catch (error) {
    logAuthenticationFailure(req, error);
    return rejectAuthentication(res);
  }
};

const createSessionAwareTokenVerifier = (
  db,
  { optional = false, customerOnly = false, requireVerifiedPhone = false } = {}
) => {
  if (!db || typeof db.get !== 'function') {
    throw new Error('Session-aware token verification requires a database');
  }

  return async (req, res, next) => {
    const candidate = extractRequestToken(req, {
      cookieName: customerOnly ? CUSTOMER_SESSION_COOKIE : undefined,
      preferCustomer: true,
    });
    if (!candidate.token && !candidate.malformed && optional) return next();
    if (!candidate.token || candidate.malformed) {
      logger.warn('未提供顾客认证令牌', { path: req.path, ip: req.ip });
      return rejectAuthentication(res, '未授权访问，请先登录');
    }

    try {
      const decoded = verifySignedToken(candidate.token);
      if (customerOnly && decoded.role !== 'customer') {
        return res.status(403).json({ error: '需要顾客身份' });
      }
      await verifySessionToken(candidate.token, db, { requireVerifiedPhone });
      req.user = decoded;
      req.authTransport = candidate.source;
      return next();
    } catch (error) {
      if (error?.code === 'PHONE_VERIFICATION_REQUIRED') {
        logger.warn('未验证手机号的顾客访问受保护资源', {
          path: req.path,
          ip: req.ip,
        });
        return res.status(403).json({
          error: '请先完成手机号验证',
          code: 'PHONE_VERIFICATION_REQUIRED',
        });
      }
      logAuthenticationFailure(req, error);
      return rejectAuthentication(res);
    }
  };
};

const createCustomerTokenVerifier = (db, options = {}) => createSessionAwareTokenVerifier(db, {
  ...options,
  customerOnly: true,
});

const createAdminTokenVerifier = (db) => async (req, res, next) => {
  const candidate = extractRequestToken(req, { cookieName: ADMIN_SESSION_COOKIE });
  if (!candidate.token || candidate.malformed) {
    return rejectAuthentication(res, '未授权访问，请先登录');
  }
  try {
    const decoded = verifySignedToken(candidate.token);
    if (decoded.role === 'admin') await verifyAdminSession(decoded, db);
    req.user = decoded;
    req.authTransport = candidate.source;
    return next();
  } catch (error) {
    logAuthenticationFailure(req, error);
    return rejectAuthentication(res);
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn('非管理员尝试访问', {
      userId: req.user?.userId,
      role: req.user?.role,
      path: req.path,
    });
    return res.status(403).json({ error: '需要管理员权限' });
  }
  return next();
};

module.exports = {
  SessionAuthenticationError,
  generateToken,
  generateCustomerToken,
  generateOrderAccessToken,
  verifyOrderAccessToken,
  verifySessionClaims,
  verifySessionToken,
  verifyToken,
  createAdminTokenVerifier,
  createCustomerTokenVerifier,
  createSessionAwareTokenVerifier,
  extractRequestToken,
  optionalToken,
  requireAdmin,
  JWT_SECRET,
  JWT_ADMIN_EXPIRES_IN,
  JWT_CUSTOMER_EXPIRES_IN,
  ORDER_ACCESS_EXPIRES_IN,
};
