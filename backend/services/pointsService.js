const logger = require('../logger');

class PointsService {
  constructor(db, customerService) {
    this.db = db;
    this.customerService = customerService || null;
  }

  async getRecords(customerId) {
    try {
      const rows = await this.db.all(
        'SELECT * FROM points_records WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100',
        [customerId]
      );
      const total = await this.db.get('SELECT SUM(points) as total FROM points_records WHERE customer_id = ?', [customerId]);
      return { data: { items: rows, totalPoints: total ? total.total : 0 }, error: null };
    } catch (error) {
      logger.error('获取积分记录失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async addPoints(customerId, points, type, reason, orderId) {
    try {
      if (!points || !type) return { data: null, error: '积分和类型不能为空', status: 400 };
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
      return { data: { message: '积分添加成功' }, error: null };
    } catch (error) {
      logger.error('添加积分失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async deductPoints(customerId, points, reason) {
    try {
      const customer = await this.db.get('SELECT points FROM customers WHERE id = ?', [customerId]);
      if (!customer || customer.points < points) {
        return { data: null, error: '积分不足', status: 400 };
      }
      await this.db.run(
        'INSERT INTO points_records (customer_id, points, type, reason) VALUES (?, ?, ?, ?)',
        [customerId, -points, 'deduct', reason || '扣减']
      );
      await this.db.run('UPDATE customers SET points = points - ? WHERE id = ?', [points, customerId]);
      return { data: { message: '积分扣减成功' }, error: null };
    } catch (error) {
      logger.error('扣减积分失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }
}

module.exports = PointsService;
