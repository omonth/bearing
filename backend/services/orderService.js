const logger = require('../logger');

class OrderService {
  constructor(db, clearCacheFn) {
    this.db = db;
    this.clearCache = clearCacheFn || (() => {});
  }

  async create({ customerName, customerPhone, province, city, district, addressDetail, items }) {
    try {
      const result = await this.db.transaction(async (tx) => {
        const checkedItems = [];
        for (const item of items) {
          const row = await tx.get('SELECT stock, price FROM bearings WHERE id = ?', [item.id]);
          if (!row) throw new Error(`产品ID ${item.id} 不存在`);
          if (row.stock < item.quantity) throw new Error(`产品ID ${item.id} 库存不足，当前库存：${row.stock}`);
          checkedItems.push({ id: item.id, quantity: item.quantity, price: row.price });
        }
        const totalPrice = checkedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderResult = await tx.run(
          'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [customerName, customerPhone, province, city, district, addressDetail, totalPrice]
        );
        const orderId = orderResult.lastID;
        for (const item of checkedItems) {
          await tx.run('INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, item.id, item.quantity, item.price]);
          await tx.run('UPDATE bearings SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }
        return { orderId, customerName, totalPrice };
      });
      logger.info('订单创建成功', { orderId: result.orderId, customerName: result.customerName, totalPrice: result.totalPrice });
      return { data: { orderId: result.orderId, message: '订单创建成功' }, error: null };
    } catch (err) {
      logger.warn('订单创建失败', { error: err.message });
      return { data: null, error: err.message, status: 400 };
    }
  }

  async list() {
    try {
      const rows = await this.db.all('SELECT * FROM orders ORDER BY created_at DESC', []);
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async getItems(orderId) {
    try {
      const rows = await this.db.all(
        'SELECT oi.*, b.name, b.model FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?',
        [orderId]
      );
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async getById(orderId) {
    try {
      const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!order) return { data: null, error: '订单不存在', status: 404 };
      return { data: order, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async updateStatus(orderId, newStatus, note, trackingNumber) {
    try {
      const order = await this.db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
      if (!order) return { data: null, error: '订单不存在', status: 404 };
      const oldStatus = order.status;

      let updateQuery = 'UPDATE orders SET status = ?';
      let params = [newStatus];
      if (newStatus === 'shipped') {
        updateQuery += ', shipped_at = CURRENT_TIMESTAMP';
        if (trackingNumber) { updateQuery += ', tracking_number = ?'; params.push(trackingNumber); }
      }
      if (newStatus === 'completed') { updateQuery += ', completed_at = CURRENT_TIMESTAMP'; }
      updateQuery += ' WHERE id = ?';
      params.push(orderId);

      await this.db.run(updateQuery, params);
      await this.db.run(
        'INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)',
        [orderId, oldStatus, newStatus, note || null]
      );
      logger.info('订单状态已更新', { orderId, oldStatus, newStatus });
      return { data: { message: '订单状态已更新', oldStatus, newStatus }, error: null };
    } catch (err) {
      logger.error('更新订单状态失败', { error: err.message, orderId });
      return { data: null, error: '更新订单状态失败', status: 500 };
    }
  }

  async batchUpdateStatus(orderIds, newStatus, note) {
    if (!orderIds || orderIds.length === 0) {
      return { data: null, error: '订单ID列表不能为空', status: 400 };
    }

    try {
      const result = await this.db.transaction(async (tx) => {
        let updated = 0;
        for (const orderId of orderIds) {
          const order = await tx.get('SELECT id, status FROM orders WHERE id = ?', [orderId]);
          if (!order) {
            throw new Error(JSON.stringify({ type: 'NOT_FOUND', orderId }));
          }
          const oldStatus = order.status;

          let updateQuery = 'UPDATE orders SET status = ?';
          let params = [newStatus];
          if (newStatus === 'shipped') {
            updateQuery += ', shipped_at = CURRENT_TIMESTAMP';
          }
          if (newStatus === 'completed') {
            updateQuery += ', completed_at = CURRENT_TIMESTAMP';
          }
          updateQuery += ' WHERE id = ?';
          params.push(orderId);

          await tx.run(updateQuery, params);
          await tx.run(
            'INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)',
            [orderId, oldStatus, newStatus, note || '批量操作']
          );
          updated++;
        }
        return { updated };
      });

      logger.info('批量更新订单状态成功', { count: result.updated, status: newStatus });
      return { data: { updated: result.updated, message: `成功更新${result.updated}个订单` }, error: null };
    } catch (err) {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.type === 'NOT_FOUND') {
          return { data: null, error: `订单 #${parsed.orderId} 不存在`, status: 404 };
        }
      } catch {}
      logger.error('批量更新订单状态失败', { error: err.message });
      return { data: null, error: '批量更新失败', status: 500 };
    }
  }

  async delete(orderId) {
    try {
      const result = await this.db.transaction(async (tx) => {
        const order = await tx.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) throw new Error('NOT_FOUND');
        if (['paid', 'shipped', 'completed'].includes(order.status)) throw new Error('CANNOT_DELETE');
        const items = await tx.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        for (const item of items) {
          await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
        }
        await tx.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
        await tx.run('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
        await tx.run('DELETE FROM orders WHERE id = ?', [orderId]);
        return { customerName: order.customer_name, itemsCount: items.length };
      });
      this.clearCache('orders:*');
      this.clearCache('bearings:*');
      logger.info('订单删除成功', { orderId, customerName: result.customerName, itemsCount: result.itemsCount });
      return { data: { message: '订单删除成功', restoredStock: result.itemsCount > 0, itemsCount: result.itemsCount }, error: null };
    } catch (err) {
      if (err.message === 'NOT_FOUND') return { data: null, error: '订单不存在', status: 404 };
      if (err.message === 'CANNOT_DELETE') return { data: null, error: '无法删除已支付或已发货的订单', suggestion: '请先取消订单，然后再删除', status: 400 };
      logger.error('删除订单失败', { error: err.message, orderId });
      return { data: null, error: '删除订单失败', status: 500 };
    }
  }

  async batchDelete(orderIds) {
    try {
      const result = await this.db.transaction(async (tx) => {
        const placeholders = orderIds.map(() => '?').join(',');
        const orders = await tx.all(`SELECT id, status FROM orders WHERE id IN (${placeholders})`, orderIds);
        const invalidOrders = orders.filter(o => ['paid', 'shipped', 'completed'].includes(o.status));
        if (invalidOrders.length > 0) {
          throw new Error(JSON.stringify({ type: 'INVALID_ORDERS', invalidOrders: invalidOrders.map(o => o.id) }));
        }
        const items = await tx.all(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
        for (const item of items) {
          await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
        }
        await tx.run(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
        await tx.run(`DELETE FROM order_status_history WHERE order_id IN (${placeholders})`, orderIds);
        const deleteResult = await tx.run(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds);
        return { changes: deleteResult.changes, restoredStock: items.length > 0 };
      });
      this.clearCache('orders:*');
      this.clearCache('bearings:*');
      logger.info('批量删除订单成功', { count: result.changes, orderIds });
      return { data: { message: `成功删除${result.changes}个订单`, count: result.changes, restoredStock: result.restoredStock }, error: null };
    } catch (err) {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.type === 'INVALID_ORDERS') {
          return { data: null, error: '部分订单无法删除', invalidOrders: parsed.invalidOrders, message: '已支付或已发货的订单无法删除', status: 400 };
        }
      } catch {}
      logger.error('批量删除订单失败', { error: err.message });
      return { data: null, error: '批量删除失败', status: 500 };
    }
  }

  async getStatusHistory(orderId) {
    try {
      const rows = await this.db.all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: '获取订单历史失败', status: 500 };
    }
  }

  async createOrder(input) {
    return this.create(input);
  }

  async listOrders() {
    return this.list();
  }

  async getOrderById(orderId) {
    return this.getById(orderId);
  }

  async getOrderItems(orderId) {
    return this.getItems(orderId);
  }

  async updateOrderStatus(orderId, newStatus, note, trackingNumber) {
    return this.updateStatus(orderId, newStatus, note, trackingNumber);
  }

  async batchUpdateOrderStatus(orderIds, newStatus, note) {
    return this.batchUpdateStatus(orderIds, newStatus, note);
  }

  async deleteOrder(orderId) {
    return this.delete(orderId);
  }

  async batchDeleteOrders(orderIds) {
    return this.batchDelete(orderIds);
  }

  async getOrderStatusHistory(orderId) {
    return this.getStatusHistory(orderId);
  }

  async getExportOrders() {
    return this.listOrders();
  }

  async getPrintableOrder(orderId) {
    const orderResult = await this.getOrderById(orderId);
    if (orderResult.error) {
      return orderResult;
    }

    const itemsResult = await this.getOrderItems(orderId);
    if (itemsResult.error) {
      return itemsResult;
    }

    return {
      data: {
        order: orderResult.data,
        items: itemsResult.data,
      },
      error: null,
    };
  }
}

module.exports = OrderService;
