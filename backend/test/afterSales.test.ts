import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createTestDb } from './helpers';

const AfterSalesService = require('../services/afterSalesService');
const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');
const UnionPayProvider = require('../services/payment/providers/UnionPayProvider');
const afterSalesMigration = require('../migrations/202607190020_after_sales_logistics_invoices');
const { generateCustomerToken, generateToken } = require('../middleware/auth');

async function createFixture() {
  const db = await createTestDb();
  const customerPasswordHash = await bcrypt.hash('customer-session-password', 10);
  await db.run(
    'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
    ['admin', customerPasswordHash, 'admin@example.test', 'admin']
  );
  await db.run(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT,
      status TEXT DEFAULT 'active',
      phone_verified_at BIGINT
    )
  `);
  await db.run(`
    CREATE TABLE payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      transaction_id TEXT
    )
  `);
  await db.run(`
    CREATE TABLE refund_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_order_id INTEGER NOT NULL,
      refund_amount REAL NOT NULL,
      refund_reason TEXT,
      status TEXT NOT NULL,
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
      refunded_at TEXT
    )
  `);
  await db.run(`
    CREATE TABLE refund_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, refund_id INTEGER NOT NULL,
      from_status TEXT, to_status TEXT NOT NULL, event_type TEXT NOT NULL,
      source TEXT NOT NULL, actor_id INTEGER, attempt_count INTEGER DEFAULT 0,
      provider_refund_id TEXT, external_reference TEXT, evidence TEXT,
      error_message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await afterSalesMigration.up({ db, dialect: 'sqlite' });

  await db.run(
    'INSERT INTO customers (name, phone, password, phone_verified_at) VALUES (?, ?, ?, ?)',
    ['顾客一', '13800000001', customerPasswordHash, 2_000_000_000]
  );
  await db.run(
    'INSERT INTO customers (name, phone, password, phone_verified_at) VALUES (?, ?, ?, ?)',
    ['顾客二', '13800000002', customerPasswordHash, 2_000_000_000]
  );
  await db.run(
    `INSERT INTO orders
       (customer_name, customer_phone, province, city, address_detail, total_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['顾客一', '13800000001', '浙江', '杭州', '测试路 1 号', 100, 'paid']
  );
  await db.run(
    `INSERT INTO orders
       (customer_name, customer_phone, province, city, address_detail, total_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['顾客二', '13800000002', '浙江', '杭州', '测试路 2 号', 80, 'paid']
  );
  await db.run(
    `INSERT INTO payment_orders
       (order_id, payment_method, amount, status, transaction_id)
     VALUES (?, ?, ?, ?, ?)`,
    [1, 'wechat', 100, 'paid', 'WX-ORDER-1']
  );

  return { db, service: new AfterSalesService({ db }), customerPasswordHash };
}

