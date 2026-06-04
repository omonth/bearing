const logger = require('../logger');

class CouponService {
  constructor(db) {
    this.db = db;
  }

  async list(status) {
    try {
      let query = 'SELECT * FROM coupons WHERE 1=1';
      const params = [];
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY created_at DESC';
      const rows = await this.db.all(query, params);
      return { data: rows, error: null };
    } catch (error) {
      logger.error('获取优惠券列表失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async create({ code, name, type, discountValue, minOrderAmount, totalQuantity, validFrom, validUntil }) {
    try {
      const result = await this.db.run(
        'INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [code, name, type, discountValue || 0, minOrderAmount || 0, totalQuantity || 1000, validFrom, validUntil]
      );
      logger.info('优惠券创建成功', { code, name });
      return { data: { id: result.lastID, message: '优惠券创建成功' }, error: null };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return { data: null, error: '优惠券代码已存在', status: 400 };
      }
      logger.error('创建优惠券失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async issue(couponId, customerIds) {
    try {
      if (!customerIds || !customerIds.length) {
        return { data: null, error: '请指定客户', status: 400 };
      }
      for (const customerId of customerIds) {
        await this.db.run('INSERT INTO customer_coupons (customer_id, coupon_id) VALUES (?, ?)', [customerId, couponId]);
      }
      logger.info('优惠券发放成功', { couponId, count: customerIds.length });
      return { data: { message: `成功发放给${customerIds.length}个客户` }, error: null };
    } catch (error) {
      logger.error('发放优惠券失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async use({ code, customerId, orderId }) {
    try {
      if (!code || !customerId || !orderId) {
        return { data: null, error: '缺少参数', status: 400 };
      }

      const coupon = await this.db.get('SELECT * FROM coupons WHERE code = ? AND status = ?', [code, 'active']);
      if (!coupon) return { data: null, error: '优惠券不存在或已失效', status: 400 };

      const customerCoupon = await this.db.get(
        'SELECT * FROM customer_coupons WHERE customer_id = ? AND coupon_id = ? AND status = ?',
        [customerId, coupon.id, 'unused']
      );
      if (!customerCoupon) return { data: null, error: '该客户没有此优惠券或已使用', status: 400 };

      // 日期校验
      const now = new Date().toISOString().split('T')[0];
      if (coupon.valid_from && coupon.valid_from > now) return { data: null, error: '优惠券尚未生效', status: 400 };
      if (coupon.valid_until && coupon.valid_until < now) return { data: null, error: '优惠券已过期', status: 400 };

      // 库存校验
      if (coupon.used_quantity >= coupon.total_quantity) return { data: null, error: '优惠券已用完', status: 400 };

      // 折扣计算
      let discountAmount = 0;
      if (coupon.type === 'fixed') {
        discountAmount = coupon.discount_value;
      } else if (coupon.type === 'percentage') {
        const order = await this.db.get('SELECT total_price FROM orders WHERE id = ?', [orderId]);
        if (order) {
          discountAmount = order.total_price * (coupon.discount_value / 100);
        }
      }

      // 最低订单金额校验
      if (coupon.min_order_amount > 0) {
        const order = await this.db.get('SELECT total_price FROM orders WHERE id = ?', [orderId]);
        if (order && order.total_price < coupon.min_order_amount) {
          return { data: null, error: `订单金额不足，最低需 ¥${coupon.min_order_amount}`, status: 400 };
        }
      }

      await this.db.run(
        'UPDATE customer_coupons SET status = ?, used_order_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['used', orderId, customerCoupon.id]
      );
      await this.db.run('UPDATE coupons SET used_quantity = used_quantity + 1 WHERE id = ?', [coupon.id]);

      logger.info('优惠券使用成功', { code, customerId, orderId, discountAmount });
      return { data: { message: '优惠券使用成功', discountAmount: Math.round(discountAmount * 100) / 100 }, error: null };
    } catch (error) {
      logger.error('使用优惠券失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async listForCustomer(customerId) {
    try {
      const coupons = await this.db.all(
        `SELECT cc.*, c.name as coupon_name, c.code, c.type, c.discount_value, c.min_order_amount, c.valid_from, c.valid_until
         FROM customer_coupons cc JOIN coupons c ON cc.coupon_id = c.id
         WHERE cc.customer_id = ? AND cc.status = 'unused' AND c.status = 'active'
         ORDER BY cc.created_at DESC`,
        [customerId]
      );
      return { data: coupons, error: null };
    } catch (error) {
      logger.error('获取顾客优惠券失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }
}

module.exports = CouponService;
