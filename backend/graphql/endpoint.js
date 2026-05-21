const { graphql, buildSchema } = require('graphql');
const logger = require('../logger');

const schemaSDL = `
  type Bearing {
    id: ID!
    name: String!
    model: String!
    price: Float!
    image: String
    category: String!
    specs: BearingSpecs!
    stock: Int!
    description: String
  }

  type BearingSpecs {
    innerDiameter: Float
    outerDiameter: Float
    width: Float
  }

  type Order {
    id: ID!
    customerName: String!
    customerPhone: String!
    province: String
    city: String
    district: String
    addressDetail: String
    totalPrice: Float!
    status: String!
    trackingNumber: String
    createdAt: String
    items: [OrderItem!]
  }

  type OrderItem {
    id: ID!
    bearingId: Int!
    quantity: Int!
    price: Float!
    bearing: Bearing
  }

  type Customer {
    id: ID!
    name: String!
    phone: String!
    email: String
    company: String
    address: String
    level: String!
    points: Int!
    totalSpent: Float!
    totalOrders: Int!
    tags: [String!]
    status: String!
  }

  type Coupon {
    id: ID!
    code: String!
    name: String!
    type: String!
    discountValue: Float
    minOrderAmount: Float
    totalQuantity: Int
    usedQuantity: Int
    validFrom: String
    validUntil: String
    status: String!
  }

  type PaymentOrder {
    id: ID!
    orderId: Int!
    paymentMethod: String!
    amount: Float!
    status: String!
    transactionId: String
    tradeNo: String
    createdAt: String
    paidAt: String
  }

  type AnalyticsDashboard {
    totalProducts: Int!
    totalOrders: Int!
    totalRevenue: Float!
    lowStockProducts: Int!
    outOfStockProducts: Int!
    todayOrders: Int!
    todayRevenue: Float!
  }

  type DemandPrediction {
    productId: ID!
    productName: String!
    model: String!
    currentStock: Int!
    avgDailySales: Float!
    predictedDemand: Int!
    trend: String!
    daysUntilEmpty: Int!
    needsRestock: Boolean!
    recommendedRestock: Int!
  }

  type SalesForecast {
    date: String!
    predictedRevenue: Float!
    predictedOrders: Int!
    dayOfWeek: Int!
  }

  type ChatResponse {
    message: String!
    suggestions: [String!]
    intent: String!
    timestamp: String!
  }

  type RefundResult {
    refundId: ID!
    refundNo: String!
    amount: Float!
    status: String!
    message: String!
  }

  type CouponUseResult {
    message: String!
    discountAmount: Float!
  }

  type MutationResult {
    success: Boolean!
    message: String
    id: ID
    orderId: ID
    orderNo: String
    paymentOrderId: ID
    qrCode: String
    qrUrl: String
    refundId: ID
    refundNo: String
    amount: Float
    status: String
    discountAmount: Float
  }

  input OrderItemInput {
    id: Int!
    quantity: Int!
    price: Float!
  }

  type Query {
    bearings(category: String, search: String, limit: Int, offset: Int): [Bearing!]!
    bearing(id: ID!): Bearing
    categories: [String!]!
    orders(status: String, limit: Int, offset: Int): [Order!]!
    order(id: ID!): Order
    customers(level: String, status: String, search: String, limit: Int, offset: Int): [Customer!]!
    customer(id: ID!): Customer
    coupons(status: String): [Coupon!]!
    payments(status: String, paymentMethod: String): [PaymentOrder!]!
    payment(id: ID!): PaymentOrder
    dashboard: AnalyticsDashboard!
    demandPredictions: [DemandPrediction!]!
    demandPrediction(productId: ID!, days: Int): DemandPrediction!
    salesForecast(days: Int): [SalesForecast!]!
    chat(message: String!): ChatResponse!
    smartRecommendations(customerPhone: String, limit: Int): [Bearing!]!
    hotProducts(limit: Int): [Bearing!]!
    newProducts(limit: Int): [Bearing!]!
    similarProducts(productId: ID!, limit: Int): [Bearing!]!
  }

  type Mutation {
    createOrder(customerName: String!, customerPhone: String!, province: String, city: String, district: String, addressDetail: String, items: [OrderItemInput!]!, totalPrice: Float): MutationResult!
    updateOrderStatus(orderId: ID!, status: String!, trackingNumber: String, note: String): MutationResult!
    addBearing(name: String!, model: String!, price: Float!, category: String!, stock: Int!, innerDiameter: Float, outerDiameter: Float, width: Float, image: String, description: String): MutationResult!
    deleteBearing(id: ID!): MutationResult!
    updateStock(id: ID!, stock: Int!): MutationResult!
    createPayment(orderId: ID!, amount: Float!, paymentMethod: String!, subject: String): MutationResult!
    simulatePayment(paymentOrderId: ID!): MutationResult!
    createRefund(paymentOrderId: ID!, amount: Float!, reason: String): MutationResult!
    createCustomer(name: String!, phone: String!, email: String, company: String, address: String): MutationResult!
    updateCustomer(id: ID!, tags: [String!], notes: String, status: String): MutationResult!
    addPoints(customerId: ID!, points: Int!, type: String!, reason: String): MutationResult!
    createCoupon(code: String!, name: String!, type: String!, discountValue: Float, minOrderAmount: Float, totalQuantity: Int, validFrom: String, validUntil: String): MutationResult!
    issueCoupon(couponId: ID!, customerIds: [ID!]!): MutationResult!
    useCoupon(code: String!, customerId: ID!, orderId: ID!): MutationResult!
  }
`;

