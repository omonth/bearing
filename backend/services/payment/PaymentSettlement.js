const crypto = require('crypto');
const logger = require('../../logger');
const { businessAudit } = require('../observability/audit');
const { RefundStatus, refundStatuses } = require('./refundStatus');

const ATTEMPTABLE_REFUND_STATUSES = new Set([
  RefundStatus.REQUESTED,
  RefundStatus.PROCESSING,
  RefundStatus.FAILED,
]);

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown provider error');
  return message.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

class PaymentSettlement {
  constructor(db, orderLifecycle, audit = businessAudit) {
    this.db = db;
    this.orderLifecycle = orderLifecycle;
    this.audit = audit;
  }

  async getPaymentOrder(id) {
    return this.db.get('SELECT * FROM payment_orders WHERE id = ?', [id]);
  }

  async settlePaid(paymentOrderId, { tradeNo, payer } = {}) {
    const resolvedTradeNo = tradeNo || `TRADE${Date.now()}`;
    const payerInfo = JSON.stringify(payer || {});
    let paymentContext = { paymentOrderId, provider: 'unknown' };
    try {
      const settlement = await this.db.transaction(async (tx) => {
        const po = await tx.get('SELECT * FROM payment_orders WHERE id = ?', [paymentOrderId]);
        if (!po) return { success: false, error: '支付订单不存在' };
        paymentContext = {
          paymentOrderId,
          orderId: po.order_id,
          provider: po.payment_method || 'unknown',
        };
        if (po.status === 'paid') {
          return { success: true, paymentOrderId, status: 'paid', idempotent: true };
        }
        if (po.status === 'refunded') {
          return {
            success: false,
            error: '支付已退款，不能重复结算',
            status: 'refunded',
          };
        }
        if (!['pending', 'processing'].includes(po.status)) {
          return { success: false, error: `当前状态 ${po.status} 不允许结算为已支付` };
        }

        const order = await tx.get('SELECT status FROM orders WHERE id = ?', [po.order_id]);
        if (!order) return { success: false, error: '订单不存在' };
        if (!['pending', 'paid'].includes(order.status)) {
          return { success: false, error: '订单当前不可支付', status: order.status };
        }

        const paymentResult = await tx.run(
          `UPDATE payment_orders
           SET status = ?, trade_no = ?, payer_info = ?, paid_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN (?, ?)`,
          ['paid', resolvedTradeNo, payerInfo, paymentOrderId, 'pending', 'processing']
        );
        if (!paymentResult || paymentResult.changes !== 1) {
          const current = await tx.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
          if (current?.status === 'paid') {
            return { success: true, paymentOrderId, status: 'paid', idempotent: true };
          }
          return { success: false, error: '支付结算并发冲突', status: current?.status };
        }

        const lifecycleResult = await this.orderLifecycle.markPaid(po.order_id, tx);
        return {
          success: true,
          paymentOrderId,
          orderId: po.order_id,
          status: 'paid',
          idempotent: false,
          lifecycleResult,
        };
      });

      if (settlement.lifecycleResult) {
        this.orderLifecycle.finalize(settlement.orderId, settlement.lifecycleResult);
      }
      if (settlement.success && settlement.idempotent) {
        logger.info('支付已结算（幂等）', { paymentOrderId, status: settlement.status });
      } else if (settlement.success) {
        logger.info('支付结算成功', {
          paymentOrderId,
          orderId: settlement.orderId,
          provider: paymentContext.provider,
        });
        this.audit.paymentSucceeded(paymentContext.provider, paymentContext);
      } else {
        logger.warn('支付结算被拒绝', {
          paymentOrderId,
          status: settlement.status,
          error: settlement.error,
        });
        if (settlement.status !== 'refunded') {
          void this.audit.paymentOrderSyncFailed(paymentContext.provider, {
            ...paymentContext,
            reasonCode: 'LOCAL_SETTLEMENT_REJECTED',
          });
        }
      }
      return settlement;
    } catch (error) {
      logger.error('支付与订单事务结算失败', { paymentOrderId, error: error.message });
      void this.audit.paymentOrderSyncFailed(paymentContext.provider, {
        ...paymentContext,
        reasonCode: 'LOCAL_SETTLEMENT_TRANSACTION_FAILED',
      });
      return { success: false, error: error.message };
    }

  }

