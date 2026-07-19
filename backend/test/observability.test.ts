import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const createApp = require('../app');
const { BusinessAudit } = require('../services/observability/audit');
const { OperationalAlerter } = require('../services/observability/alerting');
const { MetricsRegistry } = require('../services/observability/metrics');
const { redactSensitive } = require('../services/observability/redaction');

function createDependencies(overrides: Record<string, unknown> = {}) {
  const metrics = new MetricsRegistry();
  const alerter = {
    notifyDependencyState: vi.fn().mockResolvedValue({ delivered: false }),
    recordCallbackSignatureFailure: vi.fn().mockResolvedValue({ delivered: false }),
    resetCallbackSignatureFailures: vi.fn(),
    send: vi.fn().mockResolvedValue({ delivered: false }),
  };
  const db = { get: vi.fn().mockResolvedValue({ ready: 1 }) };
  const redis = vi.fn().mockResolvedValue('PONG');

  return {
    alerter,
    db,
    metrics,
    redis,
    ...overrides,
  };
}

describe('health and readiness probes', () => {
  it('keeps /health dependency-free', async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies.db, {
      observability: {
        metrics: dependencies.metrics,
        alerter: dependencies.alerter,
        redis: dependencies.redis,
        requireRedis: true,
      },
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(dependencies.db.get).not.toHaveBeenCalled();
    expect(dependencies.redis).not.toHaveBeenCalled();
  });

  it('reports ready only after database and required Redis checks pass', async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies.db, {
      observability: {
        metrics: dependencies.metrics,
        alerter: dependencies.alerter,
        redis: dependencies.redis,
        requireRedis: true,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      checks: { database: 'up', redis: 'up' },
    });
    expect(dependencies.db.get).toHaveBeenCalledWith('SELECT 1 AS ready');
    expect(dependencies.redis).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without exposing errors when dependencies are unavailable', async () => {
    const dependencies = createDependencies({
      db: { get: vi.fn().mockRejectedValue(new Error('postgres password=secret-value')) },
      redis: vi.fn().mockRejectedValue(new Error('redis://user:secret@host')),
    });
    const app = createApp(dependencies.db, {
      observability: {
        metrics: dependencies.metrics,
        alerter: dependencies.alerter,
        redis: dependencies.redis,
        requireRedis: true,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'down', redis: 'down' },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-value');
    expect(dependencies.alerter.notifyDependencyState).toHaveBeenCalledWith('database', false);
    expect(dependencies.alerter.notifyDependencyState).toHaveBeenCalledWith('redis', false);
  });

  it('fails readiness when Redis is required but no checker was injected', async () => {
    const dependencies = createDependencies();
    const app = createApp(dependencies.db, {
      observability: {
        metrics: dependencies.metrics,
        alerter: dependencies.alerter,
        requireRedis: true,
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'up', redis: 'down' });
  });
});

describe('request correlation and metrics', () => {
  let dependencies: ReturnType<typeof createDependencies>;
  let app: any;

  beforeEach(() => {
    dependencies = createDependencies();
    app = createApp(dependencies.db, {
      observability: {
        metrics: dependencies.metrics,
        alerter: dependencies.alerter,
        redis: dependencies.redis,
        requireRedis: true,
      },
    });
  });

  it('preserves a safe inbound request ID and returns it to the caller', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Request-ID', 'edge-01:trace_42');

    expect(response.headers['x-request-id']).toBe('edge-01:trace_42');
  });

  it('replaces unsafe request IDs', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Request-ID', '../../bad id');

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['x-request-id']).not.toBe('../../bad id');
  });

  it('exports low-cardinality Prometheus request, error, and latency metrics', async () => {
    await request(app).get('/health');
    await request(app).get('/definitely-not-a-real-resource/12345');
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('api_http_requests_total');
    expect(response.text).toContain('api_http_request_duration_seconds_bucket');
    expect(response.text).toContain('route="/health"');
    expect(response.text).toContain('route="unmatched"');
    expect(response.text).not.toContain('12345');

    dependencies.metrics.observeRequest({
      method: 'GET',
      baseUrl: '/api',
      route: { path: '/failure' },
    }, 500, 0.25);
    expect(dependencies.metrics.render()).toContain(
      'api_http_errors_total{method="GET",route="/api/failure",status_class="5xx"} 1'
    );
  });
});

