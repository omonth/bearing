const express = require('express');
const router = express.Router();
const logger = require('../logger');

module.exports = function(db, paymentService) {
  const { verifyToken, requireAdmin } = require('../middleware/auth');
  const { orderLimiter } = require('../middleware/rateLimiter');

  // 创建支付（公开 — 前端结账用）
  router.post('/checkout', orderLimiter, async (req, res, next) => {
    try {
      const data = await paymentService.createPayment(req.body);
      logger.info('支付订单创建成功', { data });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // 查询支付状态（公开 — 前端轮询用）
  router.get('/status/:paymentOrderId', async (req, res, next) => {
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
    } catch (err) {
      next(err);
    }
  });

  // 主动查询第三方支付状态（需认证）
  router.get('/external-status/:paymentOrderId', verifyToken, async (req, res, next) => {
    try {
      const data = await paymentService.queryExternalStatus(
        parseInt(req.params.paymentOrderId)
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // 模拟支付成功（测试用，需管理员）
  router.post('/simulate/:paymentOrderId', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      const data = await paymentService.simulatePayment(
        parseInt(req.params.paymentOrderId)
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 支付宝回调 ====================
  router.post('/alipay/notify', async (req, res, next) => {
    try {
      await paymentService.handleAlipayCallback(req.body);
      logger.info('支付宝回调处理成功', { out_trade_no: req.body.out_trade_no });
      res.send('success');
    } catch (err) {
      next(err);
    }
  });

  // ==================== 微信支付回调 ====================
  router.post('/wechat/notify', async (req, res, next) => {
    try {
      await paymentService.handleWechatCallback(req.headers, req.body);
      logger.info('微信支付回调处理成功');
      res.json({ code: 'SUCCESS', message: '成功' });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 银联回调 ====================
  router.post('/unionpay/notify', async (req, res, next) => {
    try {
      await paymentService.handleUnionPayCallback(req.body);
      logger.info('银联回调处理成功', { orderId: req.body.orderId });
      res.send('success');
    } catch (err) {
      next(err);
    }
  });

  // 退款（需管理员）
  router.post('/refund', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      const data = await paymentService.createRefund(req.body);
      logger.info('退款成功', { data });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // 支付列表（需管理员）
  router.get('/list', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      const { status, paymentMethod, page, pageSize } = req.query;
      const data = await paymentService.getPaymentList({
        status,
        paymentMethod,
        page: page ? parseInt(page) : 1,
        pageSize: pageSize ? parseInt(pageSize) : 20
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // 支付统计（需管理员）
  router.get('/stats', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      const data = await paymentService.getPaymentStats();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // 退款记录（需管理员）
  router.get('/refunds/:paymentOrderId', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      const data = await paymentService.getRefundList(
        parseInt(req.params.paymentOrderId)
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // 支付配置状态（需管理员）
  router.get('/config-status', verifyToken, requireAdmin, (req, res) => {
    const { checkConfig } = require('../config/payment');
    res.json({ data: checkConfig() });
  });

  return router;
};
