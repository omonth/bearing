const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');

module.exports = function(inventoryAlert) {
  const router = express.Router();

  router.get('/low-stock', verifyToken, requireAdmin, async (req, res) => {
    try { res.json(await inventoryAlert.getLowStockProducts()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/out-of-stock', verifyToken, requireAdmin, async (req, res) => {
    try { res.json(await inventoryAlert.getOutOfStockProducts()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/summary', verifyToken, requireAdmin, async (req, res) => {
    try { res.json(await inventoryAlert.getInventorySummary()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
