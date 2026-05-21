const express = require('express');
const router = express.Router();
const logger = require('../logger');

module.exports = function(db, { customerService, couponService, pointsService }) {
  const { verifyToken, requireAdmin } = require('../middleware/auth');

  // ==================== Customer Routes ====================

  router.get('/customers', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.list(req.query);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.get('/customers/:id', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.getById(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.post('/customers', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.create(req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.put('/customers/:id', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.update(req.params.id, req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== Points Routes ====================

  router.get('/customers/:id/points', verifyToken, requireAdmin, async (req, res) => {
    if (!pointsService) return res.status(500).json({ error: '积分服务未配置' });
    const { data, error, status } = await pointsService.getRecords(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.post('/customers/:id/points', verifyToken, requireAdmin, async (req, res) => {
    if (!pointsService) return res.status(500).json({ error: '积分服务未配置' });
    const { points, type, reason, orderId } = req.body;
    const { data, error, status } = await pointsService.addPoints(req.params.id, points, type, reason, orderId);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.post('/customers/:id/points/deduct', verifyToken, requireAdmin, async (req, res) => {
    if (!pointsService) return res.status(500).json({ error: '积分服务未配置' });
    const { points, reason } = req.body;
    const { data, error, status } = await pointsService.deductPoints(req.params.id, points, reason);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== Coupon Routes ====================

  router.get('/coupons', verifyToken, requireAdmin, async (req, res) => {
    if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
    const { data, error, status } = await couponService.list(req.query.status);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.post('/coupons', verifyToken, requireAdmin, async (req, res) => {
    if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
    const { data, error, status } = await couponService.create(req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.post('/coupons/:id/issue', verifyToken, requireAdmin, async (req, res) => {
    if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
    const { data, error, status } = await couponService.issue(req.params.id, req.body.customerIds);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.post('/coupons/use', verifyToken, async (req, res) => {
    if (!couponService) return res.status(500).json({ error: '优惠券服务未配置' });
    const { code, customerId, orderId } = req.body;
    const { data, error, status } = await couponService.use({ code, customerId, orderId });
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== Interaction Routes ====================

  router.post('/interactions', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { customerId, type, content } = req.body;
    const { data, error, status } = await customerService.recordInteraction({
      customerId, type, content, employee: req.user?.username
    });
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== Feedback Routes ====================

  router.get('/feedback', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.listFeedback(req.query.status);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.put('/feedback/:id/reply', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.replyFeedback(req.params.id, req.body.reply);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== Analytics Routes ====================

  router.get('/dashboard', verifyToken, requireAdmin, async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.getDashboard();
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.get('/levels', async (req, res) => {
    if (!customerService) return res.status(500).json({ error: 'CRM服务未配置' });
    const { data, error, status } = await customerService.getLevels();
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  return router;
};
