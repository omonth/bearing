const rateLimit = require('express-rate-limit');
const logger = require('../logger');

const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('限流触发', { ip: req.ip, path: req.path });
    res.status(429).json({ error: message });
  },
});

const apiLimiter = createLimiter(60 * 1000, 500, '请求过于频繁，请稍后再试');
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: '登录尝试次数过多，请5分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('登录限流触发', { ip: req.ip, username: req.body.username });
    res.status(429).json({ error: '登录尝试次数过多，请5分钟后再试' });
  },
});
const customerLoginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: '登录尝试次数过多，请5分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('顾客登录限流触发', { ip: req.ip });
    res.status(429).json({ error: '登录尝试次数过多，请5分钟后再试' });
  },
});
const orderLimiter = createLimiter(60 * 1000, 10, '订单创建过于频繁，请稍后再试');
const paymentLimiter = createLimiter(60 * 1000, 10, '支付请求过于频繁，请稍后再试');

module.exports = {
  apiLimiter,
  loginLimiter,
  customerLoginLimiter,
  orderLimiter,
  paymentLimiter,
};
