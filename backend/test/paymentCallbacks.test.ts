import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestDb, seedTestData } from './helpers';

const createApp = require('../app');
const OrderService = require('../services/orderService');
const PaymentOrchestrator = require('../services/payment/PaymentOrchestrator');
const WechatProvider = require('../services/payment/providers/WechatProvider');

const apiKeyV3 = '0123456789abcdef0123456789abcdef'; // gitleaks:allow - deterministic test-only AES key
const appId = 'wx-test-app';
const merchantId = '1900000109';
const platformSerial = 'A1B2C3D4';
const { privateKey: platformPrivateKey, publicKey: platformPublicKey } =
  crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

type CallbackOverrides = {
  amount?: number;
  appId?: string;
  eventId?: string;
  headerNonce?: string;
  merchantId?: string;
  tamperAuthTag?: boolean;
  timestamp?: number;
  transactionId?: string;
};

function createWechatCallback(overrides: CallbackOverrides = {}) {
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const headerNonce = overrides.headerNonce ?? `header-nonce-${crypto.randomUUID()}`;
  const transactionId = overrides.transactionId ?? 'PAY-WECHAT-001';
  const resourceNonce = crypto.randomBytes(12).toString('base64url').slice(0, 12);
  const associatedData = 'transaction';
  const transaction = {
    appid: overrides.appId ?? appId,
    mchid: overrides.merchantId ?? merchantId,
    out_trade_no: transactionId,
    transaction_id: `WX-${crypto.randomUUID()}`,
    trade_state: 'SUCCESS',
    payer: { openid: 'openid-test' },
    amount: { total: overrides.amount ?? 1500, currency: 'CNY' },
  };

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiKeyV3, 'utf8'),
    Buffer.from(resourceNonce, 'utf8')
  );
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(transaction), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  if (overrides.tamperAuthTag) encrypted[encrypted.length - 1] ^= 1;
  const ciphertext = encrypted.toString('base64');

  const body = {
    id: overrides.eventId ?? `EVT-${crypto.randomUUID()}`,
    create_time: new Date(timestamp * 1000).toISOString(),
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext,
      associated_data: associatedData,
      nonce: resourceNonce,
      original_type: 'transaction',
    },
  };
  const rawBody = JSON.stringify(body);
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(`${timestamp}\n${headerNonce}\n${rawBody}\n`, 'utf8'),
    platformPrivateKey
  ).toString('base64');

  return {
    body,
    headers: {
      'wechatpay-timestamp': timestamp.toString(),
      'wechatpay-nonce': headerNonce,
      'wechatpay-serial': platformSerial,
      'wechatpay-signature': signature,
    },
  };
}

async function createPaymentTables(db: any) {
  await db.run(`
    CREATE TABLE payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT UNIQUE,
      trade_no TEXT,
      payer_info TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.run(`
    CREATE TABLE payment_callback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_key TEXT NOT NULL,
      signature_nonce TEXT NOT NULL,
      event_timestamp INTEGER NOT NULL,
      transaction_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      processing_started_at INTEGER NOT NULL,
      processed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, event_id),
      UNIQUE(provider, event_key),
      UNIQUE(provider, signature_nonce, event_timestamp)
    )
  `);
}

async function createOrderAndPayment(
  db: any,
  { orderStatus = 'pending', paymentStatus = 'pending', transactionId = 'PAY-WECHAT-001' } = {}
) {
  const order = await db.run(
    `INSERT INTO orders
      (customer_name, customer_phone, province, city, district, address_detail, total_price, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['callback customer', '13800000000', 'Zhejiang', 'Hangzhou', 'Xihu', 'test address', 15, orderStatus]
  );
  const payment = await db.run(
    `INSERT INTO payment_orders
      (order_id, payment_method, amount, status, transaction_id)
     VALUES (?, ?, ?, ?, ?)`,
    [order.lastID, 'wechat', 15, paymentStatus, transactionId]
  );
  return { orderId: order.lastID, paymentOrderId: payment.lastID };
}

describe('payment callback route contract', () => {
  let db: any;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it.each([
    {
      endpoint: '/api/payment/alipay/notify',
      method: 'alipay',
      type: 'form',
      body: { out_trade_no: 'ALI-1', trade_status: 'TRADE_SUCCESS' },
    },
    {
      endpoint: '/api/payment/wechat/notify',
      method: 'wechat',
      type: 'json',
      body: { id: 'WX-1', resource: { ciphertext: 'ciphertext' } },
    },
    {
      endpoint: '/api/payment/unionpay/notify',
      method: 'unionpay',
      type: 'form',
      body: { orderId: 'UNION-1', respCode: '00' },
    },
  ])('passes a named callback input for $method', async ({ endpoint, method, type, body }) => {
    const handleCallback = vi.fn().mockResolvedValue({ success: true });
    const app = createApp(db, { paymentService: { handleCallback } });

    const response = request(app).post(endpoint);
    if (type === 'form') response.type('form');
    await response.send(body).expect(200);

    expect(handleCallback).toHaveBeenCalledOnce();
    expect(handleCallback).toHaveBeenCalledWith(expect.objectContaining({
      method,
      body: expect.objectContaining(body),
      headers: expect.any(Object),
      rawBody: expect.any(String),
    }));
  });
});

