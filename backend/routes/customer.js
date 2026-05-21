const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const logger = require('../logger');

module.exports = function(db, { customerService, couponService, pointsService }) {
  const { verifyToken, generateToken } = require('../middleware/auth');

  // ==================== 注册/登录 ====================

  router.post('/register', async (req, res) => {
    try {
      const { name, phone, password } = req.body;
      if (!phone || !password) return res.status(400).json({ error: '手机号和密码不能为空' });

      const existing = await db.get('SELECT id FROM customers WHERE phone = ?', [phone]);
      if (existing) return res.status(400).json({ error: '该手机号已注册' });

      const hashed = await bcrypt.hash(password, 10);
      const result = await db.run(
        'INSERT INTO customers (name, phone, password) VALUES (?, ?, ?)',
        [name || phone, phone, hashed]
      );

      const token = generateToken(result.lastID, name || phone, 'customer');
      logger.info('顾客注册成功', { id: result.lastID, phone });
      res.json({ token, user: { id: result.lastID, phone, name: name || phone, level: 'bronze', points: 0 } });
    } catch (error) {
      logger.error('顾客注册失败', { error: error.message });
      res.status(500).json({ error: '注册失败' });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) return res.status(400).json({ error: '手机号和密码不能为空' });

      const customer = await db.get('SELECT * FROM customers WHERE phone = ?', [phone]);
      if (!customer) return res.status(401).json({ error: '手机号未注册' });

      if (!customer.password) return res.status(401).json({ error: '该账户未设置密码，请先注册' });

      const valid = await bcrypt.compare(password, customer.password);
      if (!valid) return res.status(401).json({ error: '密码错误' });

      const token = generateToken(customer.id, customer.name || phone, 'customer');
      logger.info('顾客登录成功', { id: customer.id, phone });
      res.json({
        token,
        user: {
          id: customer.id, phone, name: customer.name,
          level: customer.level, points: customer.points,
        }
      });
    } catch (error) {
      logger.error('顾客登录失败', { error: error.message });
      res.status(500).json({ error: '登录失败' });
    }
  });

  // ==================== 个人信息 ====================

  router.get('/me', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'customer') return res.status(403).json({ error: '需要顾客身份' });
      const { data, error, status } = await customerService.getById(req.user.userId);
      if (error) return res.status(status || 500).json({ error });
      if (data) delete data.password;
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== 我的订单 ====================

  router.get('/orders', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'customer') return res.status(403).json({ error: '需要顾客身份' });
      const customer = await db.get('SELECT phone FROM customers WHERE id = ?', [req.user.userId]);
      if (!customer) return res.status(404).json({ error: '顾客不存在' });

      const orders = await db.all(
        'SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC',
        [customer.phone]
      );
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/orders/:id', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'customer') return res.status(403).json({ error: '需要顾客身份' });
      const order = await db.get(
        'SELECT * FROM orders WHERE id = ? AND customer_phone = (SELECT phone FROM customers WHERE id = ?)',
        [req.params.id, req.user.userId]
      );
      if (!order) return res.status(404).json({ error: '订单不存在' });
      const items = await db.all(
        'SELECT oi.*, b.name, b.model, b.image FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?',
        [order.id]
      );
      const history = await db.all(
        'SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC',
        [order.id]
      );
      res.json({ ...order, items, statusHistory: history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== 我的优惠券 ====================

  router.get('/coupons', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'customer') return res.status(403).json({ error: '需要顾客身份' });
      const coupons = await db.all(
        `SELECT cc.*, c.name as coupon_name, c.code, c.type, c.discount_value, c.min_order_amount, c.valid_from, c.valid_until
         FROM customer_coupons cc JOIN coupons c ON cc.coupon_id = c.id
         WHERE cc.customer_id = ? AND cc.status = 'unused' AND c.status = 'active'
         ORDER BY cc.created_at DESC`,
        [req.user.userId]
      );
      res.json(coupons);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/coupons/use', verifyToken, async (req, res) => {
    try {
      if (req.user.role !== 'customer') return res.status(403).json({ error: '需要顾客身份' });
      const { code, orderId } = req.body;
      if (!code || !orderId) return res.status(400).json({ error: '请提供优惠券代码和订单ID' });

      const { data, error, status } = await couponService.use({ code, customerId: req.user.userId, orderId });
      if (error) return res.status(status || 500).json({ error });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
