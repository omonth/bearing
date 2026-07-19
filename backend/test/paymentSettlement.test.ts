import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedTestData } from './helpers';
import PaymentSettlement from '../services/payment/PaymentSettlement';
import OrderLifecycleAdapter from '../services/payment/OrderLifecycleAdapter';

function createMockOrderService() {
  const calls: any[] = [];
  return {
    calls,
    updateOrderStatusInTransaction: async ({ orderId, status, note }: any) => {
      calls.push({ orderId, status, note });
      return { oldStatus: 'pending', newStatus: status, restoredStock: false, updated: true };
    },
    settleRefundInTransaction: async ({ orderId, note }: any) => {
      calls.push({ orderId, status: 'cancelled', note });
      return { oldStatus: 'paid', newStatus: 'cancelled', restoredStock: true, updated: true };
    },
    settleRefund: async (orderId: number, note?: string) => {
      calls.push({ orderId, status: 'cancelled', note });
      return { oldStatus: 'paid', newStatus: 'cancelled', restoredStock: true, updated: true };
    },
    finalizeOrderStatusUpdate: () => {},
    updateOrderStatus: async (orderId: number, status: string, note?: string) => {
      calls.push({ orderId, status, note });
      return { data: { oldStatus: 'pending', newStatus: status }, error: null };
    },
  };
}

