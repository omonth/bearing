const express = require('express');

function sendResult(res, result) {
  const { data, error, status } = result;
  if (error) return res.status(status || 500).json({ error });
  return res.json(data);
}

function requireCustomer(req, res) {
  if (req.user.role === 'customer') return true;
  res.status(403).json({ error: '需要顾客身份' });
  return false;
}

module.exports = function(customerSelfService) {
  const router = express.Router();
  const { verifyToken } = require('../middleware/auth');

  // ==================== 注册/登录 ====================

  router.post('/register', async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    return sendResult(res, await customerSelfService.register(req.body));
  });

  router.post('/login', async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    return sendResult(res, await customerSelfService.login(req.body));
  });

  // ==================== 个人信息 ====================

  router.get('/me', verifyToken, async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    if (!requireCustomer(req, res)) return;
    return sendResult(res, await customerSelfService.getMe(req.user.userId));
  });

  // ==================== 我的订单 ====================

  router.get('/orders', verifyToken, async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    if (!requireCustomer(req, res)) return;
    return sendResult(res, await customerSelfService.listOrders(req.user.userId));
  });

  router.get('/orders/:id', verifyToken, async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    if (!requireCustomer(req, res)) return;
    return sendResult(res, await customerSelfService.getOrder(req.user.userId, req.params.id));
  });

  // ==================== 我的优惠券 ====================

  router.get('/coupons', verifyToken, async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    if (!requireCustomer(req, res)) return;
    return sendResult(res, await customerSelfService.listCoupons(req.user.userId));
  });

  router.post('/coupons/use', verifyToken, async (req, res) => {
    if (!customerSelfService) return res.status(500).json({ error: '顾客自助服务未配置' });
    if (!requireCustomer(req, res)) return;
    return sendResult(res, await customerSelfService.useCoupon({
      customerId: req.user.userId,
      code: req.body.code,
      orderId: req.body.orderId,
    }));
  });

  return router;
};
