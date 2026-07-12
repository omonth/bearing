const PaymentProvider = require('../PaymentProvider');
const { paymentConfig } = require('../../../config/payment');

class AlipayProvider extends PaymentProvider {
  constructor(config) {
    super(config);
    this.alipayClient = null;
    this._init();
  }

  _init() {
    if (!this.config.appId) return;
    try {
      const AlipaySdk = require('alipay-sdk').default;
      this.alipayClient = new AlipaySdk({
        appId: this.config.appId,
        privateKey: this.config.privateKey,
        alipayPublicKey: this.config.publicKey,
        gateway: this.config.gateway || paymentConfig.alipay.gateway,
        signType: 'RSA2',
      });
      console.log('[支付] 支付宝 SDK 已初始化');
    } catch (e) {
      console.warn('[支付] 支付宝 SDK 初始化失败:', e.message);
    }
  }

  get enabled() {
    return !!this.alipayClient;
  }

  async createPayment({ orderNo, amount, subject }) {
    const AlipayFormData = require('alipay-sdk/lib/form').default;
    const formData = new AlipayFormData();
    formData.setMethod('get');
    formData.addField('bizContent', {
      outTradeNo: orderNo,
      totalAmount: amount.toFixed(2),
      subject: subject || `订单支付 ${orderNo}`,
      productCode: 'FACE_TO_FACE_PAYMENT',
    });

    const result = await this.alipayClient.exec('alipay.trade.precreate', {}, { formData });

    if (result.code !== '10000') {
      throw new Error(`支付宝下单失败: ${result.subMsg || result.msg}`);
    }

    return {
      qrCode: result.qrCode,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.qrCode)}`,
      tradeNo: result.tradeNo || '',
    };
  }

  async queryStatus({ paymentOrder }) {
    const result = await this.alipayClient.exec('alipay.trade.query', {
      bizContent: { outTradeNo: paymentOrder.transaction_id },
    });
    if (result.tradeStatus === 'TRADE_SUCCESS') {
      return {
        status: 'paid',
        tradeNo: result.tradeNo,
        amount: Number(result.totalAmount),
        payer: { buyerUserId: result.buyerUserId },
      };
    }
    return { status: paymentOrder.status, message: result.tradeStatus || '待支付' };
  }

  async handleCallback(params) {
    const isValid = this.alipayClient.checkNotifySign(params);
    if (!isValid) throw new Error('支付宝回调签名验证失败');

    const { out_trade_no, trade_no, buyer_id, total_amount } = params;
    return {
      transactionId: out_trade_no,
      status: 'paid',
      tradeNo: trade_no,
      amount: Number(total_amount),
      payer: { buyer_id },
    };
  }

  async createRefund({ paymentOrder, amount, reason, refundNo }) {
    const result = await this.alipayClient.exec('alipay.trade.refund', {
      bizContent: {
        out_trade_no: paymentOrder.transaction_id,
        refund_amount: amount.toFixed(2),
        refund_reason: reason || '无',
        out_request_no: refundNo,
      },
    });
    if (result.code !== '10000') {
      throw new Error(`支付宝退款失败: ${result.subMsg || result.msg}`);
    }
    return { success: true };
  }
}

module.exports = AlipayProvider;
