class OrderLifecycleAdapter {
  constructor(orderService) {
    if (!orderService) {
      throw new Error('OrderLifecycleAdapter requires an orderService instance');
    }
    this.orderService = orderService;
  }

  async markPaid(orderId) {
    return this.orderService.updateOrderStatus(orderId, 'paid', '支付成功');
  }

  async markCancelled(orderId) {
    return this.orderService.updateOrderStatus(orderId, 'cancelled', '退款取消');
  }
}

module.exports = OrderLifecycleAdapter;
