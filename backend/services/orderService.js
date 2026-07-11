const logger = require('../logger');
const { AppError, NotFoundError, BusinessError, ValidationError } = require('../utils/errors');

class OrderService {
  constructor(db, clearCacheFn) {
    this.db = db;
    this.clearCache = clearCacheFn || (() => {});
  }

  async create({ customerName, customerPhone, province, city, district, addressDetail, items }) {
    const result = await this.db.transaction(async (tx) => {
      const checkedItems = [];
      for (const item of items) {
        const row = await tx.get('SELECT stock, price FROM bearings WHERE id = ?', [item.id]);
        if (!row) throw new NotFoundError('产品');
        if (row.stock < item.quantity) throw new BusinessError('库存不足');
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
    return { orderId: result.orderId, message: '订单创建成功' };
  }

  async list() {
    const rows = await this.db.all('SELECT * FROM orders ORDER BY created_at DESC', []);
    return rows;
  }

  async getItems(orderId) {
    const rows = await this.db.all(
      'SELECT oi.*, b.name, b.model FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?',
      [orderId]
    );
    return rows;
  }

  async getById(orderId) {
    const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) throw new NotFoundError('订单');
    return order;
  }

  async updateStatus(orderId, newStatus, note, trackingNumber) {
    const order = await this.db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    if (!order) throw new NotFoundError('订单');
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
    return { message: '订单状态已更新', oldStatus, newStatus };
  }

  async batchUpdateStatus(orderIds, newStatus, note) {
    if (!orderIds || orderIds.length === 0) {
      throw new ValidationError('订单ID列表不能为空');
    }

    try {
      const result = await this.db.transaction(async (tx) => {
        let updated = 0;
        for (const orderId of orderIds) {
          const order = await tx.get('SELECT id, status FROM orders WHERE id = ?', [orderId]);
          if (!order) {
            throw new NotFoundError('订单');
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
      return { updated: result.updated, message: `成功更新${result.updated}个订单` };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('批量更新订单状态失败', { error: err.message });
      throw new BusinessError('批量更新失败', 500);
    }
  }

  async delete(orderId) {
    try {
      const result = await this.db.transaction(async (tx) => {
        const order = await tx.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) throw new NotFoundError('订单');
        if (['paid', 'shipped', 'completed'].includes(order.status)) throw new BusinessError('无法删除已支付或已发货的订单', 400, 'CANNOT_DELETE');
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
      return { message: '订单删除成功', restoredStock: result.itemsCount > 0, itemsCount: result.itemsCount };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('删除订单失败', { error: err.message, orderId });
      throw new BusinessError('删除订单失败', 500);
    }
  }

  async batchDelete(orderIds) {
    try {
      const result = await this.db.transaction(async (tx) => {
        const placeholders = orderIds.map(() => '?').join(',');
        const orders = await tx.all(`SELECT id, status FROM orders WHERE id IN (${placeholders})`, orderIds);
        const invalidOrders = orders.filter(o => ['paid', 'shipped', 'completed'].includes(o.status));
        if (invalidOrders.length > 0) {
          const err = new BusinessError('部分订单无法删除', 400, 'INVALID_ORDERS');
          err.invalidOrders = invalidOrders.map(o => o.id);
          throw err;
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
      return { message: `成功删除${result.changes}个订单`, count: result.changes, restoredStock: result.restoredStock };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('批量删除订单失败', { error: err.message });
      throw new BusinessError('批量删除失败', 500);
    }
  }

  async getStatusHistory(orderId) {
    const rows = await this.db.all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
    return rows;
  }

  async _getCustomerPhone(customerId) {
    const customer = await this.db.get('SELECT phone FROM customers WHERE id = ?', [customerId]);
    return customer?.phone || null;
  }

  async listForCustomer(customerId) {
    const phone = await this._getCustomerPhone(customerId);
    if (!phone) throw new NotFoundError('顾客');

    const rows = await this.db.all(
      'SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC',
      [phone]
    );
    return rows;
  }

  async getForCustomer(customerId, orderId) {
    const phone = await this._getCustomerPhone(customerId);
    if (!phone) throw new NotFoundError('顾客');

    const order = await this.db.get(
      'SELECT * FROM orders WHERE id = ? AND customer_phone = ?',
      [orderId, phone]
    );
    if (!order) throw new NotFoundError('订单');

    const items = await this.db.all(
      'SELECT oi.*, b.name, b.model, b.image FROM order_items oi JOIN bearings b ON oi.bearing_id = b.id WHERE oi.order_id = ?',
      [order.id]
    );
    const history = await this.db.all(
      'SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC',
      [order.id]
    );
    return { ...order, items, statusHistory: history };
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
    const order = await this.getOrderById(orderId);
    const items = await this.getOrderItems(orderId);
    return { order, items };
  }
}

module.exports = OrderService;
