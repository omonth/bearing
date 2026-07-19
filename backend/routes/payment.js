const express = require('express');
const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const logger = require('../logger');
const { UnauthorizedError } = require('../utils/errors');

module.exports = function(db, paymentService) {
  const router = express.Router();
  const {
    createSessionAwareTokenVerifier,
    requireAdmin,
    verifyOrderAccessToken,
    verifyToken,
  } = require('../middleware/auth');
  const { paymentLimiter } = require('../middleware/rateLimiter');
  const optionalSessionToken = createSessionAwareTokenVerifier(db, {
    optional: true,
    requireVerifiedPhone: true,
  });
  const sessionToken = createSessionAwareTokenVerifier(db, { requireVerifiedPhone: true });

  const getPaymentActor = (req, expectedOrderId) => {
    if (req.user) return { user: req.user };

    const accessToken = req.get('x-order-access-token') || req.body?.orderAccessToken;
    const access = accessToken && verifyOrderAccessToken(accessToken);
    if (!access || (expectedOrderId !== undefined && access.orderId !== Number(expectedOrderId))) {
      throw new UnauthorizedError('需要订单支付访问令牌');
    }
    return { orderId: access.orderId };
  };

  router.post('/checkout', paymentLimiter, optionalSessionToken, [
    body('orderId').isInt({ min: 1 }).withMessage('订单ID无效'),
    body('paymentMethod').isIn(['alipay', 'wechat', 'unionpay', 'cod', 'balance']).withMessage('不支持的支付方式'),
    body('subject').optional().trim().isLength({ max: 256 }).withMessage('支付描述过长'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const data = await paymentService.createPayment(
        req.body,
        getPaymentActor(req, req.body.orderId)
      );
      logger.info('支付订单创建成功', {
        paymentOrderId: data.paymentOrderId,
        paymentMethod: data.paymentMethod,
        amount: data.amount,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/status/:paymentOrderId', optionalSessionToken, [
    param('paymentOrderId').isInt({ min: 1 }).withMessage('支付订单ID无效'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const result = await paymentService.queryPaymentStatus(
        parseInt(req.params.paymentOrderId),
        getPaymentActor(req)
      );
      // 只返回必要信息，不暴露内部细节
      res.json({
        data: {
          status: result.status,
          paymentMethod: result.paymentMethod,
          amount: result.amount,
          paidAt: result.paidAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 主动查询第三方支付状态（仅订单所有者或管理员）
  router.get('/external-status/:paymentOrderId', sessionToken, async (req, res, next) => {
    try {
      const data = await paymentService.queryExternalStatus(
        parseInt(req.params.paymentOrderId),
        { user: req.user }
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

  router.post('/cod/:paymentOrderId/confirm-collection', verifyToken, requireAdmin, [
    param('paymentOrderId').isInt({ min: 1 }).withMessage('支付订单 ID 无效'),
    body('evidence').isString().trim().isLength({ min: 10, max: 2000 })
      .withMessage('收款凭证说明必须为 10 到 2000 个字符'),
    body('externalReference').isString().trim().isLength({ min: 4, max: 160 })
      .withMessage('收款凭证编号必须为 4 到 160 个字符'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const data = await paymentService.confirmCodCollection({
        paymentOrderId: Number(req.params.paymentOrderId),
        adminId: req.user.userId,
        evidence: req.body.evidence,
        externalReference: req.body.externalReference,
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 支付宝回调 ====================
  router.post('/alipay/notify', async (req, res, next) => {
    try {
      await paymentService.handleCallback({
        method: 'alipay',
        headers: req.headers,
        body: req.body,
        rawBody: req.rawBody,
      });
      logger.info('支付宝回调处理成功', { out_trade_no: req.body.out_trade_no });
      res.send('success');
    } catch (err) {
      next(err);
    }
  });

  // ==================== 微信支付回调 ====================
  router.post('/wechat/notify', async (req, res, next) => {
    try {
      await paymentService.handleCallback({
        method: 'wechat',
        headers: req.headers,
        body: req.body,
        rawBody: req.rawBody,
      });
      logger.info('微信支付回调处理成功');
      res.json({ code: 'SUCCESS', message: '成功' });
    } catch (err) {
      next(err);
    }
  });

  // ==================== 银联回调 ====================
  router.post('/unionpay/notify', async (req, res, next) => {
    try {
      await paymentService.handleCallback({
        method: 'unionpay',
        headers: req.headers,
        body: req.body,
        rawBody: req.rawBody,
      });
      logger.info('银联回调处理成功', { orderId: req.body.orderId });
      res.send('success');
    } catch (err) {
      next(err);
    }
  });

  // 退款（需管理员）
  router.post('/refund', verifyToken, requireAdmin, [
    body('paymentOrderId').isInt({ min: 1 }).withMessage('支付订单ID无效'),
    body('amount').isFloat({ gt: 0 }).withMessage('退款金额无效'),
    body('reason').optional().trim().isLength({ max: 500 }).withMessage('退款原因过长'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const data = await paymentService.createRefund(req.body);
      logger.info('退款请求已处理', {
        paymentOrderId: req.body.paymentOrderId,
        refundId: data.refundId,
        status: data.status,
      });
      const statusCode = ['processing', 'manual_required', 'requested'].includes(data.status)
        ? 202
        : 200;
      res.status(statusCode).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/refunds/reconcile', verifyToken, requireAdmin, [
    body('limit').optional().isInt({ min: 1, max: 200 }).withMessage('对账批量大小无效'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const data = await paymentService.reconcilePendingRefunds({ limit: req.body.limit });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/refunds/:refundId/reconcile', verifyToken, requireAdmin, [
    param('refundId').isInt({ min: 1 }).withMessage('退款记录ID无效'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const data = await paymentService.reconcileRefund(Number(req.params.refundId));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/refunds/:refundId/manual', verifyToken, requireAdmin, [
    param('refundId').isInt({ min: 1 }).withMessage('退款记录ID无效'),
    body('resolution')
      .isIn(['mark_manual_required', 'mark_failed', 'confirm_completed'])
      .withMessage('人工处理结论无效'),
    body('evidence').isString().trim().isLength({ min: 10, max: 2000 })
      .withMessage('人工处理凭证说明必须为 10 到 2000 个字符'),
    body('externalReference').isString().trim().isLength({ min: 4, max: 160 })
      .withMessage('外部参考号必须为 4 到 160 个字符'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const common = {
        refundId: Number(req.params.refundId),
        adminId: req.user.userId,
        evidence: req.body.evidence,
        externalReference: req.body.externalReference,
      };
      const data = req.body.resolution === 'confirm_completed'
        ? await paymentService.confirmManualRefund(common)
        : await paymentService.recordManualRefundDecision({
          ...common,
          status: req.body.resolution === 'mark_failed' ? 'failed' : 'manual_required',
        });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/refunds/:refundId/detail', verifyToken, requireAdmin, [
    param('refundId').isInt({ min: 1 }).withMessage('退款记录ID无效'),
    handleValidationErrors,
  ], async (req, res, next) => {
    try {
      const data = await paymentService.getRefundDetails(Number(req.params.refundId));
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
