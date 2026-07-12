const logger = require('../logger');
const { AppError, NotFoundError, BusinessError, ValidationError } = require('../utils/errors');

class OrderService {
  constructor(db, clearCacheFn) {
    this.db = db;
    this.clearCache = clearCacheFn || (() => {});
  }

  async create({ customerName, customerPhone, province, city, district, addressDetail, items, customerId }) {
    const result = await this.db.transaction(async (tx) => {
      let resolvedCustomerName = customerName;
      let resolvedCustomerPhone = customerPhone;
      if (customerId) {
        const customer = await tx.get('SELECT name, phone FROM customers WHERE id = ?', [customerId]);
        if (!customer) throw new NotFoundError('客户');
        resolvedCustomerName = customer.name || customer.phone;
        resolvedCustomerPhone = customer.phone;
      }

      const quantitiesByBearingId = new Map();
      for (const item of items) {
        quantitiesByBearingId.set(item.id, (quantitiesByBearingId.get(item.id) || 0) + item.quantity);
      }

      const checkedItems = [];
      for (const [bearingId, quantity] of quantitiesByBearingId) {
        const row = await tx.get('SELECT price FROM bearings WHERE id = ?', [bearingId]);
        if (!row) throw new NotFoundError('产品');

        // The conditional update is the inventory reservation. It remains safe
        // with duplicate line items and concurrent PostgreSQL transactions.
        const stockResult = await tx.run(
          'UPDATE bearings SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [quantity, bearingId, quantity]
        );
        if (!stockResult || stockResult.changes !== 1) {
          throw new BusinessError('库存不足');
        }
        checkedItems.push({ id: bearingId, quantity, price: row.price });
      }

      const totalPrice = checkedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const orderResult = await tx.run(
        'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [resolvedCustomerName, resolvedCustomerPhone, province, city, district, addressDetail, totalPrice]
      );
      const orderId = orderResult.lastID;
      for (const item of checkedItems) {
        await tx.run(
          'INSERT INTO order_items (order_id, bearing_id, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.id, item.quantity, item.price]
        );
      }
      return { orderId, customerName: resolvedCustomerName, totalPrice };
    });
    this.clearCache('bearings:*');
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

  async _updateStatusInTransaction(tx, orderId, newStatus, note, trackingNumber) {
    const order = await tx.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    if (!order) throw new NotFoundError('订单');
    const oldStatus = order.status;

    if (oldStatus === newStatus) {
      return { oldStatus, newStatus, restoredStock: false, updated: false };
    }

    const transitions = {
      pending: new Set(['paid', 'cancelled']),
      paid: new Set(['shipped', 'completed', 'cancelled']),
      shipped: new Set(['completed']),
      completed: new Set(),
      cancelled: new Set(),
    };
    if (!transitions[oldStatus]?.has(newStatus)) {
      throw new BusinessError(`订单状态不能从 ${oldStatus} 变更为 ${newStatus}`, 409, 'INVALID_STATUS_TRANSITION');
    }

    let updateQuery = 'UPDATE orders SET status = ?';
    const params = [newStatus];
    if (newStatus === 'shipped') {
      updateQuery += ', shipped_at = CURRENT_TIMESTAMP';
      if (trackingNumber) {
        updateQuery += ', tracking_number = ?';
        params.push(trackingNumber);
      }
    }
    if (newStatus === 'completed') {
      updateQuery += ', completed_at = CURRENT_TIMESTAMP';
    }
    updateQuery += ' WHERE id = ? AND status = ?';
    params.push(orderId, oldStatus);
    const updateResult = await tx.run(updateQuery, params);
    if (!updateResult || updateResult.changes !== 1) {
      throw new BusinessError('订单状态已被并发更新', 409, 'ORDER_STATUS_CONFLICT');
    }

    let restoredStock = false;
    if (newStatus === 'cancelled') {
      const items = await tx.all('SELECT bearing_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
      for (const item of items) {
        await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
      }
      restoredStock = items.length > 0;
    }

    await tx.run(
      'INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)',
      [orderId, oldStatus, newStatus, note || null]
    );
    return { oldStatus, newStatus, restoredStock, updated: true };
  }

  async updateStatus(orderId, newStatus, note, trackingNumber) {
    const result = await this.db.transaction((tx) => this._updateStatusInTransaction(
      tx,
      orderId,
      newStatus,
      note,
      trackingNumber
    ));
    this.clearCache('orders:*');
    if (result.restoredStock) this.clearCache('bearings:*');
    logger.info('订单状态已更新', { orderId, oldStatus: result.oldStatus, newStatus: result.newStatus });
    return { message: '订单状态已更新', oldStatus: result.oldStatus, newStatus: result.newStatus };
  }

  async batchUpdateStatus(orderIds, newStatus, note) {
    if (!orderIds || orderIds.length === 0) {
      throw new ValidationError('订单ID列表不能为空');
    }

    try {
      const result = await this.db.transaction(async (tx) => {
        let updated = 0;
        for (const orderId of orderIds) {
          const statusResult = await this._updateStatusInTransaction(
            tx,
            orderId,
            newStatus,
            note || '批量操作'
          );
          if (statusResult.updated) updated++;
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
        if (order.status !== 'cancelled') {
          for (const item of items) {
            await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
          }
        }
        await tx.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
        await tx.run('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
        await tx.run('DELETE FROM orders WHERE id = ?', [orderId]);
        return {
          customerName: order.customer_name,
          itemsCount: items.length,
          restoredStock: order.status !== 'cancelled' && items.length > 0,
        };
      });
      this.clearCache('orders:*');
      this.clearCache('bearings:*');
      logger.info('订单删除成功', { orderId, customerName: result.customerName, itemsCount: result.itemsCount });
      return { message: '订单删除成功', restoredStock: result.restoredStock, itemsCount: result.itemsCount };
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
        const cancelledOrderIds = new Set(orders.filter((order) => order.status === 'cancelled').map((order) => order.id));
        for (const item of items) {
          if (!cancelledOrderIds.has(item.order_id)) {
            await tx.run('UPDATE bearings SET stock = stock + ? WHERE id = ?', [item.quantity, item.bearing_id]);
          }
        }
        await tx.run(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
        await tx.run(`DELETE FROM order_status_history WHERE order_id IN (${placeholders})`, orderIds);
        const deleteResult = await tx.run(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds);
        return {
          changes: deleteResult.changes,
          restoredStock: items.some((item) => !cancelledOrderIds.has(item.order_id)),
        };
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
