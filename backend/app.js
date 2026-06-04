require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const logger = require('./logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { createUploadMiddleware, validateMime } = require('./middleware/upload');

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
    customerService,
    customerSelfService,
    couponService,
    pointsService,
    supplyChainService,
  } = services;

  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }));

  app.use('/api/', apiLimiter);
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const { upload, imagesDir } = createUploadMiddleware();

  // ==================== Route mounting ====================

  app.use('/', require('./routes/index'));

  if (authService) {
    app.use('/api/auth', require('./routes/auth')(authService));
  }

  app.use('/api', require('./routes/products')(bearingService));

  app.use('/api/bearings', require('./routes/admin-products')(db, bearingService, upload, imagesDir));

  app.use('/api/orders', require('./routes/orders')(db, orderService));

  app.use('/api/upload', require('./routes/upload')(db, upload, imagesDir));

  if (inventoryAlert) {
    app.use('/api/inventory', require('./routes/inventory')(inventoryAlert));
  }

  if (recommendationEngine) {
    app.use('/api/recommendations', require('./routes/recommendations')(recommendationEngine));
  }

  if (analytics) {
    app.use('/api/analytics', require('./routes/analytics')(db, analytics));
  }

  // ==================== External route modules ====================

  if (paymentService) {
    const paymentRoutes = require('./routes/payment')(db, paymentService);
    app.use('/api/payment', paymentRoutes);
  }

  const crmRoutes = require('./routes/crm')(db, { customerService, couponService, pointsService });
  app.use('/api/crm', crmRoutes);

  const customerRoutes = require('./routes/customer')(customerSelfService);
  app.use('/api/customer', customerRoutes);

  if (supplyChainService) {
    const supplyChainRoutes = require('./routes/supplyChain')(supplyChainService);
    app.use('/api/supply-chain', supplyChainRoutes);
  }

  if (aiService) {
    const aiRoutes = require('./routes/ai')(db, aiService);
    app.use('/api/ai', aiRoutes);
  }

  // ==================== Error handling ====================

  app.use((req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  app.use((err, req, res, _next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';

    logger.error(err.message, {
      code,
      statusCode,
      stack: err.stack,
      path: req.path,
    });

    res.status(statusCode).json({
      error: isProduction && statusCode === 500 ? '服务器内部错误' : err.message,
      code: isProduction && statusCode === 500 ? 'INTERNAL_ERROR' : code,
    });
  });

  return app;
}

module.exports = createApp;
