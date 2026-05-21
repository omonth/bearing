const logger = require('../logger');

class AIService {
  constructor(db) {
    this.db = db;
  }

  // ==================== Smart Chatbot ====================

  async chat(message, context = {}) {
    const msg = message.toLowerCase().trim();

    let response = '';
    let suggestions = [];
    let actions = [];

    // Product inquiry patterns
    if (msg.includes('产品') || msg.includes('轴承') || msg.includes('型号') || msg.includes('推荐')) {
      const products = await this.db.all('SELECT id, name, model, price, category, stock FROM bearings LIMIT 10');
      const productList = products.map(p =>
        `${p.name} (${p.model}) - ¥${p.price} [库存:${p.stock}]`
      ).join('\n');

      response = `以下是我们的轴承产品：\n\n${productList}\n\n您对哪款产品感兴趣？我可以为您详细介绍。`;
      suggestions = ['热销产品', '新品推荐', '按分类查看'];
    }
    // Order inquiry
    else if (msg.includes('订单') || msg.includes('物流') || msg.includes('发货')) {
      if (context.orderId) {
        const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [context.orderId]);
        if (order) {
          const statusMap = { pending: '待处理', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消' };
          response = `订单 #${order.id} 状态：${statusMap[order.status] || order.status}\n收货人：${order.customer_name}\n金额：¥${order.total_price}\n时间：${order.created_at}`;
          if (order.tracking_number) {
            response += `\n物流单号：${order.tracking_number}`;
          }
        } else {
          response = '未找到该订单，请检查订单号是否正确。';
        }
      } else {
        response = '请提供您的订单号，我可以帮您查询订单状态。您也可以告诉我手机号来查询订单。';
      }
    }
    // Phone order lookup
    else if (/^1[3-9]\d{9}$/.test(msg.trim())) {
      const orders = await this.db.all(
        'SELECT id, status, total_price, created_at FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 5',
        [msg.trim()]
      );
      if (orders.length > 0) {
        const statusMap = { pending: '待处理', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消' };
        response = `找到 ${orders.length} 个订单：\n\n` +
          orders.map(o => `#${o.id} - ${statusMap[o.status]} - ¥${o.total_price} - ${o.created_at}`).join('\n');
      } else {
        response = '未找到相关订单。如果您是新客户，欢迎浏览我们的产品！';
      }
      suggestions = ['查看产品', '热销推荐', '联系客服'];
    }
    // Price inquiry
    else if (msg.includes('价格') || msg.includes('多少钱') || msg.includes('优惠') || msg.includes('折扣')) {
      const priceRange = await this.db.get(
        'SELECT MIN(price) as minPrice, MAX(price) as maxPrice, AVG(price) as avgPrice FROM bearings'
      );
      response = `我们轴承产品的价格范围：¥${priceRange.minPrice} - ¥${priceRange.maxPrice}\n平均价格：¥${Math.round(priceRange.avgPrice * 100) / 100}\n\n目前有会员折扣和优惠券活动，最高可享20%折扣！`;
      suggestions = ['查看优惠券', '会员权益', '全部产品'];
    }
    // Stock inquiry
    else if (msg.includes('库存') || msg.includes('有货') || msg.includes('缺货')) {
      const [inStock, lowStock, outOfStock] = await Promise.all([
        this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock > 5'),
        this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock > 0 AND stock <= 5'),
        this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock = 0')
      ]);
      response = `库存概况：\n充足库存：${inStock.count}种\n低库存：${lowStock.count}种\n缺货：${outOfStock.count}种\n\n需要查看具体哪些产品呢？`;
    }
    // Help / general
    else if (msg.includes('帮助') || msg.includes('怎么') || msg.includes('功能') || msg === '') {
      response = `您好！我是轴承销售系统的智能客服，可以帮您：\n\n` +
        `🔍 查询产品 - 输入"产品"或"轴承型号"\n` +
        `📦 查询订单 - 输入"订单"或您的手机号\n` +
        `💰 价格咨询 - 输入"价格"\n` +
        `📊 库存查询 - 输入"库存"\n` +
        `🎫 优惠活动 - 输入"优惠"\n` +
        `❓ 更多问题 - 随时问我！`;
      suggestions = ['查看产品', '查询订单', '最新优惠', '库存情况'];
    }
    // Greeting
    else if (msg.includes('你好') || msg.includes('hi') || msg.includes('hello')) {
      response = '您好！欢迎来到轴承销售系统！有什么可以帮您的吗？';
      suggestions = ['查看产品', '查询订单', '帮助'];
    }
    // Default
    else {
      response = `关于"${message}"，我建议：\n\n1. 使用搜索功能查找相关产品\n2. 查看我们的帮助文档\n3. 联系人工客服获取更详细的解答\n\n您还可以输入"帮助"查看我能提供的服务。`;
      suggestions = ['搜索产品', '帮助', '联系客服'];
    }

    return {
      message: response,
      suggestions,
      actions,
      intent: this._detectIntent(msg),
      timestamp: new Date().toISOString()
    };
  }

  _detectIntent(message) {
    const msg = message.toLowerCase();
    if (msg.includes('产品') || msg.includes('轴承') || msg.includes('型号')) return 'product_inquiry';
    if (msg.includes('订单') || msg.includes('物流') || msg.includes('发货')) return 'order_inquiry';
    if (msg.includes('价格') || msg.includes('钱') || msg.includes('优惠') || msg.includes('折扣')) return 'price_inquiry';
    if (msg.includes('库存') || msg.includes('有货')) return 'stock_inquiry';
    if (msg.includes('你好') || msg.includes('hi') || msg.includes('hello')) return 'greeting';
    if (msg.includes('帮助')) return 'help';
    return 'general';
  }

  // ==================== Demand Prediction ====================

  async predictDemand(productId, days = 30) {
    const product = await this.db.get('SELECT * FROM bearings WHERE id = ?', [productId]);
    if (!product) throw new Error('产品不存在');

    // Get historical sales data
    const interval90 = this.db.dateInterval('-90 days');
    const salesHistory = await this.db.all(`
      SELECT
        DATE(o.created_at) as date,
        SUM(oi.quantity) as quantity
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.bearing_id = ? AND o.created_at >= ${interval90}
      GROUP BY DATE(o.created_at)
      ORDER BY date
    `, [productId]);

    // Simple moving average prediction
    let totalSales = 0;
    salesHistory.forEach(s => totalSales += s.quantity);
    const avgDailySales = salesHistory.length > 0 ? totalSales / Math.min(salesHistory.length, 90) : 0;

    // Calculate trend
    let trend = 'stable';
    if (salesHistory.length >= 14) {
      const recent = salesHistory.slice(-7).reduce((a, b) => a + b.quantity, 0);
      const older = salesHistory.slice(-14, -7).reduce((a, b) => a + b.quantity, 0);
      if (recent > older * 1.2) trend = 'up';
      else if (recent < older * 0.8) trend = 'down';
    }

    const predictedDemand = Math.ceil(avgDailySales * days);
    const currentStock = product.stock;
    const daysUntilEmpty = avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : 999;
    const needsRestock = daysUntilEmpty < 30;

    return {
      productId,
      productName: product.name,
      model: product.model,
      currentStock,
      avgDailySales: Math.round(avgDailySales * 100) / 100,
      predictedDemand,
      predictedDemandRange: {
        low: Math.ceil(predictedDemand * 0.8),
        high: Math.ceil(predictedDemand * 1.2)
      },
      trend,
      daysUntilEmpty,
      needsRestock,
      recommendedRestock: needsRestock ? Math.ceil(predictedDemand * 2 - currentStock) : 0,
      confidence: Math.min(0.9, salesHistory.length / 90 * 0.9)
    };
  }

  async predictAllDemand() {
    const products = await this.db.all('SELECT id FROM bearings');
    const predictions = [];

    for (const p of products) {
      try {
        const pred = await this.predictDemand(p.id);
        predictions.push(pred);
      } catch (e) {
        logger.warn('需求预测跳过产品', { id: p.id, error: e.message });
      }
    }

    return predictions.sort((a, b) => b.predictedDemand - a.predictedDemand);
  }

  // ==================== Smart Recommendations ====================

  async getSmartRecommendations(customerPhone, limit = 10) {
    let customerContext = {};

    if (customerPhone) {
      const orders = await this.db.all(`
        SELECT oi.bearing_id, b.category, b.name
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN bearings b ON oi.bearing_id = b.id
        WHERE o.customer_phone = ?
        ORDER BY o.created_at DESC
        LIMIT 20
      `, [customerPhone]);

      if (orders.length > 0) {
        const categories = {};
        const productIds = new Set();
        orders.forEach(o => {
          categories[o.category] = (categories[o.category] || 0) + 1;
          productIds.add(o.bearing_id);
        });

        const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
        customerContext = {
          hasHistory: true,
          topCategory: topCategory ? topCategory[0] : null,
          purchasedIds: [...productIds],
          orderCount: new Set(orders.map(o => o.created_at)).size
        };
      }
    }

    // Get recommendations based on context
    let query = 'SELECT * FROM bearings WHERE 1=1';
    const params = [];

    if (customerContext.hasHistory && customerContext.topCategory) {
      // Prioritize customer's preferred category
      const purchasedPlaceholders = customerContext.purchasedIds.map(() => '?').join(',');
      query += ` AND (category = ? OR id NOT IN (${purchasedPlaceholders}))`;
      params.push(customerContext.topCategory, ...customerContext.purchasedIds);
    }

    // Also get hot products as fallback
    const hotProducts = await this.db.all(`
      SELECT b.*, COUNT(oi.id) as order_count
      FROM bearings b
      LEFT JOIN order_items oi ON b.id = oi.bearing_id
      GROUP BY b.id
      ORDER BY order_count DESC
      LIMIT ?
    `, [limit]);

    const recommended = await this.db.all(query + ' LIMIT ?', [...params, limit]);

    const combined = [...recommended];
    // Fill with hot products if not enough
    for (const hp of hotProducts) {
      if (combined.length >= limit) break;
      if (!combined.find(p => p.id === hp.id)) {
        combined.push(hp);
      }
    }

    return {
      recommendations: combined.slice(0, limit).map(p => ({
        id: p.id,
        name: p.name,
        model: p.model,
        price: p.price,
        category: p.category,
        stock: p.stock,
        image: p.image
      })),
      context: customerContext,
      algorithm: customerContext.hasHistory ? 'hybrid_collaborative' : 'popularity_based'
    };
  }

  // ==================== Sales Forecasting ====================

  async forecastSales(days = 30) {
    // Get historical daily sales
    const interval90 = this.db.dateInterval('-90 days');
    const salesHistory = await this.db.all(`
      SELECT
        DATE(created_at) as date,
        SUM(total_price) as revenue,
        COUNT(*) as orderCount
      FROM orders
      WHERE created_at >= ${interval90}
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    if (salesHistory.length === 0) {
      return { forecast: [], message: '暂无足够历史数据进行预测' };
    }

    const totalRevenue = salesHistory.reduce((sum, s) => sum + s.revenue, 0);
    const avgDailyRevenue = totalRevenue / salesHistory.length;
    const avgDailyOrders = salesHistory.reduce((sum, s) => sum + s.orderCount, 0) / salesHistory.length;

    // Calculate trend
    const recentHalf = salesHistory.slice(-Math.ceil(salesHistory.length / 2));
    const olderHalf = salesHistory.slice(0, Math.floor(salesHistory.length / 2));
    const recentAvg = recentHalf.reduce((s, d) => s + d.revenue, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((s, d) => s + d.revenue, 0) / olderHalf.length;
    const trend = recentAvg > olderAvg * 1.05 ? 'up' : recentAvg < olderAvg * 0.95 ? 'down' : 'stable';

    // Generate forecast
    const forecast = [];
    const today = new Date();
    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();

      // Weekend adjustment
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;
      const trendFactor = trend === 'up' ? 1 + (i * 0.002) : trend === 'down' ? 1 - (i * 0.002) : 1;

      forecast.push({
        date: date.toISOString().split('T')[0],
        predictedRevenue: Math.round(avgDailyRevenue * weekendFactor * trendFactor * 100) / 100,
        predictedOrders: Math.round(avgDailyOrders * weekendFactor * trendFactor),
        dayOfWeek
      });
    }

    return {
      forecast,
      summary: {
        avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
        avgDailyOrders: Math.round(avgDailyOrders * 100) / 100,
        trend,
        predictedMonthlyRevenue: Math.round(forecast.reduce((s, f) => s + f.predictedRevenue, 0) * 100) / 100,
        predictedMonthlyOrders: Math.round(forecast.reduce((s, f) => s + f.predictedOrders, 0)),
        confidence: Math.min(0.85, salesHistory.length / 90 * 0.85)
      }
    };
  }
}

module.exports = AIService;
