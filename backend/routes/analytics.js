const express = require('express');
const { verifyToken } = require('../middleware/auth');

module.exports = function(db, analytics) {
  const router = express.Router();

  router.get('/dashboard', verifyToken, async (req, res, next) => {
    try {
      const data = await analytics.getDashboardSummary();
      const salesTrendRaw = await analytics.getSalesTrend('day', 30);
      const recentOrders = await db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10', []);

      const totalCustomers = data.customerDistribution
        ? data.customerDistribution.reduce((sum, c) => sum + (c.order_count || 0), 0)
        : 0;

      const salesTrend = salesTrendRaw.map(r => ({
        day: r.period,
        orders: r.order_count,
        revenue: r.revenue,
      }));

      res.json({
        ...data,
        totalSales: data.revenue?.total_revenue || 0,
        totalOrders: data.revenue?.total_orders || 0,
        totalCustomers,
        monthlyRevenue: data.revenue?.total_revenue || 0,
        salesTrend,
        recentOrders,
      });
    } catch (e) { next(e); }
  });

  return router;
};
