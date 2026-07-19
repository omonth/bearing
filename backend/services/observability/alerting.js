const logger = require('../../logger');
const { redactSensitive } = require('./redaction');

const ALERT_TYPES = new Set([
  'payment_order_sync_failed',
  'refund_order_sync_failed',
  'callback_signature_failures',
  'inventory_anomaly',
  'database_unavailable',
  'redis_unavailable',
  'backup_failed',
  'api_error_rate',
  'api_latency',
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

class OperationalAlerter {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl ?? process.env.ALERT_WEBHOOK_URL;
    this.timeoutMs = positiveInteger(options.timeoutMs ?? process.env.ALERT_WEBHOOK_TIMEOUT_MS, 3000);
    this.signatureFailureThreshold = positiveInteger(
      options.signatureFailureThreshold ?? process.env.CALLBACK_SIGNATURE_FAILURE_THRESHOLD,
      5
    );
    this.httpWindowSize = positiveInteger(options.httpWindowSize ?? process.env.ALERT_HTTP_WINDOW_SIZE, 100);
    this.httpMinimumSamples = positiveInteger(options.httpMinimumSamples ?? process.env.ALERT_HTTP_MIN_SAMPLES, 20);
    this.errorRateThreshold = positiveNumber(options.errorRateThreshold ?? process.env.ALERT_ERROR_RATE_THRESHOLD, 0.05);
    this.latencyThresholdMs = positiveNumber(options.latencyThresholdMs ?? process.env.ALERT_LATENCY_THRESHOLD_MS, 2000);
    this.fetchImpl = options.fetchImpl || global.fetch;
    this.signatureFailures = new Map();
    this.dependencyStates = new Map();
    this.httpSamples = [];
    this.errorRateAlertActive = false;
    this.latencyAlertActive = false;
  }

  async send(type, details = {}) {
    if (!ALERT_TYPES.has(type)) throw new Error(`Unsupported alert type: ${type}`);
    if (!this.webhookUrl) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('生产告警 webhook 未配置', { alertType: type });
      }
      return { delivered: false, reason: 'not_configured' };
    }
    if (typeof this.fetchImpl !== 'function') return { delivered: false, reason: 'fetch_unavailable' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const payload = redactSensitive({
      type,
      service: 'bearing-sales-api',
      environment: process.env.NODE_ENV || 'development',
      occurredAt: new Date().toISOString(),
      details,
    });

    try {
      const response = await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { delivered: true };
    } catch (_error) {
      logger.error('可观测性告警投递失败', {
        alertType: type,
        reason: controller.signal.aborted ? 'timeout' : 'delivery_failed',
      });
      return { delivered: false, reason: 'delivery_failed' };
    } finally {
      clearTimeout(timeout);
    }
  }

  recordCallbackSignatureFailure(provider) {
    const count = (this.signatureFailures.get(provider) || 0) + 1;
    this.signatureFailures.set(provider, count);
    if (count === this.signatureFailureThreshold) {
      return this.send('callback_signature_failures', { provider, consecutiveFailures: count });
    }
    return Promise.resolve({ delivered: false, reason: 'below_threshold' });
  }

  resetCallbackSignatureFailures(provider) {
    this.signatureFailures.delete(provider);
  }

  notifyDependencyState(dependency, available) {
    const previous = this.dependencyStates.get(dependency);
    this.dependencyStates.set(dependency, available);
    if (available || previous === false) {
      return Promise.resolve({ delivered: false, reason: 'unchanged' });
    }
    const type = dependency === 'database' ? 'database_unavailable' : 'redis_unavailable';
    return this.send(type, { dependency });
  }

  recordHttpRequest(statusCode, durationMs) {
    this.httpSamples.push({ statusCode, durationMs });
    if (this.httpSamples.length > this.httpWindowSize) this.httpSamples.shift();
    if (this.httpSamples.length < this.httpMinimumSamples) return;

    const errorCount = this.httpSamples.filter((sample) => sample.statusCode >= 500).length;
    const errorRate = errorCount / this.httpSamples.length;
    const averageLatencyMs = this.httpSamples.reduce((sum, sample) => sum + sample.durationMs, 0)
      / this.httpSamples.length;

    if (errorRate >= this.errorRateThreshold && !this.errorRateAlertActive) {
      this.errorRateAlertActive = true;
      void this.send('api_error_rate', {
        errorRate: Math.round(errorRate * 10000) / 10000,
        sampleSize: this.httpSamples.length,
      });
    } else if (errorRate < this.errorRateThreshold) {
      this.errorRateAlertActive = false;
    }

    if (averageLatencyMs >= this.latencyThresholdMs && !this.latencyAlertActive) {
      this.latencyAlertActive = true;
      void this.send('api_latency', {
        averageLatencyMs: Math.round(averageLatencyMs),
        sampleSize: this.httpSamples.length,
      });
    } else if (averageLatencyMs < this.latencyThresholdMs) {
      this.latencyAlertActive = false;
    }
  }
}

const alerter = new OperationalAlerter();

module.exports = {
  ALERT_TYPES,
  OperationalAlerter,
  alerter,
};
