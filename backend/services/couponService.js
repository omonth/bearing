const logger = require('../logger');
const {
  BusinessError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../utils/errors');

class CouponService {
  constructor(db) {
    this.db = db;
  }

  async list(status) {
    let query = 'SELECT * FROM coupons WHERE 1=1';
    const params = [];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY created_at DESC';
    const rows = await this.db.all(query, params);
    return rows;
  }

  async create({ code, name, type, discountValue, minOrderAmount, totalQuantity, validFrom, validUntil }) {
    try {
      const result = await this.db.run(
        'INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [code, name, type, discountValue || 0, minOrderAmount || 0, totalQuantity || 1000, validFrom, validUntil]
      );
      logger.info('优惠券创建成功', { code, name });
      return { id: result.lastID, message: '优惠券创建成功' };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        throw new ConflictError('优惠券代码已存在');
      }
      throw error;
    }
  }

  async issue(couponId, customerIds) {
    if (!customerIds || !customerIds.length) {
      throw new ValidationError('请指定客户');
    }
    for (const customerId of customerIds) {
      await this.db.run('INSERT INTO customer_coupons (customer_id, coupon_id) VALUES (?, ?)', [customerId, couponId]);
    }
    logger.info('优惠券发放成功', { couponId, count: customerIds.length });
    return { message: `成功发放给${customerIds.length}个客户` };
  }

  async use({ code, customerId, orderId }) {
    if (!code || !customerId || !orderId) {
      throw new ValidationError('缺少参数');
    }

    const result = await this.db.transaction(async (tx) => {
      const coupon = await tx.get('SELECT * FROM coupons WHERE code = ? AND status = ?', [code, 'active']);
      if (!coupon) throw new BusinessError('优惠券不存在或已失效');

      const [customer, order, existingOrderCoupon] = await Promise.all([
        tx.get('SELECT phone FROM customers WHERE id = ?', [customerId]),
        tx.get('SELECT id, customer_phone, total_price, status FROM orders WHERE id = ?', [orderId]),
        tx.get('SELECT id FROM customer_coupons WHERE used_order_id = ? AND status = ?', [orderId, 'used']),
      ]);
      if (!customer) throw new NotFoundError('客户');
      if (!order) throw new NotFoundError('订单');
      if (order.customer_phone !== customer.phone) {
        throw new ForbiddenError('无权对该订单使用优惠券');
      }
      if (order.status !== 'pending') {
        throw new BusinessError('只有待支付订单可以使用优惠券', 409, 'ORDER_NOT_PAYABLE');
      }
      if (existingOrderCoupon) {
        throw new ConflictError('该订单已使用优惠券');
      }

      const customerCoupon = await tx.get(
        'SELECT * FROM customer_coupons WHERE customer_id = ? AND coupon_id = ? AND status = ?',
        [customerId, coupon.id, 'unused']
      );
      if (!customerCoupon) throw new BusinessError('该客户没有此优惠券或已使用');

      const now = new Date().toISOString().split('T')[0];
      if (coupon.valid_from && coupon.valid_from > now) throw new BusinessError('优惠券尚未生效');
      if (coupon.valid_until && coupon.valid_until < now) throw new BusinessError('优惠券已过期');
      if (coupon.total_quantity !== null && coupon.used_quantity >= coupon.total_quantity) {
        throw new BusinessError('优惠券已用完');
      }
      if (coupon.min_order_amount > 0 && Number(order.total_price) < Number(coupon.min_order_amount)) {
        throw new BusinessError(`订单金额不足，最低需 ¥${coupon.min_order_amount}`);
      }

      let discountAmount = coupon.type === 'percentage'
        ? Number(order.total_price) * (Number(coupon.discount_value) / 100)
        : Number(coupon.discount_value);
      if (coupon.max_discount !== null && coupon.max_discount !== undefined) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount));
      }
      discountAmount = Math.min(discountAmount, Number(order.total_price));
      discountAmount = Math.round(discountAmount * 100) / 100;

      const couponUpdate = await tx.run(
        "UPDATE coupons SET used_quantity = used_quantity + 1 WHERE id = ? AND (total_quantity IS NULL OR used_quantity < total_quantity)",
        [coupon.id]
      );
      if (!couponUpdate || couponUpdate.changes !== 1) {
        throw new BusinessError('优惠券已用完');
      }
      const customerCouponUpdate = await tx.run(
        "UPDATE customer_coupons SET status = ?, used_order_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'unused'",
        ['used', orderId, customerCoupon.id]
      );
      if (!customerCouponUpdate || customerCouponUpdate.changes !== 1) {
        throw new ConflictError('优惠券已被使用');
      }
      return { discountAmount };
    });

    logger.info('优惠券使用成功', { code, customerId, orderId, discountAmount: result.discountAmount });
    return { message: '优惠券使用成功', discountAmount: result.discountAmount };
  }

  async listForCustomer(customerId) {
    const coupons = await this.db.all(
      `SELECT cc.*, c.name as coupon_name, c.code, c.type, c.discount_value, c.min_order_amount, c.valid_from, c.valid_until
       FROM customer_coupons cc JOIN coupons c ON cc.coupon_id = c.id
       WHERE cc.customer_id = ? AND cc.status = 'unused' AND c.status = 'active'
       ORDER BY cc.created_at DESC`,
      [customerId]
    );
    return coupons;
  }
}

module.exports = CouponService;
