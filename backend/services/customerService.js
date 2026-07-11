const logger = require('../logger');
const { NotFoundError, ValidationError, ConflictError, BusinessError } = require('../utils/errors');

class CustomerService {
  constructor(db) {
    this.db = db;
  }

  async list({ level, status, search, page = 1, pageSize = 20 }) {
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    if (level) { query += ' AND level = ?'; params.push(level); }
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (search) { query += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    params.push(parseInt(pageSize), offset);
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = await this.db.all(query, params);
    const items = rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
    return { total: rows.length, page: parseInt(page), pageSize: parseInt(pageSize), items };
  }

  async getById(id) {
    const customer = await this.db.get('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) throw new NotFoundError('客户');
    customer.tags = JSON.parse(customer.tags || '[]');
    const [orders, interactions, coupons] = await Promise.all([
      this.db.all('SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 10', [customer.phone]),
      this.db.all('SELECT * FROM customer_interactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20', [id]),
      this.db.all(
        `SELECT cc.*, c.name as coupon_name, c.type as coupon_type, c.discount_value
         FROM customer_coupons cc JOIN coupons c ON cc.coupon_id = c.id
         WHERE cc.customer_id = ? ORDER BY cc.created_at DESC`, [id]
      )
    ]);
    return { ...customer, recentOrders: orders, recentInteractions: interactions, coupons };
  }

  async create({ name, phone, email, company, address, notes }) {
    if (!name || !phone) throw new ValidationError('姓名和电话不能为空');
    try {
      const result = await this.db.run(
        'INSERT INTO customers (name, phone, email, company, address, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [name, phone, email || null, company || null, address || null, notes || null]
      );
      logger.info('客户创建成功', { id: result.lastID, name });
      return { id: result.lastID, message: '客户创建成功' };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        throw new ConflictError('该手机号已存在');
      }
      throw error;
    }
  }

  async update(id, fields) {
    const { name, email, company, address, tags, notes, status } = fields;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (company !== undefined) { updates.push('company = ?'); params.push(company); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (updates.length === 0) throw new ValidationError('没有要更新的字段');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await this.db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
    logger.info('客户信息更新成功', { id });
    return { message: '客户信息更新成功' };
  }

  async recordInteraction({ customerId, type, content, employee }) {
    const result = await this.db.run(
      'INSERT INTO customer_interactions (customer_id, type, content, employee) VALUES (?, ?, ?, ?)',
      [customerId, type, content, employee]
    );
    return { id: result.lastID, message: '互动记录添加成功' };
  }

  async listFeedback(status) {
    let query = `SELECT cf.*, c.name as customer_name FROM customer_feedback cf JOIN customers c ON cf.customer_id = c.id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND cf.status = ?'; params.push(status); }
    query += ' ORDER BY cf.created_at DESC';
    const rows = await this.db.all(query, params);
    return rows;
  }

  async replyFeedback(id, reply) {
    await this.db.run('UPDATE customer_feedback SET reply = ?, status = ? WHERE id = ?', [reply, 'replied', id]);
    return { message: '回复成功' };
  }

  async getDashboard() {
    const [totalCustomers, levelDistribution, pointsSummary, couponStats] = await Promise.all([
      this.db.get('SELECT COUNT(*) as total FROM customers'),
      this.db.all('SELECT level, COUNT(*) as count FROM customers GROUP BY level'),
      this.db.get('SELECT SUM(points) as totalPoints FROM customers'),
      this.db.get(`SELECT COUNT(*) as totalCoupons, SUM(used_quantity) as usedCoupons, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeCoupons FROM coupons`)
    ]);
    return { totalCustomers: totalCustomers.total, levelDistribution, totalPoints: pointsSummary.totalPoints, couponStats };
  }

  async getLevels() {
    const levels = await this.db.all('SELECT * FROM customer_levels ORDER BY min_points ASC');
    return levels.map(l => ({ ...l, perks: JSON.parse(l.perks || '[]') }));
  }

  async upgradeLevel(customerId) {
    const customer = await this.db.get('SELECT points FROM customers WHERE id = ?', [customerId]);
    if (!customer) return;
    const newLevel = await this.db.get(
      'SELECT level FROM customer_levels WHERE min_points <= ? ORDER BY min_points DESC LIMIT 1',
      [customer.points]
    );
    if (newLevel) {
      await this.db.run('UPDATE customers SET level = ? WHERE id = ?', [newLevel.level, customerId]);
    }
  }
}

module.exports = CustomerService;