  async confirmCodCollection(paymentOrderId, {
    adminId,
    evidence,
    externalReference,
  }) {
    let paymentContext = { paymentOrderId, provider: 'cod', adminId };
    try {
      const result = await this.db.transaction(async (tx) => {
        const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
        const payment = await tx.get(
          `SELECT po.*, o.status AS order_status
           FROM payment_orders po
           JOIN orders o ON o.id = po.order_id
           WHERE po.id = ?${lockClause}`,
          [paymentOrderId]
        );
        if (!payment) return { success: false, error: '支付订单不存在', code: 'PAYMENT_NOT_FOUND' };
        paymentContext = {
          ...paymentContext,
          orderId: payment.order_id,
          externalReference,
        };
        if (payment.payment_method !== 'cod') {
          return {
            success: false,
            error: '只有货到付款支付单可以确认线下收款',
            code: 'COD_PAYMENT_REQUIRED',
          };
        }
        if (payment.status === 'paid') {
          if (payment.order_status === 'completed' && payment.trade_no === externalReference) {
            return {
              success: true,
              payment,
              status: 'paid',
              orderStatus: 'completed',
              idempotent: true,
            };
          }
          return {
            success: false,
            error: '货到付款支付单已使用不同凭证结算或订单状态不一致',
            code: 'COD_COLLECTION_CONFLICT',
          };
        }
        if (payment.status !== 'processing') {
          return {
            success: false,
            error: `当前支付状态 ${payment.status} 不允许确认货到付款收款`,
            code: 'COD_COLLECTION_CONFLICT',
          };
        }
        if (payment.order_status !== 'shipped') {
          return {
            success: false,
            error: '货到付款订单必须先发货，送达收款后才能确认完成',
            code: 'COD_ORDER_NOT_SHIPPED',
          };
        }

        const paymentResult = await tx.run(
          `UPDATE payment_orders
           SET status = ?, trade_no = ?, payer_info = ?, paid_at = CURRENT_TIMESTAMP
           WHERE id = ? AND payment_method = ? AND status = ?`,
          [
            'paid',
            externalReference,
            JSON.stringify({ confirmation: 'admin', adminId, evidence }),
            paymentOrderId,
            'cod',
            'processing',
          ]
        );
        if (!paymentResult || paymentResult.changes !== 1) {
          return {
            success: false,
            error: '货到付款支付状态已被并发更新',
            code: 'COD_COLLECTION_CONFLICT',
          };
        }

        const lifecycleResult = await this.orderLifecycle.markCodCompleted(payment.order_id, tx);
        return {
          success: true,
          payment,
          status: 'paid',
          orderStatus: 'completed',
          lifecycleResult,
          idempotent: false,
        };
      });

      if (!result.success) return result;
      if (result.lifecycleResult) {
        this.orderLifecycle.finalize(result.payment.order_id, result.lifecycleResult);
      }
      if (!result.idempotent) {
        logger.info('货到付款收款与履约已完成事务结算', paymentContext);
        this.audit.paymentSucceeded('cod', paymentContext);
      }
      return {
        success: true,
        paymentOrderId,
        orderId: result.payment.order_id,
        status: result.status,
        orderStatus: result.orderStatus,
        idempotent: result.idempotent,
      };
    } catch (error) {
      logger.error('货到付款收款事务结算失败', {
        paymentOrderId,
        error: error.message,
      });
      void this.audit.paymentOrderSyncFailed('cod', {
        ...paymentContext,
        reasonCode: 'COD_COLLECTION_TRANSACTION_FAILED',
      });
      return { success: false, error: error.message, code: error.code };
    }
  }

