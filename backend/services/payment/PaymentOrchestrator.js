const { paymentConfig, checkConfig } = require('../../config/payment');
const AlipayProvider = require('./providers/AlipayProvider');
const WechatProvider = require('./providers/WechatProvider');
const UnionPayProvider = require('./providers/UnionPayProvider');
const SandboxProvider = require('./providers/SandboxProvider');
const OrderLifecycleAdapter = require('./OrderLifecycleAdapter');
const PaymentSettlement = require('./PaymentSettlement');
const {
  BusinessError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../utils/errors');

class PaymentOrchestrator {
  constructor(db, orderService) {
    this.db = db;
    this.providers = {};

    const adapter = new OrderLifecycleAdapter(orderService);
    this.settlement = new PaymentSettlement(db, adapter);
  }

  enable() {
    const configStatus = checkConfig();
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && paymentConfig.mode !== 'production') {
      throw new Error('生产环境必须将 PAYMENT_MODE 设置为 production');
    }

    this.providers.alipay = configStatus.alipay
      ? new AlipayProvider(paymentConfig.alipay)
      : isProduction ? null : new SandboxProvider('alipay');
    this.providers.wechat = configStatus.wechat
      ? new WechatProvider(paymentConfig.wechat)
      : isProduction ? null : new SandboxProvider('wechat');
    this.providers.unionpay = configStatus.unionpay
      ? new UnionPayProvider(paymentConfig.unionpay)
      : isProduction ? null : new SandboxProvider('unionpay');

    const enabled = Object.entries(configStatus).filter(([, v]) => v).map(([k]) => k).join(', ') || '无（全部沙箱）';
    console.log('[支付] 当前模式:', paymentConfig.mode);
    console.log('[支付] 已启用:', enabled);
  }

  _provider(method) {
    if (method === 'cod' || method === 'balance') return null;
    return this.providers[method] || null;
  }

  generateOrderNo() {
    return `PAY${require('crypto').randomUUID().replace(/-/g, '').toUpperCase()}`;
  }

  generateRefundNo() {
    return `REF${require('crypto').randomUUID().replace(/-/g, '').toUpperCase()}`;
  }

  // ==================== 创建支付 ====================

  async _assertOrderAccess(order, actor) {
    if (!actor) return;
    if (actor.user?.role === 'admin' || actor.orderId === Number(order.id)) {
      return;
    }
    if (actor.user?.role === 'customer') {
      const customer = await this.db.get('SELECT phone FROM customers WHERE id = ?', [actor.user.userId]);
      if (customer?.phone === order.customer_phone) {
        return;
      }
    }
    throw new ForbiddenError('无权访问该订单的支付信息');
  }

  async _getPayableAmount(queryable, order) {
    const coupon = await queryable.get(
      `SELECT c.type, c.discount_value, c.max_discount
       FROM customer_coupons cc
       JOIN coupons c ON c.id = cc.coupon_id
       WHERE cc.used_order_id = ? AND cc.status = 'used'
       ORDER BY cc.used_at DESC, cc.id DESC
       LIMIT 1`,
      [order.id]
    );
    if (!coupon) return Number(order.total_price);

    let discount = coupon.type === 'percentage'
      ? Number(order.total_price) * (Number(coupon.discount_value) / 100)
      : Number(coupon.discount_value);
    if (coupon.max_discount !== null && coupon.max_discount !== undefined) {
      discount = Math.min(discount, Number(coupon.max_discount));
    }
    return Math.max(0, Math.round((Number(order.total_price) - discount) * 100) / 100);
  }

  async createPayment({ orderId, paymentMethod, subject }, actor) {
    if (!orderId || !paymentMethod) {
      throw new ValidationError('订单ID和支付方式不能为空');
    }

    const validMethods = ['alipay', 'wechat', 'unionpay', 'cod', 'balance'];
    if (!validMethods.includes(paymentMethod)) {
      throw new ValidationError(`不支持的支付方式: ${paymentMethod}`);
    }

    const requestedOrder = await this.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!requestedOrder) throw new NotFoundError('订单');
    await this._assertOrderAccess(requestedOrder, actor);

    const provider = this._provider(paymentMethod);
    if (!['cod', 'balance'].includes(paymentMethod) && !provider) {
      throw new BusinessError('该支付方式尚未配置');
    }

    const paymentRecord = await this.db.transaction(async (tx) => {
      const order = await tx.get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!order) throw new NotFoundError('订单');
      if (order.status !== 'pending') {
        throw new BusinessError('只有待支付订单可以创建支付单', 409, 'ORDER_NOT_PAYABLE');
      }
      const existingPayment = await tx.get(
        "SELECT id FROM payment_orders WHERE order_id = ? AND status IN ('pending', 'processing')",
        [orderId]
      );
      if (existingPayment) {
        throw new ConflictError('该订单已有待处理支付单');
      }

      const amount = await this._getPayableAmount(tx, order);
      const orderNo = this.generateOrderNo();
      const result = await tx.run(
        'INSERT INTO payment_orders (order_id, payment_method, amount, status, transaction_id) VALUES (?, ?, ?, ?, ?)',
        [orderId, paymentMethod, amount, 'pending', orderNo]
      );
      return { amount, orderNo, paymentOrderId: result.lastID };
    });

    const { amount, orderNo, paymentOrderId } = paymentRecord;
    const paymentInfo = { amount, orderNo, paymentOrderId, paymentMethod };

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
      await this.settlement.settleFailed(paymentOrderId);
      throw error;
    }
  }

  // ==================== 查询支付状态 ====================

  async queryPaymentStatus(paymentOrderId, actor) {
    const po = await this.settlement.getPaymentOrder(paymentOrderId);
    if (!po) throw new NotFoundError('支付订单');
    const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [po.order_id]);
    if (!order) throw new NotFoundError('订单');
    await this._assertOrderAccess(order, actor);
    return {
      id: po.id, orderId: po.order_id, paymentMethod: po.payment_method,
      amount: po.amount, status: po.status, transactionId: po.transaction_id,
      tradeNo: po.trade_no, paidAt: po.paid_at, createdAt: po.created_at,
    };
  }

  async queryPaymentByTransaction(transactionId) {
    return await this.db.get('SELECT * FROM payment_orders WHERE transaction_id = ?', [transactionId]);
  }

  async queryExternalStatus(paymentOrderId, actor) {
    const po = await this.settlement.getPaymentOrder(paymentOrderId);
    if (!po) throw new NotFoundError('支付订单');
    const order = await this.db.get('SELECT * FROM orders WHERE id = ?', [po.order_id]);
    if (!order) throw new NotFoundError('订单');
    await this._assertOrderAccess(order, actor);
    if (po.status === 'paid') return { status: 'paid', message: '已支付' };

    const provider = this._provider(po.payment_method);
    if (!provider || provider instanceof SandboxProvider) {
      return { status: po.status, message: '待支付' };
    }

    try {
      const result = await provider.queryStatus({ paymentOrder: po });
      if (result.status === 'paid') {
        if (result.amount === undefined || Number(result.amount) !== Number(po.amount)) {
          return { status: po.status, message: '支付金额校验失败' };
        }
        const settleResult = await this.settlement.settlePaid(paymentOrderId, {
          tradeNo: result.tradeNo,
          payer: result.payer || {},
        });
        if (settleResult.success) {
          return { status: 'paid', message: '支付成功' };
        }
        return { status: po.status, message: settleResult.error || '结算失败' };
      }
      return { status: po.status, message: result.message || '待支付' };
    } catch {
      return { status: po.status, message: '查询失败' };
    }
  }

  // ==================== 回调处理 ====================

  async handleCallback(method, params, headers) {
    const provider = this._provider(method);
    if (!provider || provider instanceof SandboxProvider) {
      throw new BusinessError('当前环境不接受该支付回调', 403, 'PAYMENT_CALLBACK_DISABLED');
    }
    const cbResult = await provider.handleCallback(params, headers);

    const po = await this.db.get('SELECT * FROM payment_orders WHERE transaction_id = ?', [cbResult.transactionId]);
    if (!po) throw new NotFoundError('支付订单');

    if (cbResult.status === 'paid') {
      if (cbResult.amount === undefined || Number(cbResult.amount) !== Number(po.amount)) {
        throw new BusinessError('支付回调金额与支付单不一致', 400, 'PAYMENT_AMOUNT_MISMATCH');
      }
      const result = await this.settlement.settlePaid(po.id, {
        tradeNo: cbResult.tradeNo,
        payer: cbResult.payer || {},
      });
      if (!result.success && result.status !== 'refunded') {
        throw new BusinessError(result.error);
      }
    }

    return { success: true };
  }

  // 兼容旧 API — 三个回调入口
  async handleAlipayCallback(params) { return this.handleCallback('alipay', params); }
  async handleWechatCallback(headers, body) { return this.handleCallback('wechat', body, headers); }
  async handleUnionPayCallback(params) { return this.handleCallback('unionpay', params); }

  // ==================== 模拟支付 ====================

  async simulatePayment(paymentOrderId) {
    if (paymentConfig.mode !== 'sandbox') {
      throw new ForbiddenError('生产环境不允许模拟支付');
    }
    const po = await this.settlement.getPaymentOrder(paymentOrderId);
    if (!po) throw new NotFoundError('支付订单');

    const result = await this.settlement.settlePaid(paymentOrderId, {
      tradeNo: `SIM${Date.now()}`,
      payer: { simulated: true, timestamp: new Date().toISOString() },
    });

    if (!result.success && result.status !== 'refunded') {
      throw new BusinessError(result.error);
    }

    return { paymentOrderId, status: result.status || 'paid', message: result.idempotent ? '已处理' : '支付成功（模拟）' };
  }

  // ==================== 退款 ====================

  async createRefund({ paymentOrderId, amount, reason }) {
    const po = await this.settlement.getPaymentOrder(paymentOrderId);
    if (!po) throw new NotFoundError('支付订单');
    if (po.status !== 'paid') throw new BusinessError('只有已支付的订单才能退款');
    const refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new ValidationError('退款金额无效');
    }
    if (refundAmount > Number(po.amount)) {
      throw new BusinessError('退款金额不能超过支付金额');
    }
    if (refundAmount !== Number(po.amount)) {
      throw new BusinessError('当前仅支持整单退款', 400, 'PARTIAL_REFUND_UNSUPPORTED');
    }

    const refundNo = this.generateRefundNo();

    const provider = this._provider(po.payment_method);
    if (provider && !(provider instanceof SandboxProvider)) {
      await provider.createRefund({ paymentOrder: po, amount: refundAmount, reason, refundNo });
    }

    const result = await this.settlement.settleRefund(paymentOrderId, { amount: refundAmount, reason, refundNo });
    if (!result.success) {
      throw new BusinessError(result.error);
    }

    return { refundId: result.refundId, refundNo, amount: refundAmount, status: 'success', message: '退款成功' };
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
