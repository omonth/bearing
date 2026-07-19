const crypto = require('crypto');
const logger = require('../../logger');
const { paymentConfig, checkConfig } = require('../../config/payment');
const AlipayProvider = require('./providers/AlipayProvider');
const WechatProvider = require('./providers/WechatProvider');
const UnionPayProvider = require('./providers/UnionPayProvider');
const SandboxProvider = require('./providers/SandboxProvider');
const OrderLifecycleAdapter = require('./OrderLifecycleAdapter');
const PaymentSettlement = require('./PaymentSettlement');
const { businessAudit } = require('../observability/audit');
const {
  BusinessError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} = require('../../utils/errors');

class PaymentOrchestrator {
  constructor(db, orderService, audit = businessAudit) {
    this.db = db;
    this.providers = {};
    this.audit = audit;

    const adapter = new OrderLifecycleAdapter(orderService);
    this.settlement = new PaymentSettlement(db, adapter, audit);
    this.refundLeaseSeconds = this._positiveIntegerConfig('REFUND_LEASE_SECONDS', 60);
    this.refundRetryDelaySeconds = this._positiveIntegerConfig(
      'REFUND_RECONCILE_RETRY_SECONDS',
      60
    );
    this.refundMaxAttempts = this._positiveIntegerConfig('REFUND_RECONCILE_MAX_ATTEMPTS', 5);
    this.refundReconcileBatchSize = this._positiveIntegerConfig(
      'REFUND_RECONCILE_BATCH_SIZE',
      50
    );
    this.refundReconciliationTimer = null;
  }