async function setupSettlement() {
  const db = await createTestDb();
  await seedTestData(db);

  await db.run(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      transaction_id TEXT,
      trade_no TEXT,
      payer_info TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS refund_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_order_id INTEGER NOT NULL,
      refund_amount REAL NOT NULL,
      refund_reason TEXT,
      status TEXT DEFAULT 'pending',
      refund_no TEXT,
      provider_refund_id TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT,
      lease_expires_at INTEGER,
      next_reconcile_at INTEGER,
      last_attempt_at TEXT,
      last_error TEXT,
      manual_evidence TEXT,
      external_reference TEXT,
      manual_completed_by INTEGER,
      manual_completed_at TEXT,
      refunded_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS refund_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, refund_id INTEGER NOT NULL,
      from_status TEXT, to_status TEXT NOT NULL, event_type TEXT NOT NULL,
      source TEXT NOT NULL, actor_id INTEGER, attempt_count INTEGER DEFAULT 0,
      provider_refund_id TEXT, external_reference TEXT, evidence TEXT,
      error_message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const mockOrderService = createMockOrderService();
  const adapter = new OrderLifecycleAdapter(mockOrderService);
  const settlement = new PaymentSettlement(db, adapter);

  return { db, settlement, mockOrderService };
}

async function createTestOrder(db: any, status = 'pending') {
  const result = await db.run(
    'INSERT INTO orders (customer_name, customer_phone, province, city, district, address_detail, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['测试用户', '13800000000', '浙江', '杭州', '西湖区', '测试路1号', 100, status]
  );
  return result.lastID;
}

async function createTestPayment(db: any, orderId: number, status = 'pending', amount = 100) {
  const result = await db.run(
    'INSERT INTO payment_orders (order_id, payment_method, amount, status, transaction_id) VALUES (?, ?, ?, ?, ?)',
    [orderId, 'alipay', amount, status, `PAY${Date.now()}`]
  );
  return result.lastID;
}

describe('PaymentSettlement', () => {
  describe('settlePaid', () => {
    it('should transition from pending to paid', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'pending');

      const result = await settlement.settlePaid(paymentId, { tradeNo: 'TRADE123', payer: { id: 'buyer1' } });

      expect(result.success).toBe(true);
      expect(result.status).toBe('paid');
      expect(result.idempotent).toBe(false);

      const po: any = await db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentId]);
      expect(po.status).toBe('paid');
      expect(po.trade_no).toBe('TRADE123');
      expect(po.paid_at).toBeTruthy();

      expect(mockOrderService.calls).toHaveLength(1);
      expect(mockOrderService.calls[0]).toEqual({ orderId, status: 'paid', note: '支付成功' });

      await db.close();
    });

    it('should return idempotent result for duplicate paid event', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'pending');

      await settlement.settlePaid(paymentId, { tradeNo: 'TRADE1' });
      mockOrderService.calls.length = 0;

      const result = await settlement.settlePaid(paymentId, { tradeNo: 'TRADE2' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('paid');
      expect(result.idempotent).toBe(true);

      expect(mockOrderService.calls).toHaveLength(0);

      await db.close();
    });

    it('should reject paid event when payment is refunded', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'refunded');

      const result = await settlement.settlePaid(paymentId, { tradeNo: 'TRADE_LATE' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('退款');
      expect(result.status).toBe('refunded');

      expect(mockOrderService.calls).toHaveLength(0);

      await db.close();
    });

    it('should reject paid event for failed payment', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'failed');

      const result = await settlement.settlePaid(paymentId, { tradeNo: 'TRADE' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('不允许结算');

      expect(mockOrderService.calls).toHaveLength(0);

      await db.close();
    });

    it('should return error for nonexistent payment', async () => {
      const { db, settlement } = await setupSettlement();

      const result = await settlement.settlePaid(99999, { tradeNo: 'TRADE' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('支付订单不存在');

      await db.close();
    });

    it('should transition from processing to paid (COD)', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'processing');

      const result = await settlement.settlePaid(paymentId, { tradeNo: 'TRADE_COD' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('paid');
      expect(mockOrderService.calls).toHaveLength(1);

      await db.close();
    });
  });

  describe('settleRefund', () => {
    it('should refund a paid payment and cancel the order', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db, 'paid');
      const paymentId = await createTestPayment(db, orderId, 'paid', 100);

      const result = await settlement.settleRefund(paymentId, { amount: 100, reason: '测试退款', refundNo: 'REF123' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
      expect(result.refundNo).toBe('REF123');

      const po: any = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentId]);
      expect(po.status).toBe('refunded');

      const refund: any = await db.get('SELECT * FROM refund_records WHERE payment_order_id = ?', [paymentId]);
      expect(refund).toBeTruthy();
      expect(refund.refund_amount).toBe(100);
      expect(refund.refund_reason).toBe('测试退款');
      expect(refund.status).toBe('success');

      expect(mockOrderService.calls).toHaveLength(1);
      expect(mockOrderService.calls[0]).toEqual({ orderId, status: 'cancelled', note: '退款结算完成' });

      await db.close();
    });

    it('should reject refund for pending payment', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'pending');

      const result = await settlement.settleRefund(paymentId, { amount: 50, reason: 'test', refundNo: 'REF' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('只有已支付的订单才能退款');
      expect(mockOrderService.calls).toHaveLength(0);

      await db.close();
    });

    it('should reject refund for already refunded payment', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db, 'cancelled');
      const paymentId = await createTestPayment(db, orderId, 'refunded');

      const result = await settlement.settleRefund(paymentId, { amount: 50, reason: 'test', refundNo: 'REF' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('只有已支付的订单才能退款');
      expect(mockOrderService.calls).toHaveLength(0);

      await db.close();
    });

    it('should reject refund amount exceeding payment amount', async () => {
      const { db, settlement, mockOrderService } = await setupSettlement();
      const orderId = await createTestOrder(db, 'paid');
      const paymentId = await createTestPayment(db, orderId, 'paid', 100);

      const result = await settlement.settleRefund(paymentId, { amount: 200, reason: 'test', refundNo: 'REF' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('退款金额不能超过支付金额');
      expect(mockOrderService.calls).toHaveLength(0);

      await db.close();
    });

    it('should reject refund for nonexistent payment', async () => {
      const { db, settlement } = await setupSettlement();

      const result = await settlement.settleRefund(99999, { amount: 50, reason: 'test', refundNo: 'REF' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('支付订单不存在');

      await db.close();
    });

    it('locks the refund rows and aborts settlement when a concurrent decision wins', async () => {
      const tx = {
        get: vi.fn().mockResolvedValue({
          id: 71,
          payment_order_id: 81,
          refund_no: 'REF-RACE-71',
          refund_amount: 100,
          status: 'processing',
          lease_token: 'lease-new',
          attempt_count: 2,
          provider_refund_id: null,
          order_id: 91,
          payment_method: 'wechat',
          payment_status: 'paid',
        }),
        run: vi.fn()
          .mockResolvedValueOnce({ changes: 1 })
          .mockResolvedValueOnce({ changes: 0 }),
      };
      const db = {
        type: 'postgres',
        transaction: (callback: (transaction: any) => Promise<any>) => callback(tx),
      };
      const orderLifecycle = {
        markRefunded: vi.fn(),
        finalize: vi.fn(),
      };
      const settlement = new PaymentSettlement(db as any, orderLifecycle as any);

      const result = await settlement.settleRefundSuccess(71, {
        leaseToken: 'lease-new',
        providerRefundId: 'WX-RACE-WINNER',
      });

      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: '退款记录状态已被并发更新',
      }));
      expect(tx.get.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(tx.run.mock.calls[1][0]).toContain('status IN');
      expect(orderLifecycle.markRefunded).not.toHaveBeenCalled();
      expect(orderLifecycle.finalize).not.toHaveBeenCalled();
    });
  });

  describe('settleFailed', () => {
    it('should mark payment as failed', async () => {
      const { db, settlement } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'pending');

      const result = await settlement.settleFailed(paymentId);

      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');

      const po: any = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentId]);
      expect(po.status).toBe('failed');

      await db.close();
    });

    it('should not downgrade a paid payment when an earlier failure arrives late', async () => {
      const { db, settlement } = await setupSettlement();
      const orderId = await createTestOrder(db, 'paid');
      const paymentId = await createTestPayment(db, orderId, 'paid');

      const result = await settlement.settleFailed(paymentId);

      const payment: any = await db.get(
        'SELECT status FROM payment_orders WHERE id = ?',
        [paymentId]
      );
      expect({ result, payment }).toEqual({
        result: {
          success: false,
          paymentOrderId: paymentId,
          status: 'paid',
          error: '当前支付状态不允许标记失败',
        },
        payment: { status: 'paid' },
      });

      await db.close();
    });
  });

  describe('getPaymentOrder', () => {
    it('should return payment order by id', async () => {
      const { db, settlement } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'pending', 50);

      const po = await settlement.getPaymentOrder(paymentId);

      expect(po).toBeTruthy();
      expect(po.id).toBe(paymentId);
      expect(po.order_id).toBe(orderId);
      expect(po.amount).toBe(50);
      expect(po.status).toBe('pending');

      await db.close();
    });

    it('should return null for nonexistent payment', async () => {
      const { db, settlement } = await setupSettlement();

      const po = await settlement.getPaymentOrder(99999);

      expect(po).toBeNull();

      await db.close();
    });
  });

  describe('OrderLifecycleAdapter', () => {
    it('should throw if orderService is missing', () => {
      expect(() => new OrderLifecycleAdapter(null as any)).toThrow('OrderLifecycleAdapter requires an orderService instance');
    });

    it('should delegate markPaid to orderService.updateOrderStatus', async () => {
      const mock = createMockOrderService();
      const adapter = new OrderLifecycleAdapter(mock);

      await adapter.markPaid(42);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]).toEqual({ orderId: 42, status: 'paid', note: '支付成功' });
    });

    it('should delegate refund settlement to the order refund lifecycle', async () => {
      const mock = createMockOrderService();
      const adapter = new OrderLifecycleAdapter(mock);

      await adapter.markRefunded(42);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]).toEqual({ orderId: 42, status: 'cancelled', note: '退款结算完成' });
    });
  });
});
