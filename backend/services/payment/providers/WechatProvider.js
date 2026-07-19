const crypto = require('crypto');
const fs = require('fs');
const PaymentProvider = require('../PaymentProvider');
const { paymentConfig } = require('../../../config/payment');
const { BusinessError } = require('../../../utils/errors');
const logger = require('../../../logger');

function normalizePem(value) {
  return typeof value === 'string' ? value.replace(/\\n/g, '\n') : value;
}

class WechatProvider extends PaymentProvider {
  constructor(config) {
    super(config);
    this.wechatClient = null;
    this.platformPublicKey = null;
    this.platformCertSerial = '';
    this._loadPlatformCertificate();
    this._init();
  }

  _loadPlatformCertificate() {
    try {
      if (this.config.platformPublicKey) {
        this.platformPublicKey = this.config.platformPublicKey instanceof crypto.KeyObject
          ? this.config.platformPublicKey
          : crypto.createPublicKey(normalizePem(this.config.platformPublicKey));
        this.platformCertSerial = this.config.platformCertSerial || '';
        return;
      }
      if (!this.config.platformCertPath) return;

      const certificate = new crypto.X509Certificate(
        fs.readFileSync(this.config.platformCertPath, 'utf8')
      );
      this.platformPublicKey = certificate.publicKey;
      this.platformCertSerial = certificate.serialNumber;
    } catch (error) {
      logger.warn('微信平台证书加载失败', { errorName: error.name });
    }
  }

  _init() {
    const { appId, certSerial, mchId, privateKey } = this.config;
    if (!appId || !certSerial || !mchId || !privateKey) return;

    try {
      const WxPay = require('wechatpay-node-v3');
      const normalizedPrivateKey = normalizePem(privateKey);
      const merchantPublicKey = this.config.merchantPublicKey
        ? normalizePem(this.config.merchantPublicKey)
        : crypto.createPublicKey(normalizedPrivateKey).export({ type: 'spki', format: 'pem' });
      this.wechatClient = new WxPay({
        appid: appId,
        mchid: mchId,
        key: this.config.apiKeyV3,
        serial_no: certSerial,
        publicKey: merchantPublicKey,
        privateKey: normalizedPrivateKey,
      });
      logger.info('微信支付 SDK 已初始化');
    } catch (error) {
      logger.warn('微信支付 SDK 初始化失败', { errorName: error.name });
    }
  }

  get enabled() {
    return !!this.wechatClient;
  }

  _sdkData(result, operation) {
    if (!result
      || !Number.isInteger(result.status)
      || result.status < 200
      || result.status >= 300
      || !result.data
      || typeof result.data !== 'object') {
      throw new BusinessError(
        `微信支付${operation}请求失败`,
        502,
        'WECHAT_PROVIDER_REQUEST_FAILED'
      );
    }
    return result.data;
  }

  async createPayment({ orderNo, amount, subject }) {
    const response = await this.wechatClient.transactions_native({
      description: subject || `订单支付 ${orderNo}`,
      out_trade_no: orderNo,
      notify_url: this.config.notifyUrl || paymentConfig.wechat.notifyUrl,
      amount: { total: Math.round(amount * 100), currency: 'CNY' },
    });
    const result = this._sdkData(response, '下单');
    if (typeof result.code_url !== 'string' || !result.code_url) {
      throw new BusinessError('微信支付下单响应无效', 502, 'WECHAT_PROVIDER_RESPONSE_INVALID');
    }

    return {
      codeUrl: result.code_url,
      qrCode: result.code_url,
      prepayId: result.prepay_id || '',
    };
  }

