const { randomUUID } = require('crypto');
const { paymentConfig, checkConfig } = require('../config/payment');

class PaymentService {
  constructor(db, orderService) {
    this.db = db;
    this.orderService = orderService || null;
    this.alipayClient = null;
    this.wechatClient = null;
    this.configStatus = { alipay: false, wechat: false, unionpay: false };
  }

  enable() {
    this._initClients();
  }

  _initClients() {
    this.configStatus = checkConfig();

    // 初始化支付宝 SDK
    if (this.configStatus.alipay) {
      try {
        const AlipaySdk = require('alipay-sdk').default;
        const AlipayFormData = require('alipay-sdk/lib/form').default;

        this.alipayClient = new AlipaySdk({
          appId: paymentConfig.alipay.app,
          privateKey: paymentConfig.alipay.privateKey,
          alipayPublicKey: paymentConfig.alipay.publicKey,
          gateway: paymentConfig.alipay.gateway,
          signType: 'RSA2',
        });
        this.AlipayFormData = AlipayFormData;
        console.log('[支付] 支付宝 SDK 已初始化');
      } catch (e) {
        console.warn('[支付] 支付宝 SDK 初始化失败:', e.message);
        this.configStatus.alipay = false;
      }
    } else {
      console.log('[支付] 支付宝未配置，使用沙箱模式');
    }

    // 初始化微信支付 SDK
    if (this.configStatus.wechat) {
      try {
        const WxPay = require('wechatpay-node-v3');
        this.wechatClient = new WxPay({
          appid: paymentConfig.wechat.appId,
          mchid: paymentConfig.wechat.mchId,
          apiV3Key: paymentConfig.wechat.apiKeyV3,
          serial_no: paymentConfig.wechat.certSerial,
          privateKey: paymentConfig.wechat.privateKey,
          notify_url: paymentConfig.wechat.notifyUrl,
        });
        console.log('[支付] 微信支付 SDK 已初始化');
      } catch (e) {
        console.warn('[支付] 微信支付 SDK 初始化失败:', e.message);
        this.configStatus.wechat = false;
      }
    } else {
      console.log('[支付] 微信支付未配置，使用沙箱模式');
    }

    // 银联不需要 SDK 初始化，使用 HTTPS 直接调用
    if (this.configStatus.unionpay) {
      console.log('[支付] 银联支付已配置');
    } else {
      console.log('[支付] 银联未配置，使用沙箱模式');
    }

    console.log('[支付] 当前模式:', paymentConfig.mode);
    console.log('[支付] 已启用:', Object.entries(this.configStatus).filter(([, v]) => v).map(([k]) => k).join(', ') || '无（全部沙箱）');
  }

