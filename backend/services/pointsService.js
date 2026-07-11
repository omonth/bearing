const logger = require('../logger');
const { ValidationError, BusinessError } = require('../utils/errors');

class PointsService {
  constructor(db, customerService) {
    this.db = db;
    this.customerService = customerService || null;
  }

  async getRecords(customerId) {
    const rows = await this.db.all(
      'SELECT * FROM points_records WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100',
      [customerId]
    );
    const total = await this.db.get('SELECT SUM(points) as total FROM points_records WHERE customer_id = ?', [customerId]);
    return { items: rows, totalPoints: total ? total.total : 0 };
  }

  async addPoints(customerId, points, type, reason, orderId) {
    if (!points || !type) throw new ValidationError('积分和类型不能为空');
    await this.db.run(
      'INSERT INTO points_records (customer_id, points, type, reason, order_id) VALUES (?, ?, ?, ?, ?)',
      [customerId, points, type, reason || null, orderId || null]
    );
    await this.db.run('UPDATE customers SET points = points + ? WHERE id = ?', [points, customerId]);

    // 触发等级升级
    if (this.customerService) {
      await this.customerService.upgradeLevel(customerId);
    } else {
      const customer = await this.db.get('SELECT points FROM customers WHERE id = ?', [customerId]);
      if (customer) {
        const newLevel = await this.db.get(
          'SELECT level FROM customer_levels WHERE min_points <= ? ORDER BY min_points DESC LIMIT 1',
          [customer.points]
        );
        if (newLevel) {
          await this.db.run('UPDATE customers SET level = ? WHERE id = ?', [newLevel.level, customerId]);
        }
      }
    }

    logger.info('积分添加成功', { customerId, points });
    return { message: '积分添加成功' };
  }

  async deductPoints(customerId, points, reason) {
    const customer = await this.db.get('SELECT points FROM customers WHERE id = ?', [customerId]);
    if (!customer || customer.points < points) {
      throw new BusinessError('积分不足');
    }
    await this.db.run(
      'INSERT INTO points_records (customer_id, points, type, reason) VALUES (?, ?, ?, ?)',
      [customerId, -points, 'deduct', reason || '扣减']
    );
    await this.db.run('UPDATE customers SET points = points - ? WHERE id = ?', [points, customerId]);
    return { message: '积分扣减成功' };
  }
}

module.exports = PointsService;
