require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { body, param, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const logger = require('./logger');
const { generateToken, verifyToken, requireAdmin } = require('./middleware/auth');
const { apiLimiter, loginLimiter, orderLimiter } = require('./middleware/rateLimiter');
const { cacheMiddleware, clearCache } = require('./middleware/cache');
const { exportOrdersToExcel, exportOrderToPDF } = require('./utils/exportOrders');
const InventoryAlert = require('./utils/inventoryAlert');
const Analytics = require('./utils/analytics');
const RecommendationEngine = require('./utils/recommendation');
const PaymentService = require('./services/paymentService');
const AIService = require('./services/aiService');
const createGraphQLEndpoint = require('./graphql/endpoint');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false, // 开发环境可以关闭，生产环境需要配置
  crossOriginEmbedderPolicy: false
}));

// CORS配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// 全局API限流
app.use('/api/', apiLimiter);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 图片上传配置 ====================
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件 (jpg/png/gif/webp/svg)'));
    }
  }
});

const dbPath = path.join(__dirname, process.env.DB_PATH || 'bearings.db');
const db = new sqlite3.Database(dbPath);
const inventoryAlert = new InventoryAlert(dbPath);
const analytics = new Analytics(dbPath);
const recommendationEngine = new RecommendationEngine(dbPath);
const paymentService = new PaymentService(db);
const aiService = new AIService(db);

// Initialize payment service
paymentService.enable();

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('验证失败', { errors: errors.array(), path: req.path });
    return res.status(400).json({ error: '数据验证失败', details: errors.array() });
  }
  next();
};

app.get('/', (req, res) => {
  res.json({
    message: '轴承销售系统 API',
    version: '5.1.0',
    admin: 'http://localhost:3001/admin.html',
    dashboard: 'http://localhost:3001/dashboard.html',
    graphql: 'http://localhost:3001/graphql',
    endpoints: {
      '认证': {
        'POST /api/auth/login': '管理员登录',
        'POST /api/auth/change-password': '修改密码（需认证）',
        'GET /api/auth/me': '获取当前用户信息'
      },
      '产品': {
        'GET /api/bearings': '获取所有轴承产品',
        'GET /api/bearings/:id': '获取单个产品详情',
        'GET /api/categories': '获取所有产品分类',
        'POST /api/bearings': '添加产品（需管理员）',
        'DELETE /api/bearings/:id': '删除产品（需管理员）',
        'PUT /api/bearings/:id/stock': '更新库存（需管理员）',
        'PUT /api/bearings/:id/image': '更新产品图片（需管理员）'
      },
      '图片上传': {
        'POST /api/upload/image': '上传单张图片（需管理员）',
        'POST /api/upload/images': '批量上传图片，最多10张（需管理员）',
        'GET /api/upload/images': '获取已上传图片列表（需管理员）',
        'DELETE /api/upload/images/:filename': '删除图片（需管理员）'
      },
      '订单': {
        'POST /api/orders': '创建新订单',
        'GET /api/orders': '获取订单列表（需认证）',
        'GET /api/orders/:id/items': '获取订单详情（需认证）',
        'PUT /api/orders/:id/status': '更新订单状态（需认证）',
        'PUT /api/orders/batch/status': '批量更新订单状态（需认证）',
        'DELETE /api/orders/:id': '删除订单（需管理员）',
        'DELETE /api/orders/batch': '批量删除订单（需管理员）',
        'GET /api/orders/:id/history': '获取订单状态历史（需管理员）'
      },
      '支付': {
        'POST /api/payment/checkout': '创建支付订单',
        'POST /api/payment/create': '创建支付（需认证）',
        'GET /api/payment/query/:id': '查询支付状态',
        'POST /api/payment/simulate/:id': '模拟支付成功（需管理员）',
        'POST /api/payment/refund': '退款（需管理员）',
        'GET /api/payment/list': '支付列表（需管理员）',
        'GET /api/payment/stats': '支付统计（需管理员）',
        'POST /api/payment/alipay/notify': '支付宝回调',
        'POST /api/payment/wechat/notify': '微信支付回调'
      },
      'CRM': {
        'GET /api/crm/customers': '客户列表（需管理员）',
        'GET /api/crm/customers/:id': '客户详情（需管理员）',
        'POST /api/crm/customers': '创建客户（需管理员）',
        'PUT /api/crm/customers/:id': '更新客户（需管理员）',
        'GET /api/crm/customers/:id/points': '积分记录（需管理员）',
        'POST /api/crm/customers/:id/points': '添加积分（需管理员）',
        'POST /api/crm/customers/:id/points/deduct': '扣减积分（需管理员）',
        'GET /api/crm/coupons': '优惠券列表',
        'POST /api/crm/coupons': '创建优惠券（需管理员）',
        'POST /api/crm/coupons/:id/issue': '发放优惠券（需管理员）',
        'POST /api/crm/coupons/use': '使用优惠券',
        'GET /api/crm/dashboard': 'CRM仪表盘（需管理员）',
        'GET /api/crm/levels': '会员等级配置'
      },
      'AI智能': {
        'POST /api/ai/chat': '智能客服聊天',
        'GET /api/ai/predict-demand': '全量需求预测',
        'GET /api/ai/predict-demand/:productId': '单品需求预测',
        'GET /api/ai/recommendations': '智能推荐',
        'GET /api/ai/forecast': '销售预测',
        'POST /api/ai/image-recognize': '图像识别'
      },
      'GraphQL': {
        'POST /graphql': 'GraphQL API端点'
      }
    },
    examples: {
      '查看所有产品': 'http://localhost:3001/api/bearings',
      'GraphQL接口': 'http://localhost:3001/graphql',
      '数据库管理界面': 'http://localhost:3001/admin.html'
    }
  });
});