describe('WeChat Pay v3 callback', () => {
  let app: any;
  let db: any;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestData(db);
    await createPaymentTables(db);

    const orderService = new OrderService(db);
    const paymentService = new PaymentOrchestrator(db, orderService);
    paymentService.providers.wechat = new WechatProvider({
      appId,
      mchId: merchantId,
      apiKeyV3,
      platformPublicKey,
      platformCertSerial: platformSerial,
      callbackMaxAgeSeconds: 300,
    });
    app = createApp(db, { orderService, paymentService });
  });

  afterEach(async () => {
    await db.close();
  });

  it('verifies, decrypts, and settles a valid payment', async () => {
    const { orderId, paymentOrderId } = await createOrderAndPayment(db);
    const callback = createWechatCallback();

    await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(200, { code: 'SUCCESS', message: '成功' });

    const payment = await db.get('SELECT status, trade_no FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    const event = await db.get('SELECT provider, status FROM payment_callback_events');
    expect({ payment, order, event }).toEqual({
      payment: expect.objectContaining({ status: 'paid', trade_no: expect.stringMatching(/^WX-/) }),
      order: { status: 'paid' },
      event: { provider: 'wechat', status: 'processed' },
    });
  });

  it('rejects a callback with an invalid platform signature', async () => {
    await createOrderAndPayment(db);
    const callback = createWechatCallback();
    callback.headers['wechatpay-signature'] = Buffer.from('invalid').toString('base64');

    const response = await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(401);

    expect(response.body.code).toBe('WECHAT_CALLBACK_SIGNATURE_INVALID');
  });

  it('rejects a callback outside the timestamp window', async () => {
    await createOrderAndPayment(db);
    const callback = createWechatCallback({ timestamp: Math.floor(Date.now() / 1000) - 301 });

    const response = await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(401);

    expect(response.body.code).toBe('WECHAT_CALLBACK_TIMESTAMP_INVALID');
  });

  it('rejects API v3 encrypted data with a tampered GCM authentication tag', async () => {
    await createOrderAndPayment(db);
    const callback = createWechatCallback({ tamperAuthTag: true });

    const response = await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(400);

    expect(response.body.code).toBe('WECHAT_CALLBACK_DECRYPTION_FAILED');
  });

  it('rejects a callback when the paid amount differs from the local payment', async () => {
    await createOrderAndPayment(db);
    const callback = createWechatCallback({ amount: 1499 });

    const response = await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(400);

    expect(response.body.code).toBe('PAYMENT_AMOUNT_MISMATCH');
  });

  it('rejects a callback when the payment references a missing order', async () => {
    await db.run(
      `INSERT INTO payment_orders
        (order_id, payment_method, amount, status, transaction_id)
       VALUES (?, ?, ?, ?, ?)`,
      [99999, 'wechat', 15, 'pending', 'PAY-WECHAT-001']
    );
    const callback = createWechatCallback();

    const response = await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('handles duplicate delivery exactly once', async () => {
    const { orderId } = await createOrderAndPayment(db);
    const callback = createWechatCallback();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post('/api/payment/wechat/notify')
        .set(callback.headers)
        .send(callback.body)
        .expect(200);
    }

    const events = await db.get('SELECT COUNT(*) AS count FROM payment_callback_events');
    const history = await db.get(
      'SELECT COUNT(*) AS count FROM order_status_history WHERE order_id = ?',
      [orderId]
    );
    expect({ events: events.count, history: history.count }).toEqual({ events: 1, history: 1 });
  });

  it('repairs a callback ledger left processing after payment settlement committed', async () => {
    await createOrderAndPayment(db);
    const callback = createWechatCallback();
    await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(200);
    await db.run(
      'UPDATE payment_callback_events SET status = ?, processed_at = NULL',
      ['processing']
    );

    await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(200);

    await expect(db.get('SELECT status, processed_at FROM payment_callback_events'))
      .resolves.toEqual({
        status: 'processed',
        processed_at: expect.any(String),
      });
  });

  it('acknowledges a late paid callback without reviving a refunded payment', async () => {
    const { orderId, paymentOrderId } = await createOrderAndPayment(db, {
      orderStatus: 'cancelled',
      paymentStatus: 'refunded',
    });
    const callback = createWechatCallback();

    await request(app)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(200);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
    expect({ payment, order }).toEqual({
      payment: { status: 'refunded' },
      order: { status: 'cancelled' },
    });
  });

  it.each([
    { paymentStatus: 'paid', orderStatus: 'paid', callbackStatus: 'failed' },
    { paymentStatus: 'paid', orderStatus: 'paid', callbackStatus: 'pending' },
    { paymentStatus: 'refunded', orderStatus: 'cancelled', callbackStatus: 'failed' },
    { paymentStatus: 'refunded', orderStatus: 'cancelled', callbackStatus: 'pending' },
  ])(
    'ignores a late $callbackStatus callback after the payment is $paymentStatus',
    async ({ paymentStatus, orderStatus, callbackStatus }) => {
      const transactionId = `PAY-LATE-${paymentStatus}-${callbackStatus}`;
      const { orderId, paymentOrderId } = await createOrderAndPayment(db, {
        orderStatus,
        paymentStatus,
        transactionId,
      });
      const paymentService = new PaymentOrchestrator(db, new OrderService(db));
      paymentService.providers.wechat = {
        handleCallback: vi.fn().mockResolvedValue({
          eventId: `EVENT-LATE-${paymentStatus}-${callbackStatus}`,
          eventTimestamp: Math.floor(Date.now() / 1000),
          signatureNonce: `NONCE-LATE-${paymentStatus}-${callbackStatus}`,
          transactionId,
          status: callbackStatus,
        }),
      };

      const result = await paymentService.handleCallback({
        method: 'wechat',
        headers: {},
        body: { status: callbackStatus },
        rawBody: JSON.stringify({ status: callbackStatus }),
      });
      const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
      const order = await db.get('SELECT status FROM orders WHERE id = ?', [orderId]);
      const event = await db.get(
        `SELECT status, processed_at FROM payment_callback_events
         WHERE transaction_id = ?`,
        [transactionId]
      );
      expect({ result, payment, order, event }).toEqual({
        result: {
          success: true,
          idempotent: true,
          stale: true,
          status: paymentStatus,
        },
        payment: { status: paymentStatus },
        order: { status: orderStatus },
        event: { status: 'processed', processed_at: expect.any(String) },
      });
    }
  );

  it('does not acknowledge or persist payment success when the order update fails', async () => {
    const { paymentOrderId } = await createOrderAndPayment(db);
    const failingOrderService = {
      updateOrderStatus: vi.fn().mockRejectedValue(new Error('order update failed')),
      updateOrderStatusInTransaction: vi.fn().mockRejectedValue(new Error('order update failed')),
    };
    const paymentService = new PaymentOrchestrator(db, failingOrderService);
    paymentService.providers.wechat = new WechatProvider({
      appId,
      mchId: merchantId,
      apiKeyV3,
      platformPublicKey,
      platformCertSerial: platformSerial,
      callbackMaxAgeSeconds: 300,
    });
    const failingApp = createApp(db, { paymentService });
    const callback = createWechatCallback();

    await request(failingApp)
      .post('/api/payment/wechat/notify')
      .set(callback.headers)
      .send(callback.body)
      .expect(400);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    const event = await db.get('SELECT status FROM payment_callback_events');
    expect({ payment, event }).toEqual({
      payment: { status: 'pending' },
      event: { status: 'failed' },
    });
  });

  it('rejects a different payload that reuses a failed callback nonce and timestamp', async () => {
    const { paymentOrderId } = await createOrderAndPayment(db);
    const timestamp = Math.floor(Date.now() / 1000);
    const headerNonce = `shared-nonce-${crypto.randomUUID()}`;
    const failingOrderService = {
      updateOrderStatusInTransaction: vi.fn().mockRejectedValue(new Error('order update failed')),
    };
    const paymentService = new PaymentOrchestrator(db, failingOrderService);
    paymentService.providers.wechat = new WechatProvider({
      appId,
      mchId: merchantId,
      apiKeyV3,
      platformPublicKey,
      platformCertSerial: platformSerial,
      callbackMaxAgeSeconds: 300,
    });
    const failingApp = createApp(db, { paymentService });
    const first = createWechatCallback({ timestamp, headerNonce, eventId: 'EVENT-FIRST' });
    const conflicting = createWechatCallback({ timestamp, headerNonce, eventId: 'EVENT-CONFLICT' });

    await request(failingApp)
      .post('/api/payment/wechat/notify')
      .set(first.headers)
      .send(first.body)
      .expect(400);
    const response = await request(app)
      .post('/api/payment/wechat/notify')
      .set(conflicting.headers)
      .send(conflicting.body)
      .expect(409);

    const payment = await db.get('SELECT status FROM payment_orders WHERE id = ?', [paymentOrderId]);
    expect({ code: response.body.code, payment }).toEqual({
      code: 'PAYMENT_CALLBACK_REPLAY',
      payment: { status: 'pending' },
    });
  });
});
