const express = require('express');
const rateLimit = require('express-rate-limit');

const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
const recoveryConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

function requireCustomer(req, res) {
  if (req.user.role === 'customer') return true;
  res.status(403).json({ error: '需要顾客身份' });
  return false;
}

module.exports = function(customerSelfService) {
  const router = express.Router();
  const { createCustomerTokenVerifier } = require('../middleware/auth');
  const {
    CUSTOMER_SESSION_COOKIE,
    clearSessionCookie,
    setSessionCookie,
  } = require('../middleware/sessionCookies');
  const { customerLoginLimiter } = require('../middleware/rateLimiter');
  const verifyCustomerToken = customerSelfService?.db
    ? createCustomerTokenVerifier(customerSelfService.db)
    : (_req, _res, next) => next();
  const verifyVerifiedCustomerToken = customerSelfService?.db
    ? createCustomerTokenVerifier(customerSelfService.db, { requireVerifiedPhone: true })
    : (_req, _res, next) => next();

  // ==================== 注册/登录 ====================

  router.post('/register', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      const data = await customerSelfService.register(req.body);
      setSessionCookie(res, CUSTOMER_SESSION_COOKIE, data.token);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', customerLoginLimiter, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      const data = await customerSelfService.login(req.body);
      setSessionCookie(res, CUSTOMER_SESSION_COOKIE, data.token);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res, CUSTOMER_SESSION_COOKIE);
    res.json({ data: { loggedOut: true } });
  });

  router.post('/password/forgot', recoveryRequestLimiter, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      const data = await customerSelfService.requestPasswordReset(req.body);
      res.status(202).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/password/reset', recoveryConfirmLimiter, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      const data = await customerSelfService.resetPassword(req.body);
      clearSessionCookie(res, CUSTOMER_SESSION_COOKIE);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 个人信息 ====================

  router.get('/me', verifyCustomerToken, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.getMe(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me', verifyCustomerToken, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.updateProfile(req.user.userId, req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/phone-verification/request', verifyCustomerToken, recoveryRequestLimiter, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.requestPhoneVerification(req.user.userId);
      res.status(202).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/phone-verification/confirm', verifyCustomerToken, recoveryConfirmLimiter, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.confirmPhoneVerification(req.user.userId, req.body.code);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Registration/login sessions intentionally remain usable for profile and
  // verification completion. Every customer resource declared below this
  // boundary requires a durable, server-side phone verification marker.
  router.use(verifyVerifiedCustomerToken);

  // ==================== 我的订单 ====================

  router.get('/orders', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.listOrders(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/:id', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.getOrder(req.user.userId, req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/orders/:id/cancel', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const orderId = Number.parseInt(req.params.id, 10);
      if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ error: '订单 ID 无效', code: 'VALIDATION_ERROR' });
      }
      const data = await customerSelfService.cancelOrder(req.user.userId, orderId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 收货地址簿 ====================

  router.get('/addresses', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.listAddresses(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/addresses', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.createAddress(req.user.userId, req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/addresses/:id', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.updateAddress(
        req.user.userId,
        Number.parseInt(req.params.id, 10),
        req.body
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/addresses/:id', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.deleteAddress(
        req.user.userId,
        Number.parseInt(req.params.id, 10)
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 我的优惠券 ====================

  router.get('/coupons', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.listCoupons(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/coupons/use', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.useCoupon({
        customerId: req.user.userId,
        code: req.body.code,
        orderId: req.body.orderId,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