// ==================== 认证相关API ====================

// 管理员登录
app.post('/api/auth/login', loginLimiter, [
  body('username').trim().notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空'),
  handleValidationErrors
], (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) {
      logger.error('登录查询失败', { error: err.message });
      return res.status(500).json({ error: '登录失败' });
    }

    if (!admin) {
      logger.warn('登录失败 - 用户不存在', { username, ip: req.ip });
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      logger.warn('登录失败 - 密码错误', { username, ip: req.ip });
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新最后登录时间
    db.run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);

    const token = generateToken(admin.id, admin.username, admin.role);
    logger.info('登录成功', { username, ip: req.ip });

    res.json({
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  });
});

// 修改密码
app.post('/api/auth/change-password', verifyToken, [
  body('oldPassword').notEmpty().withMessage('旧密码不能为空'),
  body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位'),
  handleValidationErrors
], async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user.userId;

  db.get('SELECT * FROM admins WHERE id = ?', [userId], async (err, admin) => {
    if (err || !admin) {
      return res.status(500).json({ error: '修改密码失败' });
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isPasswordValid) {
      logger.warn('修改密码失败 - 旧密码错误', { username: admin.username });
      return res.status(401).json({ error: '旧密码错误' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
      if (err) {
        logger.error('修改密码失败', { error: err.message });
        return res.status(500).json({ error: '修改密码失败' });
      }

      logger.info('密码修改成功', { username: admin.username });
      res.json({ message: '密码修改成功' });
    });
  });
});

// 获取当前用户信息
app.get('/api/auth/me', verifyToken, (req, res) => {
  db.get('SELECT id, username, email, role, created_at, last_login FROM admins WHERE id = ?',
    [req.user.userId],
    (err, admin) => {
      if (err || !admin) {
        return res.status(404).json({ error: '用户不存在' });
      }
      res.json(admin);
    }
  );
});

// ==================== 公开API（无需认证） ====================

