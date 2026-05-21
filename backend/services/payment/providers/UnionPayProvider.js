const PaymentProvider = require('../PaymentProvider');
const { paymentConfig } = require('../../../config/payment');

class UnionPayProvider extends PaymentProvider {
  constructor(config) {
    super(config);
  }

  get enabled() {
    return !!this.config.merchantId;
  }

  _formatTime(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  _sign(params) {
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
    try {
      const crypto = require('crypto');
      const fs = require('fs');
      const certContent = fs.readFileSync(this.config.certPath, 'utf-8');
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(signStr);
      const signature = sign.sign(certContent, 'base64');
      return { ...params, signature, certId: this._getCertId() };
    } catch {
      return params;
    }
  }

  _getCertId() {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(this.config.certPath, 'utf-8');
      const match = content.match(/serialNumber\s*=\s*([A-Fa-f0-9]+)/);
      return match ? match[1] : '';
    } catch { return ''; }
  }

  _verifySign(params) {
    try {
      const crypto = require('crypto');
      const fs = require('fs');
      const { signature, certId, ...rest } = params;
      const sortedKeys = Object.keys(rest).sort();
      const signStr = sortedKeys.map(k => `${k}=${rest[k]}`).join('&');
      const certContent = fs.readFileSync(this.config.verifyCertPath || this.config.certPath, 'utf-8');
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signStr);
      return verify.verify(certContent, signature, 'base64');
    } catch { return false; }
  }

  async createPayment({ orderNo, amount }) {
    const params = {
      version: '5.1.0', encoding: 'UTF-8',
      txnType: '01', txnSubType: '01', bizType: '000201',
      signMethod: '01', channelType: '07', accessType: '0',
      merchantId: this.config.merchantId,
      orderId: orderNo,
      txnTime: this._formatTime(new Date()),
      txnAmt: Math.round(amount * 100).toString(),
      currencyCode: '156',
      frontUrl: this.config.frontUrl,
      backUrl: this.config.notifyUrl,
      payTimeoutTime: this._formatTime(new Date(Date.now() + 30 * 60 * 1000)),
    };

    return {
      payUrl: this.config.gateway || paymentConfig.unionpay.gateway,
      formParams: this._sign(params),
      gatewayType: 'form',
    };
  }

  async handleCallback(params) {
    if (!this._verifySign(params)) throw new Error('银联回调签名验证失败');
    const { orderId, respCode, queryId } = params;
    if (respCode === '00') {
      return { transactionId: orderId, status: 'paid', tradeNo: queryId || '' };
    }
    return { transactionId: orderId, status: 'failed' };
  }

  async createRefund() {
    return { success: true, message: '银联退款需联系银行处理' };
  }
}

module.exports = UnionPayProvider;
