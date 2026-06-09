const logger = require('../logger');

class AIService {
  constructor(db) {
    this.db = db;
    this.ragEngine = null;
  }

  setRagEngine(engine) {
    this.ragEngine = engine;
  }

  // ==================== Smart Chatbot (Rule-based FastPath) ====================

  async _fastPath(message, context = {}) {
    const msg = message.toLowerCase().trim();

    // Phone number → order lookup
    if (/^1[3-9]\d{9}$/.test(msg.trim())) {
      const orders = await this.db.all(
        'SELECT id, status, total_price, created_at FROM orders WHERE customer_phone = ? ORDER BY created_at DESC LIMIT 5',
        [msg.trim()]
      );
      if (orders.length > 0) {
        const statusMap = { pending: '待处理', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消' };
        return {
          message: `找到 ${orders.length} 个订单：\n\n` + orders.map(o => `#${o.id} - ${statusMap[o.status]} - ¥${o.total_price} - ${o.created_at}`).join('\n'),
          suggestions: ['查看产品', '热销推荐'],
          intent: 'order_lookup',
          fastPath: true,
        };
      }
      return { message: '未找到相关订单。如果您是新客户，欢迎浏览我们的产品！', suggestions: ['查看产品', '热销推荐'], intent: 'order_lookup', fastPath: true };
    }

    // Stock inquiry
    if (msg.includes('库存') || msg.includes('有货') || msg.includes('缺货')) {
      const [inStock, lowStock, outOfStock] = await Promise.all([
        this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock > 5'),
        this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock > 0 AND stock <= 5'),
        this.db.get('SELECT COUNT(*) as count FROM bearings WHERE stock = 0'),
      ]);
      return {
        message: `库存概况：\n充足库存：${inStock.count}种\n低库存：${lowStock.count}种\n缺货：${outOfStock.count}种`,
        suggestions: ['查看产品', '热销推荐'],
        intent: 'stock_inquiry',
        fastPath: true,
      };
    }

    // Price inquiry
    if (msg.includes('价格') || msg.includes('多少钱') || msg.includes('优惠') || msg.includes('折扣')) {
      const priceRange = await this.db.get('SELECT MIN(price) as minPrice, MAX(price) as maxPrice FROM bearings');
      return {
        message: `轴承产品价格范围：¥${priceRange.minPrice} - ¥${priceRange.maxPrice}\n欢迎浏览产品目录了解更多！`,
        suggestions: ['查看产品', '热销推荐'],
        intent: 'price_inquiry',
        fastPath: true,
      };
    }

    // Help
    if (msg.includes('帮助') || msg.includes('怎么') || msg.includes('功能')) {
      return {
        message: '您好！我是智能客服，可以帮您：\n\n🔍 查询产品 — 输入轴承型号\n📦 查询订单 — 输入手机号\n📊 查看库存 — 输入"库存"\n💰 了解价格 — 输入"价格"',
        suggestions: ['查看产品', '查询订单', '热销推荐'],
        intent: 'help',
        fastPath: true,
      };
    }

    if (msg.includes('订单') || msg.includes('物流')) {
      return { message: '请提供您的手机号或订单号，我可以帮您查询订单状态。', suggestions: ['查看产品'], intent: 'order_query', fastPath: true };
    }

    return null;
  }

  async chat(message, context = {}) {
    // FastPath: rule-based for common queries (instant, no API call)
    const fast = await this._fastPath(message, context);
    if (fast) return fast;

    // RAG: semantic search + LLM
    if (this.ragEngine) {
      try {
        const hits = await this.ragEngine.search(message, 5);

        // Fetch full product details for card display
        let products = [];
        if (hits.length > 0) {
          const ids = hits.map(h => h.id);
          const placeholders = ids.map(() => '?').join(',');
          const rows = await this.db.all(
            `SELECT id, name, model, category, price, stock, image, inner_diameter, outer_diameter, width
             FROM bearings WHERE id IN (${placeholders})`,
            ids
          );
          // Preserve search result order
          const rowMap = new Map(rows.map(r => [r.id, r]));
          products = hits.map(h => {
            const row = rowMap.get(h.id);
            if (!row) return null;
            return {
              id: row.id,
              name: this._parseJsonField(row.name),
              model: row.model,
              category: row.category,
              price: row.price,
              stock: row.stock,
              image: row.image,
              specs: {
                inner_diameter: row.inner_diameter,
                outer_diameter: row.outer_diameter,
                width: row.width,
              },
              score: h.score,
            };
          }).filter(Boolean);
        }

        const contextParts = hits.map(h => `[产品] ${h.content}`);
        const prompt = `用户问题：${message}\n\n参考信息：\n${contextParts.join('\n')}\n\n请根据参考信息回答用户问题。如果检索到了相关产品，可以推荐给用户。如果参考信息不足以回答，请诚实说明。`;

        const stream = await this.ragEngine.chat(prompt);
        return {
          stream,
          products,
          intent: 'rag',
          timestamp: new Date().toISOString(),
        };
      } catch (e) {
        logger.warn('RAG失败，降级到规则', { error: e.message });
      }
    }

    return {
      message: `关于"${message}"，请尝试搜索产品型号或输入"帮助"查看我能提供的服务。`,
      suggestions: ['搜索产品', '帮助'],
      intent: 'fallback',
      timestamp: new Date().toISOString(),
    };
  }

  _parseJsonField(val) {
    if (!val) return '';
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      return obj.zh || obj.en || '';
    } catch {
      return val;
    }
  }

