const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');

class RecommendationEngine {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  // 基于协同过滤的推荐（购买了A的用户也购买了B）
  async getCollaborativeRecommendations(productId, limit = 5) {
    return new Promise((resolve, reject) => {
      const query = `
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
      `;

      this.db.all(query, [productId, productId, limit], (err, rows) => {
        if (err) {
          logger.error('协同过滤推荐失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 基于产品相似度的推荐（同类别、相似价格）
  async getSimilarProducts(productId, limit = 5) {
    return new Promise((resolve, reject) => {
      // 先获取目标产品信息
      this.db.get('SELECT * FROM bearings WHERE id = ?', [productId], (err, product) => {
        if (err || !product) {
          return reject(err || new Error('产品不存在'));
        }

        const query = `
          SELECT
            *,
            ABS(price - ?) as price_diff,
            ABS(inner_diameter - ?) as inner_diff,
            ABS(outer_diameter - ?) as outer_diff
          FROM bearings
          WHERE id != ?
            AND category = ?
            AND stock > 0
          ORDER BY
            (price_diff + inner_diff + outer_diff) ASC
          LIMIT ?
        `;

        this.db.all(
          query,
          [product.price, product.inner_diameter, product.outer_diameter, productId, product.category, limit],
          (err, rows) => {
            if (err) {
              logger.error('相似产品推荐失败', { error: err.message });
              reject(err);
            } else {
              resolve(rows.map(row => ({
                id: row.id,
                name: row.name,
                model: row.model,
                price: row.price,
                image: row.image,
                category: row.category,
                stock: row.stock,
                specs: {
                  innerDiameter: row.inner_diameter,
                  outerDiameter: row.outer_diameter,
                  width: row.width
                }
              })));
            }
          }
        );
      });
    });
  }

  // 热销产品推荐
  async getHotProducts(limit = 10, days = 30) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          b.*,
          SUM(oi.quantity) as total_sold,
          COUNT(DISTINCT o.id) as order_count,
          SUM(oi.quantity * oi.price) as revenue
        FROM bearings b
        JOIN order_items oi ON b.id = oi.bearing_id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= datetime('now', '-${days} days')
          AND o.status != 'cancelled'
          AND b.stock > 0
        GROUP BY b.id
        ORDER BY total_sold DESC, revenue DESC
        LIMIT ?
      `;

      this.db.all(query, [limit], (err, rows) => {
        if (err) {
          logger.error('热销产品推荐失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows.map(row => ({
            id: row.id,
            name: row.name,
            model: row.model,
            price: row.price,
            image: row.image,
            category: row.category,
            stock: row.stock,
            total_sold: row.total_sold,
            order_count: row.order_count,
            specs: {
              innerDiameter: row.inner_diameter,
              outerDiameter: row.outer_diameter,
              width: row.width
            }
          })));
        }
      });
    });
  }

  // 新品推荐
  async getNewProducts(limit = 10) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM bearings
        WHERE stock > 0
        ORDER BY created_at DESC
        LIMIT ?
      `;

      this.db.all(query, [limit], (err, rows) => {
        if (err) {
          logger.error('新品推荐失败', { error: err.message });
          reject(err);
        } else {
          resolve(rows.map(row => ({
            id: row.id,
            name: row.name,
            model: row.model,
            price: row.price,
            image: row.image,
            category: row.category,
            stock: row.stock,
            created_at: row.created_at,
            specs: {
              innerDiameter: row.inner_diameter,
              outerDiameter: row.outer_diameter,
              width: row.width
            }
          })));
        }
      });
    });
  }

  // 基于用户购买历史的个性化推荐
  async getPersonalizedRecommendations(customerPhone, limit = 10) {
    return new Promise((resolve, reject) => {
      // 获取用户购买过的产品类别
      const query = `
        SELECT DISTINCT b.category
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN bearings b ON oi.bearing_id = b.id
        WHERE o.customer_phone = ?
          AND o.status != 'cancelled'
      `;

      this.db.all(query, [customerPhone], (err, categories) => {
        if (err) {
          return reject(err);
        }

        if (categories.length === 0) {
          // 如果没有购买历史，返回热销产品
          return this.getHotProducts(limit).then(resolve).catch(reject);
        }

        const categoryList = categories.map(c => c.category);
        const placeholders = categoryList.map(() => '?').join(',');

        // 推荐用户喜欢的类别中的热销产品
        const recommendQuery = `
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
        `;

        this.db.all(
          recommendQuery,
          [...categoryList, customerPhone, limit],
          (err, rows) => {
            if (err) {
              logger.error('个性化推荐失败', { error: err.message });
              reject(err);
            } else {
              resolve(rows.map(row => ({
                id: row.id,
                name: row.name,
                model: row.model,
                price: row.price,
                image: row.image,
                category: row.category,
                stock: row.stock,
                specs: {
                  innerDiameter: row.inner_diameter,
                  outerDiameter: row.outer_diameter,
                  width: row.width
                }
              })));
            }
          }
        );
      });
    });
  }

  // 综合推荐（混合多种推荐策略）
  async getMixedRecommendations(productId = null, customerPhone = null, limit = 10) {
    try {
      const recommendations = [];

      // 如果有产品ID，添加协同过滤推荐
      if (productId) {
        const collaborative = await this.getCollaborativeRecommendations(productId, 3);
        recommendations.push(...collaborative.map(p => ({ ...p, reason: '购买此产品的用户也购买了' })));
      }

      // 如果有客户电话，添加个性化推荐
      if (customerPhone) {
        const personalized = await this.getPersonalizedRecommendations(customerPhone, 3);
        recommendations.push(...personalized.map(p => ({ ...p, reason: '根据您的购买历史推荐' })));
      }

      // 添加热销产品
      const hot = await this.getHotProducts(4);
      recommendations.push(...hot.map(p => ({ ...p, reason: '热销产品' })));

      // 去重并限制数量
      const uniqueRecommendations = [];
      const seenIds = new Set();

      for (const rec of recommendations) {
        if (!seenIds.has(rec.id) && uniqueRecommendations.length < limit) {
          seenIds.add(rec.id);
          uniqueRecommendations.push(rec);
        }
      }

      return uniqueRecommendations;
    } catch (error) {
      logger.error('综合推荐失败', { error: error.message });
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = RecommendationEngine;
