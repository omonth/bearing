require('dotenv').config();
const logger = require('./logger');
const { getDatabase } = require('./db/adapter');
const InventoryAlert = require('./utils/inventoryAlert');
const Analytics = require('./utils/analytics');
const RecommendationEngine = require('./utils/recommendation');
const PaymentService = require('./services/paymentService');
const AIService = require('./services/aiService');
const AuthService = require('./services/authService');
const BearingService = require('./services/bearingService');
const OrderService = require('./services/orderService');
const createApp = require('./app');

const PORT = process.env.PORT || 3001;

const db = getDatabase();
const inventoryAlert = new InventoryAlert(db);
const analytics = new Analytics(db);
const recommendationEngine = new RecommendationEngine(db);
const aiService = new AIService(db);
const authService = new AuthService(db);

const { clearCache } = require('./middleware/cache');
const bearingService = new BearingService(db, clearCache);
const orderService = new OrderService(db, clearCache);

const paymentService = new PaymentService(db, orderService);

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
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`后端服务器运行在端口 ${PORT}`);
  logger.info('服务器启动', { port: PORT, env: process.env.NODE_ENV || 'development' });
});