function createGraphQLMiddleware(services) {
  const { db, analytics, recommendationEngine, paymentService, aiService, authService, bearingService, orderService } = services;

  const rootValue = {
    // === Query ===
    bearings: async ({ category }) => {
      if (bearingService) {
        const { data, error } = await bearingService.list(category);
        return (data || []).map(r => ({ ...r, specs: r.specs }));
      }
      const params = [];
      let query = 'SELECT * FROM bearings WHERE 1=1';
      if (category && category !== '全部') { query += ' AND category = ?'; params.push(category); }
      const rows = await db.all(query + ' ORDER BY id ASC', params);
      return rows.map(r => ({ ...r, specs: { innerDiameter: r.inner_diameter, outerDiameter: r.outer_diameter, width: r.width } }));
    },
    bearing: async ({ id }) => {
      if (bearingService) {
        const { data } = await bearingService.getById(id);
        return data ? { ...data, specs: data.specs || {} } : null;
      }
      const row = await db.get('SELECT * FROM bearings WHERE id = ?', [id]);
      return row ? { ...row, specs: { innerDiameter: row.inner_diameter, outerDiameter: row.outer_diameter, width: row.width } } : null;
    },
    categories: async () => {
      if (bearingService) {
        const { data } = await bearingService.getCategories();
        return data || [];
      }
      const rows = await db.all('SELECT DISTINCT category FROM bearings', []);
      return rows.map(r => r.category);
    },
    orders: async ({ status, limit, offset }) => {
      if (orderService) {
        const { data: rows } = await orderService.list();
        let filtered = rows || [];
        if (status) filtered = filtered.filter(o => o.status === status);
        if (offset) filtered = filtered.slice(offset);
        if (limit) filtered = filtered.slice(0, limit);
        return Promise.all(filtered.map(async (o) => {
          const { data: items } = await orderService.getItems(o.id);
          return {
            id: o.id, customerName: o.customer_name, customerPhone: o.customer_phone,
            province: o.province, city: o.city, district: o.district,
            addressDetail: o.address_detail, totalPrice: o.total_price,
            status: o.status, trackingNumber: o.tracking_number, createdAt: o.created_at,
            items: (items || []).map(it => ({ ...it, bearingId: it.bearing_id }))
          };
        }));
      }
      let query = 'SELECT * FROM orders WHERE 1=1';
      const params = [];
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY created_at DESC';
      if (limit) { query += ' LIMIT ?'; params.push(limit); }
      if (offset) { query += ' OFFSET ?'; params.push(offset); }
      const rows = await db.all(query, params);
      return Promise.all(rows.map(async (o) => {
        const items = await db.all(
          `SELECT oi.*, b.name, b.model, b.image FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?`,
          [o.id]
        );
        return {
          id: o.id, customerName: o.customer_name, customerPhone: o.customer_phone,
          province: o.province, city: o.city, district: o.district,
          addressDetail: o.address_detail, totalPrice: o.total_price,
          status: o.status, trackingNumber: o.tracking_number, createdAt: o.created_at,
          items: items.map(it => ({ ...it, bearingId: it.bearing_id }))
        };
      }));
    },
    order: async ({ id }) => {
      if (orderService) {
        const { data: o } = await orderService.getById(id);
        if (!o) return null;
        const { data: items } = await orderService.getItems(id);
        return {
          id: o.id, customerName: o.customer_name, customerPhone: o.customer_phone,
          province: o.province, city: o.city, district: o.district,
          addressDetail: o.address_detail, totalPrice: o.total_price,
          status: o.status, trackingNumber: o.tracking_number, createdAt: o.created_at,
          items: (items || []).map(it => ({ ...it, bearingId: it.bearing_id }))
        };
      }
      const o = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
      if (!o) return null;
      const items = await db.all(
        `SELECT oi.*, b.name, b.model, b.image FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?`,
        [id]
      );
      return {
        id: o.id, customerName: o.customer_name, customerPhone: o.customer_phone,
        province: o.province, city: o.city, district: o.district,
        addressDetail: o.address_detail, totalPrice: o.total_price,
        status: o.status, trackingNumber: o.tracking_number, createdAt: o.created_at,
        items: items.map(it => ({ ...it, bearingId: it.bearing_id }))
      };
    },
    customers: async ({ level, status, search, limit, offset }) => {
      let query = 'SELECT * FROM customers WHERE 1=1';
      const params = [];
      if (level) { query += ' AND level = ?'; params.push(level); }
      if (status) { query += ' AND status = ?'; params.push(status); }
      if (search) { query += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      query += ' ORDER BY created_at DESC';
      if (limit) { query += ' LIMIT ?'; params.push(limit); }
      if (offset) { query += ' OFFSET ?'; params.push(offset); }
      const rows = await db.all(query, params);
      return rows.map(r => {
        let tags = [];
        try { tags = JSON.parse(r.tags || '[]'); } catch {}
        return { ...r, tags };
      });
    },
    customer: async ({ id }) => {
      const row = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
      if (!row) return null;
      let tags = [];
      try { tags = JSON.parse(row.tags || '[]'); } catch {}
      return { ...row, tags };
    },
    coupons: async ({ status }) => {
      let query = 'SELECT * FROM coupons WHERE 1=1';
      const params = [];
      if (status) { query += ' AND status = ?'; params.push(status); }
      query += ' ORDER BY created_at DESC';
      return await db.all(query, params);
    },
    payments: async ({ status, paymentMethod }) => {
      let query = 'SELECT * FROM payment_orders WHERE 1=1';
      const params = [];
      if (status) { query += ' AND status = ?'; params.push(status); }
      if (paymentMethod) { query += ' AND payment_method = ?'; params.push(paymentMethod); }
      query += ' ORDER BY created_at DESC LIMIT 50';
      return await db.all(query, params);
    },
    payment: async ({ id }) => db.get('SELECT * FROM payment_orders WHERE id = ?', [id]),
    dashboard: async () => {
      try {
        return await analytics.getDashboardSummary();
      } catch { return { totalProducts: 0, totalOrders: 0, totalRevenue: 0, lowStockProducts: 0, outOfStockProducts: 0, todayOrders: 0, todayRevenue: 0 }; }
    },
    demandPredictions: async () => aiService.predictAllDemand(),
    demandPrediction: async ({ productId, days }) => aiService.predictDemand(parseInt(productId), days || 30),
    salesForecast: async ({ days }) => {
      const f = await aiService.forecastSales(days || 30);
      return f.forecast || [];
    },
    chat: async ({ message }) => aiService.chat(message),
    smartRecommendations: async ({ customerPhone, limit }) => {
      const r = await aiService.getSmartRecommendations(customerPhone || null, limit || 10);
      return r.recommendations.map(p => ({ ...p, specs: {} }));
    },
    hotProducts: async ({ limit }) => {
      const prods = await recommendationEngine.getHotProducts(limit || 10, 30);
      return prods.map(p => ({ ...p, specs: {} }));
    },
    newProducts: async ({ limit }) => {
      const prods = await recommendationEngine.getNewProducts(limit || 10);
      return prods.map(p => ({ ...p, specs: {} }));
    },
    similarProducts: async ({ productId, limit }) => {
      const prods = await recommendationEngine.getSimilarProducts(parseInt(productId), limit || 5);
      return prods.map(p => ({ ...p, specs: {} }));
    },

    // === Mutation ===
    createOrder: async ({ customerName, customerPhone, province, city, district, addressDetail, items }) => {
      if (orderService) {
        const { data, error } = await orderService.create({
          customerName, customerPhone, province, city, district, addressDetail, items
        });
        if (error) return { success: false, message: error };
        return { success: true, message: '订单创建成功', orderId: data.orderId };
      }
      const result = await db.transaction(async (tx) => {
        const totalPrice = items.reduce((s, i) => s + i.price * i.quantity, 0);
        const orderResult = await tx.run(
          'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [customerName, customerPhone, province || '', city || '', district || '', addressDetail || '', totalPrice]
        );
        const orderId = orderResult.lastID;
        for (const item of items) {
          await tx.run('INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, item.id, item.quantity, item.price]);
          await tx.run('UPDATE bearings SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }
        return { orderId };
      });
      return { success: true, message: '订单创建成功', orderId: result.orderId };
    },
    updateOrderStatus: async ({ orderId, status, trackingNumber, note }) => {
      if (orderService) {
        const { data, error } = await orderService.updateStatus(orderId, status, note, trackingNumber);
        if (error) return { success: false, message: error };
        return { success: true, message: data.message };
      }
      let query = 'UPDATE orders SET status = ?';
      const params = [status];
      if (status === 'shipped' && trackingNumber) { query += ', tracking_number = ?, shipped_at = CURRENT_TIMESTAMP'; params.push(trackingNumber); }
      if (status === 'completed') { query += ', completed_at = CURRENT_TIMESTAMP'; }
      query += ' WHERE id = ?';
      params.push(orderId);
      await db.run(query, params);
      await db.run('INSERT INTO order_status_history (order_id, new_status, note) VALUES (?, ?, ?)', [orderId, status, note || 'GraphQL']);
      return { success: true, message: '订单状态已更新' };
    },
    addBearing: async (args) => {
      if (bearingService) {
        const { data, error } = await bearingService.create(args);
        if (error) return { success: false, message: error };
        return { success: true, message: data.message, id: data.id };
      }
      const result = await db.run(
        `INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [args.name, args.model, args.price, args.category, args.innerDiameter, args.outerDiameter, args.width, args.stock, args.image, args.description]
      );
      return { success: true, message: '产品添加成功', id: result.lastID };
    },
    deleteBearing: async ({ id }) => {
      if (bearingService) {
        const { data, error } = await bearingService.delete(id);
        if (error) return { success: false, message: error };
        return { success: true, message: data.message };
      }
      await db.run('DELETE FROM bearings WHERE id = ?', [id]);
      return { success: true, message: '产品删除成功' };
    },
    updateStock: async ({ id, stock }) => {
      if (bearingService) {
        const { data, error } = await bearingService.updateStock(id, stock);
        if (error) return { success: false, message: error };
        return { success: true, message: data.message };
      }
      await db.run('UPDATE bearings SET stock = ? WHERE id = ?', [stock, id]);
      return { success: true, message: '库存更新成功' };
    },
    createPayment: async (args) => {
      const result = await paymentService.createPayment(args);
      return { success: true, ...result };
    },
    simulatePayment: async ({ paymentOrderId }) => {
      await paymentService.simulatePayment(paymentOrderId);
      return { success: true, message: '支付成功（模拟）' };
    },
    createRefund: async (args) => {
      const result = await paymentService.createRefund(args);
      return { success: true, ...result };
    },
    createCustomer: async (args) => {
      const result = await db.run(
        'INSERT INTO customers (name, phone, email, company, address) VALUES (?, ?, ?, ?, ?)',
        [args.name, args.phone, args.email, args.company, args.address]
      );
      return { success: true, message: '客户创建成功', id: result.lastID };
    },
    updateCustomer: async ({ id, tags, notes, status }) => {
      const updates = [], params = [];
      if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
      if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }
      if (updates.length === 0) return { success: true, message: '没有要更新的字段' };
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      await db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
      return { success: true, message: '客户信息更新成功' };
    },
    addPoints: async ({ customerId, points, type, reason }) => {
      await db.run('INSERT INTO points_records (customer_id, points, type, reason) VALUES (?, ?, ?, ?)', [customerId, points, type, reason]);
      await db.run('UPDATE customers SET points = points + ? WHERE id = ?', [points, customerId]);
      return { success: true, message: '积分添加成功' };
    },
    createCoupon: async (args) => {
      const result = await db.run(
        `INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until) VALUES (?,?,?,?,?,?,?,?)`,
        [args.code, args.name, args.type, args.discountValue || 0, args.minOrderAmount || 0, args.totalQuantity || 1000, args.validFrom, args.validUntil]
      );
      return { success: true, message: '优惠券创建成功', id: result.lastID };
    },
    issueCoupon: async ({ couponId, customerIds }) => {
      for (const customerId of customerIds) {
        await db.run('INSERT INTO customer_coupons (customer_id, coupon_id) VALUES (?, ?)', [customerId, couponId]);
      }
      return { success: true, message: `成功发放给${customerIds.length}个客户` };
    },
    useCoupon: async ({ code, customerId, orderId }) => {
      const coupon = await db.get('SELECT * FROM coupons WHERE code = ? AND status = ?', [code, 'active']);
      if (!coupon) throw new Error('优惠券不存在或已失效');
      const cc = await db.get('SELECT * FROM customer_coupons WHERE customer_id = ? AND coupon_id = ? AND status = ?', [customerId, coupon.id, 'unused']);
      if (!cc) throw new Error('该客户没有此优惠券或已使用');
      const discountAmount = coupon.type === 'fixed' ? coupon.discount_value : 0;
      await db.run('UPDATE customer_coupons SET status = ?, used_order_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?', ['used', orderId, cc.id]);
      await db.run('UPDATE coupons SET used_quantity = used_quantity + 1 WHERE id = ?', [coupon.id]);
      return { success: true, message: '优惠券使用成功', discountAmount };
    }
  };

  return rootValue;
}

function createGraphQLEndpoint(services) {
  const rootValue = createGraphQLMiddleware(services);
  const schema = buildSchema(schemaSDL);

  return async (req, res) => {
    try {
      const { query, variables, operationName } = req.body;

      if (!query) {
        // If GET request, return GraphiQL-like info
        return res.json({
          message: 'GraphQL API',
          hint: 'Send POST requests with query/variables in JSON body',
          example: {
            query: '{ bearings { id name model price category stock } }'
          }
        });
      }

      const result = await graphql({
        schema,
        source: query,
        rootValue,
        variableValues: variables,
        operationName
      });

      logger.info('GraphQL查询', { operationName: operationName || 'anonymous' });

      if (result.errors) {
        result.errors.forEach(e => logger.error('GraphQL错误', { error: e.message }));
      }

      res.json(result);
    } catch (error) {
      logger.error('GraphQL处理失败', { error: error.message });
      res.status(400).json({ errors: [{ message: error.message }] });
    }
  };
}

module.exports = createGraphQLEndpoint;
