const express = require('express');
const router = express.Router();
const logger = require('../logger');

module.exports = function(db, { customerService, couponService, pointsService }) {
  const { verifyToken, requireAdmin } = require('../middleware/auth');

  // ==================== Customer Routes ====================

  router.get('/customers', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.list(req.query);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/customers/:id', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.getById(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/customers', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.create(req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/customers/:id', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.update(req.params.id, req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== Points Routes ====================

  router.get('/customers/:id/points', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!pointsService) return res.status(500).json({ error: '积分服务未配置' });
      const data = await pointsService.getRecords(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/customers/:id/points', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!pointsService) return res.status(500).json({ error: '积分服务未配置' });
      const { points, type, reason, orderId } = req.body;
      const data = await pointsService.addPoints(req.params.id, points, type, reason, orderId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/customers/:id/points/deduct', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!pointsService) return res.status(500).json({ error: '积分服务未配置' });
      const { points, reason } = req.body;
      const data = await pointsService.deductPoints(req.params.id, points, reason);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== Coupon Routes ====================

  router.get('/coupons', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
      const data = await couponService.list(req.query.status);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/coupons', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
      const data = await couponService.create(req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/coupons/:id/issue', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
      const data = await couponService.issue(req.params.id, req.body.customerIds);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/coupons/use', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
      const { code, customerId, orderId } = req.body;
      const data = await couponService.use({ code, customerId, orderId });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== Interaction Routes ====================

  router.post('/interactions', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const { customerId, type, content } = req.body;
      const data = await customerService.recordInteraction({
        customerId, type, content, employee: req.user?.username
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== Feedback Routes ====================

  router.get('/feedback', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.listFeedback(req.query.status);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/feedback/:id/reply', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.replyFeedback(req.params.id, req.body.reply);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== Analytics Routes ====================

  router.get('/dashboard', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.getDashboard();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/levels', async (req, res, next) => {
    try {
      if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
      const data = await customerService.getLevels();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
