const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderDetails,
  updatePurchaseOrderStatus,
  createStockInRecord,
  getStockInRecords,
  createStockOutRecord,
  getStockOutRecords,
  getProductCost,
  getProfitAnalysis
} = require('../services/supplyChainService');

// 所有供应链API都需要管理员权限
router.use(verifyToken, requireAdmin);

// ==================== 供应商管理 ====================

// 获取所有供应商
router.get('/suppliers', async (req, res) => {
  try {
    const { status } = req.query;
    const suppliers = await getAllSuppliers(status);
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: '获取供应商列表失败' });
  }
});

// 创建供应商
router.post('/suppliers', async (req, res) => {
  try {
    const result = await createSupplier(req.body);
    res.json({ message: '供应商创建成功', id: result.id });
  } catch (error) {
    res.status(500).json({ error: '创建供应商失败' });
  }
});

// 更新供应商
router.put('/suppliers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await updateSupplier(id, req.body);
    res.json({ message: '供应商更新成功' });
  } catch (error) {
    res.status(500).json({ error: '更新供应商失败' });
  }
});

// ==================== 采购订单管理 ====================

// 获取采购订单列表
router.get('/purchase-orders', async (req, res) => {
  try {
    const { status } = req.query;
    const orders = await getPurchaseOrders(status);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: '获取采购订单列表失败' });
  }
});

// 获取采购订单详情
router.get('/purchase-orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await getPurchaseOrderDetails(id);
    if (!order) {
      return res.status(404).json({ error: '采购订单不存在' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: '获取采购订单详情失败' });
  }
});

// 创建采购订单
router.post('/purchase-orders', async (req, res) => {
  try {
    const result = await createPurchaseOrder({
      ...req.body,
      createdBy: req.user.userId
    });
    res.json({ message: '采购订单创建成功', id: result.id, totalAmount: result.totalAmount });
  } catch (error) {
    res.status(500).json({ error: '创建采购订单失败' });
  }
});

// 更新采购订单状态
router.put('/purchase-orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, receivedDate } = req.body;
    await updatePurchaseOrderStatus(id, status, receivedDate);
    res.json({ message: '采购订单状态已更新' });
  } catch (error) {
    res.status(500).json({ error: '更新采购订单状态失败' });
  }
});

// ==================== 入库管理 ====================

// 获取入库记录
router.get('/stock-in', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const records = await getStockInRecords(startDate, endDate);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: '获取入库记录失败' });
  }
});

// 创建入库记录
router.post('/stock-in', async (req, res) => {
  try {
    const result = await createStockInRecord({
      ...req.body,
      operator: req.user.username
    });
    res.json({ message: '入库记录创建成功', id: result.id });
  } catch (error) {
    res.status(500).json({ error: '创建入库记录失败' });
  }
});

// ==================== 出库管理 ====================

// 获取出库记录
router.get('/stock-out', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const records = await getStockOutRecords(startDate, endDate);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: '获取出库记录失败' });
  }
});

// 创建出库记录
router.post('/stock-out', async (req, res) => {
  try {
    const result = await createStockOutRecord({
      ...req.body,
      operator: req.user.username
    });
    res.json({ message: '出库记录创建成功', id: result.id, unitCost: result.unitCost });
  } catch (error) {
    res.status(500).json({ error: '创建出库记录失败' });
  }
});

// ==================== 成本核算 ====================

// 获取产品成本
router.get('/costs/:bearingId', async (req, res) => {
  try {
    const { bearingId } = req.params;
    const cost = await getProductCost(bearingId);
    res.json(cost);
  } catch (error) {
    res.status(500).json({ error: '获取产品成本失败' });
  }
});

// 获取利润分析
router.get('/profit-analysis', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '请提供开始和结束日期' });
    }
    const analysis = await getProfitAnalysis(startDate, endDate);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: '获取利润分析失败' });
  }
});

module.exports = router;