describe('After-sales commercial service', () => {
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await fixture.db.close();
  });

  it('creates one customer-owned case for exact idempotent retries', async () => {
    const input = {
      clientRequestId: 'case-request-0001',
      orderId: 1,
      type: 'refund_only',
      reason: '商品规格不符',
      description: '收到的轴承规格与订单不一致，需要整单退款。',
      requestedAmount: 100,
    };

    const created = await fixture.service.createCase(1, input);
    const retried = await fixture.service.createCase(1, input);
    const detail = await fixture.service.getCaseForCustomer(1, created.id);

    expect({ created, retried, detail }).toEqual({
      created: expect.objectContaining({
        id: expect.any(Number),
        caseNo: expect.stringMatching(/^AS-/),
        status: 'submitted',
        version: 1,
        idempotent: false,
      }),
      retried: expect.objectContaining({
        id: created.id,
        caseNo: created.caseNo,
        status: 'submitted',
        version: 1,
        idempotent: true,
      }),
      detail: expect.objectContaining({
        id: created.id,
        customerId: 1,
        orderId: 1,
        status: 'submitted',
        history: [
          expect.objectContaining({
            fromStatus: null,
            toStatus: 'submitted',
            actorType: 'customer',
            actorId: 1,
            version: 1,
          }),
        ],
      }),
    });

    await expect(fixture.service.createCase(1, {
      ...input,
      description: '复用同一个幂等键但修改载荷时必须被拒绝，不能覆盖原申请。',
    })).rejects.toMatchObject({ statusCode: 409 });
    await expect(fixture.service.createCase(2, {
      ...input,
      clientRequestId: 'case-request-other-owner',
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lists only the customer cases and lets the owner cancel a submitted support ticket', async () => {
    const created = await fixture.service.createCase(1, {
      clientRequestId: 'support-request-0001',
      type: 'order_exception',
      reason: '异常订单咨询',
      description: '订单号暂时无法确认，请客服协助人工核对。',
    });

    const beforeCancel = await fixture.service.listCasesForCustomer(1);
    const cancelled = await fixture.service.cancelCaseForCustomer(1, created.id, 1);
    const otherCustomerCases = await fixture.service.listCasesForCustomer(2);

    expect({ beforeCancel, cancelled, otherCustomerCases }).toEqual({
      beforeCancel: [expect.objectContaining({ id: created.id, orderId: null })],
      cancelled: expect.objectContaining({
        id: created.id,
        status: 'cancelled',
        version: 2,
      }),
      otherCustomerCases: [],
    });

    await expect(
      fixture.service.getCaseForCustomer(2, created.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('uses optimistic versions for admin review without fabricating a payment refund', async () => {
    const created = await fixture.service.createCase(1, {
      clientRequestId: 'case-review-0001',
      orderId: 1,
      type: 'refund_only',
      reason: '商品与描述不符',
      description: '商品与页面规格描述不一致，申请整单退款处理。',
      requestedAmount: 100,
    });

    const underReview = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 1,
      status: 'under_review',
      adminId: 9,
      note: '开始审核凭证',
    });
    await expect(fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 1,
      status: 'approved',
      adminId: 9,
      note: '旧请求不应覆盖新状态',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'AFTER_SALES_VERSION_CONFLICT',
    });
    const approved = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: underReview.version,
      status: 'approved',
      adminId: 9,
      note: '审核通过，等待发起真实退款',
    });
    const detail = await fixture.service.getCaseForAdmin(created.id);
    const payment = await fixture.db.get('SELECT status FROM payment_orders WHERE id = ?', [1]);
    const refunds = await fixture.db.all('SELECT * FROM refund_records');
    const order = await fixture.db.get('SELECT status FROM orders WHERE id = ?', [1]);

    expect({ approved, detail, payment, refunds, order }).toEqual({
      approved: expect.objectContaining({ status: 'approved', version: 3 }),
      detail: expect.objectContaining({
        status: 'approved',
        history: [
          expect.objectContaining({ toStatus: 'submitted', version: 1 }),
          expect.objectContaining({ toStatus: 'under_review', version: 2 }),
          expect.objectContaining({
            fromStatus: 'under_review',
            toStatus: 'approved',
            actorType: 'admin',
            actorId: 9,
            version: 3,
          }),
        ],
      }),
      payment: { status: 'paid' },
      refunds: [],
      order: { status: 'paid' },
    });
  });

  it('completes a refund case only after the unified payment workflow confirms local settlement', async () => {
    const paymentWorkflow = {
      async createRefund({ paymentOrderId, amount, reason }: any) {
        const result: any = await fixture.db.run(
          `INSERT INTO refund_records
             (payment_order_id, refund_amount, refund_reason, status, refund_no)
           VALUES (?, ?, ?, ?, ?)`,
          [paymentOrderId, amount, reason, 'processing', 'RF-AFTER-SALES-1']
        );
        return {
          paymentOrderId,
          refundId: result.lastID,
          refundNo: 'RF-AFTER-SALES-1',
          amount,
          status: 'processing',
        };
      },
      async confirmRefund() {
        await fixture.db.transaction(async (tx: any) => {
          await tx.run('UPDATE refund_records SET status = ? WHERE id = ?', ['success', 1]);
          await tx.run('UPDATE payment_orders SET status = ? WHERE id = ?', ['refunded', 1]);
          await tx.run('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', 1]);
        });
      },
    };
    fixture.service = new AfterSalesService({
      db: fixture.db,
      paymentOrchestrator: paymentWorkflow,
    });
    const created = await fixture.service.createCase(1, {
      clientRequestId: 'case-refund-0001',
      orderId: 1,
      type: 'refund_only',
      reason: '整单退款申请',
      description: '商品未使用且符合整单退款条件，请按原支付渠道退款。',
      requestedAmount: 100,
    });
    await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 1,
      status: 'under_review',
      adminId: 9,
      note: '审核退款条件',
    });
    const approved = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 2,
      status: 'approved',
      adminId: 9,
      note: '审核通过但尚未退款',
    });

    const processing = await fixture.service.initiateRefund({
      caseId: created.id,
      expectedVersion: approved.version,
      adminId: 9,
      note: '提交统一支付退款流程',
    });
    await expect(fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: processing.version,
      status: 'completed',
      adminId: 9,
      note: '禁止人工伪造退款成功',
    })).rejects.toMatchObject({ code: 'REFUND_NOT_CONFIRMED' });

    await paymentWorkflow.confirmRefund();
    const completed = await fixture.service.syncRefundStatus({
      caseId: created.id,
      expectedVersion: processing.version,
      adminId: 9,
    });

    expect({ processing, completed }).toEqual({
      processing: expect.objectContaining({
        status: 'refund_processing',
        refundStatus: 'processing',
        paymentOrderId: 1,
        refundId: 1,
      }),
      completed: expect.objectContaining({
        status: 'completed',
        refundStatus: 'success',
        version: processing.version + 1,
      }),
    });
  });

  it('atomically synchronizes finance, fulfilled order, and after-sales on provider success', async () => {
    await fixture.db.run('UPDATE orders SET status = ? WHERE id = ?', ['shipped', 1]);
    const paymentOrchestrator = new PaymentOrchestrator(
      fixture.db,
      new OrderService(fixture.db)
    );
    paymentOrchestrator.providers.wechat = {
      createRefund: async () => ({
        status: 'success',
        providerRefundId: 'WX-AFTER-SALES-ATOMIC-1',
      }),
    };
    fixture.service = new AfterSalesService({ db: fixture.db, paymentOrchestrator });
    const created = await fixture.service.createCase(1, {
      clientRequestId: 'case-refund-atomic-success',
      orderId: 1,
      type: 'refund_only',
      reason: '已履约订单整单退款',
      description: '验证支付、退款、已发货订单和售后申请在同一本地事务中完成同步。',
      requestedAmount: 100,
    });
    const underReview = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: created.version,
      status: 'under_review',
      adminId: 9,
      note: '开始审核原路退款',
    });
    const approved = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: underReview.version,
      status: 'approved',
      adminId: 9,
      note: '批准整单退款',
    });

    const completed = await fixture.service.initiateRefund({
      caseId: created.id,
      expectedVersion: approved.version,
      adminId: 9,
      note: '提交统一支付退款流程',
    });

    expect({
      completed,
      payment: await fixture.db.get('SELECT status FROM payment_orders WHERE id = ?', [1]),
      order: await fixture.db.get('SELECT status FROM orders WHERE id = ?', [1]),
      refund: await fixture.db.get('SELECT status FROM refund_records WHERE id = ?', [completed.refundId]),
    }).toEqual({
      completed: expect.objectContaining({
        status: 'completed',
        refundStatus: 'success',
        refundId: expect.any(Number),
      }),
      payment: { status: 'refunded' },
      order: { status: 'refunded' },
      refund: { status: 'success' },
    });
  });

  it('syncs an explicit provider refund failure without completing the after-sales case', async () => {
    const paymentOrchestrator = new PaymentOrchestrator(
      fixture.db,
      new OrderService(fixture.db)
    );
    paymentOrchestrator.providers.wechat = {
      createRefund: async () => ({ status: 'processing', providerRefundId: 'WX-PENDING-FAIL' }),
      queryRefund: async () => ({ status: 'failed', providerRefundId: 'WX-PENDING-FAIL' }),
    };
    fixture.service = new AfterSalesService({ db: fixture.db, paymentOrchestrator });
    const created = await fixture.service.createCase(1, {
      clientRequestId: 'case-refund-provider-failed',
      orderId: 1,
      type: 'refund_only',
      reason: '退款失败同步验证',
      description: '支付提供方明确返回失败时，售后必须显示失败且不能伪造完成。',
      requestedAmount: 100,
    });
    await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 1,
      status: 'under_review',
      adminId: 9,
      note: '审核退款失败同步场景',
    });
    const approved = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 2,
      status: 'approved',
      adminId: 9,
      note: '批准提交真实退款',
    });
    const processing = await fixture.service.initiateRefund({
      caseId: created.id,
      expectedVersion: approved.version,
      adminId: 9,
      note: '提交支付提供方',
    });
    const failed = await fixture.service.syncRefundStatus({
      caseId: created.id,
      expectedVersion: processing.version,
      adminId: 9,
    });

    const payment = await fixture.db.get('SELECT status FROM payment_orders WHERE id = ?', [1]);
    const order = await fixture.db.get('SELECT status FROM orders WHERE id = ?', [1]);
    expect({ processing, failed, payment, order }).toEqual({
      processing: expect.objectContaining({
        status: 'refund_processing',
        refundStatus: 'processing',
      }),
      failed: expect.objectContaining({
        status: 'refund_processing',
        refundStatus: 'failed',
        version: processing.version + 1,
      }),
      payment: { status: 'paid' },
      order: { status: 'paid' },
    });
  });

  it('requires audited evidence and atomically completes a manual UnionPay refund case', async () => {
    await fixture.db.run('UPDATE payment_orders SET payment_method = ? WHERE id = ?', ['unionpay', 1]);
    const paymentOrchestrator = new PaymentOrchestrator(
      fixture.db,
      new OrderService(fixture.db)
    );
    paymentOrchestrator.providers.unionpay = new UnionPayProvider({ merchantId: 'union-test' });
    fixture.service = new AfterSalesService({ db: fixture.db, paymentOrchestrator });
    const created = await fixture.service.createCase(1, {
      clientRequestId: 'case-refund-union-manual',
      orderId: 1,
      type: 'refund_only',
      reason: '银联人工退款',
      description: '银联自动退款未实现，必须由管理员核验外部凭证后确认。',
      requestedAmount: 100,
    });
    await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 1,
      status: 'under_review',
      adminId: 9,
      note: '审核人工退款材料',
    });
    const approved = await fixture.service.updateCaseStatus({
      caseId: created.id,
      expectedVersion: 2,
      status: 'approved',
      adminId: 9,
      note: '允许进入人工退款流程',
    });
    const manual = await fixture.service.initiateRefund({
      caseId: created.id,
      expectedVersion: approved.version,
      adminId: 9,
      note: '银联退款转人工处理',
    });

    await expect(fixture.service.resolveManualRefund({
      caseId: created.id,
      expectedVersion: manual.version,
      adminId: 9,
      resolution: 'confirm_completed',
      evidence: '不足十字',
      externalReference: 'ACP-REF-1',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const completed = await fixture.service.resolveManualRefund({
      caseId: created.id,
      expectedVersion: manual.version,
      adminId: 9,
      resolution: 'confirm_completed',
      evidence: '银行回单与商户后台记录已由两名管理员交叉核验。',
      externalReference: 'ACP-MANUAL-20260719-CASE-1',
    });

    const payment = await fixture.db.get('SELECT status FROM payment_orders WHERE id = ?', [1]);
    const order = await fixture.db.get('SELECT status FROM orders WHERE id = ?', [1]);
    const refund = await fixture.db.get(
      `SELECT status, external_reference, manual_completed_by
       FROM refund_records WHERE id = ?`,
      [manual.refundId]
    );
    expect({ manual, completed, payment, order, refund }).toEqual({
      manual: expect.objectContaining({
        status: 'refund_processing',
        refundStatus: 'manual_required',
      }),
      completed: expect.objectContaining({
        status: 'completed',
        refundStatus: 'success',
        version: manual.version + 1,
      }),
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
      refund: {
        status: 'success',
        external_reference: 'ACP-MANUAL-20260719-CASE-1',
        manual_completed_by: 9,
      },
    });
  });

  it('manages strictly whitelisted invoice profiles under customer ownership and versions', async () => {
    const created = await fixture.service.createInvoiceProfile(1, {
      titleType: 'company',
      title: '杭州轴承采购有限公司',
      taxNumber: '91330100123456789X',
      email: 'invoice@example.com',
      recipientPhone: '13800000001',
      registeredAddress: '浙江省杭州市测试路 1 号',
      bankName: '测试银行杭州分行',
      bankAccount: '622200000000000001',
      isDefault: true,
    });
    const updated = await fixture.service.updateInvoiceProfile({
      customerId: 1,
      profileId: created.id,
      expectedVersion: 1,
      input: { email: 'finance@example.com' },
    });
    const profiles = await fixture.service.listInvoiceProfiles(1);

    expect({ created, updated, profiles }).toEqual({
      created: expect.objectContaining({
        id: expect.any(Number),
        customerId: 1,
        taxNumber: '91330100123456789X',
        isDefault: true,
        version: 1,
      }),
      updated: expect.objectContaining({
        id: created.id,
        email: 'finance@example.com',
        version: 2,
      }),
      profiles: [expect.objectContaining({ id: created.id, version: 2 })],
    });

    await expect(fixture.service.updateInvoiceProfile({
      customerId: 2,
      profileId: created.id,
      expectedVersion: 2,
      input: { email: 'attacker@example.com' },
    })).rejects.toMatchObject({ statusCode: 404 });
    await expect(fixture.service.createInvoiceProfile(1, {
      titleType: 'personal',
      title: '顾客一',
      email: 'customer@example.com',
      adminNote: 'must not be accepted',
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('creates only one invoice request per owned paid order and exposes owned logistics history', async () => {
    const profile = await fixture.service.createInvoiceProfile(1, {
      titleType: 'personal',
      title: '顾客一',
      email: 'customer@example.com',
    });
    const invoice = await fixture.service.requestOrderInvoice({
      customerId: 1,
      orderId: 1,
      profileId: profile.id,
    });
    await expect(fixture.service.requestOrderInvoice({
      customerId: 1,
      orderId: 1,
      profileId: profile.id,
    })).rejects.toMatchObject({ statusCode: 409 });

    await fixture.db.run(
      `UPDATE orders
       SET status = ?, tracking_number = ?, shipped_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['shipped', 'SF1234567890', 1]
    );
    await fixture.db.run(
      `INSERT INTO order_status_history (order_id, old_status, new_status, note)
       VALUES (?, ?, ?, ?)`,
      [1, 'paid', 'shipped', '顺丰已揽收']
    );
    const logistics = await fixture.service.getLogisticsForCustomer(1, 1);
    const invoices = await fixture.service.listOrderInvoices(1);

    expect({ invoice, invoices, logistics }).toEqual({
      invoice: expect.objectContaining({
        customerId: 1,
        orderId: 1,
        profileId: profile.id,
        status: 'requested',
        profileSnapshot: expect.objectContaining({
          title: '顾客一',
          email: 'customer@example.com',
        }),
      }),
      invoices: [expect.objectContaining({ id: invoice.id, orderId: 1 })],
      logistics: {
        orderId: 1,
        orderStatus: 'shipped',
        shippingStatus: 'in_transit',
        trackingNumber: 'SF1234567890',
        shippedAt: expect.any(String),
        completedAt: null,
        history: [
          expect.objectContaining({
            oldStatus: 'paid',
            newStatus: 'shipped',
            note: '顺丰已揽收',
          }),
        ],
      },
    });

    await expect(
      fixture.service.getLogisticsForCustomer(2, 1)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets admins process invoice requests with versions and an immutable audit history', async () => {
    const profile = await fixture.service.createInvoiceProfile(1, {
      titleType: 'company',
      title: '杭州轴承采购有限公司',
      taxNumber: '91330100123456789X',
      email: 'invoice@example.com',
    });
    const invoice = await fixture.service.requestOrderInvoice({
      customerId: 1,
      orderId: 1,
      profileId: profile.id,
    });
    const processing = await fixture.service.updateInvoiceStatus({
      invoiceId: invoice.id,
      expectedVersion: 1,
      status: 'processing',
      adminId: 9,
      note: '财务开始处理发票',
    });
    await expect(fixture.service.updateInvoiceStatus({
      invoiceId: invoice.id,
      expectedVersion: 1,
      status: 'rejected',
      adminId: 9,
      note: '旧版本不得覆盖',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVOICE_VERSION_CONFLICT',
    });
    const issued = await fixture.service.updateInvoiceStatus({
      invoiceId: invoice.id,
      expectedVersion: processing.version,
      status: 'issued',
      adminId: 9,
      note: '电子发票已开具',
      invoiceNumber: 'INV-20260719-0001',
    });
    const detail = await fixture.service.getInvoiceForAdmin(invoice.id);
    const list = await fixture.service.listInvoicesForAdmin({ status: 'issued' });

    expect({ issued, detail, list }).toEqual({
      issued: expect.objectContaining({
        status: 'issued',
        version: 3,
        invoiceNumber: 'INV-20260719-0001',
      }),
      detail: expect.objectContaining({
        id: invoice.id,
        history: [
          expect.objectContaining({ actorType: 'customer', toStatus: 'requested', version: 1 }),
          expect.objectContaining({ actorType: 'admin', toStatus: 'processing', version: 2 }),
          expect.objectContaining({ actorType: 'admin', toStatus: 'issued', version: 3 }),
        ],
      }),
      list: expect.objectContaining({
        items: [expect.objectContaining({ id: invoice.id, status: 'issued' })],
        total: 1,
      }),
    });
  });

  it('updates order logistics transactionally with optimistic versions and shipment history', async () => {
    const shipped = await fixture.service.updateLogisticsForAdmin({
      orderId: 1,
      expectedVersion: 0,
      adminId: 9,
      carrier: 'SF',
      trackingNumber: 'SF1234567890',
      status: 'in_transit',
      location: '杭州转运中心',
      note: '顺丰已揽收',
    });
    await expect(fixture.service.updateLogisticsForAdmin({
      orderId: 1,
      expectedVersion: 0,
      adminId: 9,
      carrier: 'SF',
      trackingNumber: 'SF1234567890',
      status: 'delivered',
      note: '旧版本不得覆盖物流',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'LOGISTICS_VERSION_CONFLICT',
    });
    const delivered = await fixture.service.updateLogisticsForAdmin({
      orderId: 1,
      expectedVersion: shipped.shipmentVersion,
      adminId: 9,
      carrier: 'SF',
      trackingNumber: 'SF1234567890',
      status: 'delivered',
      location: '杭州市',
      note: '本人签收',
    });
    const customerView = await fixture.service.getLogisticsForCustomer(1, 1);
    const adminView = await fixture.service.getLogisticsForAdmin(1);

    expect({ shipped, delivered, customerView, adminView }).toEqual({
      shipped: expect.objectContaining({
        orderStatus: 'shipped',
        shippingStatus: 'in_transit',
        shipmentVersion: 1,
      }),
      delivered: expect.objectContaining({
        orderStatus: 'completed',
        shippingStatus: 'delivered',
        shipmentVersion: 2,
      }),
      customerView: expect.objectContaining({
        orderStatus: 'completed',
        shippingStatus: 'delivered',
        carrier: 'SF',
        trackingNumber: 'SF1234567890',
        shipmentVersion: 2,
        events: [
          expect.objectContaining({ status: 'in_transit', version: 1 }),
          expect.objectContaining({ status: 'delivered', version: 2 }),
        ],
      }),
      adminView: expect.objectContaining({
        orderId: 1,
        shippingStatus: 'delivered',
        shipmentVersion: 2,
      }),
    });
  });

  it('rejects delivered as the first logistics event', async () => {
    await expect(fixture.service.updateLogisticsForAdmin({
      orderId: 1,
      expectedVersion: 0,
      adminId: 9,
      carrier: 'SF',
      trackingNumber: 'SF1234567890',
      status: 'delivered',
      location: '杭州市',
      note: '不得跳过运输过程直接签收',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_INITIAL_LOGISTICS_STATUS',
    });

    const shipment = await fixture.db.get(
      'SELECT id FROM shipment_records WHERE order_id = ?',
      [1]
    );
    const order = await fixture.db.get(
      'SELECT status, tracking_number FROM orders WHERE id = ?',
      [1]
    );
    expect({ shipment, order }).toEqual({
      shipment: null,
      order: { status: 'paid', tracking_number: null },
    });
  });

  it('enforces customer/admin HTTP roles and returns explicit version conflicts', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/after-sales', require('../routes/afterSales')(fixture.service));
    app.use((error: any, _req: any, res: any, _next: any) => {
      res.status(error.statusCode || 500).json({
        error: error.message,
        code: error.code || 'INTERNAL_ERROR',
      });
    });
    const customerToken = generateCustomerToken(
      1,
      'customer-1',
      fixture.customerPasswordHash
    );
    const adminToken = generateToken(1, 'admin', 'admin');

    await fixture.db.run('UPDATE customers SET phone_verified_at = NULL WHERE id = ?', [1]);
    const unverified = await request(app)
      .post('/api/after-sales/cases')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'http-case-request-unverified')
      .send({
        orderId: 1,
        type: 'refund_only',
        reason: '未验证手机号不应取得订单售后权限',
        description: '手机号即使与订单一致，也不能在验证前创建售后申请。',
        requestedAmount: 100,
      })
      .expect(403);
    await request(app)
      .get('/api/after-sales/admin/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(unverified.body).toEqual({
      error: '请先完成手机号验证',
      code: 'PHONE_VERIFICATION_REQUIRED',
    });
    await fixture.db.run(
      'UPDATE customers SET phone_verified_at = ? WHERE id = ?',
      [2_000_000_000, 1]
    );

    const created = await request(app)
      .post('/api/after-sales/cases')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', 'http-case-request-0001')
      .send({
        orderId: 1,
        type: 'refund_only',
        reason: '接口售后申请',
        description: '通过公开接口提交售后申请并验证鉴权与版本控制。',
        requestedAmount: 100,
      })
      .expect(201);

    await request(app)
      .get('/api/after-sales/admin/cases')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    const adminList = await request(app)
      .get('/api/after-sales/admin/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const underReview = await request(app)
      .patch(`/api/after-sales/admin/cases/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedVersion: 1, status: 'under_review', note: '管理员开始审核' })
      .expect(200);
    const stale = await request(app)
      .patch(`/api/after-sales/admin/cases/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedVersion: 1, status: 'approved', note: '旧版本审核请求' })
      .expect(409);
    const profile = await fixture.service.createInvoiceProfile(1, {
      titleType: 'personal',
      title: '顾客一',
      email: 'customer@example.com',
    });
    await fixture.service.requestOrderInvoice({ customerId: 1, orderId: 1, profileId: profile.id });
    await request(app)
      .get('/api/after-sales/admin/invoices')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    const adminInvoices = await request(app)
      .get('/api/after-sales/admin/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .put('/api/after-sales/admin/orders/1/logistics')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        expectedVersion: 0,
        carrier: 'SF',
        trackingNumber: 'SF1234567890',
        status: 'in_transit',
        note: '顾客不能维护物流',
      })
      .expect(403);
    const adminLogistics = await request(app)
      .put('/api/after-sales/admin/orders/1/logistics')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        expectedVersion: 0,
        carrier: 'SF',
        trackingNumber: 'SF1234567890',
        status: 'in_transit',
        note: '管理员录入物流',
      })
      .expect(200);

    expect({
      created: created.body,
      adminList: adminList.body,
      underReview: underReview.body,
      stale: stale.body,
      adminInvoices: adminInvoices.body,
      adminLogistics: adminLogistics.body,
    })
      .toEqual({
        created: { data: expect.objectContaining({ status: 'submitted', version: 1 }) },
        adminList: {
          data: expect.objectContaining({
            items: [expect.objectContaining({ id: created.body.data.id })],
            total: 1,
          }),
        },
        underReview: { data: expect.objectContaining({ status: 'under_review', version: 2 }) },
        stale: {
          error: '售后申请已被更新，请刷新后重试',
          code: 'AFTER_SALES_VERSION_CONFLICT',
        },
        adminInvoices: {
          data: expect.objectContaining({
            items: [expect.objectContaining({ orderId: 1, status: 'requested' })],
            total: 1,
          }),
        },
        adminLogistics: {
          data: expect.objectContaining({
            orderId: 1,
            shippingStatus: 'in_transit',
            shipmentVersion: 1,
          }),
        },
      });

    const replacementHash = await bcrypt.hash('replacement-session-password', 10);
    await fixture.db.run('UPDATE customers SET password = ? WHERE id = ?', [replacementHash, 1]);
    await request(app)
      .get('/api/after-sales/cases')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(401);
  });

  it('rolls back the commercial tables in reverse dependency order', async () => {
    await afterSalesMigration.down({ db: fixture.db, dialect: 'sqlite' });

    const tables = await fixture.db.all(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'after_sales_cases', 'after_sales_history', 'invoice_profiles',
         'order_invoice_requests', 'order_invoice_history',
         'shipment_records', 'shipment_history'
       ) ORDER BY name`
    );

    expect(tables).toEqual([]);
  });
});
