require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { body, param, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const logger = require('./logger');
const { generateToken, verifyToken, requireAdmin } = require('./middleware/auth');
const { apiLimiter, loginLimiter, orderLimiter } = require('./middleware/rateLimiter');
const { cacheMiddleware, clearCache } = require('./middleware/cache');
const { exportOrdersToExcel, exportOrderToPDF } = require('./utils/exportOrders');
const multer = require('multer');
const fs = require('fs');

function createApp(db, services = {}) {
  const {
    inventoryAlert,
    analytics,
    recommendationEngine,
    paymentService,
    aiService,
  } = services;

  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }));

  app.use('/api/', apiLimiter);
  app.use(bodyParser.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const imagesDir = path.join(__dirname, 'public', 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = req.body.name
        ? req.body.name.replace(/[^a-zA-Z0-9一-龥_-]/g, '') + ext
        : Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
      cb(null, name);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
      if (allowed.test(path.extname(file.originalname))) {
        cb(null, true);
      } else {
        cb(new Error('只允许上传图片文件 (jpg/png/gif/webp/svg)'));
      }
    }
  });

  const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('验证失败', { errors: errors.array(), path: req.path });
      return res.status(400).json({ error: '数据验证失败', details: errors.array() });
    }
    next();
  };

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/', (req, res) => {
    res.json({ message: '轴承销售系统 API', version: '5.1.0' });
  });

  // ==================== 认证 ====================

  app.post('/api/auth/login', loginLimiter, [
    body('username').trim().notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空'),
    handleValidationErrors
  ], async (req, res) => {
    const { username, password } = req.body;
    try {
      const admin = await db.get('SELECT * FROM admins WHERE username = ?', [username]);
      if (!admin) {
        logger.warn('登录失败 - 用户不存在', { username, ip: req.ip });
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (!isPasswordValid) {
        logger.warn('登录失败 - 密码错误', { username, ip: req.ip });
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      await db.run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
      const token = generateToken(admin.id, admin.username, admin.role);
      logger.info('登录成功', { username, ip: req.ip });
      res.json({ token, user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role } });
    } catch (err) {
      logger.error('登录查询失败', { error: err.message });
      res.status(500).json({ error: '登录失败' });
    }
  });

  app.post('/api/auth/change-password', verifyToken, [
    body('oldPassword').notEmpty().withMessage('旧密码不能为空'),
    body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位'),
    handleValidationErrors
  ], async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.userId;
    try {
      const admin = await db.get('SELECT * FROM admins WHERE id = ?', [userId]);
      if (!admin) return res.status(500).json({ error: '修改密码失败' });
      const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);
      if (!isPasswordValid) {
        logger.warn('修改密码失败 - 旧密码错误', { username: admin.username });
        return res.status(401).json({ error: '旧密码错误' });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.run('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, userId]);
      logger.info('密码修改成功', { username: admin.username });
      res.json({ message: '密码修改成功' });
    } catch (err) {
      logger.error('修改密码失败', { error: err.message });
      res.status(500).json({ error: '修改密码失败' });
    }
  });

  app.get('/api/auth/me', verifyToken, async (req, res) => {
    try {
      const admin = await db.get('SELECT id, username, email, role, created_at, last_login FROM admins WHERE id = ?', [req.user.userId]);
      if (!admin) return res.status(404).json({ error: '用户不存在' });
      res.json(admin);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 产品 ====================

  app.get('/api/search', cacheMiddleware('search', 300), async (req, res) => {
    const { q, category, minPrice, maxPrice, minStock, inStock, sortBy, order } = req.query;
    let query = '';
    let params = [];
    if (q && q.trim()) {
      query = 'SELECT b.* FROM bearings b INNER JOIN bearings_fts fts ON b.id = fts.id WHERE bearings_fts MATCH ?';
      params.push(q.trim());
    } else {
      query = 'SELECT * FROM bearings WHERE 1=1';
    }
    if (category && category !== '全部') { query += ' AND category = ?'; params.push(category); }
    if (minPrice) { query += ' AND price >= ?'; params.push(parseFloat(minPrice)); }
    if (maxPrice) { query += ' AND price <= ?'; params.push(parseFloat(maxPrice)); }
    if (minStock) { query += ' AND stock >= ?'; params.push(parseInt(minStock)); }
    if (inStock === 'true') { query += ' AND stock > 0'; }
    const validSortFields = ['price', 'stock', 'name', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'id';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${sortField} ${sortOrder}`;
    try {
      const rows = await db.all(query, params);
      const bearings = rows.map(row => ({
        id: row.id, name: row.name, model: row.model, price: row.price, image: row.image, category: row.category,
        specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width },
        stock: row.stock, description: row.description
      }));
      logger.info('搜索成功', { count: bearings.length, query: req.query });
      res.json({ total: bearings.length, results: bearings });
    } catch (err) {
      logger.error('搜索失败', { error: err.message });
      res.status(500).json({ error: '搜索失败' });
    }
  });

  app.get('/api/search/suggestions', cacheMiddleware('suggestions', 1800), async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    try {
      const rows = await db.all('SELECT DISTINCT name, model FROM bearings_fts WHERE bearings_fts MATCH ? LIMIT 10', [`${q.trim()}*`]);
      res.json(rows.map(row => ({ name: row.name, model: row.model })));
    } catch (err) {
      logger.error('获取搜索建议失败', { error: err.message });
      res.json([]);
    }
  });

  app.get('/api/bearings', cacheMiddleware('bearings', 600), async (req, res) => {
    const { category } = req.query;
    let query = 'SELECT * FROM bearings';
    const params = [];
    if (category && category !== '全部') { query += ' WHERE category = ?'; params.push(category); }
    try {
      const rows = await db.all(query, params);
      const bearings = rows.map(row => ({
        id: row.id, name: row.name, model: row.model, price: row.price, image: row.image, category: row.category,
        specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width },
        stock: row.stock, description: row.description
      }));
      logger.info('获取轴承列表成功', { count: bearings.length, category });
      res.json(bearings);
    } catch (err) {
      logger.error('获取轴承列表失败', { error: err.message });
      res.status(500).json({ error: '获取产品列表失败' });
    }
  });

  app.get('/api/bearings/:id', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM bearings WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ error: '产品未找到' });
      res.json({
        id: row.id, name: row.name, model: row.model, price: row.price, image: row.image, category: row.category,
        specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width },
        stock: row.stock, description: row.description
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/categories', cacheMiddleware('categories', 3600), async (req, res) => {
    try {
      const rows = await db.all('SELECT DISTINCT category FROM bearings', []);
      res.json(rows.map(row => row.category));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/orders', orderLimiter, [
    body('customerName').trim().notEmpty().withMessage('客户姓名不能为空'),
    body('customerPhone').trim().matches(/^1[3-9]\d{9}$/).withMessage('手机号格式不正确'),
    body('province').trim().notEmpty().withMessage('省份不能为空'),
    body('city').trim().notEmpty().withMessage('城市不能为空'),
    body('district').trim().notEmpty().withMessage('区/县不能为空'),
    body('addressDetail').trim().notEmpty().withMessage('详细地址不能为空'),
    body('items').isArray({ min: 1 }).withMessage('订单至少包含一个商品'),
    body('items.*.id').isInt({ min: 1 }).withMessage('商品ID无效'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('商品数量必须大于0'),
    handleValidationErrors
  ], async (req, res) => {
    const { customerName, customerPhone, province, city, district, addressDetail, items } = req.body;
    try {
      const result = await db.transaction(async (tx) => {
        const checkedItems = [];
        for (const item of items) {
          const row = await tx.get('SELECT stock, price FROM bearings WHERE id = ?', [item.id]);
          if (!row) throw new Error(`产品ID ${item.id} 不存在`);
          if (row.stock < item.quantity) throw new Error(`产品ID ${item.id} 库存不足，当前库存：${row.stock}`);
          checkedItems.push({ id: item.id, quantity: item.quantity, price: row.price });
        }
        const totalPrice = checkedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderResult = await tx.run(
          'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [customerName, customerPhone, province, city, district, addressDetail, totalPrice]
        );
        const orderId = orderResult.lastID;
        for (const item of checkedItems) {
          await tx.run('INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, item.id, item.quantity, item.price]);
          await tx.run('UPDATE bearings SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }
        return { orderId, customerName, totalPrice };
      });
      logger.info('订单创建成功', { orderId: result.orderId, customerName: result.customerName, totalPrice: result.totalPrice });
      res.json({ orderId: result.orderId, message: '订单创建成功' });
    } catch (err) {
      logger.warn('订单创建失败', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  // ==================== 管理员API ====================

  app.get('/api/orders', verifyToken, requireAdmin, async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC', []);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/orders/:id/items', verifyToken, requireAdmin, async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT oi.*, b.name, b.model FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?',
        [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/orders/:id/status', verifyToken, requireAdmin, [
    body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    body('note').optional().trim(),
    handleValidationErrors
  ], async (req, res) => {
    const { id } = req.params;
    const { status, note, trackingNumber } = req.body;
    try {
      const order = await db.get('SELECT status FROM orders WHERE id = ?', [id]);
      if (!order) return res.status(404).json({ error: '订单不存在' });
      const oldStatus = order.status;
      let updateQuery = 'UPDATE orders SET status = ?';
      let params = [status];
      if (status === 'shipped') {
        updateQuery += ', shipped_at = CURRENT_TIMESTAMP';
        if (trackingNumber) { updateQuery += ', tracking_number = ?'; params.push(trackingNumber); }
      }
      if (status === 'completed') { updateQuery += ', completed_at = CURRENT_TIMESTAMP'; }
      updateQuery += ' WHERE id = ?';
      params.push(id);
      await db.run(updateQuery, params);
      await db.run('INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)', [id, oldStatus, status, note || null]);
      logger.info('订单状态已更新', { orderId: id, oldStatus, newStatus: status });
      res.json({ message: '订单状态已更新', oldStatus, newStatus: status });
    } catch (err) {
      logger.error('更新订单状态失败', { error: err.message, orderId: id });
      res.status(500).json({ error: '更新订单状态失败' });
    }
  });

  app.put('/api/orders/batch/status', verifyToken, requireAdmin, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    handleValidationErrors
  ], async (req, res) => {
    const { orderIds, status, note } = req.body;
    try {
      const placeholders = orderIds.map(() => '?').join(',');
      const result = await db.run(`UPDATE orders SET status = ? WHERE id IN (${placeholders})`, [status, ...orderIds]);
      for (const orderId of orderIds) {
        await db.run('INSERT INTO order_status_history (order_id, new_status, note) VALUES (?, ?, ?)', [orderId, status, note || '批量操作']);
      }
      logger.info('批量更新订单状态成功', { count: result.changes, status });
      res.json({ message: `成功更新${result.changes}个订单`, count: result.changes });
    } catch (err) {
      logger.error('批量更新订单状态失败', { error: err.message });
      res.status(500).json({ error: '批量更新失败' });
    }
  });

  app.delete('/api/orders/:id', verifyToken, requireAdmin, [
    param('id').isInt({ min: 1 }).withMessage('订单ID无效'),
    handleValidationErrors
  ], async (req, res) => {
    const { id } = req.params;
    try {
      const result = await db.transaction(async (tx) => {
        const order = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) throw new Error('NOT_FOUND');
        if (['paid', 'shipped', 'completed'].includes(order.status)) throw new Error('CANNOT_DELETE');
        const items = await tx.all('SELECT * FROM order_items WHERE order_id = ?', [id]);
        for (const item of items) {
          await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
        }
        await tx.run('DELETE FROM order_items WHERE order_id = ?', [id]);
        await tx.run('DELETE FROM order_status_history WHERE order_id = ?', [id]);
        await tx.run('DELETE FROM orders WHERE id = ?', [id]);
        return { customerName: order.customer_name, itemsCount: items.length };
      });
      clearCache('orders:*');
      clearCache('bearings:*');
      logger.info('订单删除成功', { orderId: id, customerName: result.customerName, itemsCount: result.itemsCount });
      res.json({ message: '订单删除成功', restoredStock: result.itemsCount > 0, itemsCount: result.itemsCount });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: '订单不存在' });
      if (err.message === 'CANNOT_DELETE') return res.status(400).json({ error: '无法删除已支付或已发货的订单', suggestion: '请先取消订单，然后再删除' });
      logger.error('删除订单失败', { error: err.message, orderId: id });
      res.status(500).json({ error: '删除订单失败' });
    }
  });

  app.delete('/api/orders/batch', verifyToken, requireAdmin, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('orderIds.*').isInt({ min: 1 }).withMessage('订单ID无效'),
    handleValidationErrors
  ], async (req, res) => {
    const { orderIds } = req.body;
    try {
      const result = await db.transaction(async (tx) => {
        const placeholders = orderIds.map(() => '?').join(',');
        const orders = await tx.all(`SELECT id, status FROM orders WHERE id IN (${placeholders})`, orderIds);
        const invalidOrders = orders.filter(o => ['paid', 'shipped', 'completed'].includes(o.status));
        if (invalidOrders.length > 0) throw new Error(JSON.stringify({ type: 'INVALID_ORDERS', invalidOrders: invalidOrders.map(o => o.id) }));
        const items = await tx.all(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
        for (const item of items) {
          await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
        }
        await tx.run(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
        await tx.run(`DELETE FROM order_status_history WHERE order_id IN (${placeholders})`, orderIds);
        const deleteResult = await tx.run(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds);
        return { changes: deleteResult.changes, restoredStock: items.length > 0 };
      });
      clearCache('orders:*');
      clearCache('bearings:*');
      logger.info('批量删除订单成功', { count: result.changes, orderIds });
      res.json({ message: `成功删除${result.changes}个订单`, count: result.changes, restoredStock: result.restoredStock });
    } catch (err) {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.type === 'INVALID_ORDERS') return res.status(400).json({ error: '部分订单无法删除', invalidOrders: parsed.invalidOrders, message: '已支付或已发货的订单无法删除' });
      } catch {}
      logger.error('批量删除订单失败', { error: err.message });
      res.status(500).json({ error: '批量删除失败' });
    }
  });

  app.get('/api/orders/:id/history', verifyToken, requireAdmin, async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC', [req.params.id]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: '获取订单历史失败' });
    }
  });

  app.get('/api/orders/export/excel', verifyToken, requireAdmin, async (req, res) => {
    try {
      const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC', []);
      const workbook = await exportOrdersToExcel(orders);
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.xlsx`);
      res.send(buffer);
      logger.info('订单Excel导出成功', { count: orders.length });
    } catch (error) {
      logger.error('导出Excel失败', { error: error.message });
      res.status(500).json({ error: '导出失败' });
    }
  });

  app.get('/api/orders/:id/export/pdf', verifyToken, requireAdmin, async (req, res) => {
    try {
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
      if (!order) return res.status(404).json({ error: '订单不存在' });
      const items = await db.all(
        'SELECT oi.*, b.name, b.model FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?',
        [req.params.id]
      );
      const pdfBuffer = await exportOrderToPDF(order, items);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=order-${req.params.id}.pdf`);
      res.send(pdfBuffer);
      logger.info('订单PDF导出成功', { orderId: req.params.id });
    } catch (error) {
      logger.error('导出PDF失败', { error: error.message, orderId: req.params.id });
      res.status(500).json({ error: '导出失败' });
    }
  });

  app.post('/api/bearings', verifyToken, requireAdmin, [
    body('name').trim().notEmpty().withMessage('产品名称不能为空'),
    body('model').trim().notEmpty().withMessage('产品型号不能为空'),
    body('price').isFloat({ min: 0.01 }).withMessage('价格必须大于0'),
    body('category').trim().notEmpty().withMessage('分类不能为空'),
    body('stock').isInt({ min: 0 }).withMessage('库存不能为负数'),
    handleValidationErrors
  ], async (req, res) => {
    const { name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description } = req.body;
    try {
      const result = await db.run(
        'INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description]
      );
      clearCache('bearings:*');
      clearCache('categories:*');
      res.json({ id: result.lastID, message: '产品添加成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/bearings/:id', verifyToken, requireAdmin, async (req, res) => {
    try {
      await db.run('DELETE FROM bearings WHERE id = ?', [req.params.id]);
      clearCache('bearings:*');
      res.json({ message: '产品删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/bearings/:id/stock', verifyToken, requireAdmin, async (req, res) => {
    try {
      await db.run('UPDATE bearings SET stock = ? WHERE id = ?', [req.body.stock, req.params.id]);
      clearCache('bearings:*');
      res.json({ message: '库存更新成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== 图片上传 ====================

  app.post('/api/upload/image', verifyToken, requireAdmin, (req, res) => {
    upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '请选择要上传的图片' });
      res.json({ message: '图片上传成功', url: `/images/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
    });
  });

  app.post('/api/upload/images', verifyToken, requireAdmin, (req, res) => {
    upload.array('images', 10)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择要上传的图片' });
      res.json({ message: `成功上传${req.files.length}张图片`, files: req.files.map(f => ({ url: `/images/${f.filename}`, filename: f.filename, size: f.size })) });
    });
  });

  app.put('/api/bearings/:id/image', verifyToken, requireAdmin, (req, res) => {
    upload.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '请选择要上传的图片' });
      try {
        const row = await db.get('SELECT image FROM bearings WHERE id = ?', [req.params.id]);
        if (row && row.image && row.image.startsWith('/images/')) {
          const oldPath = path.join(imagesDir, path.basename(row.image));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const imageUrl = `/images/${req.file.filename}`;
        await db.run('UPDATE bearings SET image = ? WHERE id = ?', [imageUrl, req.params.id]);
        clearCache('bearings:*');
        logger.info('产品图片已更新', { bearingId: req.params.id, image: imageUrl });
        res.json({ message: '产品图片已更新', url: imageUrl });
      } catch (dbErr) {
        logger.error('更新产品图片失败', { error: dbErr.message });
        res.status(500).json({ error: '更新产品图片失败' });
      }
    });
  });

  app.get('/api/upload/images', verifyToken, requireAdmin, (req, res) => {
    fs.readdir(imagesDir, (err, files) => {
      if (err) return res.status(500).json({ error: '获取图片列表失败' });
      const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f)).map(f => ({
        filename: f, url: `/images/${f}`, size: fs.statSync(path.join(imagesDir, f)).size
      }));
      res.json(images);
    });
  });

  app.delete('/api/upload/images/:filename', verifyToken, requireAdmin, async (req, res) => {
    const filePath = path.join(imagesDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '图片不存在' });
    try {
      fs.unlinkSync(filePath);
      await db.run('UPDATE bearings SET image = NULL WHERE image = ?', [`/images/${req.params.filename}`]);
      logger.info('图片已删除', { filename: req.params.filename });
      res.json({ message: '图片已删除' });
    } catch (err) {
      res.status(500).json({ error: '删除图片失败' });
    }
  });

  // ==================== 库存/推荐/分析 (可选服务) ====================

  if (inventoryAlert) {
    app.get('/api/inventory/low-stock', verifyToken, requireAdmin, async (req, res) => {
      try { res.json(await inventoryAlert.getLowStockProducts()); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/api/inventory/out-of-stock', verifyToken, requireAdmin, async (req, res) => {
      try { res.json(await inventoryAlert.getOutOfStockProducts()); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/api/inventory/summary', verifyToken, requireAdmin, async (req, res) => {
      try { res.json(await inventoryAlert.getInventorySummary()); } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }

  if (recommendationEngine) {
    app.get('/api/recommendations/hot', async (req, res) => {
      try { res.json(await recommendationEngine.getHotProducts(parseInt(req.query.limit) || 10, parseInt(req.query.days) || 30)); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/api/recommendations/similar/:id', async (req, res) => {
      try { res.json(await recommendationEngine.getSimilarProducts(parseInt(req.params.id), parseInt(req.query.limit) || 5)); } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }

  if (analytics) {
    app.get('/api/analytics/dashboard', verifyToken, async (req, res) => {
      try {
        const data = await analytics.getDashboardSummary();
        const salesTrend = await analytics.getSalesTrend('day', 30);
        const recentOrders = await db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10', []);
        res.json({ ...data, salesTrend, recentOrders });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }

  // ==================== 外部路由模块（需要完整服务） ====================

  if (paymentService) {
    const paymentRoutes = require('./routes/payment')(db, paymentService);
    app.use('/api/payment', paymentRoutes);
  }

  const crmRoutes = require('./routes/crm')(db);
  app.use('/api/crm', crmRoutes);

  if (aiService) {
    const aiRoutes = require('./routes/ai')(db, aiService);
    app.use('/api/ai', aiRoutes);
  }

  const createGraphQLEndpoint = require('./graphql/endpoint');
  app.use('/graphql', createGraphQLEndpoint({ db, recommendationEngine, analytics, paymentService, aiService }));

  return app;
}

module.exports = createApp;
