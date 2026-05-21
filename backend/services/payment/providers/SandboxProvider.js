const PaymentProvider = require('../PaymentProvider');

class SandboxProvider extends PaymentProvider {
  constructor(method) {
    super({});
    this.method = method;
  }

  get enabled() { return true; }

  async createPayment({ orderNo, amount }) {
    if (this.method === 'alipay') {
      const qrCode = `alipay://pay?orderNo=${orderNo}&amount=${amount}`;
      return {
        qrCode,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`,
        sandbox: true,
        message: '支付宝沙箱模式',
      };
    }
    if (this.method === 'wechat') {
      const qrCode = `weixin://wxpay/bizpayurl?orderNo=${orderNo}&amount=${amount}`;
      return {
        qrCode,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`,
        sandbox: true,
        message: '微信支付沙箱模式',
      };
    }
    // unionpay sandbox
    return {
      payUrl: `https://sandbox.unionpay.com?orderNo=${orderNo}&amount=${amount}`,
      sandbox: true,
      message: '银联沙箱模式',
    };
  }

  async queryStatus() {
    return { status: 'pending', message: '待支付' };
  }

  async handleCallback(params) {
    const { out_trade_no, orderId, transaction_id, trade_no } = params;
    return { transactionId: out_trade_no || orderId, status: 'paid', tradeNo: trade_no || transaction_id };
  }

  async createRefund() {
    return { success: true, message: '沙箱退款成功' };
  }
}

module.exports = SandboxProvider;