  // ==================== Admin NL-to-SQL ====================

  async adminChat(message) {
    if (!this.ragEngine) {
      return { message: 'AI 助手未启用（需配置 DEEPSEEK_API_KEY）', type: 'error' };
    }

    const schema = `
数据库表结构:
- bearings(id, name TEXT, model TEXT, price REAL, category TEXT, stock INTEGER, inner_diameter, outer_diameter, width, description TEXT, created_at)
- orders(id, customer_name TEXT, customer_phone TEXT, total_price REAL, status TEXT, created_at, shipped_at, completed_at)
- order_items(id, order_id, bearing_id, quantity, price)
- customers(id, name TEXT, phone TEXT, level TEXT, points INTEGER, total_spent REAL)
- payment_orders(id, order_id, amount REAL, status TEXT, created_at)
注意: name 和 description 字段存储的是 JSON 格式 {"zh":"...", "en":"..."}

规则:
1. 只生成 SELECT 语句
2. 用 LIMIT 限制结果（最多100行）
3. 时间过滤用 date(created_at)
4. 返回纯SQL，不要解释`;

    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.ragEngine.apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: schema },
            { role: 'user', content: `生成SQL查询：${message}` },
          ],
        }),
      });

      const data = await res.json();
      const sql = (data.choices?.[0]?.message?.content || '').replace(/```sql|```/g, '').trim();

      if (!sql.toUpperCase().startsWith('SELECT')) return { message: '仅支持数据查询操作', type: 'error' };
      if (sql.toUpperCase().includes('DROP') || sql.toUpperCase().includes('DELETE') || sql.toUpperCase().includes('INSERT') || sql.toUpperCase().includes('UPDATE') || sql.toUpperCase().includes('ALTER')) {
        return { message: '不允许的数据库操作', type: 'error' };
      }

      const safeSql = sql.includes('LIMIT') ? sql : `${sql} LIMIT 100`;
      const start = Date.now();
      const rows = await Promise.race([
        this.db.all(safeSql, []),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000)),
      ]);

      if (rows.length === 0) return { message: '未找到匹配数据', type: 'result', data: [], sql: safeSql };
      if (rows.length >= 100) return { message: `查询到 ${rows.length}+ 条数据（仅显示前100条）`, type: 'result', data: rows.slice(0, 100), sql: safeSql };

      return { message: `查询到 ${rows.length} 条数据`, type: 'result', data: rows, sql: safeSql };
    } catch (e) {
      if (e.message === 'TIMEOUT') return { message: '查询超时，请简化查询条件', type: 'error' };
      logger.error('Admin AI查询失败', { error: e.message });
      return { message: '抱歉，我无法回答这个问题', type: 'error' };
    }
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