  async _initTables() {
    try {
      await this.db.run(`CREATE TABLE IF NOT EXISTS payment_orders (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        trade_no VARCHAR(100),
        payer_info TEXT,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_po_order ON payment_orders(order_id)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_po_status ON payment_orders(status)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_po_trade_no ON payment_orders(trade_no)`);

      await this.db.run(`CREATE TABLE IF NOT EXISTS refund_records (
        id SERIAL PRIMARY KEY,
        payment_order_id INTEGER NOT NULL,
        refund_amount DECIMAL(10, 2) NOT NULL,
        refund_reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        refund_no VARCHAR(100),
        refunded_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_order_id) REFERENCES payment_orders(id)
      )`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_rr_po ON refund_records(payment_order_id)`);
    } catch (err) {
      // Tables may already exist
    }
  }

  generateOrderNo() {
    return `PAY${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  generateRefundNo() {
    return `REF${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  // ==================== 创建支付 ====================

  async createPayment({ orderId, amount, paymentMethod, subject }) {
    if (!orderId || !amount || !paymentMethod) {
      throw new Error('订单ID、金额和支付方式不能为空');
    }

    const validMethods = ['alipay', 'wechat', 'unionpay', 'cod', 'balance'];
    if (!validMethods.includes(paymentMethod)) {
      throw new Error(`不支持的支付方式: ${paymentMethod}`);
    }

    const orderNo = this.generateOrderNo();

    const result = await this.db.run(
      `INSERT INTO payment_orders (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, 'pending', ?)`,
      [orderId, paymentMethod, amount, orderNo]
    );

    const paymentOrderId = result.lastID;

    let paymentInfo = { orderNo, paymentOrderId, paymentMethod };

    try {
      switch (paymentMethod) {
        case 'alipay':
          return await this._createAlipayPayment(paymentOrderId, orderNo, amount, subject, paymentInfo);
        case 'wechat':
          return await this._createWechatPayment(paymentOrderId, orderNo, amount, subject, paymentInfo);
        case 'unionpay':
          return await this._createUnionPayPayment(paymentOrderId, orderNo, amount, subject, paymentInfo);
        case 'cod':
          paymentInfo.message = '货到付款';
          await this.db.run('UPDATE payment_orders SET status = ? WHERE id = ?', ['processing', paymentOrderId]);
          return paymentInfo;
        case 'balance':
          paymentInfo.message = '余额支付';
          return paymentInfo;
      }
    } catch (error) {
      // 支付网关调用失败，标记订单为失败状态
      await this.db.run('UPDATE payment_orders SET status = ? WHERE id = ?', ['failed', paymentOrderId]);
      throw error;
    }
  }

  // ==================== 支付宝 ====================

  async _createAlipayPayment(paymentOrderId, orderNo, amount, subject, paymentInfo) {
    if (!this.configStatus.alipay) {
      // 沙箱模式：返回模拟数据
      paymentInfo.qrCode = `alipay://pay?orderNo=${orderNo}&amount=${amount}`;
      paymentInfo.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentInfo.qrCode)}`;
      paymentInfo.sandbox = true;
      paymentInfo.message = '支付宝沙箱模式 - 配置 ALIPAY_APP_ID 和 ALIPAY_PRIVATE_KEY 后可使用真实支付';
      return paymentInfo;
    }

    // 真实调用：当面付 - 扫码支付
    const AlipayFormData = this.AlipayFormData;
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

    paymentInfo.qrCode = result.qrCode;
    paymentInfo.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.qrCode)}`;
    paymentInfo.tradeNo = result.tradeNo || '';
    return paymentInfo;
  }

  // ==================== 微信支付 ====================

  async _createWechatPayment(paymentOrderId, orderNo, amount, subject, paymentInfo) {
    if (!this.configStatus.wechat) {
      // 沙箱模式
      paymentInfo.qrCode = `weixin://wxpay/bizpayurl?orderNo=${orderNo}&amount=${amount}`;
      paymentInfo.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentInfo.qrCode)}`;
      paymentInfo.sandbox = true;
      paymentInfo.message = '微信支付沙箱模式 - 配置 WECHAT_APP_ID, WECHAT_MCH_ID, WECHAT_API_KEY_V3 后可使用真实支付';
      return paymentInfo;
    }

    // 真实调用：Native 支付（扫码）
    const result = await this.wechatClient.transactions_native({
      description: subject || `订单支付 ${orderNo}`,
      out_trade_no: orderNo,
      notify_url: paymentConfig.wechat.notifyUrl,
      amount: {
        total: Math.round(amount * 100), // 微信用分
        currency: 'CNY',
      },
    });

    paymentInfo.codeUrl = result.code_url;
    paymentInfo.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.code_url)}`;
    paymentInfo.prepayId = result.prepay_id || '';
    return paymentInfo;
  }

  // ==================== 银联支付 ====================

  async _createUnionPayPayment(paymentOrderId, orderNo, amount, subject, paymentInfo) {
    if (!this.configStatus.unionpay) {
      // 沙箱模式
      paymentInfo.payUrl = `${paymentConfig.unionpay.gateway}?orderNo=${orderNo}&amount=${amount}`;
      paymentInfo.sandbox = true;
      paymentInfo.message = '银联沙箱模式 - 配置 UNIONPAY_MERCHANT_ID 和 UNIONPAY_CERT_PATH 后可使用真实支付';
      return paymentInfo;
    }

    // 真实调用：银联网关支付
    const https = require('https');
    const fs = require('fs');
    const querystring = require('querystring');

    const params = {
      version: '5.1.0',
      encoding: 'UTF-8',
      txnType: '01',        // 消费
      txnSubType: '01',     // 商户消费
      bizType: '000201',    // 网关支付
      signMethod: '01',     // RSA
      channelType: '07',    // 网页
      accessType: '0',      // 商户接入
      merchantId: paymentConfig.unionpay.merchantId,
      orderId: orderNo,
      txnTime: this._formatUnionPayTime(new Date()),
      txnAmt: Math.round(amount * 100).toString(), // 银联用分
      currencyCode: '156',  // 人民币
      frontUrl: paymentConfig.unionpay.frontUrl,
      backUrl: paymentConfig.unionpay.notifyUrl,
      payTimeoutTime: this._formatUnionPayTime(new Date(Date.now() + 30 * 60 * 1000)),
    };

    // 签名
    const signedParams = this._signUnionPayParams(params);

    // 构造表单跳转 URL
    paymentInfo.payUrl = paymentConfig.unionpay.gateway;
    paymentInfo.formParams = signedParams;
    paymentInfo.gatewayType = 'form'; // 前端需要构造表单 POST 跳转

    return paymentInfo;
  }

  _formatUnionPayTime(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  _signUnionPayParams(params) {
    // 排序参数
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys.map(k => `${k}=${params[k]}`).join('&');

    try {
      const crypto = require('crypto');
      const certContent = fs.readFileSync(paymentConfig.unionpay.certPath, 'utf-8');
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(signStr);
      const signature = sign.sign(certContent, 'base64');

      return { ...params, signature, certId: this._getCertId(paymentConfig.unionpay.certPath) };
    } catch (e) {
      // 证书读取失败，返回未签名参数（沙箱模式）
      return params;
    }
  }

  _getCertId(certPath) {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(certPath, 'utf-8');
      // 简单提取证书序列号
      const match = content.match(/serialNumber\s*=\s*([A-Fa-f0-9]+)/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  // ==================== 查询支付状态 ====================

  async queryPaymentStatus(paymentOrderId) {
    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE id = ?',
      [paymentOrderId]
    );

    if (!paymentOrder) {
      throw new Error('支付订单不存在');
    }

    return {
      id: paymentOrder.id,
      orderId: paymentOrder.order_id,
      paymentMethod: paymentOrder.payment_method,
      amount: paymentOrder.amount,
      status: paymentOrder.status,
      transactionId: paymentOrder.transaction_id,
      tradeNo: paymentOrder.trade_no,
      paidAt: paymentOrder.paid_at,
      createdAt: paymentOrder.created_at,
    };
  }

  async queryPaymentByTransaction(transactionId) {
    return await this.db.get(
      'SELECT * FROM payment_orders WHERE transaction_id = ?',
      [transactionId]
    );
  }

  // 主动查询第三方支付状态（用于轮询补单）
  async queryExternalStatus(paymentOrderId) {
    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE id = ?',
      [paymentOrderId]
    );

    if (!paymentOrder) {
      throw new Error('支付订单不存在');
    }

    if (paymentOrder.status === 'paid') {
      return { status: 'paid', message: '已支付' };
    }

    const method = paymentOrder.payment_method;
    const orderNo = paymentOrder.transaction_id;

    try {
      if (method === 'alipay' && this.configStatus.alipay) {
        const result = await this.alipayClient.exec('alipay.trade.query', {
          bizContent: { outTradeNo: orderNo },
        });
        if (result.tradeStatus === 'TRADE_SUCCESS') {
          await this.updatePaymentStatus(paymentOrderId, 'paid', {
            trade_no: result.tradeNo,
            payer: { buyerUserId: result.buyerUserId },
          });
          return { status: 'paid', message: '支付成功' };
        }
        return { status: paymentOrder.status, message: result.tradeStatus || '待支付' };
      }

      if (method === 'wechat' && this.configStatus.wechat) {
        const result = await this.wechatClient.query({ out_trade_no: orderNo });
        if (result.trade_state === 'SUCCESS') {
          await this.updatePaymentStatus(paymentOrderId, 'paid', {
            trade_no: result.transaction_id,
            payer: { openid: result.payer?.openid },
          });
          return { status: 'paid', message: '支付成功' };
        }
        return { status: paymentOrder.status, message: result.trade_state || '待支付' };
      }

      // 银联和沙箱模式不支持主动查询
      return { status: paymentOrder.status, message: '待支付' };
    } catch (error) {
      return { status: paymentOrder.status, message: '查询失败' };
    }
  }

  // ==================== 更新支付状态 ====================

  async updatePaymentStatus(paymentOrderId, status, paymentInfo = {}) {
    if (status === 'paid') {
      await this.db.run(
        `UPDATE payment_orders
         SET status = ?, trade_no = ?, payer_info = ?, paid_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, paymentInfo.trade_no || `TRADE${Date.now()}`, JSON.stringify(paymentInfo.payer || {}), paymentOrderId]
      );

      const paymentOrder = await this.db.get(
        'SELECT order_id FROM payment_orders WHERE id = ?',
        [paymentOrderId]
      );

      if (paymentOrder) {
        if (this.orderService) {
          await this.orderService.updateStatus(paymentOrder.order_id, 'paid');
        } else {
          await this.db.run(
            "UPDATE orders SET status = 'paid' WHERE id = ?",
            [paymentOrder.order_id]
          );
        }
      }
    } else {
      await this.db.run(
        'UPDATE payment_orders SET status = ? WHERE id = ?',
        [status, paymentOrderId]
      );
    }

    return { paymentOrderId, status };
  }

  // ==================== 回调处理 ====================

  // 支付宝回调验签
  async handleAlipayCallback(params) {
    if (this.configStatus.alipay && this.alipayClient) {
      // 使用 SDK 验签
      const isValid = this.alipayClient.checkNotifySign(params);
      if (!isValid) {
        throw new Error('支付宝回调签名验证失败');
      }
    }

    const { out_trade_no, trade_status, trade_no, buyer_id } = params;

    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE transaction_id = ?',
      [out_trade_no]
    );

    if (!paymentOrder) {
      throw new Error('支付订单不存在');
    }

    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      await this.updatePaymentStatus(paymentOrder.id, 'paid', {
        trade_no,
        payer: { buyer_id },
      });
    }

    return { success: true };
  }

  // 微信支付回调验签
  async handleWechatCallback(headers, body) {
    if (this.configStatus.wechat && this.wechatClient) {
      // 使用 SDK 验签和解密
      try {
        const notification = await this.wechatClient.decipher_gcm(
          body.resource.ciphertext,
          body.resource.associated_data,
          body.resource.nonce,
          paymentConfig.wechat.apiKeyV3
        );
        const result = JSON.parse(notification);

        const paymentOrder = await this.db.get(
          'SELECT * FROM payment_orders WHERE transaction_id = ?',
          [result.out_trade_no]
        );

        if (!paymentOrder) {
          throw new Error('支付订单不存在');
        }

        if (result.trade_state === 'SUCCESS') {
          await this.updatePaymentStatus(paymentOrder.id, 'paid', {
            trade_no: result.transaction_id,
            payer: result.payer || {},
          });
        }

        return { success: true };
      } catch (error) {
        throw new Error(`微信回调处理失败: ${error.message}`);
      }
    }

    // 沙箱模式：直接信任回调
    const { out_trade_no, trade_state, transaction_id } = body;
    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE transaction_id = ?',
      [out_trade_no]
    );

    if (paymentOrder && (trade_state === 'SUCCESS' || trade_state === 'paid')) {
      await this.updatePaymentStatus(paymentOrder.id, 'paid', {
        trade_no: transaction_id,
      });
    }

    return { success: true };
  }

  // 银联回调验签
  async handleUnionPayCallback(params) {
    if (this.configStatus.unionpay) {
      const isValid = this._verifyUnionPaySign(params);
      if (!isValid) {
        throw new Error('银联回调签名验证失败');
      }
    }

    const { orderId, respCode, queryId } = params;

    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE transaction_id = ?',
      [orderId]
    );

    if (!paymentOrder) {
      throw new Error('支付订单不存在');
    }

    // 00 = 成功
    if (respCode === '00') {
      await this.updatePaymentStatus(paymentOrder.id, 'paid', {
        trade_no: queryId || '',
      });
    }

    return { success: true };
  }

  _verifyUnionPaySign(params) {
    try {
      const crypto = require('crypto');
      const fs = require('fs');
      const { signature, certId, ...rest } = params;
      const sortedKeys = Object.keys(rest).sort();
      const signStr = sortedKeys.map(k => `${k}=${rest[k]}`).join('&');

      const certContent = fs.readFileSync(paymentConfig.unionpay.verifyCertPath, 'utf-8');
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(signStr);
      return verify.verify(certContent, signature, 'base64');
    } catch {
      return false;
    }
  }

  // ==================== 模拟支付（测试用） ====================

  async simulatePayment(paymentOrderId) {
    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE id = ?',
      [paymentOrderId]
    );

    if (!paymentOrder) {
      throw new Error('支付订单不存在');
    }

    await this.updatePaymentStatus(paymentOrderId, 'paid', {
      trade_no: `SIM${Date.now()}`,
      payer: { simulated: true, timestamp: new Date().toISOString() }
    });

    return { paymentOrderId, status: 'paid', message: '支付成功（模拟）' };
  }

  // ==================== 退款 ====================

  async createRefund({ paymentOrderId, amount, reason }) {
    const paymentOrder = await this.db.get(
      'SELECT * FROM payment_orders WHERE id = ?',
      [paymentOrderId]
    );

    if (!paymentOrder) {
      throw new Error('支付订单不存在');
    }

    if (paymentOrder.status !== 'paid') {
      throw new Error('只有已支付的订单才能退款');
    }

    if (parseFloat(amount) > parseFloat(paymentOrder.amount)) {
      throw new Error('退款金额不能超过支付金额');
    }

    const refundNo = this.generateRefundNo();
    const method = paymentOrder.payment_method;
    const orderNo = paymentOrder.transaction_id;

    // 调用第三方退款 API
    let refundResult = { success: true };

    try {
      if (method === 'alipay' && this.configStatus.alipay) {
        const result = await this.alipayClient.exec('alipay.trade.refund', {
          bizContent: {
            out_trade_no: orderNo,
            refund_amount: amount.toFixed(2),
            refund_reason: reason || '无',
            out_request_no: refundNo,
          },
        });
        if (result.code !== '10000') {
          throw new Error(`支付宝退款失败: ${result.subMsg || result.msg}`);
        }
      } else if (method === 'wechat' && this.configStatus.wechat) {
        await this.wechatClient.refunds({
          out_trade_no: orderNo,
          out_refund_no: refundNo,
          reason: reason || '无',
          amount: {
            refund: Math.round(amount * 100),
            total: Math.round(paymentOrder.amount * 100),
            currency: 'CNY',
          },
        });
      } else if (method === 'unionpay' && this.configStatus.unionpay) {
        // 银联退款需要单独实现
        refundResult.message = '银联退款需联系银行处理';
      }
    } catch (error) {
      throw new Error(`退款失败: ${error.message}`);
    }

    // 记录退款
    const result = await this.db.run(
      `INSERT INTO refund_records (payment_order_id, refund_amount, refund_reason, refund_no, status)
       VALUES (?, ?, ?, ?, 'success')`,
      [paymentOrderId, amount, reason || '无', refundNo]
    );

    await this.db.run(
      `UPDATE refund_records SET refunded_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [result.lastID]
    );

    await this.db.run(
      'UPDATE payment_orders SET status = ? WHERE id = ?',
      ['refunded', paymentOrderId]
    );

    if (this.orderService) {
      await this.orderService.updateStatus(paymentOrder.order_id, 'cancelled');
    } else {
      await this.db.run(
        "UPDATE orders SET status = 'cancelled' WHERE id = ?",
        [paymentOrder.order_id]
      );
    }

    return {
      refundId: result.lastID,
      refundNo,
      amount,
      status: 'success',
      message: '退款成功',
    };
  }

  // ==================== 列表和统计 ====================

  async getPaymentList({ status, paymentMethod, page = 1, pageSize = 20 } = {}) {
    let query = 'SELECT * FROM payment_orders WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (paymentMethod) {
      query += ' AND payment_method = ?';
      params.push(paymentMethod);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);

    const countQuery = query.split('LIMIT')[0].replace('SELECT *', 'SELECT COUNT(*) as total');

    const [rows, countResult] = await Promise.all([
      this.db.all(query, params),
      this.db.get(countQuery, params.slice(0, -2))
    ]);

    return {
      total: countResult ? countResult.total : 0,
      page,
      pageSize,
      items: rows
    };
  }

  async getRefundList(paymentOrderId) {
    return await this.db.all(
      'SELECT * FROM refund_records WHERE payment_order_id = ? ORDER BY created_at DESC',
      [paymentOrderId]
    );
  }

  async getPaymentStats() {
    return await this.db.get(`
      SELECT
        COUNT(*) as totalPayments,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paidCount,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refundedCount,
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as totalRevenue
      FROM payment_orders
    `);
  }
}

module.exports = PaymentService;
