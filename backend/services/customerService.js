const logger = require('../logger');

class CustomerService {
  constructor(db) {
    this.db = db;
  }

  async list({ level, status, search, page = 1, pageSize = 20 }) {
    try {
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
      return { data: { total: rows.length, page: parseInt(page), pageSize: parseInt(pageSize), items }, error: null };
    } catch (error) {
      logger.error('获取客户列表失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async getById(id) {
    try {
      const customer = await this.db.get('SELECT * FROM customers WHERE id = ?', [id]);
      if (!customer) return { data: null, error: '客户不存在', status: 404 };
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
      return { data: { ...customer, recentOrders: orders, recentInteractions: interactions, coupons }, error: null };
    } catch (error) {
      logger.error('获取客户详情失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async create({ name, phone, email, company, address, notes }) {
    try {
      if (!name || !phone) return { data: null, error: '姓名和电话不能为空', status: 400 };
      const result = await this.db.run(
        'INSERT INTO customers (name, phone, email, company, address, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [name, phone, email || null, company || null, address || null, notes || null]
      );
      logger.info('客户创建成功', { id: result.lastID, name });
      return { data: { id: result.lastID, message: '客户创建成功' }, error: null };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return { data: null, error: '该手机号已存在', status: 400 };
      }
      logger.error('创建客户失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async update(id, fields) {
    try {
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
      if (updates.length === 0) return { data: null, error: '没有要更新的字段', status: 400 };
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      await this.db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
      logger.info('客户信息更新成功', { id });
      return { data: { message: '客户信息更新成功' }, error: null };
    } catch (error) {
      logger.error('更新客户失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async recordInteraction({ customerId, type, content, employee }) {
    try {
      const result = await this.db.run(
        'INSERT INTO customer_interactions (customer_id, type, content, employee) VALUES (?, ?, ?, ?)',
        [customerId, type, content, employee]
      );
      return { data: { id: result.lastID, message: '互动记录添加成功' }, error: null };
    } catch (error) {
      logger.error('添加互动记录失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async listFeedback(status) {
    try {
      let query = `SELECT cf.*, c.name as customer_name FROM customer_feedback cf JOIN customers c ON cf.customer_id = c.id WHERE 1=1`;
      const params = [];
      if (status) { query += ' AND cf.status = ?'; params.push(status); }
      query += ' ORDER BY cf.created_at DESC';
      const rows = await this.db.all(query, params);
      return { data: rows, error: null };
    } catch (error) {
      logger.error('获取反馈列表失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async replyFeedback(id, reply) {
    try {
      await this.db.run('UPDATE customer_feedback SET reply = ?, status = ? WHERE id = ?', [reply, 'replied', id]);
      return { data: { message: '回复成功' }, error: null };
    } catch (error) {
      logger.error('回复反馈失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async getDashboard() {
    try {
      const [totalCustomers, levelDistribution, pointsSummary, couponStats] = await Promise.all([
        this.db.get('SELECT COUNT(*) as total FROM customers'),
        this.db.all('SELECT level, COUNT(*) as count FROM customers GROUP BY level'),
        this.db.get('SELECT SUM(points) as totalPoints FROM customers'),
        this.db.get(`SELECT COUNT(*) as totalCoupons, SUM(used_quantity) as usedCoupons, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeCoupons FROM coupons`)
      ]);
      return { data: { totalCustomers: totalCustomers.total, levelDistribution, totalPoints: pointsSummary.totalPoints, couponStats }, error: null };
    } catch (error) {
      logger.error('获取CRM仪表盘失败', { error: error.message });
      return { data: null, error: error.message, status: 500 };
    }
  }

  async getLevels() {
    try {
      const levels = await this.db.all('SELECT * FROM customer_levels ORDER BY min_points ASC');
      return { data: levels.map(l => ({ ...l, perks: JSON.parse(l.perks || '[]') })), error: null };
    } catch (error) {
      return { data: null, error: error.message, status: 500 };
    }
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
