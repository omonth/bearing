require('dotenv').config();
const logger = require('./logger');
const { getDatabase } = require('./db/adapter');
const InventoryAlert = require('./utils/inventoryAlert');
const Analytics = require('./utils/analytics');
const RecommendationEngine = require('./utils/recommendation');
const PaymentOrchestrator = require('./services/payment/PaymentOrchestrator');
const AIService = require('./services/aiService');
const AuthService = require('./services/authService');
const BearingService = require('./services/bearingService');
const OrderService = require('./services/orderService');
const CustomerService = require('./services/customerService');
const CustomerSelfService = require('./services/customerSelfService');
const CouponService = require('./services/couponService');
const PointsService = require('./services/pointsService');
const SupplyChainService = require('./services/supplyChainService');
const RAGEngine = require('./services/ragEngine');
const createApp = require('./app');

const PORT = process.env.PORT || 3001;

const db = getDatabase();
const inventoryAlert = new InventoryAlert(db);
const analytics = new Analytics(db);
const recommendationEngine = new RecommendationEngine(db);
const aiService = new AIService(db);
if (process.env.DEEPSEEK_API_KEY) {
  const ragEngine = new RAGEngine(db, process.env.DEEPSEEK_API_KEY);
  aiService.setRagEngine(ragEngine);
  ragEngine.buildIndex().catch(err => logger.warn('RAG索引构建失败', { error: err.message }));
  logger.info('RAG引擎已初始化');
} else {
  logger.warn('DEEPSEEK_API_KEY未设置，RAG引擎未启用');
}
const authService = new AuthService(db);

const { clearCache } = require('./middleware/cache');
const bearingService = new BearingService(db, clearCache);
const orderService = new OrderService(db, clearCache);
const customerService = new CustomerService(db);
const couponService = new CouponService(db);
const pointsService = new PointsService(db, customerService);
const supplyChainService = new SupplyChainService(db);
const customerSelfService = new CustomerSelfService({
  db,
  customerService,
  couponService,
  orderService,
});

const paymentService = new PaymentOrchestrator(db, orderService);

paymentService.enable();

const app = createApp(db, {
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
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务器运行在端口 ${PORT}`);
  logger.info('服务器启动', { port: PORT, env: process.env.NODE_ENV || 'development' });
});
