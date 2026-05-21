const logger = require('../logger');

class RecommendationEngine {
  constructor(db) {
    this.db = db;
  }

  async getCollaborativeRecommendations(productId, limit = 5) {
    return await this.db.all(`
      SELECT
        b2.id,
        b2.name,
        b2.model,
        b2.price,
        b2.image,
        b2.category,
        COUNT(DISTINCT o.id) as co_purchase_count,
        AVG(b2.price) as avg_price
      FROM order_items oi1
      JOIN orders o ON oi1.order_id = o.id
      JOIN order_items oi2 ON o.id = oi2.order_id
      JOIN bearings b2 ON oi2.bearing_id = b2.id
      WHERE oi1.bearing_id = ?
        AND oi2.bearing_id != ?
        AND o.status != 'cancelled'
        AND b2.stock > 0
      GROUP BY b2.id
      ORDER BY co_purchase_count DESC, avg_price DESC
      LIMIT ?
    `, [productId, productId, limit]);
  }

  async getSimilarProducts(productId, limit = 5) {
    const product = await this.db.get('SELECT * FROM bearings WHERE id = ?', [productId]);
    if (!product) throw new Error('产品不存在');

    const rows = await this.db.all(`
      SELECT
        *,
        ABS(price - ?) as price_diff,
        ABS(inner_diameter - ?) as inner_diff,
        ABS(outer_diameter - ?) as outer_diff
      FROM bearings
      WHERE id != ?
        AND category = ?
        AND stock > 0
      ORDER BY (price_diff + inner_diff + outer_diff) ASC
      LIMIT ?
    `, [product.price, product.inner_diameter, product.outer_diameter, productId, product.category, limit]);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      stock: row.stock,
      specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width }
    }));
  }

  async getHotProducts(limit = 10, days = 30) {
    const interval = this.db.dateInterval(`-${days} days`);

    const rows = await this.db.all(`
      SELECT
        b.*,
        SUM(oi.quantity) as total_sold,
        COUNT(DISTINCT o.id) as order_count,
        SUM(oi.quantity * oi.price) as revenue
      FROM bearings b
      JOIN order_items oi ON b.id = oi.bearing_id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= ${interval}
        AND o.status != 'cancelled'
        AND b.stock > 0
      GROUP BY b.id
      ORDER BY total_sold DESC, revenue DESC
      LIMIT ?
    `, [limit]);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      stock: row.stock,
      total_sold: row.total_sold,
      order_count: row.order_count,
      specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width }
    }));
  }

  async getNewProducts(limit = 10) {
    const rows = await this.db.all(`
      SELECT * FROM bearings
      WHERE stock > 0
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit]);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      stock: row.stock,
      created_at: row.created_at,
      specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width }
    }));
  }

  async getPersonalizedRecommendations(customerPhone, limit = 10) {
    const categories = await this.db.all(`
      SELECT DISTINCT b.category
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN bearings b ON oi.bearing_id = b.id
      WHERE o.customer_phone = ?
        AND o.status != 'cancelled'
    `, [customerPhone]);

    if (categories.length === 0) {
      return this.getHotProducts(limit);
    }

    const categoryList = categories.map(c => c.category);
    const placeholders = categoryList.map(() => '?').join(',');

    const rows = await this.db.all(`
      SELECT
        b.*,
        SUM(oi.quantity) as total_sold
      FROM bearings b
      LEFT JOIN order_items oi ON b.id = oi.bearing_id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE b.category IN (${placeholders})
        AND b.stock > 0
        AND b.id NOT IN (
          SELECT DISTINCT oi2.bearing_id
          FROM orders o2
          JOIN order_items oi2 ON o2.id = oi2.order_id
          WHERE o2.customer_phone = ?
        )
      GROUP BY b.id
      ORDER BY total_sold DESC
      LIMIT ?
    `, [...categoryList, customerPhone, limit]);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      stock: row.stock,
      specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width }
    }));
  }

  async getMixedRecommendations(productId = null, customerPhone = null, limit = 10) {
    const recommendations = [];

    if (productId) {
      const collaborative = await this.getCollaborativeRecommendations(productId, 3);
      recommendations.push(...collaborative.map(p => ({ ...p, reason: '购买此产品的用户也购买了' })));
    }

    if (customerPhone) {
      const personalized = await this.getPersonalizedRecommendations(customerPhone, 3);
      recommendations.push(...personalized.map(p => ({ ...p, reason: '根据您的购买历史推荐' })));
    }

    const hot = await this.getHotProducts(4);
    recommendations.push(...hot.map(p => ({ ...p, reason: '热销产品' })));

    const uniqueRecommendations = [];
    const seenIds = new Set();
    for (const rec of recommendations) {
      if (!seenIds.has(rec.id) && uniqueRecommendations.length < limit) {
        seenIds.add(rec.id);
        uniqueRecommendations.push(rec);
      }
    }

    return uniqueRecommendations;
  }
}

module.exports = RecommendationEngine;