// 高级搜索API
app.get('/api/search', cacheMiddleware('search', 300), (req, res) => {
  const {
    q,              // 搜索关键词
    category,       // 分类筛选
    minPrice,       // 最低价格
    maxPrice,       // 最高价格
    minStock,       // 最低库存
    inStock,        // 是否有货
    sortBy,         // 排序字段: price, stock, name
    order           // 排序方向: asc, desc
  } = req.query;

  let query = '';
  let params = [];

  // 如果有搜索关键词，使用全文搜索
  if (q && q.trim()) {
    query = `
      SELECT b.* FROM bearings b
      INNER JOIN bearings_fts fts ON b.id = fts.id
      WHERE bearings_fts MATCH ?
    `;
    params.push(q.trim());
  } else {
    query = 'SELECT * FROM bearings WHERE 1=1';
  }

  // 分类筛选
  if (category && category !== '全部') {
    query += ' AND category = ?';
    params.push(category);
  }

  // 价格区间筛选
  if (minPrice) {
    query += ' AND price >= ?';
    params.push(parseFloat(minPrice));
  }
  if (maxPrice) {
    query += ' AND price <= ?';
    params.push(parseFloat(maxPrice));
  }

  // 库存筛选
  if (minStock) {
    query += ' AND stock >= ?';
    params.push(parseInt(minStock));
  }
  if (inStock === 'true') {
    query += ' AND stock > 0';
  }

  // 排序
  const validSortFields = ['price', 'stock', 'name', 'created_at'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'id';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortField} ${sortOrder}`;

  db.all(query, params, (err, rows) => {
    if (err) {
      logger.error('搜索失败', { error: err.message, query: req.query });
      res.status(500).json({ error: '搜索失败' });
      return;
    }

    const bearings = rows.map(row => ({
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      specs: {
        innerDiameter: row.inner_diameter,
        outerDiameter: row.outer_diameter,
        width: row.width
      },
      stock: row.stock,
      description: row.description
    }));

    logger.info('搜索成功', { count: bearings.length, query: req.query });
    res.json({
      total: bearings.length,
      results: bearings
    });
  });
});

// 搜索建议（自动补全）
app.get('/api/search/suggestions', cacheMiddleware('suggestions', 1800), (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json([]);
  }

  const keyword = `${q.trim()}*`;

  db.all(
    `SELECT DISTINCT name, model FROM bearings_fts WHERE bearings_fts MATCH ? LIMIT 10`,
    [keyword],
    (err, rows) => {
      if (err) {
        logger.error('获取搜索建议失败', { error: err.message });
        return res.json([]);
      }

      const suggestions = rows.map(row => ({
        name: row.name,
        model: row.model
      }));

      res.json(suggestions);
    }
  );
});

app.get('/api/bearings', cacheMiddleware('bearings', 600), (req, res) => {
  const { category } = req.query;

  let query = 'SELECT * FROM bearings';
  const params = [];

  if (category && category !== '全部') {
    query += ' WHERE category = ?';
    params.push(category);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      logger.error('获取轴承列表失败', { error: err.message });
      res.status(500).json({ error: '获取产品列表失败' });
      return;
    }

    const bearings = rows.map(row => ({
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      specs: {
        innerDiameter: row.inner_diameter,
        outerDiameter: row.outer_diameter,
        width: row.width
      },
      stock: row.stock,
      description: row.description
    }));

    logger.info('获取轴承列表成功', { count: bearings.length, category });
    res.json(bearings);
  });
});

app.get('/api/bearings/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM bearings WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (!row) {
      res.status(404).json({ error: '产品未找到' });
      return;
    }

    const bearing = {
      id: row.id,
      name: row.name,
      model: row.model,
      price: row.price,
      image: row.image,
      category: row.category,
      specs: {
        innerDiameter: row.inner_diameter,
        outerDiameter: row.outer_diameter,
        width: row.width
      },
      stock: row.stock,
      description: row.description
    };

    res.json(bearing);
  });
});

app.get('/api/categories', cacheMiddleware('categories', 3600), (req, res) => {
  db.all('SELECT DISTINCT category FROM bearings', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const categories = rows.map(row => row.category);
    res.json(categories);
  });
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
], (req, res) => {
  const { customerName, customerPhone, province, city, district, addressDetail, items } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const checkStockPromises = items.map(item => {
      return new Promise((resolve, reject) => {
        db.get('SELECT stock, price FROM bearings WHERE id = ?', [item.id], (err, row) => {
          if (err) {
            reject(err);
          } else if (!row) {
            reject(new Error(`产品ID ${item.id} 不存在`));
          } else if (row.stock < item.quantity) {
            reject(new Error(`产品ID ${item.id} 库存不足，当前库存：${row.stock}`));
          } else {
            resolve({ id: item.id, quantity: item.quantity, price: row.price });
          }
        });
      });
    });

    Promise.all(checkStockPromises)
      .then((checkedItems) => {
        const totalPrice = checkedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        db.run(
          'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [customerName, customerPhone, province, city, district, addressDetail, totalPrice],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              logger.error('创建订单失败', { error: err.message });
              res.status(500).json({ error: '创建订单失败' });
              return;
            }

            const orderId = this.lastID;
            const stmt = db.prepare('INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)');
            const updateStmt = db.prepare('UPDATE bearings SET stock = stock - ? WHERE id = ?');

            checkedItems.forEach(item => {
              stmt.run(orderId, item.id, item.quantity, item.price);
              updateStmt.run(item.quantity, item.id);
            });

            stmt.finalize();
            updateStmt.finalize();

            db.run('COMMIT', (err) => {
              if (err) {
                logger.error('提交订单事务失败', { error: err.message, orderId });
                res.status(500).json({ error: '订单提交失败' });
              } else {
                logger.info('订单创建成功', { orderId, customerName, totalPrice });
                res.json({ orderId, message: '订单创建成功' });
              }
            });
          }
        );
      })
      .catch(err => {
        db.run('ROLLBACK');
        logger.warn('订单验证失败', { error: err.message });
        res.status(400).json({ error: err.message });
      });
  });
});

// ==================== 管理员API（需要认证） ====================

app.get('/api/orders', verifyToken, requireAdmin, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/orders/:id/items', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT oi.*, b.name, b.model
    FROM order_items oi
    JOIN bearings b ON oi.bearing_id = b.id
    WHERE oi.order_id = ?
  `;

  db.all(query, [id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// 更新订单状态
app.put('/api/orders/:id/status', verifyToken, requireAdmin, [
  body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
  body('note').optional().trim(),
  handleValidationErrors
], (req, res) => {
  const { id } = req.params;
  const { status, note, trackingNumber } = req.body;

  // 先获取当前订单状态
  db.get('SELECT status FROM orders WHERE id = ?', [id], (err, order) => {
    if (err || !order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    const oldStatus = order.status;
    let updateQuery = 'UPDATE orders SET status = ?';
    let params = [status];

    // 如果状态是已发货，更新发货时间和物流单号
    if (status === 'shipped') {
      updateQuery += ', shipped_at = CURRENT_TIMESTAMP';
      if (trackingNumber) {
        updateQuery += ', tracking_number = ?';
        params.push(trackingNumber);
      }
    }

    // 如果状态是已完成，更新完成时间
    if (status === 'completed') {
      updateQuery += ', completed_at = CURRENT_TIMESTAMP';
    }

    updateQuery += ' WHERE id = ?';
    params.push(id);

    db.run(updateQuery, params, function(err) {
      if (err) {
        logger.error('更新订单状态失败', { error: err.message, orderId: id });
        return res.status(500).json({ error: '更新订单状态失败' });
      }

      // 记录状态变更历史
      db.run(
        'INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)',
        [id, oldStatus, status, note || null],
        (err) => {
          if (err) {
            logger.warn('记录订单状态历史失败', { error: err.message });
          }
        }
      );

      logger.info('订单状态已更新', { orderId: id, oldStatus, newStatus: status });
      res.json({ message: '订单状态已更新', oldStatus, newStatus: status });
    });
  });
});

// 批量更新订单状态
app.put('/api/orders/batch/status', verifyToken, requireAdmin, [
  body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
  body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
  handleValidationErrors
], (req, res) => {
  const { orderIds, status, note } = req.body;

  const placeholders = orderIds.map(() => '?').join(',');
  const query = `UPDATE orders SET status = ? WHERE id IN (${placeholders})`;

  db.run(query, [status, ...orderIds], function(err) {
    if (err) {
      logger.error('批量更新订单状态失败', { error: err.message });
      return res.status(500).json({ error: '批量更新失败' });
    }

    // 记录每个订单的状态变更
    orderIds.forEach(orderId => {
      db.run(
        'INSERT INTO order_status_history (order_id, new_status, note) VALUES (?, ?, ?)',
        [orderId, status, note || '批量操作']
      );
    });

    logger.info('批量更新订单状态成功', { count: this.changes, status });
    res.json({ message: `成功更新${this.changes}个订单`, count: this.changes });
  });
});

// 删除订单
app.delete('/api/orders/:id', verifyToken, requireAdmin, [
  param('id').isInt({ min: 1 }).withMessage('订单ID无效'),
  handleValidationErrors
], (req, res) => {
  const { id } = req.params;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 先检查订单是否存在
    db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
      if (err) {
        db.run('ROLLBACK');
        logger.error('查询订单失败', { error: err.message, orderId: id });
        return res.status(500).json({ error: '删除订单失败' });
      }

      if (!order) {
        db.run('ROLLBACK');
        return res.status(404).json({ error: '订单不存在' });
      }

      // 如果订单已支付或已发货，不允许删除
      if (['paid', 'shipped', 'completed'].includes(order.status)) {
        db.run('ROLLBACK');
        return res.status(400).json({
          error: '无法删除已支付或已发货的订单',
          suggestion: '请先取消订单，然后再删除'
        });
      }

      // 获取订单项以恢复库存
      db.all('SELECT * FROM order_items WHERE order_id = ?', [id], (err, items) => {
        if (err) {
          db.run('ROLLBACK');
          logger.error('获取订单项失败', { error: err.message, orderId: id });
          return res.status(500).json({ error: '删除订单失败' });
        }

        // 恢复库存
        const updateStmt = db.prepare('UPDATE bearings SET stock = stock + ? WHERE id = ?');
        items.forEach(item => {
          updateStmt.run(item.quantity, item.bearing_id);
        });
        updateStmt.finalize();

        // 删除订单项
        db.run('DELETE FROM order_items WHERE order_id = ?', [id], (err) => {
          if (err) {
            db.run('ROLLBACK');
            logger.error('删除订单项失败', { error: err.message, orderId: id });
            return res.status(500).json({ error: '删除订单失败' });
          }

          // 删除订单状态历史
          db.run('DELETE FROM order_status_history WHERE order_id = ?', [id], (err) => {
            if (err) {
              logger.warn('删除订单历史失败', { error: err.message, orderId: id });
            }

            // 删除订单
            db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
              if (err) {
                db.run('ROLLBACK');
                logger.error('删除订单失败', { error: err.message, orderId: id });
                return res.status(500).json({ error: '删除订单失败' });
              }

              db.run('COMMIT');

              // 清除缓存
              clearCache('orders:*');
              clearCache('bearings:*');

              logger.info('订单删除成功', {
                orderId: id,
                customerName: order.customer_name,
                itemsCount: items.length
              });

              res.json({
                message: '订单删除成功',
                restoredStock: items.length > 0,
                itemsCount: items.length
              });
            });
          });
        });
      });
    });
  });
});

