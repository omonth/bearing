const express = require('express');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const {
  createSessionAwareTokenVerifier,
  generateOrderAccessToken,
  verifyToken,
  requireAdmin,
} = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimiter');
const { exportOrdersToExcel, exportOrderToPDF } = require('../utils/exportOrders');
const { BusinessError } = require('../utils/errors');
const logger = require('../logger');

function rejectManualPaidStatus(req, _res, next) {
  if (req.body?.status === 'paid') {
    return next(new BusinessError(
      '订单只能由支付结算事务更新为已支付',
      409,
      'PAYMENT_SETTLEMENT_REQUIRED'
    ));
  }
  return next();
}

function rejectOrderHardDelete(_req, _res, next) {
  return next(new BusinessError(
    '生产订单不允许硬删除，请使用取消或归档流程',
    409,
    'ORDER_HARD_DELETE_DISABLED'
  ));
}

module.exports = function(db, orderService) {
  const router = express.Router();
  const optionalSessionToken = createSessionAwareTokenVerifier(db, {
    optional: true,
    requireVerifiedPhone: true,
  });

  // Guest checkout is supported, but a signed access token scopes the payment
  // session to the newly-created order. Authenticated customers are bound to
  // their verified profile by OrderService.
  router.post('/', orderLimiter, optionalSessionToken, [
    body('customerName').trim().notEmpty().withMessage('客户姓名不能为空'),
    body('customerPhone').trim().matches(/^1[3-9]\d{9}$/).withMessage('手机号格式不正确'),
    body('province').trim().notEmpty().withMessage('省份不能为空'),
    body('city').trim().notEmpty().withMessage('城市不能为空'),
    body('district').trim().notEmpty().withMessage('区/县不能为空'),
    body('addressDetail').trim().notEmpty().withMessage('详细地址不能为空'),
    body('items').isArray({ min: 1 }).withMessage('订单至少包含一个商品'),
    body('items.*.id').isInt({ min: 1 }).withMessage('商品ID无效'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('商品数量必须大于0'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.createOrder({
        ...req.body,
        customerId: req.user?.role === 'customer' ? req.user.userId : null,
      });
      data.orderAccessToken = generateOrderAccessToken(data.orderId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Admin: list all orders
  router.get('/', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.listOrders();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Admin: export all orders to Excel
  router.get('/export/excel', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const orders = await orderService.getExportOrders();
      const workbook = await exportOrdersToExcel(orders);
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.xlsx`);
      res.send(buffer);
      logger.info('订单Excel导出成功', { count: orders.length });
    } catch (err) {
      next(err);
    }
  });

  // Financial and audit records are immutable through the public admin API.
  // Administrators must cancel or archive orders instead of hard deleting them.
  router.delete('/batch', verifyToken, requireAdmin, rejectOrderHardDelete);

  // Admin: get order items
  router.get('/:id/items', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.getOrderItems(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Admin: batch update order status
  router.put('/batch/status', verifyToken, requireAdmin, rejectManualPaidStatus, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('status').isIn(['pending', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.batchUpdateOrderStatus(req.body.orderIds, req.body.status, req.body.note);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Admin: update order status
  router.put('/:id/status', verifyToken, requireAdmin, rejectManualPaidStatus, [
    body('status').isIn(['pending', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    body('note').optional().trim(),
    body('trackingNumber').custom((value, { req }) => {
      if (req.body.status !== 'shipped') return true;
      return typeof value === 'string' && /^[A-Za-z0-9._-]{4,64}$/.test(value.trim());
    }).withMessage('发货必须提供 4-64 位有效物流单号'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.updateOrderStatus(req.params.id, req.body.status, req.body.note, req.body.trackingNumber);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Keep the service-level guard as defense in depth for non-HTTP callers.
  router.delete('/:id', verifyToken, requireAdmin, rejectOrderHardDelete);

  // Admin: get order status history
  router.get('/:id/history', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.getOrderStatusHistory(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  // Admin: export single order to PDF
  router.get('/:id/export/pdf', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const { order, items } = await orderService.getPrintableOrder(req.params.id);
      const pdfBuffer = await exportOrderToPDF(order, items);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=order-${req.params.id}.pdf`);
      res.send(pdfBuffer);
      logger.info('订单PDF导出成功', { orderId: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
