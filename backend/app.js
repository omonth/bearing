require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { body, param, validationResult } = require('express-validator');
const helmet = require('helmet');
const logger = require('./logger');
const { verifyToken, requireAdmin } = require('./middleware/auth');
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
    authService,
    bearingService,
    orderService,
  } = services;

  const app = express();

  app.set('trust proxy', 1);

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
    if (!authService) return res.status(500).json({ error: '认证服务未配置' });
    const { username, password } = req.body;
    const { data, error, status } = await authService.login(username, password);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.post('/api/auth/change-password', verifyToken, [
    body('oldPassword').notEmpty().withMessage('旧密码不能为空'),
    body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位'),
    handleValidationErrors
  ], async (req, res) => {
    if (!authService) return res.status(500).json({ error: '认证服务未配置' });
    const { oldPassword, newPassword } = req.body;
    const { data, error, status } = await authService.changePassword(req.user.userId, oldPassword, newPassword);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/auth/me', verifyToken, async (req, res) => {
    if (!authService) return res.status(500).json({ error: '认证服务未配置' });
    const { data, error, status } = await authService.getMe(req.user.userId);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== 产品 ====================

  app.get('/api/search', cacheMiddleware('search', 300), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.search(req.query);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/search/suggestions', cacheMiddleware('suggestions', 1800), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.searchSuggestions(req.query.q);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/bearings', cacheMiddleware('bearings', 600), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.list(req.query.category);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/bearings/:id', async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.getById(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/categories', cacheMiddleware('categories', 3600), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.getCategories();
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
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
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.create(req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  // ==================== 管理员API ====================

  app.get('/api/orders', verifyToken, requireAdmin, async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.list();
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/orders/:id/items', verifyToken, requireAdmin, async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.getItems(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.put('/api/orders/:id/status', verifyToken, requireAdmin, [
    body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    body('note').optional().trim(),
    handleValidationErrors
  ], async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.updateStatus(req.params.id, req.body.status, req.body.note, req.body.trackingNumber);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.put('/api/orders/batch/status', verifyToken, requireAdmin, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('status').isIn(['pending', 'paid', 'shipped', 'completed', 'cancelled']).withMessage('无效的订单状态'),
    handleValidationErrors
  ], async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.batchUpdateStatus(req.body.orderIds, req.body.status, req.body.note);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.delete('/api/orders/:id', verifyToken, requireAdmin, [
    param('id').isInt({ min: 1 }).withMessage('订单ID无效'),
    handleValidationErrors
  ], async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.delete(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.delete('/api/orders/batch', verifyToken, requireAdmin, [
    body('orderIds').isArray({ min: 1 }).withMessage('订单ID列表不能为空'),
    body('orderIds.*').isInt({ min: 1 }).withMessage('订单ID无效'),
    handleValidationErrors
  ], async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.batchDelete(req.body.orderIds);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.get('/api/orders/:id/history', verifyToken, requireAdmin, async (req, res) => {
    if (!orderService) return res.status(500).json({ error: '订单服务未配置' });
    const { data, error, status } = await orderService.getStatusHistory(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
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
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.create(req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.delete('/api/bearings/:id', verifyToken, requireAdmin, async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.delete(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  app.put('/api/bearings/:id/stock', verifyToken, requireAdmin, async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.updateStock(req.params.id, req.body.stock);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
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
        if (bearingService) {
          const { data: oldData } = await bearingService.getImagePath(req.params.id);
          if (oldData && oldData.image && oldData.image.startsWith('/images/')) {
            const oldPath = path.join(imagesDir, path.basename(oldData.image));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          const imageUrl = `/images/${req.file.filename}`;
          const { data, error, status } = await bearingService.updateImage(req.params.id, imageUrl);
          if (error) return res.status(status || 500).json({ error });
          return res.json(data);
        }
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
  app.use('/graphql', createGraphQLEndpoint({ db, recommendationEngine, analytics, paymentService, aiService, authService, bearingService, orderService }));

  return app;
}

module.exports = createApp;
