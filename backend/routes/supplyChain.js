const express = require('express');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const router = express.Router();
const logger = require('../logger');

module.exports = function(supplyChainService) {
  const { verifyToken, requireAdmin } = require('../middleware/auth');

  const svc = supplyChainService;

  // 所有供应链API都需要管理员权限
  router.use(verifyToken, requireAdmin);

// ==================== 供应商管理 ====================

// 获取所有供应商
router.get('/suppliers', async (req, res, next) => {
  try {
    const { status } = req.query;
    const suppliers = await svc.getAllSuppliers(status);
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

// 创建供应商
router.post('/suppliers', [
  body('name').trim().notEmpty().withMessage('供应商名称不能为空'),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const result = await svc.createSupplier(req.body);
    res.json({ message: '供应商创建成功', id: result.id });
  } catch (error) {
    next(error);
  }
});

// 更新供应商
router.put('/suppliers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await svc.updateSupplier(id, req.body);
    res.json({ message: '供应商更新成功' });
  } catch (error) {
    next(error);
  }
});

// ==================== 采购订单管理 ====================

// 获取采购订单列表
router.get('/purchase-orders', async (req, res, next) => {
  try {
    const { status } = req.query;
    const orders = await svc.getPurchaseOrders(status);
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// 获取采购订单详情
router.get('/purchase-orders/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await svc.getPurchaseOrderDetails(id);
    if (!order) {
      return res.status(404).json({ error: '采购订单不存在' });
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
});

// 创建采购订单
router.post('/purchase-orders', [
  body('supplierId').isInt({ min: 1 }).withMessage('供应商ID无效'),
  body('items').isArray({ min: 1 }).withMessage('采购项目不能为空'),
  handleValidationErrors,
], async (req, res, next) => {
  try {
    const result = await svc.createPurchaseOrder({
      ...req.body,
      createdBy: req.user.userId
    });
    res.json({ message: '采购订单创建成功', id: result.id, totalAmount: result.totalAmount });
  } catch (error) {
    next(error);
  }
});

// 更新采购订单状态
router.put('/purchase-orders/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, receivedDate } = req.body;
    await svc.updatePurchaseOrderStatus(id, status, receivedDate);
    res.json({ message: '采购订单状态已更新' });
  } catch (error) {
    next(error);
  }
});

// ==================== 入库管理 ====================

// 获取入库记录
router.get('/stock-in', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const records = await svc.getStockInRecords(startDate, endDate);
    res.json(records);
  } catch (error) {
    next(error);
  }
});

// 创建入库记录
router.post('/stock-in', async (req, res, next) => {
  try {
    const result = await svc.createStockInRecord({
      ...req.body,
      operator: req.user.username
    });
    res.json({ message: '入库记录创建成功', id: result.id });
  } catch (error) {
    next(error);
  }
});

// ==================== 出库管理 ====================

// 获取出库记录
router.get('/stock-out', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const records = await svc.getStockOutRecords(startDate, endDate);
    res.json(records);
  } catch (error) {
    next(error);
  }
});

// 创建出库记录
router.post('/stock-out', async (req, res, next) => {
  try {
    const result = await svc.createStockOutRecord({
      ...req.body,
      operator: req.user.username
    });
    res.json({ message: '出库记录创建成功', id: result.id, unitCost: result.unitCost });
  } catch (error) {
    next(error);
  }
});

// ==================== 成本核算 ====================

// 获取产品成本
router.get('/costs/:bearingId', async (req, res, next) => {
  try {
    const { bearingId } = req.params;
    const cost = await svc.getProductCost(bearingId);
    res.json(cost);
  } catch (error) {
    next(error);
  }
});

// 获取利润分析
router.get('/profit-analysis', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请提供开始和结束日期' });
    }
    const analysis = await svc.getProfitAnalysis(startDate, endDate);
    res.json(analysis);
  } catch (error) {
    next(error);
  }
});

  return router;
};
