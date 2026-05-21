const resolvers = {
  Bearing: {
    specs: (parent) => ({
      innerDiameter: parent.inner_diameter,
      outerDiameter: parent.outer_diameter,
      width: parent.width
    })
  },

  Order: {
    items: (parent, _, { db }) => {
      return new Promise((resolve, reject) => {
        db.all(
          `SELECT oi.*, b.name, b.model, b.image FROM order_items oi
           JOIN bearings b ON oi.bearing_id = b.id
           WHERE oi.order_id = ?`,
          [parent.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
    }
  },

  OrderItem: {
    bearing: (parent, _, { db }) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM bearings WHERE id = ?', [parent.bearing_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  },

  Customer: {
    tags: (parent) => {
      try { return JSON.parse(parent.tags || '[]'); } catch { return []; }
    }
  },

  Query: {
    bearings: (_, { category, search, limit, offset }, { db }) => {
      return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM bearings WHERE 1=1';
        const params = [];
        if (category && category !== '全部') { query += ' AND category = ?'; params.push(category); }
        if (search) { query += ' AND (name LIKE ? OR model LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        query += ' ORDER BY id ASC';
        if (limit) { query += ' LIMIT ?'; params.push(limit); }
        if (offset) { query += ' OFFSET ?'; params.push(offset); }
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
      });
    },

    bearing: (_, { id }, { db }) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM bearings WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row || null));
      });
    },

    categories: (_, __, { db }) => {
      return new Promise((resolve, reject) => {
        db.all('SELECT DISTINCT category FROM bearings', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.category));
        });
      });
    },

    orders: (_, { status, limit, offset }, { db }) => {
      return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM orders WHERE 1=1';
        const params = [];
        if (status) { query += ' AND status = ?'; params.push(status); }
        query += ' ORDER BY created_at DESC';
        if (limit) { query += ' LIMIT ?'; params.push(limit); }
        if (offset) { query += ' OFFSET ?'; params.push(offset); }
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
      });
    },

    order: (_, { id }, { db }) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM orders WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row || null));
      });
    },

    customers: (_, { level, status, search, limit, offset }, { db }) => {
      return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM customers WHERE 1=1';
        const params = [];
        if (level) { query += ' AND level = ?'; params.push(level); }
        if (status) { query += ' AND status = ?'; params.push(status); }
        if (search) { query += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        query += ' ORDER BY created_at DESC';
        if (limit) { query += ' LIMIT ?'; params.push(limit); }
        if (offset) { query += ' OFFSET ?'; params.push(offset); }
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
      });
    },

    customer: (_, { id }, { db }) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row || null));
      });
    },

    coupons: (_, { status }, { db }) => {
      return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM coupons WHERE 1=1';
        const params = [];
        if (status) { query += ' AND status = ?'; params.push(status); }
        query += ' ORDER BY created_at DESC';
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
      });
    },

    payments: (_, { status, paymentMethod }, { db }) => {
      return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM payment_orders WHERE 1=1';
        const params = [];
        if (status) { query += ' AND status = ?'; params.push(status); }
        if (paymentMethod) { query += ' AND payment_method = ?'; params.push(paymentMethod); }
        query += ' ORDER BY created_at DESC LIMIT 50';
        db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
      });
    },

    payment: (_, { id }, { db }) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM payment_orders WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row || null));
      });
    },

    dashboard: async (_, __, { db, analytics }) => {
      try {
        const summary = await analytics.getDashboardSummary();
        return {
          totalProducts: summary.totalProducts || 0,
          totalOrders: summary.totalOrders || 0,
          totalRevenue: summary.totalRevenue || 0,
          lowStockProducts: summary.lowStockProducts || 0,
          outOfStockProducts: summary.outOfStockProducts || 0,
          todayOrders: summary.todayOrders || 0,
          todayRevenue: summary.todayRevenue || 0
        };
      } catch (e) {
        return { totalProducts: 0, totalOrders: 0, totalRevenue: 0, lowStockProducts: 0, outOfStockProducts: 0, todayOrders: 0, todayRevenue: 0 };
      }
    },

    demandPredictions: (_, __, { aiService }) => {
      return aiService.predictAllDemand();
    },

    demandPrediction: (_, { productId, days }, { aiService }) => {
      return aiService.predictDemand(parseInt(productId), days || 30);
    },

    salesForecast: (_, { days }, { aiService }) => {
      return aiService.forecastSales(days || 30).then(f => f.forecast);
    },

    chat: (_, { message }, { aiService }) => {
      return aiService.chat(message);
    },

    smartRecommendations: (_, { customerPhone, limit }, { aiService }) => {
      return aiService.getSmartRecommendations(customerPhone || null, limit || 10)
        .then(r => r.recommendations);
    },

    hotProducts: (_, { limit }, { recommendationEngine }) => {
      return recommendationEngine.getHotProducts(limit || 10, 30);
    },

    newProducts: (_, { limit }, { recommendationEngine }) => {
      return recommendationEngine.getNewProducts(limit || 10);
    },

    similarProducts: (_, { productId, limit }, { recommendationEngine }) => {
      return recommendationEngine.getSimilarProducts(parseInt(productId), limit || 5);
    }
  },

  Mutation: {
    createOrder: (_, { customerName, customerPhone, province, city, district, addressDetail, items, totalPrice }, { db }) => {
      return new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          db.run(
            'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [customerName, customerPhone, province || '', city || '', district || '', addressDetail || '', totalPrice],
            function(err) {
              if (err) { db.run('ROLLBACK'); reject(err); return; }
              const orderId = this.lastID;

              let completed = 0;
              const total = items.length;
              const doItem = (i) => {
                if (i >= total) {
                  db.run('COMMIT', (err) => {
                    if (err) { db.run('ROLLBACK'); reject(err); }
                    else resolve({ orderId, message: '订单创建成功' });
                  });
                  return;
                }
                const item = items[i];
                db.run(
                  'INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)',
                  [orderId, item.id, item.quantity, item.price],
                  (err) => {
                    if (err) { db.run('ROLLBACK'); reject(err); return; }
                    db.run('UPDATE bearings SET stock = stock - ? WHERE id = ?', [item.quantity, item.id], (err) => {
                      if (err) { db.run('ROLLBACK'); reject(err); return; }
                      doItem(i + 1);
                    });
                  }
                );
              };
              doItem(0);
            }
          );
        });
      });
    },

    updateOrderStatus: (_, { orderId, status, trackingNumber, note }, { db }) => {
      return new Promise((resolve, reject) => {
        let query = 'UPDATE orders SET status = ?';
        const params = [status];
        if (status === 'shipped' && trackingNumber) {
          query += ', tracking_number = ?, shipped_at = CURRENT_TIMESTAMP';
          params.push(trackingNumber);
        }
        if (status === 'completed') {
          query += ', completed_at = CURRENT_TIMESTAMP';
        }
        query += ' WHERE id = ?';
        params.push(orderId);

        db.run(query, params, function(err) {
          if (err) reject(err);
          else {
            db.run(
              'INSERT INTO order_status_history (order_id, new_status, note) VALUES (?, ?, ?)',
              [orderId, status, note || 'GraphQL操作']
            );
            resolve({ message: '订单状态已更新' });
          }
        });
      });
    },

    addBearing: (_, args, { db }) => {
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO bearings (name, model, price, category, inner_diameter, outer_diameter, width, stock, image, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [args.name, args.model, args.price, args.category, args.innerDiameter, args.outerDiameter, args.width, args.stock, args.image, args.description],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, message: '产品添加成功' });
          }
        );
      });
    },

    deleteBearing: (_, { id }, { db }) => {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM bearings WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve({ message: '产品删除成功' });
        });
      });
    },

    updateStock: (_, { id, stock }, { db }) => {
      return new Promise((resolve, reject) => {
        db.run('UPDATE bearings SET stock = ? WHERE id = ?', [stock, id], function(err) {
          if (err) reject(err);
          else resolve({ message: '库存更新成功' });
        });
      });
    },

    createPayment: async (_, args, { paymentService }) => {
      const result = await paymentService.createPayment(args);
      return result;
    },

    simulatePayment: async (_, { paymentOrderId }, { paymentService }) => {
      await paymentService.simulatePayment(paymentOrderId);
      return { message: '支付成功（模拟）' };
    },

    createRefund: async (_, args, { paymentService }) => {
      return await paymentService.createRefund(args);
    },

    createCustomer: (_, args, { db }) => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO customers (name, phone, email, company, address) VALUES (?, ?, ?, ?, ?)',
          [args.name, args.phone, args.email, args.company, args.address],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, message: '客户创建成功' });
          }
        );
      });
    },

    updateCustomer: (_, { id, tags, notes, status }, { db }) => {
      return new Promise((resolve, reject) => {
        const updates = [];
        const params = [];
        if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
        if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }
        if (updates.length === 0) { resolve({ message: '没有要更新的字段' }); return; }
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);
        db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
          if (err) reject(err);
          else resolve({ message: '客户信息更新成功' });
        });
      });
    },

    addPoints: (_, { customerId, points, type, reason }, { db }) => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO points_records (customer_id, points, type, reason) VALUES (?, ?, ?, ?)',
          [customerId, points, type, reason],
          function(err) {
            if (err) reject(err);
            else {
              db.run('UPDATE customers SET points = points + ? WHERE id = ?', [points, customerId]);
              resolve({ message: '积分添加成功' });
            }
          }
        );
      });
    },

    createCoupon: (_, args, { db }) => {
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO coupons (code, name, type, discount_value, min_order_amount, total_quantity, valid_from, valid_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [args.code, args.name, args.type, args.discountValue || 0, args.minOrderAmount || 0, args.totalQuantity || 1000, args.validFrom, args.validUntil],
          function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, message: '优惠券创建成功' });
          }
        );
      });
    },

    issueCoupon: (_, { couponId, customerIds }, { db }) => {
      return new Promise((resolve, reject) => {
        let completed = 0;
        customerIds.forEach(customerId => {
          db.run(
            'INSERT INTO customer_coupons (customer_id, coupon_id) VALUES (?, ?)',
            [customerId, couponId],
            (err) => {
              if (err) reject(err);
              else {
                completed++;
                if (completed >= customerIds.length) {
                  resolve({ message: `成功发放给${customerIds.length}个客户` });
                }
              }
            }
          );
        });
      });
    },

    useCoupon: async (_, { code, customerId, orderId }, { db }) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM coupons WHERE code = ? AND status = ?', [code, 'active'], (err, coupon) => {
          if (err || !coupon) { reject(new Error('优惠券不存在或已失效')); return; }
          db.get(
            'SELECT * FROM customer_coupons WHERE customer_id = ? AND coupon_id = ? AND status = ?',
            [customerId, coupon.id, 'unused'],
            (err, cc) => {
              if (err || !cc) { reject(new Error('该客户没有此优惠券或已使用')); return; }
              let discountAmount = coupon.type === 'fixed' ? coupon.discount_value : 0;
              db.run(
                'UPDATE customer_coupons SET status = ?, used_order_id = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['used', orderId, cc.id]
              );
              db.run('UPDATE coupons SET used_quantity = used_quantity + 1 WHERE id = ?', [coupon.id]);
              resolve({ message: '优惠券使用成功', discountAmount });
            }
          );
        });
      });
    }
  }
};

module.exports = resolvers;
