const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const PAYMENT_PROVIDERS = new Set(['alipay', 'wechat', 'unionpay', 'sandbox', 'cod', 'unknown']);
const REFUND_STATUSES = new Set(['requested', 'processing', 'success', 'failed', 'manual_required']);
const INVENTORY_TYPES = new Set(['insufficient', 'negative', 'deduction_failed', 'restore_failed', 'unknown']);
const DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(values) {
  const entries = Object.entries(values);
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function routeLabel(req) {
  if (!req.route || typeof req.route.path !== 'string') return 'unmatched';
  const route = `${req.baseUrl || ''}${req.route.path}` || '/';
  return route.length <= 160 ? route : 'other';
}

class MetricsRegistry {
  constructor() {
    this.reset();
  }

  reset() {
    this.requests = new Map();
    this.errors = new Map();
    this.durationCounts = new Map();
    this.durationSums = new Map();
    this.durationBuckets = new Map();
    this.orders = new Map();
    this.payments = new Map();
    this.refunds = new Map();
    this.inventory = new Map();
    this.callbackSignatureFailures = new Map();
  }

  observeRequest(req, statusCode, durationSeconds) {
    const method = HTTP_METHODS.has(req.method) ? req.method : 'OTHER';
    const route = routeLabel(req);
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const requestKey = JSON.stringify({ method, route, status_class: statusClass });
    const durationKey = JSON.stringify({ method, route });
    increment(this.requests, requestKey);
    if (statusCode >= 500) increment(this.errors, requestKey);
    increment(this.durationCounts, durationKey);
    increment(this.durationSums, durationKey, durationSeconds);
    for (const bucket of DURATION_BUCKETS) {
      if (durationSeconds <= bucket) increment(this.durationBuckets, `${durationKey}|${bucket}`);
    }
    increment(this.durationBuckets, `${durationKey}|+Inf`);
  }

  recordOrder(outcome) {
    increment(this.orders, outcome === 'success' ? 'success' : 'failed');
  }

  recordPayment(provider, outcome) {
    const safeProvider = PAYMENT_PROVIDERS.has(provider) ? provider : 'unknown';
    const safeOutcome = outcome === 'success' ? 'success' : 'failed';
    increment(this.payments, JSON.stringify({ provider: safeProvider, outcome: safeOutcome }));
  }

  recordRefund(status) {
    const safeStatus = REFUND_STATUSES.has(status) ? status : 'failed';
    increment(this.refunds, safeStatus);
  }

  recordInventoryAnomaly(type) {
    const safeType = INVENTORY_TYPES.has(type) ? type : 'unknown';
    increment(this.inventory, safeType);
  }

  recordCallbackSignatureFailure(provider) {
    const safeProvider = PAYMENT_PROVIDERS.has(provider) ? provider : 'unknown';
    increment(this.callbackSignatureFailures, safeProvider);
  }

  render() {
    const lines = [];
    const addMap = (name, help, type, map, labelParser) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
      for (const [key, value] of map) {
        lines.push(`${name}${labels(labelParser(key))} ${value}`);
      }
    };

    addMap('api_http_requests_total', 'Total API HTTP requests.', 'counter', this.requests, JSON.parse);
    addMap('api_http_errors_total', 'Total API HTTP 5xx responses.', 'counter', this.errors, JSON.parse);
    lines.push('# HELP api_http_request_duration_seconds API request duration in seconds.');
    lines.push('# TYPE api_http_request_duration_seconds histogram');
    for (const [key, value] of this.durationBuckets) {
      const separator = key.lastIndexOf('|');
      const baseLabels = JSON.parse(key.slice(0, separator));
      lines.push(`api_http_request_duration_seconds_bucket${labels({ ...baseLabels, le: key.slice(separator + 1) })} ${value}`);
    }
    for (const [key, value] of this.durationSums) {
      lines.push(`api_http_request_duration_seconds_sum${labels(JSON.parse(key))} ${value}`);
    }
    for (const [key, value] of this.durationCounts) {
      lines.push(`api_http_request_duration_seconds_count${labels(JSON.parse(key))} ${value}`);
    }

    addMap('business_orders_total', 'Orders grouped by outcome.', 'counter', this.orders, (outcome) => ({ outcome }));
    addMap('business_payments_total', 'Payments grouped by provider and outcome.', 'counter', this.payments, JSON.parse);
    addMap('business_refunds_total', 'Refunds grouped by state.', 'counter', this.refunds, (status) => ({ status }));
    addMap('business_inventory_anomalies_total', 'Inventory consistency anomalies.', 'counter', this.inventory, (type) => ({ type }));
    addMap('payment_callback_signature_failures_total', 'Payment callback signature failures.', 'counter', this.callbackSignatureFailures, (provider) => ({ provider }));

    return `${lines.join('\n')}\n`;
  }
}

const metrics = new MetricsRegistry();

module.exports = {
  MetricsRegistry,
  metrics,
  routeLabel,
};
