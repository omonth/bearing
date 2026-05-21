const logger = require('../logger');

class InventoryAlert {
  constructor(db) {
    this.db = db;
    this.lowStockThreshold = process.env.LOW_STOCK_THRESHOLD || 10;
  }

  async getLowStockProducts() {
    return await this.db.all(
      'SELECT * FROM bearings WHERE stock <= ? AND stock > 0 ORDER BY stock ASC',
      [this.lowStockThreshold]
    );
  }

  async getOutOfStockProducts() {
    return await this.db.all('SELECT * FROM bearings WHERE stock = 0');
  }

  async getInventoryTurnover() {
    const interval = this.db.dateInterval('-30 days');

    return await this.db.all(`
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
      WHERE o.created_at >= ${interval} OR o.created_at IS NULL
      GROUP BY b.id
      ORDER BY turnover_rate DESC
    `);
  }

  async getSalesTrend(productId, days = 30) {
    const interval = this.db.dateInterval(`-${days} days`);

    return await this.db.all(`
      SELECT
        DATE(o.created_at) as date,
        SUM(oi.quantity) as quantity,
        SUM(oi.quantity * oi.price) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.bearing_id = ?
        AND o.created_at >= ${interval}
        AND o.status != 'cancelled'
      GROUP BY DATE(o.created_at)
      ORDER BY date ASC
    `, [productId]);
  }

  async getRestockSuggestions() {
    const interval = this.db.dateInterval('-30 days');

    return await this.db.all(`
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
        WHERE o.created_at >= ${interval}
          AND o.status != 'cancelled'
        GROUP BY oi.bearing_id, DATE(o.created_at)
      ) daily_sales ON b.id = daily_sales.bearing_id
      GROUP BY b.id
      HAVING days_until_stockout < 30 AND suggested_restock_quantity > 0
      ORDER BY days_until_stockout ASC
    `);
  }

  async getInventorySummary() {
    const [totalProducts, totalStock, lowStock, outOfStock, totalValue] = await Promise.all([
      this.db.get('SELECT COUNT(*) as count FROM bearings'),
      this.db.get('SELECT SUM(stock) as total FROM bearings'),
      this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock <= ? AND stock > 0', [this.lowStockThreshold]),
      this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock = 0'),
      this.db.get('SELECT SUM(stock * price) as value FROM bearings')
    ]);

    return {
      totalProducts: totalProducts.count,
      totalStock: totalStock.total || 0,
      lowStock: lowStock.count,
      outOfStock: outOfStock.count,
      totalValue: totalValue.value || 0
    };
  }
}

module.exports = InventoryAlert;