  _positiveIntegerConfig(name, defaultValue) {
    const value = process.env[name];
    if (value === undefined || value === '') return defaultValue;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} 必须是正整数`);
    }
    return parsed;
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

    if (isProduction) {
      if (configStatus.alipay && !this.providers.alipay?.enabled) {
        throw new Error('支付宝 SDK 初始化失败，拒绝启动生产服务');
      }
      if (configStatus.wechat
        && (!this.providers.wechat?.enabled || !this.providers.wechat.platformPublicKey)) {
        throw new Error('微信支付 SDK 或平台证书初始化失败，拒绝启动生产服务');
      }
    }

    const enabled = Object.entries(configStatus).filter(([, v]) => v).map(([k]) => k).join(', ') || '无（全部沙箱）';
    logger.info('支付编排器已启用', { mode: paymentConfig.mode, enabledProviders: enabled });
    this.startRefundReconciliation();
  }

  startRefundReconciliation() {
    if (this.refundReconciliationTimer
      || process.env.NODE_ENV === 'test'
      || process.env.REFUND_RECONCILIATION_DISABLED === 'true') {
      return;
    }
    const intervalSeconds = this._positiveIntegerConfig(
      'REFUND_RECONCILE_INTERVAL_SECONDS',
      60
    );
    this.refundReconciliationTimer = setInterval(() => {
      this.reconcilePendingRefunds().catch((error) => {
        logger.error('定时退款对账失败', { error: error.message });
      });
    }, intervalSeconds * 1000);
    this.refundReconciliationTimer.unref?.();
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
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const order = await tx.get(
        `SELECT * FROM orders WHERE id = ?${lockClause}`,
        [orderId]
      );
      if (!order) throw new NotFoundError('订单');
      if (order.status !== 'pending') {
        throw new BusinessError('只有待支付订单可以创建支付单', 409, 'ORDER_NOT_PAYABLE');
      }
      const existingPayment = await tx.get(
        `SELECT id FROM payment_orders
         WHERE order_id = ? AND status IN ('pending', 'processing')
         ORDER BY id DESC LIMIT 1${lockClause}`,
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
        const activation = await this.db.run(
          'UPDATE payment_orders SET status = ? WHERE id = ? AND status = ?',
          ['processing', paymentOrderId, 'pending']
        );
        if (!activation || activation.changes !== 1) {
          throw new ConflictError('货到付款支付单状态已变化，请刷新订单后重试');
        }
        return paymentInfo;
      }
      if (paymentMethod === 'balance') {
        paymentInfo.message = '余额支付';
        return paymentInfo;
      }

      await this.db.run(
        'UPDATE payment_orders SET status = ? WHERE id = ? AND status = ?',
        ['processing', paymentOrderId, 'pending']
      );
      const providerResult = await provider.createPayment({ orderNo, amount, subject, paymentOrderId });
      return { ...paymentInfo, ...providerResult };
    } catch (error) {
      this.audit.paymentCreateUncertain(paymentMethod, {
        paymentOrderId,
        orderId,
        reasonCode: 'PROVIDER_CREATE_RESULT_UNKNOWN',
      });
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

  async _claimCallbackEvent({ method, callback, rawBody, body, paymentStatus }) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const eventId = callback.eventId
      || `${callback.transactionId}:${callback.tradeNo || callback.status}`;
    const eventTimestamp = callback.eventTimestamp || nowSeconds;
    const signatureNonce = callback.signatureNonce || eventId;
    const eventKey = crypto.createHash('sha256')
      .update(`${method}\0${eventId}\0${rawBody || JSON.stringify(body)}`)
      .digest('hex');

    try {
      const result = await this.db.run(
        `INSERT INTO payment_callback_events
          (provider, event_id, event_key, signature_nonce, event_timestamp,
           transaction_id, status, processing_started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          method,
          eventId,
          eventKey,
          signatureNonce,
          eventTimestamp,
          callback.transactionId,
          'processing',
          nowSeconds,
        ]
      );
      return { claimed: true, eventId: result.lastID };
    } catch (error) {
      const existing = await this.db.get(
        `SELECT * FROM payment_callback_events
         WHERE provider = ?
           AND (event_id = ? OR event_key = ? OR (signature_nonce = ? AND event_timestamp = ?))
         ORDER BY id DESC LIMIT 1`,
        [method, eventId, eventKey, signatureNonce, eventTimestamp]
      );
      if (!existing) throw error;
      const exactRetry = existing.event_id === eventId
        && existing.event_key === eventKey
        && existing.transaction_id === callback.transactionId;
      if (!exactRetry) {
        throw new BusinessError(
          '支付回调 nonce 或事件标识已被其他载荷使用',
          409,
          'PAYMENT_CALLBACK_REPLAY'
        );
      }
      if (['paid', 'refunded'].includes(paymentStatus)) {
        if (existing.status !== 'processed') {
          await this.db.run(
            `UPDATE payment_callback_events
             SET status = ?, processed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = ?`,
            ['processed', existing.id, existing.status]
          );
        }
        return { claimed: false, eventId: existing.id, idempotent: true };
      }
      if (existing.status === 'processed') {
        return { claimed: false, eventId: existing.id, idempotent: true };
      }

      const staleProcessing = existing.status === 'processing'
        && Number(existing.processing_started_at) <= nowSeconds - 60;
      if (existing.status === 'failed' || staleProcessing) {
        const result = await this.db.run(
          `UPDATE payment_callback_events
           SET status = ?, processing_started_at = ?
           WHERE id = ? AND status = ? AND processing_started_at = ?`,
          [
            'processing',
            nowSeconds,
            existing.id,
            existing.status,
            existing.processing_started_at,
          ]
        );
        if (result?.changes === 1) {
          return { claimed: true, eventId: existing.id };
        }
      }

      throw new BusinessError(
        '支付回调正在处理或已被重放',
        409,
        'PAYMENT_CALLBACK_REPLAY'
      );
    }
  }

  async handleCallback({ method, headers = {}, body, rawBody }) {
    const provider = this._provider(method);
    if (!provider || provider instanceof SandboxProvider) {
      throw new BusinessError('当前环境不接受该支付回调', 403, 'PAYMENT_CALLBACK_DISABLED');
    }
    let cbResult;
    try {
      cbResult = await provider.handleCallback({ headers, body, rawBody });
      this.audit.callbackSignatureVerified(method);
    } catch (error) {
      if (String(error.code || '').includes('SIGNATURE') || /签名/.test(error.message || '')) {
        void this.audit.callbackSignatureFailed(method, {
          reasonCode: error.code || 'CALLBACK_SIGNATURE_INVALID',
        });
      }
      throw error;
    }

    const po = await this.db.get('SELECT * FROM payment_orders WHERE transaction_id = ?', [cbResult.transactionId]);
    if (!po) throw new NotFoundError('支付订单');
    if (po.payment_method !== method) {
      throw new BusinessError('支付回调渠道与支付单不匹配', 400, 'PAYMENT_METHOD_MISMATCH');
    }
    const order = await this.db.get('SELECT id FROM orders WHERE id = ?', [po.order_id]);
    if (!order) throw new NotFoundError('订单');

    if (cbResult.status === 'paid') {
      const callbackAmountCents = Math.round(Number(cbResult.amount) * 100);
      const paymentAmountCents = Math.round(Number(po.amount) * 100);
      if (cbResult.amount === undefined
        || !Number.isSafeInteger(callbackAmountCents)
        || callbackAmountCents !== paymentAmountCents) {
        throw new BusinessError('支付回调金额与支付单不一致', 400, 'PAYMENT_AMOUNT_MISMATCH');
      }
    }

    const event = await this._claimCallbackEvent({
      method,
      callback: cbResult,
      rawBody,
      body,
      paymentStatus: po.status,
    });
    if (!event.claimed) {
      return { success: true, idempotent: true };
    }

    if (['paid', 'refunded'].includes(po.status) && cbResult.status !== 'paid') {
      await this.db.run(
        'UPDATE payment_callback_events SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['processed', event.eventId]
      );
      logger.info('忽略迟到的非成功支付回调', {
        paymentOrderId: po.id,
        paymentStatus: po.status,
        callbackStatus: cbResult.status,
      });
      return {
        success: true,
        idempotent: true,
        stale: true,
        status: po.status,
      };
    }

    try {
      let settlementResult = { success: true, status: po.status };
      if (cbResult.status === 'paid') {
        settlementResult = await this.settlement.settlePaid(po.id, {
          tradeNo: cbResult.tradeNo,
          payer: cbResult.payer || {},
        });
        if (!settlementResult.success && settlementResult.status !== 'refunded') {
          throw new BusinessError(settlementResult.error);
        }
      } else if (cbResult.status === 'failed') {
        settlementResult = await this.settlement.settleFailed(po.id);
        if (!settlementResult.success) throw new BusinessError(settlementResult.error);
        if (!settlementResult.idempotent) {
          this.audit.paymentFailed(method, {
            paymentOrderId: po.id,
            orderId: po.order_id,
            reasonCode: 'PROVIDER_CALLBACK_FAILED',
          });
        }
      }
      await this.db.run(
        'UPDATE payment_callback_events SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['processed', event.eventId]
      );
      return {
        success: true,
        idempotent: settlementResult.idempotent || settlementResult.status === 'refunded',
      };
    } catch (error) {
      await this.db.run(
        'UPDATE payment_callback_events SET status = ? WHERE id = ?',
        ['failed', event.eventId]
      );
      throw error;
    }
  }

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

  _refundResponse(paymentOrderId, refund, overrides = {}) {
    return {
      paymentOrderId,
      refundId: Number(refund.id || refund.refundId),
      refundNo: refund.refund_no || refund.refundNo,
      amount: Number(refund.refund_amount ?? refund.amount),
      status: refund.status,
      providerRefundId: refund.provider_refund_id || refund.providerRefundId || null,
      attemptCount: Number(refund.attempt_count || refund.attemptCount || 0),
      ...overrides,
    };
  }

  async _getRefundContext(refundId) {
    return this.db.get(
      `SELECT rr.*, po.order_id, po.payment_method, po.status AS payment_status,
              po.transaction_id, po.amount AS payment_amount
       FROM refund_records rr
       JOIN payment_orders po ON po.id = rr.payment_order_id
       WHERE rr.id = ?`,
      [refundId]
    );
  }

  async _completeUncertainAttempt({
    claim,
    paymentOrderId,
    provider,
    action,
    error,
    syncAfterSales,
    providerRefundId = null,
  }) {
    const exhausted = claim.attemptCount >= this.refundMaxAttempts;
    const status = exhausted
      ? 'manual_required'
      : action === 'create' ? 'requested' : 'processing';
    const nextReconcileAt = exhausted
      ? null
      : Math.floor(Date.now() / 1000) + this.refundRetryDelaySeconds;
    const completed = await this.settlement.completeRefundAttempt(
      claim.refund.id,
      claim.leaseToken,
      {
        status,
        error,
        providerRefundId,
        nextReconcileAt,
        source: 'system',
        eventType: exhausted ? 'reconcile_exhausted' : 'provider_error',
        syncAfterSales,
      }
    );
    this.audit.refundRequestUncertain({
      refundId: claim.refund.id,
      paymentOrderId,
      provider,
      attemptCount: claim.attemptCount,
      reasonCode: exhausted
        ? 'REFUND_RECONCILIATION_EXHAUSTED'
        : 'PROVIDER_REFUND_RESULT_UNKNOWN',
    });
    const current = await this._getRefundContext(claim.refund.id);
    return this._refundResponse(paymentOrderId, current || claim.refund, {
      status: completed.status || status,
      message: exhausted
        ? '自动对账已达安全上限，需要人工核验'
        : '支付提供方结果未知，已保留原退款请求号并排队重试',
      retryScheduled: !exhausted,
    });
  }

  async _executeRefundAttempt(refundId, { syncAfterSales = false } = {}) {
    const before = await this._getRefundContext(refundId);
    if (!before) throw new NotFoundError('退款记录');
    if (['success', 'manual_required'].includes(before.status)) {
      if (syncAfterSales) {
        const syncResult = await this.settlement.syncRefundAfterSales(refundId);
        if (!syncResult.success) {
          throw new BusinessError(syncResult.error, 409, 'REFUND_AFTER_SALES_SYNC_FAILED');
        }
      }
      return this._refundResponse(before.payment_order_id, before, {
        idempotent: true,
        message: before.status === 'success' ? '退款已完成' : '需要人工处理',
      });
    }

    const action = before.status === 'processing' && before.provider_refund_id
      ? 'query'
      : 'create';
    const claim = await this.settlement.claimRefundAttempt(refundId, {
      leaseSeconds: this.refundLeaseSeconds,
      source: action === 'query' ? 'system' : 'provider',
    });
    if (!claim.success) throw new BusinessError(claim.error, 409, 'REFUND_LEASE_CONFLICT');
    if (!claim.claimed) {
      const current = await this._getRefundContext(refundId);
      return this._refundResponse(before.payment_order_id, current || before, {
        idempotent: true,
        message: claim.busy ? '退款请求正在处理中' : '退款状态已处理',
      });
    }

    const providerName = claim.refund.payment_method;
    const provider = this._provider(providerName);
    let providerResult;
    try {
      if (!provider) {
        providerResult = { status: 'manual_required' };
      } else if (action === 'query') {
        if (typeof provider.queryRefund !== 'function') {
          providerResult = { status: 'manual_required' };
        } else {
          providerResult = await provider.queryRefund({
            paymentOrder: {
              id: claim.refund.payment_order_id,
              order_id: claim.refund.order_id,
              payment_method: providerName,
              transaction_id: claim.refund.transaction_id,
              amount: claim.refund.payment_amount,
            },
            refund: claim.refund,
          });
        }
      } else {
        providerResult = await provider.createRefund({
          paymentOrder: {
            id: claim.refund.payment_order_id,
            order_id: claim.refund.order_id,
            payment_method: providerName,
            transaction_id: claim.refund.transaction_id,
            amount: claim.refund.payment_amount,
          },
          amount: Number(claim.refund.refund_amount),
          reason: claim.refund.refund_reason,
          refundNo: claim.refund.refund_no,
        });
      }
    } catch (error) {
      return this._completeUncertainAttempt({
        claim,
        paymentOrderId: claim.refund.payment_order_id,
        provider: providerName,
        action,
        error,
        syncAfterSales,
      });
    }

    const providerStatus = providerResult?.status;
    if (!['processing', 'success', 'failed', 'manual_required'].includes(providerStatus)) {
      return this._completeUncertainAttempt({
        claim,
        paymentOrderId: claim.refund.payment_order_id,
        provider: providerName,
        action,
        error: new Error('支付提供方返回了无效的退款状态'),
        syncAfterSales,
      });
    }
    if (providerStatus === 'success') {
      const result = await this.settlement.settleRefundSuccess(refundId, {
        leaseToken: claim.leaseToken,
        providerRefundId: providerResult.providerRefundId,
        syncAfterSales,
      });
      if (!result.success) {
        void this.audit.refundOrderSyncFailed({
          refundId,
          paymentOrderId: claim.refund.payment_order_id,
          provider: providerName,
          reasonCode: 'LOCAL_REFUND_SETTLEMENT_FAILED',
        });
        return this._completeUncertainAttempt({
          claim,
          paymentOrderId: claim.refund.payment_order_id,
          provider: providerName,
          action: 'query',
          error: new Error(result.error),
          syncAfterSales,
          providerRefundId: providerResult.providerRefundId,
        });
      }
      if (result.outOfOrder) {
        const current = await this._getRefundContext(refundId);
        return this._refundResponse(claim.refund.payment_order_id, current || claim.refund, {
          idempotent: true,
          outOfOrder: true,
        });
      }
      return { ...result, paymentOrderId: claim.refund.payment_order_id };
    }

    const effectiveProviderStatus = providerStatus === 'processing'
      && claim.attemptCount >= this.refundMaxAttempts
      ? 'manual_required'
      : providerStatus;
    const nextReconcileAt = effectiveProviderStatus === 'processing'
      ? Math.floor(Date.now() / 1000) + this.refundRetryDelaySeconds
      : null;
    const statusResult = await this.settlement.completeRefundAttempt(
      refundId,
      claim.leaseToken,
      {
        status: effectiveProviderStatus,
        providerRefundId: providerResult.providerRefundId,
        nextReconcileAt,
        syncAfterSales,
        source: effectiveProviderStatus === providerStatus ? 'provider' : 'system',
        eventType: effectiveProviderStatus === providerStatus
          ? 'provider_response'
          : 'reconcile_exhausted',
      }
    );
    if (!statusResult.success) throw new BusinessError(statusResult.error);
    if (effectiveProviderStatus === 'failed') {
      this.audit.refundFailed({
        refundId,
        paymentOrderId: claim.refund.payment_order_id,
        provider: providerName,
        reasonCode: 'PROVIDER_REFUND_FAILED',
      });
    } else {
      this.audit.refundStatus(effectiveProviderStatus, {
        refundId,
        paymentOrderId: claim.refund.payment_order_id,
        provider: providerName,
      });
    }
    const current = await this._getRefundContext(refundId);
    return this._refundResponse(claim.refund.payment_order_id, current || claim.refund, {
      status: statusResult.status,
      idempotent: statusResult.idempotent,
      outOfOrder: statusResult.outOfOrder,
      message: effectiveProviderStatus === 'manual_required'
        ? '需要人工处理'
        : effectiveProviderStatus === 'failed' ? '支付提供方确认退款失败' : '退款请求处理中',
    });
  }

  async createRefund({ paymentOrderId, amount, reason, syncAfterSales = false }) {
    const po = await this.settlement.getPaymentOrder(paymentOrderId);
    if (!po) throw new NotFoundError('支付订单');
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
    const request = await this.settlement.requestRefund(paymentOrderId, {
      amount: refundAmount,
      reason,
      refundNo,
    });
    if (!request.success) throw new BusinessError(request.error);
    if (!request.idempotent) {
      this.audit.refundRequested({
        refundId: request.refundId,
        paymentOrderId,
        provider: po.payment_method,
      });
    }
    if (request.idempotent && ['success', 'manual_required', 'processing'].includes(request.status)) {
      if (syncAfterSales) {
        const syncResult = await this.settlement.syncRefundAfterSales(request.refundId);
        if (!syncResult.success) {
          throw new BusinessError(syncResult.error, 409, 'REFUND_AFTER_SALES_SYNC_FAILED');
        }
      }
      return {
        paymentOrderId,
        refundId: request.refundId,
        refundNo: request.refundNo,
        amount: request.amount,
        status: request.status,
        message: request.status === 'manual_required'
          ? '需要人工处理'
          : request.status === 'success' ? '退款已完成' : '退款请求已存在',
        idempotent: true,
      };
    }
    return this._executeRefundAttempt(request.refundId, { syncAfterSales });
  }

  async reconcileRefund(refundId, { syncAfterSales = true } = {}) {
    return this._executeRefundAttempt(Number(refundId), { syncAfterSales });
  }

  async reconcilePendingRefunds({ limit = this.refundReconcileBatchSize } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 200);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const rows = await this.db.all(
      `SELECT id FROM refund_records
       WHERE status IN ('requested', 'processing')
         AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
         AND (next_reconcile_at IS NULL OR next_reconcile_at <= ?)
       ORDER BY created_at, id
       LIMIT ?`,
      [nowSeconds, nowSeconds, safeLimit]
    );
    const results = [];
    for (const row of rows) {
      try {
        results.push(await this.reconcileRefund(row.id, { syncAfterSales: true }));
      } catch (error) {
        logger.error('单笔退款对账失败', { refundId: row.id, error: error.message });
        results.push({ refundId: Number(row.id), status: 'error' });
      }
    }
    return { scanned: rows.length, results };
  }

  _validateManualEvidence({ adminId, evidence, externalReference }) {
    if (!Number.isSafeInteger(Number(adminId)) || Number(adminId) <= 0) {
      throw new ValidationError('管理员 ID 无效');
    }
    if (typeof evidence !== 'string' || evidence.trim().length < 10 || evidence.trim().length > 2000) {
      throw new ValidationError('人工处理凭证说明必须为 10 到 2000 个字符', 'evidence');
    }
    if (typeof externalReference !== 'string'
      || externalReference.trim().length < 4
      || externalReference.trim().length > 160) {
      throw new ValidationError('外部参考号必须为 4 到 160 个字符', 'externalReference');
    }
    return {
      adminId: Number(adminId),
      evidence: evidence.trim(),
      externalReference: externalReference.trim(),
    };
  }

  async confirmCodCollection({
    paymentOrderId,
    adminId,
    evidence,
    externalReference,
  }) {
    if (!Number.isSafeInteger(Number(paymentOrderId)) || Number(paymentOrderId) <= 0) {
      throw new ValidationError('支付订单 ID 无效', 'paymentOrderId');
    }
    const validated = this._validateManualEvidence({ adminId, evidence, externalReference });
    const result = await this.settlement.confirmCodCollection(Number(paymentOrderId), validated);
    if (!result.success) {
      throw new BusinessError(
        result.error,
        result.code === 'PAYMENT_NOT_FOUND' ? 404 : 409,
        result.code || 'COD_COLLECTION_CONFLICT'
      );
    }
    return result;
  }

  async recordManualRefundDecision({
    refundId,
    status,
    adminId,
    evidence,
    externalReference,
    caseId = null,
    expectedVersion = null,
  }) {
    const validated = this._validateManualEvidence({ adminId, evidence, externalReference });
    const result = await this.settlement.recordManualRefundDecision(Number(refundId), {
      status,
      ...validated,
      caseId: caseId === null ? null : Number(caseId),
      expectedVersion: expectedVersion === null ? null : Number(expectedVersion),
    });
    if (!result.success) throw new BusinessError(result.error, 409, result.code || 'MANUAL_REFUND_CONFLICT');
    this.audit.refundStatus(status, {
      refundId: Number(refundId),
      adminId: validated.adminId,
      externalReference: validated.externalReference,
      manual: true,
    });
    return result;
  }

  async confirmManualRefund({
    refundId,
    adminId,
    evidence,
    externalReference,
    caseId = null,
    expectedVersion = null,
  }) {
    const validated = this._validateManualEvidence({ adminId, evidence, externalReference });
    const result = await this.settlement.settleManualRefundSuccess(Number(refundId), {
      ...validated,
      caseId: caseId === null ? null : Number(caseId),
      expectedVersion: expectedVersion === null ? null : Number(expectedVersion),
    });
    if (!result.success) throw new BusinessError(
      result.error,
      409,
      result.code || 'MANUAL_REFUND_CONFIRMATION_CONFLICT'
    );
    return result;
  }

  // ==================== 列表和统计 ====================

  async getPaymentList({ status, paymentMethod, page = 1, pageSize = 20 } = {}) {
    let whereClause = ' WHERE 1=1';
    const params = [];
    if (status) { whereClause += ' AND status = ?'; params.push(status); }
    if (paymentMethod) { whereClause += ' AND payment_method = ?'; params.push(paymentMethod); }
    const query = `SELECT id, order_id, payment_method, amount, status, paid_at, created_at
      FROM payment_orders${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const countQuery = `SELECT COUNT(*) as total FROM payment_orders${whereClause}`;

    const [rows, countResult] = await Promise.all([
      this.db.all(query, listParams),
      this.db.get(countQuery, params)
    ]);
    return { total: countResult ? countResult.total : 0, page, pageSize, items: rows };
  }

  async getRefundList(paymentOrderId) {
    return await this.db.all('SELECT * FROM refund_records WHERE payment_order_id = ? ORDER BY created_at DESC', [paymentOrderId]);
  }

  async getRefundDetails(refundId) {
    const refund = await this._getRefundContext(Number(refundId));
    if (!refund) throw new NotFoundError('退款记录');
    const history = await this.db.all(
      `SELECT * FROM refund_status_history WHERE refund_id = ? ORDER BY id`,
      [refundId]
    );
    return { ...refund, history };
  }

  async getPaymentStats() {
    return await this.db.get(`SELECT COUNT(*) as totalPayments, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paidCount, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount, SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) as refundedCount, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as totalRevenue FROM payment_orders`);
  }
}

module.exports = PaymentOrchestrator;
