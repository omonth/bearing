const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');

module.exports = function(inventoryAlert) {
  const router = express.Router();

  router.get('/low-stock', verifyToken, requireAdmin, async (req, res, next) => {
    try { res.json(await inventoryAlert.getLowStockProducts()); } catch (e) { next(e); }
  });

  router.get('/out-of-stock', verifyToken, requireAdmin, async (req, res, next) => {
    try { res.json(await inventoryAlert.getOutOfStockProducts()); } catch (e) { next(e); }
  });

  router.get('/summary', verifyToken, requireAdmin, async (req, res, next) => {
    try { res.json(await inventoryAlert.getInventorySummary()); } catch (e) { next(e); }
  });

  return router;
};
