import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestData } from './helpers';
import PaymentSettlement from '../services/payment/PaymentSettlement';
import OrderLifecycleAdapter from '../services/payment/OrderLifecycleAdapter';

function createMockOrderService() {
  const calls: any[] = [];
  return {
    calls,
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
      refunded_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
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

      const po = await db.get('SELECT * FROM payment_orders WHERE id = ?', [paymentId]);
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

      const po = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentId]);
      expect(po.status).toBe('refunded');

      const refund = await db.get('SELECT * FROM refund_records WHERE payment_order_id = ?', [paymentId]);
      expect(refund).toBeTruthy();
      expect(refund.refund_amount).toBe(100);
      expect(refund.refund_reason).toBe('测试退款');
      expect(refund.status).toBe('success');

      expect(mockOrderService.calls).toHaveLength(1);
      expect(mockOrderService.calls[0]).toEqual({ orderId, status: 'cancelled', note: '退款取消' });

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
  });

  describe('settleFailed', () => {
    it('should mark payment as failed', async () => {
      const { db, settlement } = await setupSettlement();
      const orderId = await createTestOrder(db);
      const paymentId = await createTestPayment(db, orderId, 'pending');

      const result = await settlement.settleFailed(paymentId);

      expect(result.success).toBe(true);
      expect(result.status).toBe('failed');

      const po = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentId]);
      expect(po.status).toBe('failed');

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

    it('should delegate markCancelled to orderService.updateOrderStatus', async () => {
      const mock = createMockOrderService();
      const adapter = new OrderLifecycleAdapter(mock);

      await adapter.markCancelled(42);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]).toEqual({ orderId: 42, status: 'cancelled', note: '退款取消' });
    });
  });
});
