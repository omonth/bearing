const express = require('express');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimiter');
const { exportOrdersToExcel, exportOrderToPDF } = require('../utils/exportOrders');
const logger = require('../logger');

module.exports = function(db, orderService) {
  const router = express.Router();

  // Public: create order
  router.post('/', orderLimiter, [
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
      const data = await orderService.createOrder(req.body);
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

  // Admin: batch delete orders
  router.delete('/batch', verifyToken, requireAdmin, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('orderIds.*').isInt({ min: 1 }).withMessage('订单ID无效'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.batchDeleteOrders(req.body.orderIds);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

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
  router.put('/batch/status', verifyToken, requireAdmin, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
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
  router.put('/:id/status', verifyToken, requireAdmin, [
    body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    body('note').optional().trim(),
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

  // Admin: delete single order
  router.delete('/:id', verifyToken, requireAdmin, [
    param('id').isInt({ min: 1 }).withMessage('订单ID无效'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
      const data = await orderService.deleteOrder(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

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
