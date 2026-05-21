const express = require('express');
const router = express.Router();
const logger = require('../logger');

module.exports = function(db, paymentService) {
  const { verifyToken, requireAdmin } = require('../middleware/auth');
  const { orderLimiter } = require('../middleware/rateLimiter');

  // 创建支付（需认证）
  router.post('/create', verifyToken, orderLimiter, async (req, res) => {
    try {
      const result = await paymentService.createPayment(req.body);
      logger.info('支付订单创建成功', { result });
      res.json(result);
    } catch (error) {
      logger.error('创建支付失败', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // 创建支付（公开 - 结算用）
  router.post('/checkout', orderLimiter, async (req, res) => {
    try {
      const result = await paymentService.createPayment(req.body);
      logger.info('支付订单创建成功(公开)', { result });
      res.json(result);
    } catch (error) {
      logger.error('创建支付失败', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // 查询支付状态（需认证）
  router.get('/query/:paymentOrderId', verifyToken, async (req, res) => {
    try {
      const result = await paymentService.queryPaymentStatus(
        parseInt(req.params.paymentOrderId)
      );
      res.json(result);
    } catch (error) {
      logger.error('查询支付状态失败', { error: error.message });
      res.status(404).json({ error: error.message });
    }
  });

  // 查询支付状态（公开 - 前端轮询用）
  router.get('/status/:paymentOrderId', async (req, res) => {
    try {
      const result = await paymentService.queryPaymentStatus(
        parseInt(req.params.paymentOrderId)
      );
      // 只返回必要信息，不暴露内部细节
      res.json({
        status: result.status,
        paymentMethod: result.paymentMethod,
        amount: result.amount,
        paidAt: result.paidAt,
      });
    } catch (error) {
      logger.error('查询支付状态失败', { error: error.message });
      res.status(404).json({ error: error.message });
    }
  });

  // 主动查询第三方支付状态（需认证）
  router.get('/external-status/:paymentOrderId', verifyToken, async (req, res) => {
    try {
      const result = await paymentService.queryExternalStatus(
        parseInt(req.params.paymentOrderId)
      );
      res.json(result);
    } catch (error) {
      logger.error('查询外部支付状态失败', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // 模拟支付成功（测试用，需管理员）
  router.post('/simulate/:paymentOrderId', verifyToken, requireAdmin, async (req, res) => {
    try {
      const result = await paymentService.simulatePayment(
        parseInt(req.params.paymentOrderId)
      );
      res.json(result);
    } catch (error) {
      logger.error('模拟支付失败', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== 支付宝回调 ====================
  router.post('/alipay/notify', async (req, res) => {
    try {
      await paymentService.handleAlipayCallback(req.body);
      logger.info('支付宝回调处理成功', { out_trade_no: req.body.out_trade_no });
      res.send('success');
    } catch (error) {
      logger.error('支付宝回调处理失败', { error: error.message });
      res.send('fail');
    }
  });

  // ==================== 微信支付回调 ====================
  router.post('/wechat/notify', async (req, res) => {
    try {
      await paymentService.handleWechatCallback(req.headers, req.body);
      logger.info('微信支付回调处理成功');
      res.json({ code: 'SUCCESS', message: '成功' });
    } catch (error) {
      logger.error('微信支付回调处理失败', { error: error.message });
      res.json({ code: 'FAIL', message: error.message });
    }
  });

  // ==================== 银联回调 ====================
  router.post('/unionpay/notify', async (req, res) => {
    try {
      await paymentService.handleUnionPayCallback(req.body);
      logger.info('银联回调处理成功', { orderId: req.body.orderId });
      res.send('success');
    } catch (error) {
      logger.error('银联回调处理失败', { error: error.message });
      res.send('fail');
    }
  });

  // 退款（需管理员）
  router.post('/refund', verifyToken, requireAdmin, async (req, res) => {
    try {
      const result = await paymentService.createRefund(req.body);
      logger.info('退款成功', { result });
      res.json(result);
    } catch (error) {
      logger.error('退款失败', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // 支付列表（需管理员）
  router.get('/list', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { status, paymentMethod, page, pageSize } = req.query;
      const result = await paymentService.getPaymentList({
        status,
        paymentMethod,
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20
      });
      res.json(result);
    } catch (error) {
      logger.error('获取支付列表失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // 支付统计（需管理员）
  router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
    try {
      const stats = await paymentService.getPaymentStats();
      res.json(stats);
    } catch (error) {
      logger.error('获取支付统计失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // 退款记录（需管理员）
  router.get('/refunds/:paymentOrderId', verifyToken, requireAdmin, async (req, res) => {
    try {
      const refunds = await paymentService.getRefundList(
        parseInt(req.params.paymentOrderId)
      );
      res.json(refunds);
    } catch (error) {
      logger.error('获取退款记录失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // 支付配置状态（需管理员）
  router.get('/config-status', verifyToken, requireAdmin, (req, res) => {
    const { checkConfig } = require('../config/payment');
    res.json(checkConfig());
  });

  return router;
};
