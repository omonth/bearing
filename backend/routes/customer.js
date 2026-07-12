const express = require('express');

function requireCustomer(req, res) {
  if (req.user.role === 'customer') return true;
  res.status(403).json({ error: '需要顾客身份' });
  return false;
}

module.exports = function(customerSelfService) {
  const router = express.Router();
  const { verifyToken } = require('../middleware/auth');
  const { customerLoginLimiter } = require('../middleware/rateLimiter');

  // ==================== 注册/登录 ====================

  router.post('/register', async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      const data = await customerSelfService.register(req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', customerLoginLimiter, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      const data = await customerSelfService.login(req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 个人信息 ====================

  router.get('/me', verifyToken, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.getMe(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 我的订单 ====================

  router.get('/orders', verifyToken, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.listOrders(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/:id', verifyToken, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.getOrder(req.user.userId, req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 我的优惠券 ====================

  router.get('/coupons', verifyToken, async (req, res, next) => {
    try {
      if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
      if (!requireCustomer(req, res)) return;
      const data = await customerSelfService.listCoupons(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/coupons/use', verifyToken, async (req, res, next) => {
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
