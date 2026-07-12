const jwt = require('jsonwebtoken');
const logger = require('../logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ADMIN_EXPIRES_IN = process.env.JWT_ADMIN_EXPIRES_IN || '8h';
const JWT_CUSTOMER_EXPIRES_IN = process.env.JWT_CUSTOMER_EXPIRES_IN || '7d';
const ORDER_ACCESS_EXPIRES_IN = process.env.ORDER_ACCESS_EXPIRES_IN || '24h';

const generateToken = (userId, username, role = 'admin') => {
  const expiresIn = role === 'customer' ? JWT_CUSTOMER_EXPIRES_IN : JWT_ADMIN_EXPIRES_IN;
  return jwt.sign(
    { userId, username, role },
    JWT_SECRET,
    { expiresIn }
  );
};

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

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('未提供认证令牌', { path: req.path, ip: req.ip });
    return res.status(401).json({ error: '未授权访问，请先登录' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('令牌验证失败', { error: error.message, ip: req.ip });
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
};

const optionalToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '认证令牌格式无效' });
  }

  try {
    req.user = jwt.verify(authHeader.substring(7), JWT_SECRET);
    next();
  } catch (error) {
    logger.warn('令牌验证失败', { error: error.message, ip: req.ip });
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn('非管理员尝试访问', { user: req.user, path: req.path });
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

module.exports = {
  generateToken,
  generateOrderAccessToken,
  verifyOrderAccessToken,
  verifyToken,
  optionalToken,
  requireAdmin,
  JWT_SECRET,
  JWT_ADMIN_EXPIRES_IN,
  JWT_CUSTOMER_EXPIRES_IN,
  ORDER_ACCESS_EXPIRES_IN,
};
