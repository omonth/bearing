const express = require('express');
const router = express.Router();
const logger = require('../logger');

module.exports = function(db) {
  const { verifyToken, requireAdmin } = require('../middleware/auth');

  const runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  const getAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

  const allAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

  // Initialize CRM tables
  async function initCRMTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(100),
        company VARCHAR(200),
        address TEXT,
        level VARCHAR(20) DEFAULT 'bronze',
        points INTEGER DEFAULT 0,
        total_spent DECIMAL(12,2) DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        notes TEXT,
        status VARCHAR(20) DEFAULT 'active',
        birthday DATE,
        last_purchase_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customer_levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        min_points INTEGER NOT NULL,
        discount_rate DECIMAL(5,2) DEFAULT 0,
        perks TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS points_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        reason TEXT,
        order_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )`,
      `CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        discount_value DECIMAL(10,2),
        min_order_amount DECIMAL(10,2) DEFAULT 0,
        total_quantity INTEGER DEFAULT 0,
        used_quantity INTEGER DEFAULT 0,
        valid_from DATE,
        valid_until DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customer_coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        coupon_id INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'unused',
        used_order_id INTEGER,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (coupon_id) REFERENCES coupons(id)
      )`,
      `CREATE TABLE IF NOT EXISTS customer_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(50) UNIQUE NOT NULL,
        color VARCHAR(7) DEFAULT '#1890ff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customer_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        content TEXT,
        employee VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )`,
      `CREATE TABLE IF NOT EXISTS customer_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        order_id INTEGER,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        content TEXT,
        reply TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )`
    ];

    for (const sql of tables) {
      try { await runAsync(sql); } catch (e) { /* ignore */ }
    }

    // Seed customer levels
    const levels = [
      ['bronze', '青铜会员', 0, 0, '["基础服务"]'],
      ['silver', '白银会员', 1000, 5, '["5%折扣","优先发货"]'],
      ['gold', '黄金会员', 5000, 10, '["10%折扣","专属客服"]'],
      ['platinum', '铂金会员', 10000, 15, '["15%折扣","免运费"]'],
      ['diamond', '钻石会员', 50000, 20, '["20%折扣","定制服务"]']
    ];

    for (const [level, name, minPoints, discount, perks] of levels) {
      try {
        await runAsync(
          `INSERT OR IGNORE INTO customer_levels (level, name, min_points, discount_rate, perks) VALUES (?, ?, ?, ?, ?)`,
          [level, name, minPoints, discount, perks]
        );
      } catch (e) { /* ignore duplicates */ }
    }

    logger.info('CRM表初始化完成');
  }

  initCRMTables();

  // ==================== Customer Routes ====================

  // List customers
  router.get('/customers', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { level, status, search, page = 1, pageSize = 20 } = req.query;
      let query = 'SELECT * FROM customers WHERE 1=1';
      const params = [];

      if (level) { query += ' AND level = ?'; params.push(level); }
      if (status) { query += ' AND status = ?'; params.push(status); }
      if (search) { query += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      params.push(parseInt(pageSize), offset);
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

      const rows = await allAsync(query, params);

      // Parse tags
      const customers = rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));

      res.json({ total: rows.length, page: parseInt(page), pageSize: parseInt(pageSize), items: customers });
    } catch (error) {
      logger.error('获取客户列表失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Get customer detail
  router.get('/customers/:id', verifyToken, requireAdmin, async (req, res) => {
    try {
      const customer = await getAsync('SELECT * FROM customers WHERE id = ?', [req.params.id]);
      if (!customer) return res.status(404).json({ error: '客户不存在' });

      customer.tags = JSON.parse(customer.tags || '[]');

      // Get customer stats
      const [orders, interactions, coupons] = await Promise.all([
        allAsync('SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 10', [customer.phone]),
        allAsync('SELECT * FROM customer_interactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20', [customer.id]),
        allAsync(`
          SELECT cc.*, c.name as coupon_name, c.type as coupon_type, c.discount_value
          FROM customer_coupons cc
          JOIN coupons c ON cc.coupon_id = c.id
          WHERE cc.customer_id = ?
          ORDER BY cc.created_at DESC
        `, [customer.id])
      ]);

      res.json({ ...customer, recentOrders: orders, recentInteractions: interactions, coupons });
    } catch (error) {
      logger.error('获取客户详情失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Create customer
  router.post('/customers', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { name, phone, email, company, address, birthday, notes } = req.body;
      if (!name || !phone) return res.status(400).json({ error: '姓名和电话不能为空' });

      const result = await runAsync(
        `INSERT INTO customers (name, phone, email, company, address, birthday, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, phone, email || null, company || null, address || null, birthday || null, notes || null]
      );

      logger.info('客户创建成功', { id: result.lastID, name });
      res.json({ id: result.lastID, message: '客户创建成功' });
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        return res.status(400).json({ error: '该手机号已存在' });
      }
      logger.error('创建客户失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Update customer
  router.put('/customers/:id', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { name, email, company, address, tags, notes, birthday, status } = req.body;
      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (email !== undefined) { updates.push('email = ?'); params.push(email); }
      if (company !== undefined) { updates.push('company = ?'); params.push(company); }
      if (address !== undefined) { updates.push('address = ?'); params.push(address); }
      if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
      if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
      if (birthday !== undefined) { updates.push('birthday = ?'); params.push(birthday); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }

      if (updates.length === 0) return res.status(400).json({ error: '没有要更新的字段' });

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(req.params.id);

      await runAsync(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);

      logger.info('客户信息更新成功', { id: req.params.id });
      res.json({ message: '客户信息更新成功' });
    } catch (error) {
      logger.error('更新客户失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Points Routes ====================

  // Get points records for customer
  router.get('/customers/:id/points', verifyToken, requireAdmin, async (req, res) => {
    try {
      const rows = await allAsync(
        'SELECT * FROM points_records WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100',
        [req.params.id]
      );
      const total = await getAsync(
        'SELECT SUM(points) as total FROM points_records WHERE customer_id = ?',
        [req.params.id]
      );
      res.json({ items: rows, totalPoints: total ? total.total : 0 });
    } catch (error) {
      logger.error('获取积分记录失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Add points
  router.post('/customers/:id/points', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { points, type, reason, orderId } = req.body;
      if (!points || !type) return res.status(400).json({ error: '积分和类型不能为空' });

      await runAsync(
        'INSERT INTO points_records (customer_id, points, type, reason, order_id) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, points, type, reason || null, orderId || null]
      );
      await runAsync('UPDATE customers SET points = points + ? WHERE id = ?', [points, req.params.id]);

      // Auto-upgrade level
      const customer = await getAsync('SELECT points FROM customers WHERE id = ?', [req.params.id]);
      if (customer) {
        const newLevel = await getAsync(
          'SELECT level FROM customer_levels WHERE min_points <= ? ORDER BY min_points DESC LIMIT 1',
          [customer.points]
        );
        if (newLevel) {
          await runAsync('UPDATE customers SET level = ? WHERE id = ?', [newLevel.level, req.params.id]);
        }
      }

      logger.info('积分添加成功', { customerId: req.params.id, points });
      res.json({ message: '积分添加成功' });
    } catch (error) {
      logger.error('添加积分失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Deduct points
  router.post('/customers/:id/points/deduct', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { points, reason } = req.body;
      const customer = await getAsync('SELECT points FROM customers WHERE id = ?', [req.params.id]);
      if (!customer || customer.points < points) {
        return res.status(400).json({ error: '积分不足' });
      }

      await runAsync(
        'INSERT INTO points_records (customer_id, points, type, reason) VALUES (?, ?, ?, ?)',
        [req.params.id, -points, 'deduct', reason || '扣减']
      );
      await runAsync('UPDATE customers SET points = points - ? WHERE id = ?', [points, req.params.id]);
      res.json({ message: '积分扣减成功' });
    } catch (error) {
      logger.error('扣减积分失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Coupon Routes ====================

  // List coupons
  router.get('/coupons', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      let query = 'SELECT * FROM coupons WHERE 1=1';
      const params = [];
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY created_at DESC';

      const rows = await allAsync(query, params);
      res.json(rows);
    } catch (error) {
      logger.error('获取优惠券列表失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Create coupon
  router.post('/coupons', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { code, name, type, discountValue, minOrderAmount, totalQuantity, validFrom, validUntil } = req.body;

      const result = await runAsync(
        `INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, name, type, discountValue || 0, minOrderAmount || 0, totalQuantity || 1000, validFrom, validUntil]
      );

      logger.info('优惠券创建成功', { code, name });
      res.json({ id: result.lastID, message: '优惠券创建成功' });
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        return res.status(400).json({ error: '优惠券代码已存在' });
      }
      logger.error('创建优惠券失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Issue coupons to customers
  router.post('/coupons/:id/issue', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { customerIds } = req.body;
      if (!customerIds || !customerIds.length) {
        return res.status(400).json({ error: '请指定客户' });
      }

      for (const customerId of customerIds) {
        await runAsync(
          'INSERT INTO customer_coupons (customer_id, coupon_id) VALUES (?, ?)',
          [customerId, req.params.id]
        );
      }

      logger.info('优惠券发放成功', { couponId: req.params.id, count: customerIds.length });
      res.json({ message: `成功发放给${customerIds.length}个客户` });
    } catch (error) {
      logger.error('发放优惠券失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Use coupon
  router.post('/coupons/use', verifyToken, async (req, res) => {
    try {
      const { code, customerId, orderId } = req.body;
      if (!code || !customerId || !orderId) {
        return res.status(400).json({ error: '缺少参数' });
      }

      const coupon = await getAsync('SELECT * FROM coupons WHERE code = ? AND status = ?', [code, 'active']);
      if (!coupon) return res.status(400).json({ error: '优惠券不存在或已失效' });

      const customerCoupon = await getAsync(
        'SELECT * FROM customer_coupons WHERE customer_id = ? AND coupon_id = ? AND status = ?',
        [customerId, coupon.id, 'unused']
      );
      if (!customerCoupon) return res.status(400).json({ error: '该客户没有此优惠券或已使用' });

      // Check validity
      const now = new Date().toISOString().split('T')[0];
      if (coupon.valid_from && coupon.valid_from > now) return res.status(400).json({ error: '优惠券尚未生效' });
      if (coupon.valid_until && coupon.valid_until < now) return res.status(400).json({ error: '优惠券已过期' });

      let discountAmount = 0;
      if (coupon.type === 'fixed') {
        discountAmount = coupon.discount_value;
      } else if (coupon.type === 'percentage') {
        const order = await getAsync('SELECT total_price FROM orders WHERE id = ?', [orderId]);
        if (order) {
          discountAmount = order.total_price * (coupon.discount_value / 100);
        }
      }

      await runAsync(
        'UPDATE customer_coupons SET status = ?, used_order_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['used', orderId, customerCoupon.id]
      );
      await runAsync('UPDATE coupons SET used_quantity = used_quantity + 1 WHERE id = ?', [coupon.id]);

      logger.info('优惠券使用成功', { code, customerId, orderId, discountAmount });
      res.json({ message: '优惠券使用成功', discountAmount: Math.round(discountAmount * 100) / 100 });
    } catch (error) {
      logger.error('使用优惠券失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Interaction Routes ====================

  // Record interaction
  router.post('/interactions', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { customerId, type, content, employee } = req.body;
      const result = await runAsync(
        'INSERT INTO customer_interactions (customer_id, type, content, employee) VALUES (?, ?, ?, ?)',
        [customerId, type, content, employee || req.user?.username]
      );
      res.json({ id: result.lastID, message: '互动记录添加成功' });
    } catch (error) {
      logger.error('添加互动记录失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Feedback Routes ====================

  // List feedback
  router.get('/feedback', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      let query = `
        SELECT cf.*, c.name as customer_name
        FROM customer_feedback cf
        JOIN customers c ON cf.customer_id = c.id
        WHERE 1=1
      `;
      const params = [];
      if (status) { query += ' AND cf.status = ?'; params.push(status); }
      query += ' ORDER BY cf.created_at DESC';

      const rows = await allAsync(query, params);
      res.json(rows);
    } catch (error) {
      logger.error('获取反馈列表失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Reply to feedback
  router.put('/feedback/:id/reply', verifyToken, requireAdmin, async (req, res) => {
    try {
      const { reply } = req.body;
      await runAsync(
        'UPDATE customer_feedback SET reply = ?, status = ? WHERE id = ?',
        [reply, 'replied', req.params.id]
      );
      res.json({ message: '回复成功' });
    } catch (error) {
      logger.error('回复反馈失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Analytics Routes ====================

  // CRM Dashboard
  router.get('/dashboard', verifyToken, requireAdmin, async (req, res) => {
    try {
      const [totalCustomers, levelDistribution, pointsSummary, couponStats] = await Promise.all([
        getAsync('SELECT COUNT(*) as total FROM customers'),
        allAsync('SELECT level, COUNT(*) as count FROM customers GROUP BY level'),
        getAsync('SELECT SUM(points) as totalPoints FROM customers'),
        getAsync(`
          SELECT
            COUNT(*) as totalCoupons,
            SUM(used_quantity) as usedCoupons,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeCoupons
          FROM coupons
        `)
      ]);

      res.json({
        totalCustomers: totalCustomers.total,
        levelDistribution,
        totalPoints: pointsSummary.totalPoints,
        couponStats
      });
    } catch (error) {
      logger.error('获取CRM仪表盘失败', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Customer levels config
  router.get('/levels', async (req, res) => {
    try {
      const levels = await allAsync('SELECT * FROM customer_levels ORDER BY min_points ASC');
      res.json(levels.map(l => ({ ...l, perks: JSON.parse(l.perks || '[]') })));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