// 批量删除订单
app.delete('/api/orders/batch', verifyToken, requireAdmin, [
  body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
  body('orderIds.*').isInt({ min: 1 }).withMessage('订单ID无效'),
  handleValidationErrors
], (req, res) => {
  const { orderIds } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 检查所有订单状态
    const placeholders = orderIds.map(() => '?').join(',');
    db.all(
      `SELECT id, status FROM orders WHERE id IN (${placeholders})`,
      orderIds,
      (err, orders) => {
        if (err) {
          db.run('ROLLBACK');
          logger.error('查询订单失败', { error: err.message });
          return res.status(500).json({ error: '批量删除失败' });
        }

        // 检查是否有已支付或已发货的订单
        const invalidOrders = orders.filter(o =>
          ['paid', 'shipped', 'completed'].includes(o.status)
        );

        if (invalidOrders.length > 0) {
          db.run('ROLLBACK');
          return res.status(400).json({
            error: '部分订单无法删除',
            invalidOrders: invalidOrders.map(o => o.id),
            message: '已支付或已发货的订单无法删除'
          });
        }

        // 获取所有订单项以恢复库存
        db.all(
          `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
          orderIds,
          (err, items) => {
            if (err) {
              db.run('ROLLBACK');
              logger.error('获取订单项失败', { error: err.message });
              return res.status(500).json({ error: '批量删除失败' });
            }

            // 恢复库存
            const updateStmt = db.prepare('UPDATE bearings SET stock = stock + ? WHERE id = ?');
            items.forEach(item => {
              updateStmt.run(item.quantity, item.bearing_id);
            });
            updateStmt.finalize();

            // 删除订单项
            db.run(
              `DELETE FROM order_items WHERE order_id IN (${placeholders})`,
              orderIds,
              (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  logger.error('删除订单项失败', { error: err.message });
                  return res.status(500).json({ error: '批量删除失败' });
                }

                // 删除订单状态历史
                db.run(
                  `DELETE FROM order_status_history WHERE order_id IN (${placeholders})`,
                  orderIds
                );

                // 删除订单
                db.run(
                  `DELETE FROM orders WHERE id IN (${placeholders})`,
                  orderIds,
                  function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      logger.error('批量删除订单失败', { error: err.message });
                      return res.status(500).json({ error: '批量删除失败' });
                    }

                    db.run('COMMIT');

                    // 清除缓存
                    clearCache('orders:*');
                    clearCache('bearings:*');

                    logger.info('批量删除订单成功', {
                      count: this.changes,
                      orderIds
                    });

                    res.json({
                      message: `成功删除${this.changes}个订单`,
                      count: this.changes,
                      restoredStock: items.length > 0
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// 获取订单状态历史
app.get('/api/orders/:id/history', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC',
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: '获取订单历史失败' });
      }
      res.json(rows);
    }
  );
});

// 导出订单为Excel
app.get('/api/orders/export/excel', verifyToken, requireAdmin, async (req, res) => {
  try {
    const orders = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM orders ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

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

// 导出单个订单为PDF
app.get('/api/orders/:id/export/pdf', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const order = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM orders WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    const items = await new Promise((resolve, reject) => {
      db.all(
        `SELECT oi.*, b.name, b.model FROM order_items oi
         JOIN bearings b ON oi.bearing_id = b.id
         WHERE oi.order_id = ?`,
        [id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const pdfBuffer = await exportOrderToPDF(order, items);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=order-${id}.pdf`);
    res.send(pdfBuffer);

    logger.info('订单PDF导出成功', { orderId: id });
  } catch (error) {
    logger.error('导出PDF失败', { error: error.message, orderId: id });
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
], (req, res) => {
  const { name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description } = req.body;

  db.run(
    `INSERT INTO bearings
    (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, model, price, category, innerDiameter, outerDiameter, width, stock, image, description],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      // 清除产品和分类缓存
      clearCache('bearings:*');
      clearCache('categories:*');
      res.json({ id: this.lastID, message: '产品添加成功' });
    }
  );
});

app.delete('/api/bearings/:id', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM bearings WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // 清除产品缓存
    clearCache('bearings:*');
    res.json({ message: '产品删除成功' });
  });
});

app.put('/api/bearings/:id/stock', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;

  db.run('UPDATE bearings SET stock = ? WHERE id = ?', [stock, id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // 清除产品缓存
    clearCache('bearings:*');
    res.json({ message: '库存更新成功' });
  });
});

// ==================== 图片上传API ====================

// 上传单张图片
app.post('/api/upload/image', verifyToken, requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: '文件大小不能超过5MB' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    const imageUrl = `/images/${req.file.filename}`;
    logger.info('图片上传成功', { filename: req.file.filename, size: req.file.size });

    res.json({
      message: '图片上传成功',
      url: imageUrl,
      filename: req.file.filename,
      size: req.file.size
    });
  });
});

// 批量上传图片（最多10张）
app.post('/api/upload/images', verifyToken, requireAdmin, (req, res) => {
  upload.array('images', 10)(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: '单个文件大小不能超过5MB' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    const results = req.files.map(file => ({
      url: `/images/${file.filename}`,
      filename: file.filename,
      size: file.size
    }));

    logger.info('批量图片上传成功', { count: results.length });

    res.json({
      message: `成功上传${results.length}张图片`,
      files: results
    });
  });
});

// 更新产品图片
app.put('/api/bearings/:id/image', verifyToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }

    // 删除旧图片
    db.get('SELECT image FROM bearings WHERE id = ?', [id], (err, row) => {
      if (row && row.image && row.image.startsWith('/images/')) {
        const oldPath = path.join(imagesDir, path.basename(row.image));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    });

    const imageUrl = `/images/${req.file.filename}`;
    db.run('UPDATE bearings SET image = ? WHERE id = ?', [imageUrl, id], function(err) {
      if (err) {
        logger.error('更新产品图片失败', { error: err.message, bearingId: id });
        return res.status(500).json({ error: '更新产品图片失败' });
      }

      clearCache('bearings:*');
      logger.info('产品图片已更新', { bearingId: id, image: imageUrl });
      res.json({ message: '产品图片已更新', url: imageUrl });
    });
  });
});

// 获取已上传的图片列表
app.get('/api/upload/images', verifyToken, requireAdmin, (req, res) => {
  fs.readdir(imagesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: '获取图片列表失败' });
    }

    const images = files
      .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f))
      .map(f => ({
        filename: f,
        url: `/images/${f}`,
        size: fs.statSync(path.join(imagesDir, f)).size
      }));

    res.json(images);
  });
});

// 删除图片
app.delete('/api/upload/images/:filename', verifyToken, requireAdmin, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(imagesDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '图片不存在' });
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: '删除图片失败' });
    }

    // 清除数据库中引用该图片的产品
    db.run('UPDATE bearings SET image = NULL WHERE image = ?', [`/images/${filename}`]);

    logger.info('图片已删除', { filename });
    res.json({ message: '图片已删除' });
  });
});

// ==================== 库存预警API ====================

// 获取低库存产品
app.get('/api/inventory/low-stock', verifyToken, requireAdmin, async (req, res) => {
  try {
    const products = await inventoryAlert.getLowStockProducts();
    res.json(products);
  } catch (error) {
    logger.error('获取低库存产品失败', { error: error.message });
    res.status(500).json({ error: '获取低库存产品失败' });
  }
});

// 获取缺货产品
app.get('/api/inventory/out-of-stock', verifyToken, requireAdmin, async (req, res) => {
  try {
    const products = await inventoryAlert.getOutOfStockProducts();
    res.json(products);
  } catch (error) {
    logger.error('获取缺货产品失败', { error: error.message });
    res.status(500).json({ error: '获取缺货产品失败' });
  }
});

// 获取库存周转率
app.get('/api/inventory/turnover', verifyToken, requireAdmin, async (req, res) => {
  try {
    const turnover = await inventoryAlert.getInventoryTurnover();
    res.json(turnover);
  } catch (error) {
    logger.error('获取库存周转率失败', { error: error.message });
    res.status(500).json({ error: '获取库存周转率失败' });
  }
});

// 获取销售趋势
app.get('/api/inventory/sales-trend/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { days = 30 } = req.query;

  try {
    const trend = await inventoryAlert.getSalesTrend(id, parseInt(days));
    res.json(trend);
  } catch (error) {
    logger.error('获取销售趋势失败', { error: error.message });
    res.status(500).json({ error: '获取销售趋势失败' });
  }
});

// 获取补货建议
app.get('/api/inventory/restock-suggestions', verifyToken, requireAdmin, async (req, res) => {
  try {
    const suggestions = await inventoryAlert.getRestockSuggestions();
    res.json(suggestions);
  } catch (error) {
    logger.error('获取补货建议失败', { error: error.message });
    res.status(500).json({ error: '获取补货建议失败' });
  }
});

// 获取库存统计摘要
app.get('/api/inventory/summary', verifyToken, requireAdmin, async (req, res) => {
  try {
    const summary = await inventoryAlert.getInventorySummary();
    res.json(summary);
  } catch (error) {
    logger.error('获取库存统计失败', { error: error.message });
    res.status(500).json({ error: '获取库存统计失败' });
  }
});

// ==================== 数据分析API ====================

// ==================== 智能推荐API ====================

// 热销产品推荐（公开）
app.get('/api/recommendations/hot', cacheMiddleware('recommendations:hot', 1800), async (req, res) => {
  const { limit = 10, days = 30 } = req.query;

  try {
    const products = await recommendationEngine.getHotProducts(parseInt(limit), parseInt(days));
    res.json(products);
  } catch (error) {
    logger.error('热销产品推荐失败', { error: error.message });
    res.status(500).json({ error: '推荐失败' });
  }
});

// 新品推荐（公开）
app.get('/api/recommendations/new', cacheMiddleware('recommendations:new', 1800), async (req, res) => {
  const { limit = 10 } = req.query;

  try {
    const products = await recommendationEngine.getNewProducts(parseInt(limit));
    res.json(products);
  } catch (error) {
    logger.error('新品推荐失败', { error: error.message });
    res.status(500).json({ error: '推荐失败' });
  }
});

// 相似产品推荐（公开）
app.get('/api/recommendations/similar/:id', cacheMiddleware('recommendations:similar', 1800), async (req, res) => {
  const { id } = req.params;
  const { limit = 5 } = req.query;

  try {
    const products = await recommendationEngine.getSimilarProducts(parseInt(id), parseInt(limit));
    res.json(products);
  } catch (error) {
    logger.error('相似产品推荐失败', { error: error.message });
    res.status(500).json({ error: '推荐失败' });
  }
});

// 协同过滤推荐（公开）
app.get('/api/recommendations/collaborative/:id', cacheMiddleware('recommendations:collaborative', 1800), async (req, res) => {
  const { id } = req.params;
  const { limit = 5 } = req.query;

  try {
    const products = await recommendationEngine.getCollaborativeRecommendations(parseInt(id), parseInt(limit));
    res.json(products);
  } catch (error) {
    logger.error('协同过滤推荐失败', { error: error.message });
    res.status(500).json({ error: '推荐失败' });
  }
});

// 个性化推荐（需要客户电话）
app.post('/api/recommendations/personalized', async (req, res) => {
  const { customerPhone, limit = 10 } = req.body;

  if (!customerPhone) {
    return res.status(400).json({ error: '需要提供客户电话' });
  }

  try {
    const products = await recommendationEngine.getPersonalizedRecommendations(customerPhone, parseInt(limit));
    res.json(products);
  } catch (error) {
    logger.error('个性化推荐失败', { error: error.message });
    res.status(500).json({ error: '推荐失败' });
  }
});

// 综合推荐（混合策略）
app.post('/api/recommendations/mixed', async (req, res) => {
  const { productId, customerPhone, limit = 10 } = req.body;

  try {
    const products = await recommendationEngine.getMixedRecommendations(
      productId ? parseInt(productId) : null,
      customerPhone || null,
      parseInt(limit)
    );
    res.json(products);
  } catch (error) {
    logger.error('综合推荐失败', { error: error.message });
    res.status(500).json({ error: '推荐失败' });
  }
});

// ==================== 支付API ====================
const paymentRoutes = require('./routes/payment')(db, paymentService);
app.use('/api/payment', paymentRoutes);

// ==================== CRM API ====================
const crmRoutes = require('./routes/crm')(db);
app.use('/api/crm', crmRoutes);

// ==================== AI智能 API ====================
const aiRoutes = require('./routes/ai')(db, aiService);
app.use('/api/ai', aiRoutes);

// ==================== GraphQL API ====================
const graphqlEndpoint = createGraphQLEndpoint({
  db,
  recommendationEngine,
  analytics,
  paymentService,
  aiService
});

app.use('/graphql', graphqlEndpoint);

logger.info('GraphQL API已启动');

// ==================== 数据分析仪表板API ====================

// 获取销售趋势
app.get('/api/analytics/sales-trend', verifyToken, async (req, res) => {
  try {
    const { period = 'day', days = 30 } = req.query;
    const data = await analytics.getSalesTrend(period, parseInt(days));
    res.json(data);
  } catch (error) {
    logger.error('获取销售趋势失败', { error: error.message });
    res.status(500).json({ error: '获取销售趋势失败' });
  }
});

// 获取热销产品
app.get('/api/analytics/top-products', verifyToken, async (req, res) => {
  try {
    const { limit = 10, days = 30 } = req.query;
    const data = await analytics.getTopSellingProducts(parseInt(limit), parseInt(days));
    res.json(data);
  } catch (error) {
    logger.error('获取热销产品失败', { error: error.message });
    res.status(500).json({ error: '获取热销产品失败' });
  }
});

// 获取分类销售统计
app.get('/api/analytics/category-sales', verifyToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = await analytics.getCategorySales(parseInt(days));
    res.json(data);
  } catch (error) {
    logger.error('获取分类销售统计失败', { error: error.message });
    res.status(500).json({ error: '获取分类销售统计失败' });
  }
});

// 获取客户地区分布
app.get('/api/analytics/customer-distribution', verifyToken, async (req, res) => {
  try {
    const data = await analytics.getCustomerDistribution();
    res.json(data);
  } catch (error) {
    logger.error('获取客户地区分布失败', { error: error.message });
    res.status(500).json({ error: '获取客户地区分布失败' });
  }
});

// 获取收入统计
app.get('/api/analytics/revenue-stats', verifyToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = await analytics.getRevenueStats(parseInt(days));
    res.json(data);
  } catch (error) {
    logger.error('获取收入统计失败', { error: error.message });
    res.status(500).json({ error: '获取收入统计失败' });
  }
});

// 获取实时销售监控
app.get('/api/analytics/realtime-sales', verifyToken, async (req, res) => {
  try {
    const data = await analytics.getRealtimeSales();
    res.json(data);
  } catch (error) {
    logger.error('获取实时销售监控失败', { error: error.message });
    res.status(500).json({ error: '获取实时销售监控失败' });
  }
});

// 获取综合仪表板数据
app.get('/api/analytics/dashboard', verifyToken, async (req, res) => {
  try {
    const data = await analytics.getDashboardSummary();

    // 获取销售趋势
    const salesTrend = await analytics.getSalesTrend('day', 30);

    // 获取最近订单
    const recentOrders = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT 10',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json({
      ...data,
      salesTrend,
      recentOrders
    });
  } catch (error) {
    logger.error('获取仪表板数据失败', { error: error.message });
    res.status(500).json({ error: '获取仪表板数据失败' });
  }
});

app.listen(PORT, () => {
  const message = `后端服务器运行在 http://localhost:${PORT}`;
  console.log(message);
  logger.info('服务器启动', { port: PORT, env: process.env.NODE_ENV });
});
