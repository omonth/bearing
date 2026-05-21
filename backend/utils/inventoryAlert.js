const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

class InventoryAlert {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
    this.lowStockThreshold = process.env.LOW_STOCK_THRESHOLD || 10;
  }

  // 获取低库存产品
  async getLowStockProducts() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM bearings WHERE stock <= ? AND stock > 0 ORDER BY stock ASC',
        [this.lowStockThreshold],
        (err, rows) => {
          if (err) {
            logger.error('获取低库存产品失败', { error: err.message });
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // 获取缺货产品
  async getOutOfStockProducts() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM bearings WHERE stock = 0',
        [],
        (err, rows) => {
          if (err) {
            logger.error('获取缺货产品失败', { error: err.message });
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // 获取库存周转率（最近30天）
  async getInventoryTurnover() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          b.id,
          b.name,
          b.model,
          b.stock as current_stock,
          COALESCE(SUM(oi.quantity), 0) as sold_quantity,
          CASE
            WHEN b.stock > 0 THEN CAST(COALESCE(SUM(oi.quantity), 0) AS FLOAT) / b.stock
            ELSE 0
          END as turnover_rate
        FROM bearings b
        LEFT JOIN order_items oi ON b.id = oi.bearing_id
        LEFT JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= datetime('now', '-30 days') OR o.created_at IS NULL
        GROUP BY b.id
        ORDER BY turnover_rate DESC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('获取库存周转率失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取销售趋势（最近7天、30天）
  async getSalesTrend(productId, days = 30) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          DATE(o.created_at) as date,
          SUM(oi.quantity) as quantity,
          SUM(oi.quantity * oi.price) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.bearing_id = ?
          AND o.created_at >= datetime('now', '-${days} days')
          AND o.status != 'cancelled'
        GROUP BY DATE(o.created_at)
        ORDER BY date ASC
      `;

      this.db.all(query, [productId], (err, rows) => {
        if (err) {
          logger.error('获取销售趋势失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 计算补货建议
  async getRestockSuggestions() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          b.id,
          b.name,
          b.model,
          b.stock as current_stock,
          COALESCE(AVG(daily_sales.quantity), 0) as avg_daily_sales,
          CASE
            WHEN COALESCE(AVG(daily_sales.quantity), 0) > 0
            THEN CAST(b.stock AS FLOAT) / AVG(daily_sales.quantity)
            ELSE 999
          END as days_until_stockout,
          CASE
            WHEN COALESCE(AVG(daily_sales.quantity), 0) > 0
            THEN CAST(AVG(daily_sales.quantity) * 30 - b.stock AS INTEGER)
            ELSE 0
          END as suggested_restock_quantity
        FROM bearings b
        LEFT JOIN (
          SELECT
            oi.bearing_id,
            DATE(o.created_at) as date,
            SUM(oi.quantity) as quantity
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE o.created_at >= datetime('now', '-30 days')
            AND o.status != 'cancelled'
          GROUP BY oi.bearing_id, DATE(o.created_at)
        ) daily_sales ON b.id = daily_sales.bearing_id
        GROUP BY b.id
        HAVING days_until_stockout < 30 AND suggested_restock_quantity > 0
        ORDER BY days_until_stockout ASC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('获取补货建议失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 获取库存统计摘要
  async getInventorySummary() {
    return new Promise((resolve, reject) => {
      const queries = {
        totalProducts: 'SELECT COUNT(*) as count FROM bearings',
        totalStock: 'SELECT SUM(stock) as total FROM bearings',
        lowStock: `SELECT COUNT(*) as count FROM bearings WHERE stock <= ${this.lowStockThreshold} AND stock > 0`,
        outOfStock: 'SELECT COUNT(*) as count FROM bearings WHERE stock = 0',
        totalValue: 'SELECT SUM(stock * price) as value FROM bearings'
      };

      const results = {};
      const promises = Object.entries(queries).map(([key, query]) => {
        return new Promise((resolve, reject) => {
          this.db.get(query, [], (err, row) => {
            if (err) reject(err);
            else {
              results[key] = row.count !== undefined ? row.count : (row.total || row.value || 0);
              resolve();
            }
          });
        });
      });

      Promise.all(promises)
        .then(() => resolve(results))
        .catch(reject);
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = InventoryAlert;