  async requestRefund(paymentOrderId, { amount, reason, refundNo } = {}) {
    try {
      return await this.db.transaction(async (tx) => {
        const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
        const po = await tx.get(
          `SELECT * FROM payment_orders WHERE id = ?${lockClause}`,
          [paymentOrderId]
        );
        if (!po) return { success: false, error: '支付订单不存在' };

        const existing = await tx.get(
          `SELECT * FROM refund_records
           WHERE payment_order_id = ?
           ORDER BY id DESC LIMIT 1${lockClause}`,
          [paymentOrderId]
        );
        if (existing) {
          if ((existing.status === RefundStatus.SUCCESS) !== (po.status === 'refunded')) {
            return {
              success: false,
              error: '退款记录与支付单状态不一致，需要人工核验',
            };
          }
          if (existing.status !== RefundStatus.SUCCESS && po.status !== 'paid') {
            return {
              success: false,
              error: '当前支付状态不允许继续退款',
            };
          }
          return {
            success: true,
            idempotent: true,
            refundId: existing.id,
            refundNo: existing.refund_no,
            amount: existing.refund_amount,
            status: existing.status,
          };
        }

        if (po.status !== 'paid') return { success: false, error: '只有已支付的订单才能退款' };
        const amountCents = Math.round(Number(amount) * 100);
        const paymentCents = Math.round(Number(po.amount) * 100);
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
          return { success: false, error: '退款金额无效' };
        }
        if (amountCents > paymentCents) {
          return { success: false, error: '退款金额不能超过支付金额' };
        }
        if (amountCents !== paymentCents) {
          return { success: false, error: '当前仅支持整单退款' };
        }

        const result = await tx.run(
          `INSERT INTO refund_records
            (payment_order_id, refund_amount, refund_reason, refund_no, status)
           VALUES (?, ?, ?, ?, ?)`,
          [paymentOrderId, amount, reason || '无', refundNo, RefundStatus.REQUESTED]
        );
        await this._appendRefundHistory(tx, {
          refundId: result.lastID,
          fromStatus: null,
          toStatus: RefundStatus.REQUESTED,
          eventType: 'refund_requested',
          source: 'system',
          attemptCount: 0,
        });
        return {
          success: true,
          idempotent: false,
          refundId: result.lastID,
          refundNo,
          amount,
          status: RefundStatus.REQUESTED,
        };
      });
    } catch (error) {
      logger.error('创建退款请求失败', { paymentOrderId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async _appendRefundHistory(tx, {
    refundId,
    fromStatus,
    toStatus,
    eventType,
    source,
    actorId = null,
    attemptCount = 0,
    providerRefundId = null,
    externalReference = null,
    evidence = null,
    errorMessage = null,
  }) {
    await tx.run(
      `INSERT INTO refund_status_history
        (refund_id, from_status, to_status, event_type, source, actor_id,
         attempt_count, provider_refund_id, external_reference, evidence, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        refundId,
        fromStatus,
        toStatus,
        eventType,
        source,
        actorId,
        attemptCount,
        providerRefundId,
        externalReference,
        evidence,
        errorMessage,
      ]
    );
  }

  async _syncLinkedAfterSales(tx, refund, status, {
    actorType = 'payment_system',
    actorId = null,
    note,
    caseId = null,
    expectedVersion = null,
  } = {}) {
    const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
    let cases;
    try {
      cases = await tx.all(
        `SELECT * FROM after_sales_cases
         WHERE status = 'refund_processing'
           AND (refund_id = ? OR (refund_id IS NULL AND payment_order_id = ?))
         ${lockClause}`,
        [refund.id, refund.payment_order_id]
      );
    } catch (error) {
      if (/no such table|does not exist/i.test(error.message || '')) return [];
      throw error;
    }

    if (caseId !== null && !cases.some((entry) => Number(entry.id) === Number(caseId))) {
      throw new Error('关联售后申请不存在或不在退款处理中状态');
    }

    const updatedCases = [];
    for (const current of cases) {
      if (caseId !== null
        && Number(current.id) === Number(caseId)
        && expectedVersion !== null
        && Number(current.version) !== Number(expectedVersion)) {
        const conflict = new Error('售后申请已被更新，请刷新后重试');
        conflict.code = 'AFTER_SALES_VERSION_CONFLICT';
        throw conflict;
      }
      const nextCaseStatus = status === RefundStatus.SUCCESS ? 'completed' : 'refund_processing';
      if (current.refund_status === status
        && Number(current.refund_id || 0) === Number(refund.id)
        && current.status === nextCaseStatus) {
        updatedCases.push(current);
        continue;
      }

      const nextVersion = Number(current.version) + 1;
      const result = await tx.run(
        `UPDATE after_sales_cases
         SET status = ?, refund_id = ?, refund_status = ?, version = ?,
             resolution_note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ? AND version = ?`,
        [
          nextCaseStatus,
          refund.id,
          status,
          nextVersion,
          note,
          current.id,
          'refund_processing',
          current.version,
        ]
      );
      if (!result || result.changes !== 1) throw new Error('售后退款状态并发更新冲突');
      await tx.run(
        `INSERT INTO after_sales_history
          (case_id, from_status, to_status, actor_type, actor_id, note, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          current.id,
          'refund_processing',
          nextCaseStatus,
          actorType,
          actorId,
          note,
          nextVersion,
        ]
      );
      updatedCases.push(await tx.get('SELECT * FROM after_sales_cases WHERE id = ?', [current.id]));
    }
    return updatedCases;
  }

  async claimRefundAttempt(refundId, { leaseSeconds = 60, source = 'system' } = {}) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const leaseToken = crypto.randomUUID();
    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const refund = await tx.get(
        `SELECT rr.*, po.order_id, po.payment_method, po.status AS payment_status,
                po.transaction_id, po.amount AS payment_amount
         FROM refund_records rr
         JOIN payment_orders po ON po.id = rr.payment_order_id
         WHERE rr.id = ?${lockClause}`,
        [refundId]
      );
      if (!refund) return { success: false, error: '退款记录不存在' };
      if (!ATTEMPTABLE_REFUND_STATUSES.has(refund.status)) {
        return { success: true, claimed: false, refund, status: refund.status, idempotent: true };
      }
      if (refund.lease_token && Number(refund.lease_expires_at) > nowSeconds) {
        return { success: true, claimed: false, refund, status: refund.status, busy: true };
      }

      const nextAttemptCount = Number(refund.attempt_count || 0) + 1;
      const result = await tx.run(
        `UPDATE refund_records
         SET status = ?, attempt_count = ?, lease_token = ?, lease_expires_at = ?,
             last_attempt_at = CURRENT_TIMESTAMP, last_error = NULL
         WHERE id = ? AND status = ?`,
        [
          RefundStatus.PROCESSING,
          nextAttemptCount,
          leaseToken,
          nowSeconds + leaseSeconds,
          refundId,
          refund.status,
        ]
      );
      if (!result || result.changes !== 1) {
        return { success: false, error: '退款处理租约竞争失败' };
      }
      await this._appendRefundHistory(tx, {
        refundId,
        fromStatus: refund.status,
        toStatus: RefundStatus.PROCESSING,
        eventType: 'attempt_started',
        source,
        attemptCount: nextAttemptCount,
        providerRefundId: refund.provider_refund_id,
      });
      return {
        success: true,
        claimed: true,
        leaseToken,
        attemptCount: nextAttemptCount,
        refund: { ...refund, status: RefundStatus.PROCESSING, attempt_count: nextAttemptCount },
      };
    });
  }

  async completeRefundAttempt(refundId, leaseToken, {
    status,
    providerRefundId = null,
    error = null,
    nextReconcileAt = null,
    source = 'provider',
    eventType = 'provider_response',
    syncAfterSales = false,
  } = {}) {
    if (!refundStatuses.has(status) || status === RefundStatus.SUCCESS) {
      return { success: false, error: '退款状态无效' };
    }
    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT rr.*, po.order_id, po.payment_method, po.status AS payment_status
         FROM refund_records rr
         JOIN payment_orders po ON po.id = rr.payment_order_id
         WHERE rr.id = ?${lockClause}`,
        [refundId]
      );
      if (!current) return { success: false, error: '退款记录不存在' };
      if (current.status === RefundStatus.SUCCESS) {
        return { success: true, status: current.status, idempotent: true, outOfOrder: true };
      }
      if (current.lease_token !== leaseToken) {
        return { success: true, status: current.status, idempotent: true, outOfOrder: true };
      }

      const errorMessage = error ? safeErrorMessage(error) : null;
      const resolvedProviderRefundId = providerRefundId || current.provider_refund_id || null;
      const result = await tx.run(
        `UPDATE refund_records
         SET status = ?, provider_refund_id = ?, lease_token = NULL,
             lease_expires_at = NULL, next_reconcile_at = ?, last_error = ?
         WHERE id = ? AND lease_token = ?`,
        [status, resolvedProviderRefundId, nextReconcileAt, errorMessage, refundId, leaseToken]
      );
      if (!result || result.changes !== 1) {
        return { success: false, error: '退款处理租约已失效' };
      }
      await this._appendRefundHistory(tx, {
        refundId,
        fromStatus: current.status,
        toStatus: status,
        eventType,
        source,
        attemptCount: Number(current.attempt_count || 0),
        providerRefundId: resolvedProviderRefundId,
        errorMessage,
      });
      if (syncAfterSales) {
        await this._syncLinkedAfterSales(tx, current, status, {
          note: status === RefundStatus.MANUAL_REQUIRED
            ? '退款需要人工处理，自动流程未宣称成功'
            : status === RefundStatus.FAILED
              ? '支付提供方确认退款失败'
              : `退款对账状态：${status}`,
        });
      }
      return {
        success: true,
        refundId,
        status,
        providerRefundId: resolvedProviderRefundId,
      };
    });
  }

  async updateRefundStatus(refundId, status) {
    if (!refundStatuses.has(status) || status === RefundStatus.SUCCESS) {
      return { success: false, error: '退款状态无效' };
    }
    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await tx.get(
        `SELECT * FROM refund_records WHERE id = ?${lockClause}`,
        [refundId]
      );
      if (!current) return { success: false, error: '退款记录不存在' };
      if (current.status === status) {
        return { success: true, refundId, status, idempotent: true };
      }
      if (current.status === RefundStatus.SUCCESS) {
        return { success: true, refundId, status: current.status, idempotent: true, outOfOrder: true };
      }
      if (![RefundStatus.REQUESTED, RefundStatus.PROCESSING].includes(current.status)) {
        return { success: false, error: '退款状态转换冲突' };
      }
      await tx.run(
        `UPDATE refund_records
         SET status = ?, lease_token = NULL, lease_expires_at = NULL
         WHERE id = ? AND status = ?`,
        [status, refundId, current.status]
      );
      await this._appendRefundHistory(tx, {
        refundId,
        fromStatus: current.status,
        toStatus: status,
        eventType: 'status_updated',
        source: 'system',
        attemptCount: Number(current.attempt_count || 0),
        providerRefundId: current.provider_refund_id,
      });
      return { success: true, refundId, status };
    });
  }

  async syncRefundAfterSales(refundId) {
    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const refund = await tx.get(
        `SELECT rr.*, po.order_id, po.status AS payment_status, o.status AS order_status
         FROM refund_records rr
         JOIN payment_orders po ON po.id = rr.payment_order_id
         JOIN orders o ON o.id = po.order_id
         WHERE rr.id = ?${lockClause}`,
        [refundId]
      );
      if (!refund) return { success: false, error: '退款记录不存在' };
      if (!refundStatuses.has(refund.status)) {
        return { success: false, error: '退款状态无效' };
      }
      if (refund.status === RefundStatus.SUCCESS
        && (refund.payment_status !== 'refunded'
          || !['cancelled', 'refunded'].includes(refund.order_status))) {
        return {
          success: false,
          error: '退款成功记录与本地支付或订单状态不一致',
        };
      }
      const cases = await this._syncLinkedAfterSales(tx, refund, refund.status, {
        note: refund.status === RefundStatus.SUCCESS
          ? '退款、支付、订单与售后状态已完成事务一致性同步'
          : `退款对账状态：${refund.status}`,
      });
      return { success: true, refundId, status: refund.status, cases };
    });
  }

  async settleRefundSuccess(refundId, {
    leaseToken = null,
    providerRefundId = null,
    syncAfterSales = false,
  } = {}) {
    let refundContext = { refundId, provider: 'unknown' };
    try {
      const result = await this.db.transaction(async (tx) => {
        const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
        const refund = await tx.get(
          `SELECT rr.*, po.order_id, po.payment_method, po.status AS payment_status
           FROM refund_records rr
           JOIN payment_orders po ON po.id = rr.payment_order_id
           WHERE rr.id = ?${lockClause}`,
          [refundId]
        );
        if (!refund) return { success: false, error: '退款记录不存在' };
        refundContext = {
          refundId,
          refundNo: refund.refund_no,
          paymentOrderId: refund.payment_order_id,
          orderId: refund.order_id,
          provider: refund.payment_method || 'unknown',
        };
        if (refund.status === RefundStatus.SUCCESS && refund.payment_status === 'refunded') {
          return { success: true, refund, idempotent: true };
        }
        if (leaseToken && refund.lease_token !== leaseToken) {
          return {
            success: true,
            refund,
            status: refund.status,
            idempotent: true,
            outOfOrder: true,
          };
        }
        if (![RefundStatus.REQUESTED, RefundStatus.PROCESSING].includes(refund.status)
          || refund.payment_status !== 'paid') {
          return { success: false, error: '退款状态不允许确认成功' };
        }

        const paymentResult = await tx.run(
          'UPDATE payment_orders SET status = ? WHERE id = ? AND status = ?',
          ['refunded', refund.payment_order_id, 'paid']
        );
        if (!paymentResult || paymentResult.changes !== 1) {
          return { success: false, error: '支付单退款状态更新冲突' };
        }
        const refundResult = await tx.run(
          `UPDATE refund_records
           SET status = ?, provider_refund_id = ?, refunded_at = CURRENT_TIMESTAMP,
               lease_token = NULL, lease_expires_at = NULL, next_reconcile_at = NULL,
               last_error = NULL
           WHERE id = ? AND status IN (?, ?)`,
          [
            RefundStatus.SUCCESS,
            providerRefundId || refund.provider_refund_id || null,
            refundId,
            RefundStatus.REQUESTED,
            RefundStatus.PROCESSING,
          ]
        );
        if (!refundResult || refundResult.changes !== 1) {
          throw new Error('退款记录状态已被并发更新');
        }
        await this._appendRefundHistory(tx, {
          refundId,
          fromStatus: refund.status,
          toStatus: RefundStatus.SUCCESS,
          eventType: 'provider_confirmed_success',
          source: 'provider',
          attemptCount: Number(refund.attempt_count || 0),
          providerRefundId: providerRefundId || refund.provider_refund_id || null,
        });
        const lifecycleResult = await this.orderLifecycle.markRefunded(refund.order_id, tx);
        if (syncAfterSales) {
          await this._syncLinkedAfterSales(tx, refund, RefundStatus.SUCCESS, {
            note: '支付提供方已确认退款成功并完成本地事务同步',
          });
        }
        return { success: true, refund, idempotent: false, lifecycleResult };
      });
      if (!result.success) return result;

      if (result.outOfOrder) {
        return {
          success: true,
          refundId,
          status: result.status,
          idempotent: true,
          outOfOrder: true,
        };
      }

      if (result.lifecycleResult) {
        this.orderLifecycle.finalize(result.refund.order_id, result.lifecycleResult);
      }
      logger.info('退款结算成功', {
        paymentOrderId: result.refund.payment_order_id,
        orderId: result.refund.order_id,
        refundNo: result.refund.refund_no,
        amount: result.refund.refund_amount,
      });
      if (!result.idempotent) this.audit.refundSucceeded(refundContext);
      return {
        success: true,
        refundId,
        refundNo: result.refund.refund_no,
        amount: result.refund.refund_amount,
        status: RefundStatus.SUCCESS,
        message: '退款成功',
        idempotent: result.idempotent,
      };
    } catch (error) {
      logger.error('退款结算失败', { refundId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async recordManualRefundDecision(refundId, {
    status,
    adminId,
    evidence,
    externalReference,
    caseId = null,
    expectedVersion = null,
  }) {
    if (![RefundStatus.MANUAL_REQUIRED, RefundStatus.FAILED].includes(status)) {
      return { success: false, error: '人工处理状态无效' };
    }
    return this.db.transaction(async (tx) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const refund = await tx.get(
        `SELECT rr.*, po.order_id, po.payment_method, po.status AS payment_status
         FROM refund_records rr
         JOIN payment_orders po ON po.id = rr.payment_order_id
         WHERE rr.id = ?${lockClause}`,
        [refundId]
      );
      if (!refund) return { success: false, error: '退款记录不存在' };
      if (refund.status === RefundStatus.SUCCESS) {
        return { success: false, error: '已成功的退款不能改为人工处理状态' };
      }
      const sameDecision = refund.status === status
        && refund.external_reference === externalReference
        && refund.manual_evidence === evidence;
      if (sameDecision) {
        return { success: true, refundId, status, idempotent: true };
      }

      await tx.run(
        `UPDATE refund_records
         SET status = ?, lease_token = NULL, lease_expires_at = NULL,
             next_reconcile_at = NULL, manual_evidence = ?, external_reference = ?
         WHERE id = ?`,
        [status, evidence, externalReference, refundId]
      );
      await this._appendRefundHistory(tx, {
        refundId,
        fromStatus: refund.status,
        toStatus: status,
        eventType: 'manual_decision',
        source: 'admin',
        actorId: adminId,
        attemptCount: Number(refund.attempt_count || 0),
        providerRefundId: refund.provider_refund_id,
        externalReference,
        evidence,
      });
      await this._syncLinkedAfterSales(tx, refund, status, {
        actorType: 'admin',
        actorId: adminId,
        note: status === RefundStatus.MANUAL_REQUIRED
          ? `退款转人工处理，外部参考号：${externalReference}`
          : `人工核对确认退款失败，外部参考号：${externalReference}`,
        caseId,
        expectedVersion,
      });
      return { success: true, refundId, status };
    });
  }

  async settleManualRefundSuccess(refundId, {
    adminId,
    evidence,
    externalReference,
    caseId = null,
    expectedVersion = null,
  }) {
    let context = { refundId, provider: 'unknown', manual: true, adminId };
    try {
      const result = await this.db.transaction(async (tx) => {
        const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
        const refund = await tx.get(
          `SELECT rr.*, po.order_id, po.payment_method, po.status AS payment_status
           FROM refund_records rr
           JOIN payment_orders po ON po.id = rr.payment_order_id
           WHERE rr.id = ?${lockClause}`,
          [refundId]
        );
        if (!refund) return { success: false, error: '退款记录不存在' };
        context = {
          ...context,
          refundNo: refund.refund_no,
          paymentOrderId: refund.payment_order_id,
          orderId: refund.order_id,
          provider: refund.payment_method || 'unknown',
          externalReference,
        };
        if (refund.status === RefundStatus.SUCCESS && refund.payment_status === 'refunded') {
          return { success: true, refund, idempotent: true };
        }
        if (refund.status !== RefundStatus.MANUAL_REQUIRED || refund.payment_status !== 'paid') {
          return { success: false, error: '只有需要人工处理的已支付退款才能人工确认完成' };
        }

        const paymentResult = await tx.run(
          'UPDATE payment_orders SET status = ? WHERE id = ? AND status = ?',
          ['refunded', refund.payment_order_id, 'paid']
        );
        if (!paymentResult || paymentResult.changes !== 1) {
          return { success: false, error: '支付单人工退款状态更新冲突' };
        }
        const refundResult = await tx.run(
          `UPDATE refund_records
           SET status = ?, refunded_at = CURRENT_TIMESTAMP, lease_token = NULL,
               lease_expires_at = NULL, next_reconcile_at = NULL, last_error = NULL,
               manual_evidence = ?, external_reference = ?, manual_completed_by = ?,
               manual_completed_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = ?`,
          [
            RefundStatus.SUCCESS,
            evidence,
            externalReference,
            adminId,
            refundId,
            RefundStatus.MANUAL_REQUIRED,
          ]
        );
        if (!refundResult || refundResult.changes !== 1) {
          throw new Error('退款记录人工确认状态已被并发更新');
        }
        await this._appendRefundHistory(tx, {
          refundId,
          fromStatus: RefundStatus.MANUAL_REQUIRED,
          toStatus: RefundStatus.SUCCESS,
          eventType: 'manual_completion_confirmed',
          source: 'admin',
          actorId: adminId,
          attemptCount: Number(refund.attempt_count || 0),
          providerRefundId: refund.provider_refund_id,
          externalReference,
          evidence,
        });
        const lifecycleResult = await this.orderLifecycle.markRefunded(refund.order_id, tx);
        await this._syncLinkedAfterSales(tx, refund, RefundStatus.SUCCESS, {
          actorType: 'admin',
          actorId: adminId,
          note: `人工凭证已核验，退款完成；外部参考号：${externalReference}`,
          caseId,
          expectedVersion,
        });
        return { success: true, refund, lifecycleResult, idempotent: false };
      });
      if (!result.success) return result;
      if (result.lifecycleResult) {
        this.orderLifecycle.finalize(result.refund.order_id, result.lifecycleResult);
      }
      if (!result.idempotent) this.audit.refundSucceeded(context);
      return {
        success: true,
        refundId,
        refundNo: result.refund.refund_no,
        status: RefundStatus.SUCCESS,
        message: '人工退款凭证已确认，订单与支付状态已事务同步',
        idempotent: result.idempotent,
      };
    } catch (error) {
      logger.error('人工退款事务确认失败', { refundId, error: error.message });
      return { success: false, error: error.message, code: error.code };
    }
  }

  async settleRefund(paymentOrderId, { amount, reason, refundNo } = {}) {
    const request = await this.requestRefund(paymentOrderId, { amount, reason, refundNo });
    if (!request.success) return request;
    return this.settleRefundSuccess(request.refundId);
  }

  async settleFailed(paymentOrderId) {
    try {
      const result = await this.db.run(
        'UPDATE payment_orders SET status = ? WHERE id = ? AND status IN (?, ?)',
        ['failed', paymentOrderId, 'pending', 'processing']
      );
      if (!result || result.changes !== 1) {
        const current = await this.db.get(
          'SELECT status FROM payment_orders WHERE id = ?',
          [paymentOrderId]
        );
        if (current?.status === 'failed') {
          return { success: true, paymentOrderId, status: 'failed', idempotent: true };
        }
        return {
          success: false,
          paymentOrderId,
          status: current?.status,
          error: current ? '当前支付状态不允许标记失败' : '支付订单不存在',
        };
      }
      logger.info('支付创建失败已记录', { paymentOrderId });
      return { success: true, paymentOrderId, status: 'failed' };
    } catch (err) {
      logger.error('记录支付失败状态出错', { paymentOrderId, error: err.message });
      return { success: false, error: err.message };
    }
  }
}

module.exports = PaymentSettlement;
