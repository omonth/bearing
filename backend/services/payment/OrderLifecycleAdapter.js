class OrderLifecycleAdapter {
  constructor(orderService) {
    if (!orderService) {
      throw new Error('OrderLifecycleAdapter requires an orderService instance');
    }
    this.orderService = orderService;
  }

  async markPaid(orderId, transaction) {
    if (transaction) {
      return this.orderService.updateOrderStatusInTransaction({
        transaction,
        orderId,
        status: 'paid',
        note: '支付成功',
      });
    }
    return this.orderService.updateOrderStatus(orderId, 'paid', '支付成功');
  }

  async markCancelled(orderId, transaction) {
    if (transaction) {
      return this.orderService.updateOrderStatusInTransaction({
        transaction,
        orderId,
        status: 'cancelled',
        note: '退款取消',
        source: 'refund_settlement',
      });
    }
    return this.orderService.updateOrderStatus(orderId, 'cancelled', '退款取消');
  }

  async markRefunded(orderId, transaction) {
    if (transaction) {
      return this.orderService.settleRefundInTransaction({
        transaction,
        orderId,
        note: '退款结算完成',
      });
    }
    return this.orderService.settleRefund(orderId, '退款结算完成');
  }

  async markCodCompleted(orderId, transaction) {
    if (!transaction) {
      throw new Error('COD collection settlement requires a database transaction');
    }
    return this.orderService.updateOrderStatusInTransaction({
      transaction,
      orderId,
      status: 'completed',
      note: '货到付款已确认收款并完成履约',
      source: 'cod_collection',
    });
  }

  finalize(orderId, result) {
    if (this.orderService.finalizeOrderStatusUpdate) {
      this.orderService.finalizeOrderStatusUpdate({ orderId, result });
    }
  }
}

module.exports = OrderLifecycleAdapter;
