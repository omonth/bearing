const { paymentConfig, checkConfig } = require('../../config/payment');
const AlipayProvider = require('./providers/AlipayProvider');
const WechatProvider = require('./providers/WechatProvider');
const UnionPayProvider = require('./providers/UnionPayProvider');
const SandboxProvider = require('./providers/SandboxProvider');

class PaymentOrchestrator {
  constructor(db, orderService) {
    this.db = db;
    this.orderService = orderService || null;
    this.providers = {};
  }

  enable() {
    const configStatus = checkConfig();

    this.providers.alipay = configStatus.alipay
      ? new AlipayProvider(paymentConfig.alipay)
      : new SandboxProvider('alipay');
    this.providers.wechat = configStatus.wechat
      ? new WechatProvider(paymentConfig.wechat)
      : new SandboxProvider('wechat');
    this.providers.unionpay = configStatus.unionpay
      ? new UnionPayProvider(paymentConfig.unionpay)
      : new SandboxProvider('unionpay');

    const enabled = Object.entries(configStatus).filter(([, v]) => v).map(([k]) => k).join(', ') || '无（全部沙箱）';
    console.log('[支付] 当前模式:', paymentConfig.mode);
    console.log('[支付] 已启用:', enabled);
  }

  _provider(method) {
    if (method === 'cod' || method === 'balance') return null;
    return this.providers[method] || this.providers.alipay;
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
      'INSERT INTO payment_orders (order_id, payment_method, amount, status, transaction_id) VALUES (?, ?, ?, ?, ?)',
      [orderId, paymentMethod, amount, 'pending', orderNo]
    );

    const paymentOrderId = result.lastID;
    const paymentInfo = { orderNo, paymentOrderId, paymentMethod };

    const provider = this._provider(paymentMethod);

