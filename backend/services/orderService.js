const logger = require('../logger');
const { AppError, NotFoundError, BusinessError, ValidationError } = require('../utils/errors');
const { businessAudit } = require('./observability/audit');

class OrderService {
  constructor(db, clearCacheFn, audit = businessAudit) {
    this.db = db;
    this.clearCache = clearCacheFn || (() => {});
    this.audit = audit;
  }

  async create({ customerName, customerPhone, province, city, district, addressDetail, items, customerId }) {
    let result;
    try {
      result = await this.db.transaction(async (tx) => {
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
            void this.audit.inventoryAnomaly('insufficient', {
              bearingId,
              requestedQuantity: quantity,
            });
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
    } catch (error) {
      this.audit.orderFailed({ reasonCode: error.code || error.name || 'ORDER_CREATE_FAILED' });
      throw error;
    }
    this.clearCache('bearings:*');
    logger.info('订单创建成功', { orderId: result.orderId, customerName: result.customerName, totalPrice: result.totalPrice });
    this.audit.orderCreated({
      orderId: result.orderId,
      amount: result.totalPrice,
      itemCount: items.length,
    });
    return { orderId: result.orderId, message: '订单创建成功' };
  }

  async list() {
    const rows = await this.db.all(
      `SELECT o.*, po.id AS payment_order_id, po.payment_method, po.status AS payment_status
       FROM orders o
       LEFT JOIN payment_orders po ON po.id = (
         SELECT latest.id
         FROM payment_orders latest
         WHERE latest.order_id = o.id
         ORDER BY latest.id DESC
         LIMIT 1
       )
       ORDER BY o.created_at DESC`,
      []
    );
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

  async _updateStatusInTransaction(tx, orderId, newStatus, note, trackingNumber, source) {
    const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
    const order = await tx.get(
      `SELECT status FROM orders WHERE id = ?${lockClause}`,
      [orderId]
    );
    if (!order) throw new NotFoundError('订单');
    const oldStatus = order.status;
    let normalizedTrackingNumber = trackingNumber;

    if (newStatus === 'paid' && source !== 'payment_settlement') {
      throw new BusinessError(
        '订单只能由支付结算事务更新为已支付',
        409,
        'PAYMENT_SETTLEMENT_REQUIRED'
      );
    }

    if (newStatus === 'refunded' && source !== 'refund_settlement') {
      throw new BusinessError(
        '退款订单状态只能由退款结算事务更新',
        409,
        'REFUND_SETTLEMENT_REQUIRED'
      );
    }

    if (newStatus === 'shipped') {
      normalizedTrackingNumber = typeof trackingNumber === 'string'
        ? trackingNumber.trim()
        : '';
      if (!/^[A-Za-z0-9._-]{4,64}$/.test(normalizedTrackingNumber)) {
        throw new ValidationError(
          '发货必须提供 4-64 位有效物流单号',
          'trackingNumber'
        );
      }
    }

    if (oldStatus === newStatus) {
      return { oldStatus, newStatus, restoredStock: false, updated: false };
    }

    if (oldStatus === 'pending' && newStatus === 'shipped') {
      const payment = await tx.get(
        `SELECT id, payment_method, status
         FROM payment_orders
         WHERE order_id = ?
         ORDER BY id DESC
         LIMIT 1${lockClause}`,
        [orderId]
      );
      if (payment?.payment_method !== 'cod' || payment.status !== 'processing') {
        throw new BusinessError(
          '待支付订单仅允许在货到付款支付单处理中时发货',
          409,
          'COD_PAYMENT_REQUIRED'
        );
      }
    }

    if (oldStatus === 'shipped' && newStatus === 'completed' && source !== 'cod_collection') {
      const payment = await tx.get(
        `SELECT id, payment_method, status
         FROM payment_orders
         WHERE order_id = ?
         ORDER BY id DESC
         LIMIT 1${lockClause}`,
        [orderId]
      );
      if (payment?.payment_method === 'cod' && payment.status === 'processing') {
        throw new BusinessError(
          '货到付款订单必须通过确认收款接口原子完成支付与履约',
          409,
          'COD_COLLECTION_CONFIRMATION_REQUIRED'
        );
      }
    }
    if (oldStatus === 'paid' && newStatus === 'cancelled' && source !== 'refund_settlement') {
      throw new BusinessError(
        '已支付订单必须通过退款流程取消',
        409,
        'REFUND_REQUIRED'
      );
    }

    const transitions = {
      pending: new Set(['paid', 'shipped', 'cancelled']),
      paid: new Set(['shipped', 'completed', 'cancelled']),
      shipped: new Set(['completed', 'refunded']),
      completed: new Set(['refunded']),
      cancelled: new Set(),
      refunded: new Set(),
    };
    if (!transitions[oldStatus]?.has(newStatus)) {
      throw new BusinessError(`订单状态不能从 ${oldStatus} 变更为 ${newStatus}`, 409, 'INVALID_STATUS_TRANSITION');
    }

    let updateQuery = 'UPDATE orders SET status = ?';
    const params = [newStatus];
    if (newStatus === 'shipped') {
      updateQuery += ', shipped_at = CURRENT_TIMESTAMP';
      updateQuery += ', tracking_number = ?';
      params.push(normalizedTrackingNumber);
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
        const restoreResult = await tx.run(
          'UPDATE bearings SET stock = stock + ? WHERE id = ?',
          [item.quantity, item.bearing_id]
        );
        if (!restoreResult || restoreResult.changes !== 1) {
          void this.audit.inventoryAnomaly('restore_failed', {
            bearingId: item.bearing_id,
            orderId,
          });
          throw new BusinessError('库存恢复失败', 500, 'INVENTORY_RESTORE_FAILED');
        }
      }
      restoredStock = items.length > 0;
    }

    await tx.run(
      'INSERT INTO order_status_history (order_id, old_status, new_status, note) VALUES (?, ?, ?, ?)',
      [orderId, oldStatus, newStatus, note || null]
    );
    return { oldStatus, newStatus, restoredStock, updated: true };
  }

  async _cancelForAdminInTransaction(tx, orderId, note) {
    const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
    const order = await tx.get(
      `SELECT id, status FROM orders WHERE id = ?${lockClause}`,
      [orderId]
    );
    if (!order) throw new NotFoundError('订单');

    if (!['pending', 'cancelled'].includes(order.status)) {
      return this._updateStatusInTransaction(
        tx,
        order.id,
        'cancelled',
        note,
        undefined,
        'admin'
      );
    }

    const paymentOrders = await tx.all(
      `SELECT id, payment_method, status FROM payment_orders
       WHERE order_id = ? ORDER BY id DESC${lockClause}`,
      [order.id]
    );
    if (paymentOrders.some((payment) => ['paid', 'refunded', 'success'].includes(payment.status))) {
      throw new BusinessError(
        '订单支付已结算，必须通过退款流程处理',
        409,
        'PAYMENT_ALREADY_SETTLED'
      );
    }

    const activePayments = paymentOrders.filter((payment) =>
      ['pending', 'processing'].includes(payment.status)
    );
    const requiresProviderClose = activePayments.some((payment) =>
      !['cod', 'balance'].includes(payment.payment_method)
    );
    if (requiresProviderClose) {
      throw new BusinessError(
        '外部支付单尚未确认关单，暂时不能取消订单',
        409,
        'PAYMENT_CLOSE_REQUIRED'
      );
    }

    for (const payment of activePayments) {
      const paymentResult = await tx.run(
        'UPDATE payment_orders SET status = ? WHERE id = ? AND status = ?',
        ['cancelled', payment.id, payment.status]
      );
      if (!paymentResult || paymentResult.changes !== 1) {
        throw new BusinessError(
          '支付状态已被并发更新',
          409,
          'PAYMENT_STATUS_CONFLICT'
        );
      }
    }

    return this._updateStatusInTransaction(
      tx,
      order.id,
      'cancelled',
      note,
      undefined,
      'admin'
    );
  }

  async updateStatus(orderId, newStatus, note, trackingNumber) {
    const result = await this.db.transaction((tx) => (
      newStatus === 'cancelled'
        ? this._cancelForAdminInTransaction(tx, orderId, note)
        : this._updateStatusInTransaction(
          tx,
          orderId,
          newStatus,
          note,
          trackingNumber,
          'admin'
        )
    ));
    this.finalizeOrderStatusUpdate({ orderId, result });
    return {
      message: '订单状态已更新',
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      idempotent: !result.updated,
    };
  }

  async updateOrderStatusInTransaction({
    transaction,
    orderId,
    status,
    note,
    trackingNumber,
    source,
  }) {
    // This transaction-only boundary is consumed by PaymentSettlement. Public
    // administrator routes use updateStatus(), which always carries the admin
    // source and can never authorize a paid transition.
    const lifecycleSource = status === 'paid' ? 'payment_settlement' : source;
    return this._updateStatusInTransaction(
      transaction,
      orderId,
      status,
      note,
      trackingNumber,
      lifecycleSource
    );
  }

  async settleRefundInTransaction({ transaction, orderId, note = '退款结算完成' }) {
    const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
    const order = await transaction.get(
      `SELECT status FROM orders WHERE id = ?${lockClause}`,
      [orderId]
    );
    if (!order) throw new NotFoundError('订单');

    if (['cancelled', 'refunded'].includes(order.status)) {
      return {
        oldStatus: order.status,
        newStatus: order.status,
        restoredStock: false,
        updated: false,
      };
    }

    const targetStatus = order.status === 'paid'
      ? 'cancelled'
      : ['shipped', 'completed'].includes(order.status) ? 'refunded' : null;
    if (!targetStatus) {
      throw new BusinessError(
        `订单状态 ${order.status} 不允许完成退款结算`,
        409,
        'INVALID_REFUND_ORDER_STATUS'
      );
    }

    return this._updateStatusInTransaction(
      transaction,
      orderId,
      targetStatus,
      note,
      undefined,
      'refund_settlement'
    );
  }

  async settleRefund(orderId, note) {
    const result = await this.db.transaction((transaction) => (
      this.settleRefundInTransaction({ transaction, orderId, note })
    ));
    this.finalizeOrderStatusUpdate({ orderId, result });
    return result;
  }

  finalizeOrderStatusUpdate({ orderId, result }) {
    this.clearCache('orders:*');
    if (result.restoredStock) this.clearCache('bearings:*');
    logger.info('订单状态已更新', { orderId, oldStatus: result.oldStatus, newStatus: result.newStatus });
  }

  async batchUpdateStatus(orderIds, newStatus, note) {
    if (!orderIds || orderIds.length === 0) {
      throw new ValidationError('订单ID列表不能为空');
    }
    if (newStatus === 'paid') {
      throw new BusinessError(
        '订单只能由支付结算事务更新为已支付',
        409,
        'PAYMENT_SETTLEMENT_REQUIRED'
      );
    }

    try {
      const result = await this.db.transaction(async (tx) => {
        let updated = 0;
        for (const orderId of orderIds) {
          const statusResult = newStatus === 'cancelled'
            ? await this._cancelForAdminInTransaction(tx, orderId, note || '批量操作')
            : await this._updateStatusInTransaction(
              tx,
              orderId,
              newStatus,
              note || '批量操作',
              undefined,
              'admin'
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

  async delete(_orderId) {
    throw new BusinessError(
      '生产订单不允许硬删除，请使用取消或归档流程',
      409,
      'ORDER_HARD_DELETE_DISABLED'
    );
  }

  async batchDelete(_orderIds) {
    throw new BusinessError(
      '生产订单不允许硬删除，请使用取消或归档流程',
      409,
      'ORDER_HARD_DELETE_DISABLED'
    );
  }

  async getStatusHistory(orderId) {
    const rows = await this.db.all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC', [orderId]);
    return rows;
  }

  async _getCustomerPhone(customerId, executor = this.db) {
    const customer = await executor.get('SELECT phone FROM customers WHERE id = ?', [customerId]);
    return customer?.phone || null;
  }

  async cancelForCustomer(customerId, orderId) {
    const result = await this.db.transaction(async (tx) => {
      const phone = await this._getCustomerPhone(customerId, tx);
      if (!phone) throw new NotFoundError('顾客');

      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const order = await tx.get(
        `SELECT id, status FROM orders WHERE id = ? AND customer_phone = ?${lockClause}`,
        [orderId, phone]
      );
      if (!order) throw new NotFoundError('订单');
      if (order.status === 'cancelled') {
        return {
          response: { orderId: Number(order.id), status: 'cancelled', idempotent: true },
          lifecycleResult: null,
        };
      }
      if (order.status !== 'pending') {
        throw new BusinessError('只有未支付订单可以由顾客取消', 409, 'ORDER_NOT_CANCELLABLE');
      }

      const paymentOrders = await tx.all(
        `SELECT payment_method, status FROM payment_orders
         WHERE order_id = ? ORDER BY id DESC${lockClause}`,
        [order.id]
      );
      if (paymentOrders.some((payment) => ['paid', 'refunded', 'success'].includes(payment.status))) {
        throw new BusinessError('订单已支付，必须通过退款流程处理', 409, 'PAYMENT_ALREADY_SETTLED');
      }
      if (paymentOrders.some((payment) => payment.status === 'processing')) {
        throw new BusinessError('支付正在处理中，暂时不能取消订单', 409, 'PAYMENT_IN_PROGRESS');
      }
      const externalPending = paymentOrders.some((payment) =>
        payment.status === 'pending'
        && ['alipay', 'wechat', 'unionpay'].includes(payment.payment_method)
      );
      if (externalPending) {
        throw new BusinessError(
          '外部支付单尚未关单，暂时不能取消订单',
          409,
          'PAYMENT_CLOSE_REQUIRED'
        );
      }

      await tx.run(
        `UPDATE payment_orders SET status = ?
         WHERE order_id = ? AND status = ? AND payment_method IN (?, ?)`,
        ['cancelled', order.id, 'pending', 'cod', 'balance']
      );

      const lifecycleResult = await this._updateStatusInTransaction(
        tx,
        order.id,
        'cancelled',
        '顾客主动取消未支付订单'
      );
      return {
        response: { orderId: Number(order.id), status: 'cancelled', idempotent: false },
        lifecycleResult,
      };
    });

    if (result.lifecycleResult) {
      this.finalizeOrderStatusUpdate({ orderId, result: result.lifecycleResult });
    }
    return result.response;
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
