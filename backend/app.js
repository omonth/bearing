require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const logger = require('./logger');
const { createGrayReleaseMiddleware } = require('./middleware/grayRelease');
const { apiLimiter } = require('./middleware/rateLimiter');
const { createUploadMiddleware, validateMime } = require('./middleware/upload');
const { createRequestObservabilityMiddleware } = require('./middleware/observability');
const { alerter: defaultAlerter } = require('./services/observability/alerting');
const { metrics: defaultMetrics } = require('./services/observability/metrics');
const {
  configuredOrigins,
  createCookieCsrfProtection,
} = require('./middleware/sessionCookies');

function createApp(db, services = {}) {
  const {
    inventoryAlert,
    analytics,
    recommendationEngine,
    paymentService,
    aiService,
    aiAuthService,
    authService,
    bearingService,
    orderService,
    customerService,
    customerSelfService,
    afterSalesService,
    couponService,
    pointsService,
    supplyChainService,
    observability = {},
  } = services;

  const metrics = observability.metrics || defaultMetrics;
  const alerter = observability.alerter || defaultAlerter;

  const app = express();
  app.locals.db = db;

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

  const allowedOrigins = configuredOrigins();
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin.replace(/\/$/, '')));
    },
    credentials: true
  }));

  app.use(createCookieCsrfProtection());

  app.use(...createRequestObservabilityMiddleware(metrics, alerter));

  app.use('/', require('./routes/observability')({
    db,
    redis: observability.redis,
    requireRedis: observability.requireRedis ?? process.env.NODE_ENV === 'production',
    metrics,
    alerter,
  }));

  app.use('/api/', apiLimiter);
  const capturePaymentCallbackBody = (req, _res, buffer) => {
    if (req.originalUrl.startsWith('/api/payment/')) {
      req.rawBody = buffer.toString('utf8');
    }
  };
  app.use(express.json({ verify: capturePaymentCallbackBody }));
  app.use(express.urlencoded({ extended: false, verify: capturePaymentCallbackBody }));
  app.use(createGrayReleaseMiddleware());
  app.use(express.static(path.join(__dirname, 'public')));

  const { upload, imagesDir } = createUploadMiddleware();
  const requireAIRole = aiAuthService
    ? require('./middleware/aiAuth').createAIAuthMiddleware(aiAuthService)
    : null;

  // ==================== Route mounting ====================

  app.use('/', require('./routes/index'));

  app.use('/api/runtime', require('./routes/runtime'));

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

  if (afterSalesService) {
    app.use('/api/after-sales', require('./routes/afterSales')(afterSalesService));
  }

  if (supplyChainService) {
    const supplyChainRoutes = require('./routes/supplyChain')(supplyChainService);
    app.use('/api/supply-chain', supplyChainRoutes);
  }

  if (aiAuthService) {
    const aiAuthRoutes = require('./routes/ai-auth')(aiAuthService, requireAIRole, db);
    app.use('/api/ai/auth', aiAuthRoutes);

    // Smart product modification (requires editor/admin role)
    if (aiService && bearingService) {
      const aiModifyRoutes = require('./routes/ai-modify')(db, aiService, aiAuthService, bearingService, requireAIRole);
      app.use('/api/ai/modify-product', aiModifyRoutes);
    }
  }

  if (aiService) {
    const aiRoutes = require('./routes/ai')(db, aiService, requireAIRole);
    app.use('/api/ai', aiRoutes);
  }

  // ==================== Error handling ====================

  // 404 handler for unmatched routes
  app.use((req, res) => {
    res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND' });
  });

  // Global error handler — catches AppError (operational) and unexpected errors
  app.use((err, req, res, _next) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // Operational errors: expected failures from services (NotFoundError, ValidationError, etc.)
    if (err.isOperational) {
      const statusCode = err.statusCode || 500;
      const code = err.code || 'INTERNAL_ERROR';

      logger.warn(err.message, {
        code,
        statusCode,
        path: req.path,
      });

      return res.status(statusCode).json({
        error: isProduction && statusCode === 500 ? '服务器内部错误' : err.message,
        code: isProduction && statusCode === 500 ? 'INTERNAL_ERROR' : code,
        ...(err.field && { field: err.field }),
      });
    }

    // Programmer bugs / unexpected errors: log full stack, return generic 500
    logger.error(err.message, {
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      stack: err.stack,
      path: req.path,
    });

    res.status(500).json({
      error: isProduction ? '服务器内部错误' : err.message || '未知错误',
      code: 'INTERNAL_ERROR',
    });
  });

  return app;
}

module.exports = createApp;
