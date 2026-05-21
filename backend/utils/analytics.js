const logger = require('../logger');

class Analytics {
  constructor(db) {
    this.db = db;
  }

  async getSalesTrend(period = 'day', days = 30) {
    let dateFormat;
    if (this.db.type === 'postgres') {
      switch (period) {
        case 'week':
          dateFormat = "TO_CHAR(o.created_at, 'IYYY-IW')";
          break;
        case 'month':
          dateFormat = "TO_CHAR(o.created_at, 'YYYY-MM')";
          break;
        default:
          dateFormat = "DATE(o.created_at)";
      }
    } else {
      switch (period) {
        case 'week':
          dateFormat = "strftime('%Y-W%W', o.created_at)";
          break;
        case 'month':
          dateFormat = "strftime('%Y-%m', o.created_at)";
          break;
        default:
          dateFormat = "DATE(o.created_at)";
      }
    }

    const interval = this.db.type === 'postgres'
      ? `CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `datetime('now', '-${days} days')`;

    const query = `
      SELECT
        ${dateFormat} as period,
        COUNT(DISTINCT o.id) as order_count,
        SUM(o.total_price) as revenue,
        SUM(oi.quantity) as items_sold
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.created_at >= ${interval}
        AND o.status != 'cancelled'
      GROUP BY period
      ORDER BY period ASC
    `;

    return await this.db.all(query);
  }

  async getTopSellingProducts(limit = 10, days = 30) {
    const interval = this.db.type === 'postgres'
      ? `CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `datetime('now', '-${days} days')`;

    return await this.db.all(`
      SELECT
        b.id,
        b.name,
        b.model,
        b.category,
        b.price,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM bearings b
      JOIN order_items oi ON b.id = oi.bearing_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= ${interval}
        AND o.status != 'cancelled'
      GROUP BY b.id
      ORDER BY total_sold DESC
      LIMIT ?
    `, [limit]);
  }

  async getCategorySales(days = 30) {
    const interval = this.db.type === 'postgres'
      ? `CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `datetime('now', '-${days} days')`;

    return await this.db.all(`
      SELECT
        b.category,
        COUNT(DISTINCT b.id) as product_count,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue,
        AVG(oi.price) as avg_price
      FROM bearings b
      JOIN order_items oi ON b.id = oi.bearing_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= ${interval}
        AND o.status != 'cancelled'
      GROUP BY b.category
      ORDER BY total_revenue DESC
    `);
  }

  async getCustomerDistribution() {
    return await this.db.all(`
      SELECT
        COALESCE(NULLIF(province, ''), '其他') as region,
        COUNT(*) as order_count,
        SUM(total_price) as total_revenue
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY province
      ORDER BY total_revenue DESC
    `);
  }

  async getRevenueStats(days = 30) {
    const interval = this.db.type === 'postgres'
      ? `CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `datetime('now', '-${days} days')`;

    return await this.db.get(`
      SELECT
        COUNT(*) as total_orders,
        SUM(total_price) as total_revenue,
        AVG(total_price) as avg_order_value,
        MAX(total_price) as max_order_value,
        MIN(total_price) as min_order_value
      FROM orders
      WHERE created_at >= ${interval}
        AND status != 'cancelled'
    `);
  }

  async getRealtimeSales() {
    let hourFormat;
    if (this.db.type === 'postgres') {
      hourFormat = "TO_CHAR(o.created_at, 'HH24:00')";
    } else {
      hourFormat = "strftime('%H:00', o.created_at)";
    }

    const interval = this.db.type === 'postgres'
      ? "CURRENT_TIMESTAMP - INTERVAL '24 hours'"
      : "datetime('now', '-24 hours')";

    return await this.db.all(`
      SELECT
        ${hourFormat} as hour,
        COUNT(*) as order_count,
        SUM(o.total_price) as revenue
      FROM orders o
      WHERE o.created_at >= ${interval}
        AND o.status != 'cancelled'
      GROUP BY hour
      ORDER BY hour ASC
    `);
  }

  async getDashboardSummary() {
    const [revenueStats, topProducts, categorySales, customerDistribution, realtimeSales] = await Promise.all([
      this.getRevenueStats(30),
      this.getTopSellingProducts(5, 30),
      this.getCategorySales(30),
      this.getCustomerDistribution(),
      this.getRealtimeSales()
    ]);

    return { revenue: revenueStats, topProducts, categorySales, customerDistribution, realtimeSales };
  }
}

module.exports = Analytics;
