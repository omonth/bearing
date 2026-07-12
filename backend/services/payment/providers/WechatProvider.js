const PaymentProvider = require('../PaymentProvider');
const { paymentConfig } = require('../../../config/payment');

class WechatProvider extends PaymentProvider {
  constructor(config) {
    super(config);
    this.wechatClient = null;
    this._init();
  }

  _init() {
    if (!this.config.appId) return;
    try {
      const WxPay = require('wechatpay-node-v3');
      this.wechatClient = new WxPay({
        appid: this.config.appId,
        mchid: this.config.mchId,
        apiV3Key: this.config.apiKeyV3,
        serial_no: this.config.certSerial,
        privateKey: this.config.privateKey,
        notify_url: this.config.notifyUrl || paymentConfig.wechat.notifyUrl,
      });
      console.log('[支付] 微信支付 SDK 已初始化');
    } catch (e) {
      console.warn('[支付] 微信支付 SDK 初始化失败:', e.message);
    }
  }

  get enabled() {
    return !!this.wechatClient;
  }

  async createPayment({ orderNo, amount, subject }) {
    const result = await this.wechatClient.transactions_native({
      description: subject || `订单支付 ${orderNo}`,
      out_trade_no: orderNo,
      notify_url: this.config.notifyUrl || paymentConfig.wechat.notifyUrl,
      amount: { total: Math.round(amount * 100), currency: 'CNY' },
    });

    return {
      codeUrl: result.code_url,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.code_url)}`,
      prepayId: result.prepay_id || '',
    };
  }

  async queryStatus({ paymentOrder }) {
    const result = await this.wechatClient.query({ out_trade_no: paymentOrder.transaction_id });
    if (result.trade_state === 'SUCCESS') {
      return {
        status: 'paid',
        tradeNo: result.transaction_id,
        amount: result.amount?.total === undefined ? undefined : result.amount.total / 100,
        payer: result.payer || {},
      };
    }
    return { status: paymentOrder.status, message: result.trade_state || '待支付' };
  }

  async handleCallback(headers, body) {
    const notification = await this.wechatClient.decipher_gcm(
      body.resource.ciphertext,
      body.resource.associated_data,
      body.resource.nonce,
      this.config.apiKeyV3
    );
    const result = JSON.parse(notification);
    return {
      transactionId: result.out_trade_no,
      status: result.trade_state === 'SUCCESS' ? 'paid' : 'pending',
      tradeNo: result.transaction_id,
      amount: result.amount?.total === undefined ? undefined : result.amount.total / 100,
      payer: result.payer || {},
    };
  }

  async createRefund({ paymentOrder, amount, reason, refundNo }) {
    await this.wechatClient.refunds({
      out_trade_no: paymentOrder.transaction_id,
      out_refund_no: refundNo,
      reason: reason || '无',
      amount: { refund: Math.round(amount * 100), total: Math.round(paymentOrder.amount * 100), currency: 'CNY' },
    });
    return { success: true };
  }
}

module.exports = WechatProvider;
