const express = require('express');
const { verifyToken } = require('../middleware/auth');

module.exports = function(db, analytics) {
  const router = express.Router();

  router.get('/dashboard', verifyToken, async (req, res) => {
    try {
      const data = await analytics.getDashboardSummary();
      const salesTrend = await analytics.getSalesTrend('day', 30);
      const recentOrders = await db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10', []);
      res.json({ ...data, salesTrend, recentOrders });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
