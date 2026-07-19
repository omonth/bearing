const PaymentProvider = require('../PaymentProvider');
const { paymentConfig } = require('../../../config/payment');
const logger = require('../../../logger');
const { BusinessError } = require('../../../utils/errors');

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
      logger.info('支付宝 SDK 已初始化');
    } catch (e) {
      logger.warn('支付宝 SDK 初始化失败', { errorName: e.name });
    }
  }

  get enabled() {
    return !!this.alipayClient;
  }

  async createPayment({ orderNo, amount, subject }) {
    const notifyUrl = this.config.notifyUrl;
    if (!notifyUrl) {
      throw new BusinessError(
        '支付宝异步通知地址未配置',
        503,
        'ALIPAY_NOTIFY_URL_REQUIRED'
      );
    }
    const result = await this.alipayClient.exec('alipay.trade.precreate', {
      notify_url: notifyUrl,
      bizContent: {
        out_trade_no: orderNo,
        total_amount: amount.toFixed(2),
        subject: subject || `订单支付 ${orderNo}`,
        product_code: 'FACE_TO_FACE_PAYMENT',
      },
    });

    if (result.code !== '10000') {
      throw new Error(`支付宝下单失败: ${result.subMsg || result.msg}`);
    }

    return {
      qrCode: result.qrCode,
      tradeNo: result.tradeNo || '',
    };
  }

  async queryStatus({ paymentOrder }) {
    const result = await this.alipayClient.exec('alipay.trade.query', {
      bizContent: { outTradeNo: paymentOrder.transaction_id },
    });
    if (['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(result.tradeStatus)) {
      return {
        status: 'paid',
        tradeNo: result.tradeNo,
        amount: Number(result.totalAmount),
        payer: { buyerUserId: result.buyerUserId },
      };
    }
    return { status: paymentOrder.status, message: result.tradeStatus || '待支付' };
  }

  async handleCallback({ body: params }) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new BusinessError('支付宝回调格式无效', 400, 'ALIPAY_CALLBACK_INVALID');
    }
    const isValid = this.alipayClient.checkNotifySign(params);
    if (!isValid) {
      throw new BusinessError(
        '支付宝回调签名验证失败',
        401,
        'ALIPAY_CALLBACK_SIGNATURE_INVALID'
      );
    }

    const { app_id, notify_id, out_trade_no, trade_no, trade_status, buyer_id, total_amount } = params;
    if (!app_id || app_id !== this.config.appId) {
      throw new BusinessError(
        '支付宝回调应用 ID 不匹配',
        400,
        'ALIPAY_CALLBACK_IDENTITY_MISMATCH'
      );
    }
    if (typeof out_trade_no !== 'string' || !out_trade_no
      || typeof trade_status !== 'string' || !trade_status) {
      throw new BusinessError(
        '支付宝回调交易信息无效',
        400,
        'ALIPAY_CALLBACK_TRANSACTION_INVALID'
      );
    }

    const statuses = {
      TRADE_SUCCESS: 'paid',
      TRADE_FINISHED: 'paid',
      TRADE_CLOSED: 'failed',
      WAIT_BUYER_PAY: 'pending',
    };
    const status = statuses[trade_status];
    if (!status) {
      throw new BusinessError(
        '支付宝回调交易状态无效',
        400,
        'ALIPAY_CALLBACK_STATUS_INVALID'
      );
    }
    const amount = Number(total_amount);
    if (status === 'paid'
      && (typeof trade_no !== 'string' || !trade_no
        || !Number.isFinite(amount) || amount < 0)) {
      throw new BusinessError(
        '支付宝回调金额或交易号无效',
        400,
        'ALIPAY_CALLBACK_TRANSACTION_INVALID'
      );
    }
    return {
      eventId: notify_id || `${out_trade_no}:${trade_no}:${trade_status}`,
      transactionId: out_trade_no,
      status,
      tradeNo: trade_no,
      amount: status === 'paid' ? amount : undefined,
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
    return {
      status: result.fundChange === 'Y' ? 'success' : 'processing',
      providerRefundId: result.tradeNo,
    };
  }

  async queryRefund({ paymentOrder, refund }) {
    const result = await this.alipayClient.exec('alipay.trade.fastpay.refund.query', {
      bizContent: {
        out_trade_no: paymentOrder.transaction_id,
        out_request_no: refund.refund_no,
      },
    });
    if (result.code !== '10000') {
      throw new BusinessError(
        '支付宝退款查询失败',
        502,
        'ALIPAY_REFUND_QUERY_FAILED'
      );
    }

    const outTradeNo = result.outTradeNo || result.out_trade_no;
    const outRequestNo = result.outRequestNo || result.out_request_no;
    if ((outTradeNo && outTradeNo !== paymentOrder.transaction_id)
      || (outRequestNo && outRequestNo !== refund.refund_no)) {
      throw new BusinessError(
        '支付宝退款查询标识不匹配',
        502,
        'ALIPAY_REFUND_QUERY_MISMATCH'
      );
    }
    const amountValue = result.refundAmount ?? result.refund_amount;
    if (amountValue !== undefined
      && Math.round(Number(amountValue) * 100) !== Math.round(Number(refund.refund_amount) * 100)) {
      throw new BusinessError(
        '支付宝退款查询金额不匹配',
        502,
        'ALIPAY_REFUND_AMOUNT_MISMATCH'
      );
    }

    const refundStatus = result.refundStatus || result.refund_status;
    const status = refundStatus === 'REFUND_SUCCESS' || result.fundChange === 'Y'
      ? 'success'
      : 'processing';
    return {
      status,
      providerRefundId: result.tradeNo || result.trade_no || refund.provider_refund_id,
    };
  }
}

module.exports = AlipayProvider;
