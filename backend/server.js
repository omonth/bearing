require('dotenv').config();
const http = require('http');
const logger = require('./logger');
const { validateProductionEnvironment } = require('./config/production');
const { closeDatabase, getDatabase } = require('./db/adapter');
const InventoryAlert = require('./utils/inventoryAlert');
const Analytics = require('./utils/analytics');
const RecommendationEngine = require('./utils/recommendation');
const PaymentOrchestrator = require('./services/payment/PaymentOrchestrator');
const AIService = require('./services/aiService');
const AIAuthService = require('./services/aiAuthService');
const AuthService = require('./services/authService');
const BearingService = require('./services/bearingService');
const OrderService = require('./services/orderService');
const CustomerService = require('./services/customerService');
const CustomerSelfService = require('./services/customerSelfService');
const AfterSalesService = require('./services/afterSalesService');
const AddressBookService = require('./services/addressBookService');
const CouponService = require('./services/couponService');
const PointsService = require('./services/pointsService');
const SupplyChainService = require('./services/supplyChainService');
const RAGEngine = require('./services/ragEngine');
const { checkMigrations } = require('./migrations/migrator');

const PORT = process.env.PORT || 3001;

validateProductionEnvironment();
const db = getDatabase();

async function startServer() {
  await checkMigrations(db);

  // Route imports initialize Redis, so load the application only after the
  // schema ledger and checksums have passed the startup gate.
  const createApp = require('./app');
  const { clearCache, isRedisAvailable, redis } = require('./middleware/cache');
  const inventoryAlert = new InventoryAlert(db);
  const analytics = new Analytics(db);
  const recommendationEngine = new RecommendationEngine(db);
  const aiService = new AIService(db);

  let ragEngine = null;
  if (process.env.DEEPSEEK_API_KEY) {
    ragEngine = new RAGEngine(db, process.env.DEEPSEEK_API_KEY);
    aiService.setRagEngine(ragEngine);
    ragEngine.buildIndex().catch(err => logger.warn('RAG索引构建失败', { error: err.message }));
    logger.info('RAG引擎已初始化');
  } else {
    logger.warn('DEEPSEEK_API_KEY未设置，RAG引擎未启用');
  }

  const authService = new AuthService(db);
  const aiAuthService = new AIAuthService(db);
  const bearingService = new BearingService(db, clearCache, ragEngine);
  const orderService = new OrderService(db, clearCache);
  const customerService = new CustomerService(db);
  const addressBookService = new AddressBookService(db);
  const couponService = new CouponService(db);
  const pointsService = new PointsService(db, customerService);
  const supplyChainService = new SupplyChainService(db);
  const customerSelfService = new CustomerSelfService({
    db,
    customerService,
    couponService,
    orderService,
    addressBookService,
  });
  const paymentService = new PaymentOrchestrator(db, orderService);
  paymentService.enable();
  const afterSalesService = new AfterSalesService({
    db,
    paymentOrchestrator: paymentService,
  });

  const app = createApp(db, {
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
    observability: {
      requireRedis: true,
      redis: async () => {
        if (!isRedisAvailable() || !redis) throw new Error('Redis unavailable');
        const response = await redis.ping();
        if (response !== 'PONG') throw new Error('Redis ping failed');
      },
    },
  });

  await Promise.all([authService.bootstrapInitialAdmin(), aiAuthService.ready]);
  const httpServer = http.createServer(app);
  await require('./services/websocketService').initWebSocket(httpServer, {
    db,
    redisClient: redis,
    requireRedis: process.env.NODE_ENV === 'production',
  });
  return httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info('服务器启动', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
}

startServer().catch(async (error) => {
  logger.error('启动前数据库检查失败，服务未启动', { error: error.message });
  try {
    await closeDatabase();
  } finally {
    process.exitCode = 1;
  }
});
