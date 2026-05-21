/**
 * PaymentProvider — 支付网关接口基类
 * 每个具体网关实现 createPayment / queryStatus / handleCallback / createRefund
 */
class PaymentProvider {
  constructor(config = {}) {
    this.config = config;
  }

  get enabled() {
    return !!this.config.appId || !!this.config.merchantId;
  }

  async createPayment({ orderNo, amount, subject, paymentOrderId }) {
    throw new Error('createPayment not implemented');
  }

  async queryStatus({ paymentOrder }) {
    throw new Error('queryStatus not implemented');
  }

  async handleCallback(params) {
    throw new Error('handleCallback not implemented');
  }

  async createRefund({ paymentOrder, amount, reason, refundNo }) {
    throw new Error('createRefund not implemented');
  }
}

module.exports = PaymentProvider;
