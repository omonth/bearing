const rateLimit = require('express-rate-limit');
const logger = require('../logger');

// 通用API限流（开发环境宽松限制）
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 500, // 限制500个请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('API限流触发', { ip: req.ip, path: req.path });
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
});

// 登录接口严格限流
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 只允许5次登录尝试
  message: { error: '登录尝试次数过多，请15分钟后再试' },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn('登录限流触发', { ip: req.ip, username: req.body.username });
    res.status(429).json({ error: '登录尝试次数过多，请15分钟后再试' });
  }
});

// 订单创建限流
const orderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10个订单
  message: { error: '订单创建过于频繁，请稍后再试' }
});

module.exports = {
  apiLimiter,
  loginLimiter,
  orderLimiter
};
