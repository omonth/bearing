const logger = require('../../logger');

class PaymentSettlement {
  constructor(db, orderLifecycle) {
    this.db = db;
    this.orderLifecycle = orderLifecycle;
  }

  async getPaymentOrder(id) {
    return this.db.get('SELECT * FROM payment_orders WHERE id = ?', [id]);
  }

  async settlePaid(paymentOrderId, { tradeNo, payer } = {}) {
    const po = await this.getPaymentOrder(paymentOrderId);
    if (!po) {
      return { success: false, error: '支付订单不存在' };
    }

    if (po.status === 'paid') {
      logger.info('支付已结算（幂等）', { paymentOrderId, status: po.status });
      return { success: true, paymentOrderId, status: 'paid', idempotent: true };
    }

    if (po.status === 'refunded') {
      logger.warn('拒绝已退款支付的回放', { paymentOrderId, status: po.status });
      return { success: false, error: '支付已退款，不能重复结算', status: 'refunded' };
    }

    if (po.status !== 'pending' && po.status !== 'processing') {
      logger.warn('非法支付状态转换', { paymentOrderId, currentStatus: po.status });
      return { success: false, error: `当前状态 ${po.status} 不允许结算为已支付` };
    }

    const resolvedTradeNo = tradeNo || `TRADE${Date.now()}`;
    const payerInfo = JSON.stringify(payer || {});

    const result = await this.db.run(
      'UPDATE payment_orders SET status = ?, trade_no = ?, payer_info = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN (?, ?)',
      ['paid', resolvedTradeNo, payerInfo, paymentOrderId, 'pending', 'processing']
    );

    if (!result || result.changes === 0) {
      logger.warn('支付结算并发冲突', { paymentOrderId });
      const current = await this.getPaymentOrder(paymentOrderId);
      return { success: true, paymentOrderId, status: current?.status || 'paid', idempotent: true };
    }

    try {
      await this.orderLifecycle.markPaid(po.order_id);
    } catch (err) {
      logger.error('订单状态同步失败（支付已结算）', { paymentOrderId, orderId: po.order_id, error: err.message });
      return { success: true, paymentOrderId, status: 'paid', idempotent: false, orderSyncFailed: true, error: err.message };
    }

    logger.info('支付结算成功', { paymentOrderId, orderId: po.order_id, tradeNo: resolvedTradeNo });
    return { success: true, paymentOrderId, status: 'paid', idempotent: false };
  }

  async settleRefund(paymentOrderId, { amount, reason, refundNo } = {}) {
    const po = await this.getPaymentOrder(paymentOrderId);
    if (!po) {
      return { success: false, error: '支付订单不存在' };
    }
    if (po.status !== 'paid') {
      return { success: false, error: '只有已支付的订单才能退款' };
    }
    if (!amount || isNaN(parseFloat(amount))) {
      return { success: false, error: '退款金额无效' };
    }
    if (parseFloat(amount) > parseFloat(po.amount)) {
      return { success: false, error: '退款金额不能超过支付金额' };
    }

    try {
      const result = await this.db.transaction(async (tx) => {
        const insertResult = await tx.run(
          'INSERT INTO refund_records (payment_order_id, refund_amount, refund_reason, refund_no, status, refunded_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [paymentOrderId, amount, reason || '无', refundNo, 'success']
        );
        await tx.run(
          'UPDATE payment_orders SET status = ? WHERE id = ? AND status = ?',
          ['refunded', paymentOrderId, 'paid']
        );
        return insertResult;
      });

      try {
        await this.orderLifecycle.markCancelled(po.order_id);
      } catch (err) {
        logger.error('退款后订单状态同步失败', { paymentOrderId, orderId: po.order_id, error: err.message });
      }

      logger.info('退款结算成功', { paymentOrderId, orderId: po.order_id, refundNo, amount });
      return {
        success: true,
        refundId: result.lastID,
        refundNo,
        amount,
        status: 'success',
        message: '退款成功',
      };
    } catch (err) {
      logger.error('退款结算失败', { paymentOrderId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  async settleFailed(paymentOrderId) {
    try {
      await this.db.run(
        'UPDATE payment_orders SET status = ? WHERE id = ?',
        ['failed', paymentOrderId]
      );
      logger.info('支付创建失败已记录', { paymentOrderId });
      return { success: true, paymentOrderId, status: 'failed' };
    } catch (err) {
      logger.error('记录支付失败状态出错', { paymentOrderId, error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = PaymentSettlement;