describe('redaction, audit metrics, and alerts', () => {
  it('recursively removes credentials and masks customer PII', () => {
    const redacted = redactSensitive({
      authorization: 'Bearer header-secret',
      password: 'admin-password',
      sessionProof: 'customer-session-proof',
      apiV3Key: 'payment-secret',
      customerPhone: '13800138000',
      addressDetail: '测试路 100 号',
      payer: { openid: 'openid-secret', name: '付款人' },
      message: 'token=raw-token Bearer another-secret 13900139000',
    });

    expect(redacted).toEqual({
      authorization: '[REDACTED]',
      password: '[REDACTED]',
      sessionProof: '[REDACTED]',
      apiV3Key: '[REDACTED]',
      customerPhone: '138****8000',
      addressDetail: '[REDACTED]',
      payer: '[REDACTED]',
      message: 'token=[REDACTED] Bearer [REDACTED] 139****9000',
    });
  });

  it('records required business counters without identifier labels', async () => {
    const metrics = new MetricsRegistry();
    const logger = { info: vi.fn() };
    const alerter = {
      resetCallbackSignatureFailures: vi.fn(),
      recordCallbackSignatureFailure: vi.fn().mockResolvedValue({ delivered: false }),
      send: vi.fn().mockResolvedValue({ delivered: false }),
    };
    const audit = new BusinessAudit({ logger, metrics, alerter });

    audit.orderCreated({ orderId: 'ORDER-VERY-UNIQUE' });
    audit.paymentSucceeded('wechat', { paymentOrderId: 'PAY-VERY-UNIQUE' });
    audit.refundFailed({ refundId: 'REFUND-VERY-UNIQUE' });
    await audit.inventoryAnomaly('negative', { bearingId: 42 });
    await audit.callbackSignatureFailed('wechat', { nonce: 'secret-nonce' });

    const output = metrics.render();
    expect(output).toContain('business_orders_total{outcome="success"} 1');
    expect(output).toContain('business_payments_total{provider="wechat",outcome="success"} 1');
    expect(output).toContain('business_refunds_total{status="failed"} 1');
    expect(output).toContain('business_inventory_anomalies_total{type="negative"} 1');
    expect(output).toContain('payment_callback_signature_failures_total{provider="wechat"} 1');
    expect(output).not.toContain('VERY-UNIQUE');
    expect(logger.info).toHaveBeenCalledTimes(5);
  });

  it('routes payment and refund synchronization failures to operational alerts', async () => {
    const metrics = new MetricsRegistry();
    const logger = { info: vi.fn() };
    const alerter = {
      resetCallbackSignatureFailures: vi.fn(),
      recordCallbackSignatureFailure: vi.fn().mockResolvedValue({ delivered: false }),
      send: vi.fn().mockResolvedValue({ delivered: true }),
    };
    const audit = new BusinessAudit({ logger, metrics, alerter });

    await audit.paymentOrderSyncFailed('wechat', {
      paymentOrderId: 7,
      reasonCode: 'LOCAL_SETTLEMENT_TRANSACTION_FAILED',
    });
    await audit.refundOrderSyncFailed({
      refundId: 9,
      reasonCode: 'LOCAL_REFUND_SETTLEMENT_FAILED',
    });

    expect(alerter.send.mock.calls).toEqual([
      ['payment_order_sync_failed', {
        provider: 'wechat',
        paymentOrderId: 7,
        reasonCode: 'LOCAL_SETTLEMENT_TRANSACTION_FAILED',
      }],
      ['refund_order_sync_failed', {
        refundId: 9,
        reasonCode: 'LOCAL_REFUND_SETTLEMENT_FAILED',
      }],
    ]);
  });

  it('sends only a redacted webhook payload at the signature-failure threshold', async () => {
    const payloads: any[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      payloads.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    });
    const alerter = new OperationalAlerter({
      webhookUrl: 'https://alerts.example.test/hooks/credential-in-url-is-not-logged',
      signatureFailureThreshold: 2,
      fetchImpl,
    });

    await alerter.recordCallbackSignatureFailure('wechat');
    await alerter.recordCallbackSignatureFailure('wechat');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(payloads[0].type).toBe('callback_signature_failures');
    expect(payloads[0].details).toEqual({ provider: 'wechat', consecutiveFailures: 2 });

    alerter.resetCallbackSignatureFailures('wechat');
    await alerter.recordCallbackSignatureFailure('wechat');
    await alerter.recordCallbackSignatureFailure('wechat');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('alerts once when rolling API error rate or latency crosses its threshold', async () => {
    const alertTypes: string[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      alertTypes.push(JSON.parse(init.body).type);
      return { ok: true, status: 200 };
    });
    const alerter = new OperationalAlerter({
      webhookUrl: 'https://alerts.example.test/http-health',
      httpWindowSize: 2,
      httpMinimumSamples: 2,
      errorRateThreshold: 0.5,
      latencyThresholdMs: 100,
      fetchImpl,
    });

    alerter.recordHttpRequest(500, 200);
    alerter.recordHttpRequest(200, 200);
    alerter.recordHttpRequest(500, 200);
    await Promise.resolve();

    expect(alertTypes.sort()).toEqual(['api_error_rate', 'api_latency']);
  });
});