    try {
      if (paymentMethod === 'cod') {
        paymentInfo.message = '货到付款';
        await this.db.run('UPDATE payment_orders SET status = ? WHERE id = ?', ['processing', paymentOrderId]);
        return paymentInfo;
      }
      if (paymentMethod === 'balance') {
        paymentInfo.message = '余额支付';
        return paymentInfo;
      }

      const providerResult = await provider.createPayment({ orderNo, amount, subject, paymentOrderId });
      return { ...paymentInfo, ...providerResult };
    } catch (error) {
      await this.db.run('UPDATE payment_orders SET status = ? WHERE id = ?', ['failed', paymentOrderId]);
      throw error;
    }
  }

  // ==================== 查询支付状态 ====================

  async queryPaymentStatus(paymentOrderId) {
    const po = await this.db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
    if (!po) throw new Error('支付订单不存在');
    return {
      id: po.id, orderId: po.order_id, paymentMethod: po.payment_method,
      amount: po.amount, status: po.status, transactionId: po.transaction_id,
      tradeNo: po.trade_no, paidAt: po.paid_at, createdAt: po.created_at,
    };
  }

  async queryPaymentByTransaction(transactionId) {
    return await this.db.get('SELECT * FROM payment_orders WHERE transaction_id = ?', [transactionId]);
  }

  async queryExternalStatus(paymentOrderId) {
    const po = await this.db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
    if (!po) throw new Error('支付订单不存在');
    if (po.status === 'paid') return { status: 'paid', message: '已支付' };

    const provider = this._provider(po.payment_method);
    if (!provider || provider instanceof SandboxProvider) {
      return { status: po.status, message: '待支付' };
    }

    try {
      const result = await provider.queryStatus({ paymentOrder: po });
      if (result.status === 'paid') {
        await this.updatePaymentStatus(paymentOrderId, 'paid', {
          trade_no: result.tradeNo,
          payer: result.payer || {},
        });
        return { status: 'paid', message: '支付成功' };
      }
      return { status: po.status, message: result.message || '待支付' };
    } catch {
      return { status: po.status, message: '查询失败' };
    }
  }

  // ==================== 更新支付状态 ====================

  async updatePaymentStatus(paymentOrderId, status, paymentInfo = {}) {
    if (status === 'paid') {
      await this.db.run(
        'UPDATE payment_orders SET status = ?, trade_no = ?, payer_info = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, paymentInfo.trade_no || `TRADE${Date.now()}`, JSON.stringify(paymentInfo.payer || {}), paymentOrderId]
      );
      const po = await this.db.get('SELECT order_id FROM payment_orders WHERE id = ?', [paymentOrderId]);
      if (po) {
        if (this.orderService) {
          await this.orderService.updateStatus(po.order_id, 'paid');
        } else {
          await this.db.run("UPDATE orders SET status = 'paid' WHERE id = ?", [po.order_id]);
        }
      }
    } else {
      await this.db.run('UPDATE payment_orders SET status = ? WHERE id = ?', [status, paymentOrderId]);
    }
    return { paymentOrderId, status };
  }

  // ==================== 回调处理 ====================

  async handleCallback(method, params, headers) {
    const provider = this._provider(method);
    const cbResult = await provider.handleCallback(params, headers);

    const po = await this.db.get('SELECT * FROM payment_orders WHERE transaction_id = ?', [cbResult.transactionId]);
    if (!po) throw new Error('支付订单不存在');

    if (cbResult.status === 'paid') {
      await this.updatePaymentStatus(po.id, 'paid', {
        trade_no: cbResult.tradeNo,
        payer: cbResult.payer || {},
      });
    }

    return { success: true };
  }

  // 兼容旧 API — 三个回调入口
  async handleAlipayCallback(params) { return this.handleCallback('alipay', params); }
  async handleWechatCallback(headers, body) { return this.handleCallback('wechat', body, headers); }
  async handleUnionPayCallback(params) { return this.handleCallback('unionpay', params); }

  // ==================== 模拟支付 ====================

  async simulatePayment(paymentOrderId) {
    const po = await this.db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
    if (!po) throw new Error('支付订单不存在');

    await this.updatePaymentStatus(paymentOrderId, 'paid', {
      trade_no: `SIM${Date.now()}`,
      payer: { simulated: true, timestamp: new Date().toISOString() }
    });

    return { paymentOrderId, status: 'paid', message: '支付成功（模拟）' };
  }

  // ==================== 退款 ====================

  async createRefund({ paymentOrderId, amount, reason }) {
    const po = await this.db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
    if (!po) throw new Error('支付订单不存在');
    if (po.status !== 'paid') throw new Error('只有已支付的订单才能退款');
    if (parseFloat(amount) > parseFloat(po.amount)) throw new Error('退款金额不能超过支付金额');

    const refundNo = this.generateRefundNo();

    const provider = this._provider(po.payment_method);
    if (provider && !(provider instanceof SandboxProvider)) {
      await provider.createRefund({ paymentOrder: po, amount, reason, refundNo });
    }

    const result = await this.db.run(
      'INSERT INTO refund_records (payment_order_id, refund_amount, refund_reason, refund_no, status) VALUES (?, ?, ?, ?, ?)',
      [paymentOrderId, amount, reason || '无', refundNo, 'success']
    );
    await this.db.run('UPDATE refund_records SET refunded_at = CURRENT_TIMESTAMP WHERE id = ?', [result.lastID]);
    await this.db.run('UPDATE payment_orders SET status = ? WHERE id = ?', ['refunded', paymentOrderId]);

    if (this.orderService) {
      await this.orderService.updateStatus(po.order_id, 'cancelled');
    } else {
      await this.db.run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [po.order_id]);
    }

    return { refundId: result.lastID, refundNo, amount, status: 'success', message: '退款成功' };
  }

  // ==================== 列表和统计 ====================

  async getPaymentList({ status, paymentMethod, page = 1, pageSize = 20 } = {}) {
    let query = 'SELECT * FROM payment_orders WHERE 1=1';
    const params = [];
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (paymentMethod) { query += ' AND payment_method = ?'; params.push(paymentMethod); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, (page - 1) * pageSize);
    const countQuery = query.split('ORDER BY')[0].replace('SELECT *', 'SELECT COUNT(*) as total');

    const [rows, countResult] = await Promise.all([
      this.db.all(query, params),
      this.db.get(countQuery, params.slice(0, -2))
    ]);
    return { total: countResult ? countResult.total : 0, page, pageSize, items: rows };
  }

  async getRefundList(paymentOrderId) {
    return await this.db.all('SELECT * FROM refund_records WHERE payment_order_id = ? ORDER BY created_at DESC', [paymentOrderId]);
  }

  async getPaymentStats() {
    return await this.db.get(`SELECT COUNT(*) as totalPayments, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paidCount, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount, SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refundedCount, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as totalRevenue FROM payment_orders`);
  }
}

module.exports = PaymentOrchestrator;
