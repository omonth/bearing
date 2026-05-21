require('dotenv').config();
const logger = require('./logger');
const { getDatabase } = require('./db/adapter');
const InventoryAlert = require('./utils/inventoryAlert');
const Analytics = require('./utils/analytics');
const RecommendationEngine = require('./utils/recommendation');
const PaymentService = require('./services/paymentService');
const AIService = require('./services/aiService');
const createApp = require('./app');

const PORT = process.env.PORT || 3001;

const db = getDatabase();
const inventoryAlert = new InventoryAlert(db);
const analytics = new Analytics(db);
const recommendationEngine = new RecommendationEngine(db);
const paymentService = new PaymentService(db);
const aiService = new AIService(db);

paymentService.enable();

const app = createApp(db, {
  inventoryAlert,
  analytics,
  recommendationEngine,
  paymentService,
  aiService,
});

app.listen(PORT, () => {
  console.log(`后端服务器运行在 http://localhost:${PORT}`);
  logger.info('服务器启动', { port: PORT, env: process.env.NODE_ENV });
});
