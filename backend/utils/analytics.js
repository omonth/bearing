const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');

class Analytics {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  // 获取销售趋势（按天、周、月）
  async getSalesTrend(period = 'day', days = 30) {
    return new Promise((resolve, reject) => {
      let dateFormat;
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

      const query = `
        SELECT
          ${dateFormat} as period,
          COUNT(DISTINCT o.id) as order_count,
          SUM(o.total_price) as revenue,
          SUM(oi.quantity) as items_sold
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.created_at >= datetime('now', '-${days} days')
          AND o.status != 'cancelled'
        GROUP BY period
        ORDER BY period ASC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('获取销售趋势失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取产品销量排行
  async getTopSellingProducts(limit = 10, days = 30) {
    return new Promise((resolve, reject) => {
      const query = `
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
        WHERE o.created_at >= datetime('now', '-${days} days')
          AND o.status != 'cancelled'
        GROUP BY b.id
        ORDER BY total_sold DESC
        LIMIT ?
      `;

      this.db.all(query, [limit], (err, rows) => {
        if (err) {
          logger.error('获取产品销量排行失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取分类销售统计
  async getCategorySales(days = 30) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          b.category,
          COUNT(DISTINCT b.id) as product_count,
          SUM(oi.quantity) as total_sold,
          SUM(oi.quantity * oi.price) as total_revenue,
          AVG(oi.price) as avg_price
        FROM bearings b
        JOIN order_items oi ON b.id = oi.bearing_id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= datetime('now', '-${days} days')
          AND o.status != 'cancelled'
        GROUP BY b.category
        ORDER BY total_revenue DESC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('获取分类销售统计失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取客户地区分布
  async getCustomerDistribution() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          COALESCE(NULLIF(province, ''), '其他') as region,
          COUNT(*) as order_count,
          SUM(total_price) as total_revenue
        FROM orders
        WHERE status != 'cancelled'
        GROUP BY province
        ORDER BY total_revenue DESC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('获取客户地区分布失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取收入统计
  async getRevenueStats(days = 30) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          COUNT(*) as total_orders,
          SUM(total_price) as total_revenue,
          AVG(total_price) as avg_order_value,
          MAX(total_price) as max_order_value,
          MIN(total_price) as min_order_value
        FROM orders
        WHERE created_at >= datetime('now', '-${days} days')
          AND status != 'cancelled'
      `;

      this.db.get(query, [], (err, row) => {
        if (err) {
          logger.error('获取收入统计失败', { error: err.message });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 获取实时销售监控（最近24小时）
  async getRealtimeSales() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          strftime('%H:00', o.created_at) as hour,
          COUNT(*) as order_count,
          SUM(o.total_price) as revenue
        FROM orders o
        WHERE o.created_at >= datetime('now', '-24 hours')
          AND o.status != 'cancelled'
        GROUP BY hour
        ORDER BY hour ASC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('获取实时销售监控失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取综合仪表板数据
  async getDashboardSummary() {
    try {
      const [
        revenueStats,
        topProducts,
        categorySales,
        customerDistribution,
        realtimeSales
      ] = await Promise.all([
        this.getRevenueStats(30),
        this.getTopSellingProducts(5, 30),
        this.getCategorySales(30),
        this.getCustomerDistribution(),
        this.getRealtimeSales()
      ]);

      return {
        revenue: revenueStats,
        topProducts,
        categorySales,
        customerDistribution,
        realtimeSales
      };
    } catch (error) {
      logger.error('获取仪表板摘要失败', { error: error.message });
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = Analytics;
