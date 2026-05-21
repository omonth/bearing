/**
 * 支付配置 - 支付宝 / 微信支付 / 银联
 * 所有密钥从环境变量读取，不硬编码
 */

const path = require('path');

const paymentConfig = {
  // 支付模式: sandbox | production
  mode: process.env.PAYMENT_MODE || 'sandbox',

  // ==================== 支付宝 ====================
  alipay: {
    appId: process.env.ALIPAY_APP_ID || '',
    // 应用私钥（RSA2 2048位，去掉头尾换行）
    privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
    // 支付宝公钥（用于验证回调签名）
    publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
    // 异步通知地址（公网可访问）
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || 'http://localhost:3001/api/payment/alipay/notify',
    // 网关地址
    gateway: process.env.ALIPAY_MODE === 'production'
      ? 'https://openapi.alipay.com/gateway.do'
      : 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
    // 沙箱环境应用公钥证书路径（可选，证书模式用）
    appCertPath: process.env.ALIPAY_APP_CERT_PATH || '',
    alipayCertPath: process.env.ALIPAY_ALIPAY_CERT_PATH || '',
    alipayRootCertPath: process.env.ALIPAY_ROOT_CERT_PATH || '',
  },

  // ==================== 微信支付 ====================
  wechat: {
    appId: process.env.WECHAT_APP_ID || '',
    mchId: process.env.WECHAT_MCH_ID || '',
    // APIv3 密钥
    apiKeyV3: process.env.WECHAT_API_KEY_V3 || '',
    // 商户证书序列号
    certSerial: process.env.WECHAT_CERT_SERIAL || '',
    // 商户API私钥（apiclient_key.pem 内容）
    privateKey: process.env.WECHAT_PRIVATE_KEY || '',
    // 异步通知地址
    notifyUrl: process.env.WECHAT_NOTIFY_URL || 'http://localhost:3001/api/payment/wechat/notify',
    // 微信平台证书（用于验证回调签名，可选，SDK 会自动下载）
    platformCertPath: process.env.WECHAT_PLATFORM_CERT_PATH || '',
  },

  // ==================== 银联 ====================
  unionpay: {
    merchantId: process.env.UNIONPAY_MERCHANT_ID || '',
    // 签名证书路径（商户签名私钥）
    certPath: process.env.UNIONPAY_CERT_PATH || '',
    // 签名证书密码
    certPwd: process.env.UNIONPAY_CERT_PWD || '',
    // 验证签名证书路径（银联公钥）
    verifyCertPath: process.env.UNIONPAY_VERIFY_CERT_PATH || '',
    // 加密证书路径
    encryptCertPath: process.env.UNIONPAY_ENCRYPT_CERT_PATH || '',
    // 异步通知地址
    notifyUrl: process.env.UNIONPAY_NOTIFY_URL || 'http://localhost:3001/api/payment/unionpay/notify',
    // 网关地址
    gateway: process.env.UNIONPAY_MODE === 'production'
      ? 'https://gateway.95516.com/gateway/api'
      : 'https://gateway.test.95516.com/gateway/api',
    // 前台跳转地址
    frontUrl: process.env.UNIONPAY_FRONT_URL || 'http://localhost:3000',
  },
};

// 检查配置是否完整
function checkConfig() {
  const results = { alipay: false, wechat: false, unionpay: false };

  if (paymentConfig.alipay.appId && paymentConfig.alipay.privateKey) {
    results.alipay = true;
  }
  if (paymentConfig.wechat.appId && paymentConfig.wechat.mchId && paymentConfig.wechat.apiKeyV3) {
    results.wechat = true;
  }
  if (paymentConfig.unionpay.merchantId && paymentConfig.unionpay.certPath) {
    results.unionpay = true;
  }

  return results;
}

module.exports = { paymentConfig, checkConfig };