  async queryStatus({ paymentOrder }) {
    const response = await this.wechatClient.query({ out_trade_no: paymentOrder.transaction_id });
    const result = this._sdkData(response, '查询');
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

  _callbackHeader(headers, name) {
    const direct = headers[name];
    if (direct !== undefined) return Array.isArray(direct) ? direct[0] : direct;
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  }

  _verifyCallbackSignature({ headers, rawBody }) {
    const timestamp = this._callbackHeader(headers, 'wechatpay-timestamp');
    const nonce = this._callbackHeader(headers, 'wechatpay-nonce');
    const serial = this._callbackHeader(headers, 'wechatpay-serial');
    const signature = this._callbackHeader(headers, 'wechatpay-signature');
    if (!timestamp || !nonce || !serial || !signature || typeof rawBody !== 'string') {
      throw new BusinessError('微信支付回调头不完整', 400, 'WECHAT_CALLBACK_HEADERS_INVALID');
    }

    const timestampSeconds = Number(timestamp);
    const maxAgeSeconds = Number(this.config.callbackMaxAgeSeconds || 300);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(timestampSeconds)
      || Math.abs(nowSeconds - timestampSeconds) > maxAgeSeconds) {
      throw new BusinessError('微信支付回调时间戳无效', 401, 'WECHAT_CALLBACK_TIMESTAMP_INVALID');
    }

    const normalizedSerial = serial.replace(/:/g, '').toUpperCase();
    const expectedSerial = this.platformCertSerial.replace(/:/g, '').toUpperCase();
    if (!this.platformPublicKey || !expectedSerial || normalizedSerial !== expectedSerial) {
      throw new BusinessError('微信支付平台证书无效', 401, 'WECHAT_CALLBACK_SIGNATURE_INVALID');
    }

    const signedData = Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`, 'utf8');
    const valid = crypto.verify(
      'RSA-SHA256',
      signedData,
      this.platformPublicKey,
      Buffer.from(signature, 'base64')
    );
    if (!valid) {
      throw new BusinessError('微信支付回调签名无效', 401, 'WECHAT_CALLBACK_SIGNATURE_INVALID');
    }

    return { nonce, timestamp: timestampSeconds };
  }

  _decryptResource(resource) {
    if (!resource
      || resource.algorithm !== 'AEAD_AES_256_GCM'
      || !resource.ciphertext
      || !resource.nonce) {
      throw new BusinessError('微信支付回调加密数据无效', 400, 'WECHAT_CALLBACK_RESOURCE_INVALID');
    }

    const key = Buffer.from(this.config.apiKeyV3 || '', 'utf8');
    if (key.length !== 32) {
      throw new BusinessError('微信支付 API v3 密钥配置无效', 503, 'WECHAT_API_V3_KEY_INVALID');
    }

    try {
      const encrypted = Buffer.from(resource.ciphertext, 'base64');
      if (encrypted.length <= 16) throw new Error('ciphertext is too short');
      const authTag = encrypted.subarray(encrypted.length - 16);
      const ciphertext = encrypted.subarray(0, encrypted.length - 16);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(resource.nonce, 'utf8')
      );
      decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      return JSON.parse(plaintext);
    } catch {
      throw new BusinessError('微信支付回调解密失败', 400, 'WECHAT_CALLBACK_DECRYPTION_FAILED');
    }
  }

  async handleCallback({ headers = {}, body, rawBody }) {
    const signature = this._verifyCallbackSignature({ headers, rawBody });
    if (!body || body.event_type !== 'TRANSACTION.SUCCESS' || !body.id) {
      throw new BusinessError('微信支付回调事件无效', 400, 'WECHAT_CALLBACK_EVENT_INVALID');
    }

    const result = this._decryptResource(body.resource);
    if (result.mchid !== this.config.mchId || result.appid !== this.config.appId) {
      throw new BusinessError('微信支付回调商户信息不匹配', 400, 'WECHAT_CALLBACK_IDENTITY_MISMATCH');
    }
    if (!result.out_trade_no || !result.transaction_id || result.trade_state !== 'SUCCESS') {
      throw new BusinessError('微信支付回调交易信息无效', 400, 'WECHAT_CALLBACK_TRANSACTION_INVALID');
    }
    if (!Number.isSafeInteger(result.amount?.total)
      || result.amount.total < 0
      || result.amount.currency !== 'CNY') {
      throw new BusinessError('微信支付回调金额无效', 400, 'WECHAT_CALLBACK_AMOUNT_INVALID');
    }

    return {
      eventId: body.id,
      eventTimestamp: signature.timestamp,
      signatureNonce: signature.nonce,
      transactionId: result.out_trade_no,
      status: 'paid',
      tradeNo: result.transaction_id,
      amount: result.amount.total / 100,
      payer: result.payer || {},
    };
  }

  async createRefund({ paymentOrder, amount, reason, refundNo }) {
    const response = await this.wechatClient.refunds({
      out_trade_no: paymentOrder.transaction_id,
      out_refund_no: refundNo,
      reason: reason || '无',
      amount: {
        refund: Math.round(amount * 100),
        total: Math.round(paymentOrder.amount * 100),
        currency: 'CNY',
      },
    });
    const result = this._sdkData(response, '退款');
    const statuses = {
      SUCCESS: 'success',
      PROCESSING: 'processing',
      CLOSED: 'failed',
      ABNORMAL: 'failed',
    };
    const status = statuses[result.status];
    if (!status) {
      throw new BusinessError('微信支付退款响应状态无效', 502, 'WECHAT_PROVIDER_RESPONSE_INVALID');
    }
    return {
      status,
      providerRefundId: result.refund_id,
    };
  }

  async queryRefund({ paymentOrder, refund }) {
    const response = await this.wechatClient.find_refunds(refund.refund_no);
    const result = this._sdkData(response, '退款查询');
    if (result.out_refund_no !== refund.refund_no
      || result.out_trade_no !== paymentOrder.transaction_id) {
      throw new BusinessError(
        '微信支付退款查询标识不匹配',
        502,
        'WECHAT_REFUND_QUERY_MISMATCH'
      );
    }
    if (!Number.isSafeInteger(result.amount?.refund)
      || result.amount.refund !== Math.round(Number(refund.refund_amount) * 100)
      || result.amount.currency !== 'CNY') {
      throw new BusinessError(
        '微信支付退款查询金额不匹配',
        502,
        'WECHAT_REFUND_AMOUNT_MISMATCH'
      );
    }
    const statuses = {
      SUCCESS: 'success',
      PROCESSING: 'processing',
      CLOSED: 'failed',
      ABNORMAL: 'failed',
    };
    const status = statuses[result.status];
    if (!status) {
      throw new BusinessError('微信支付退款查询状态无效', 502, 'WECHAT_PROVIDER_RESPONSE_INVALID');
    }
    return { status, providerRefundId: result.refund_id };
  }
}

module.exports = WechatProvider;
