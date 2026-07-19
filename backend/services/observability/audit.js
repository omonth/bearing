const logger = require('../../logger');
const { alerter: defaultAlerter } = require('./alerting');
const { metrics: defaultMetrics } = require('./metrics');
const { redactSensitive } = require('./redaction');

const AUDIT_EVENTS = new Set([
  'order_created',
  'order_failed',
  'payment_succeeded',
  'payment_failed',
  'payment_create_uncertain',
  'payment_order_sync_failed',
  'refund_requested',
  'refund_succeeded',
  'refund_failed',
  'refund_request_uncertain',
  'refund_status_changed',
  'refund_order_sync_failed',
  'inventory_anomaly',
  'callback_signature_failed',
]);

class BusinessAudit {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.metrics = options.metrics || defaultMetrics;
    this.alerter = options.alerter || defaultAlerter;
  }

  event(type, details = {}) {
    if (!AUDIT_EVENTS.has(type)) throw new Error(`Unsupported audit event: ${type}`);
    this.logger.info('关键业务审计事件', {
      audit: {
        event: type,
        occurredAt: new Date().toISOString(),
        details: redactSensitive(details),
      },
    });
  }

  orderCreated(details) {
    this.metrics.recordOrder('success');
    this.event('order_created', details);
  }

  orderFailed(details) {
    this.metrics.recordOrder('failed');
    this.event('order_failed', details);
  }

  paymentSucceeded(provider, details) {
    this.metrics.recordPayment(provider, 'success');
    this.alerter.resetCallbackSignatureFailures(provider);
    this.event('payment_succeeded', { provider, ...details });
  }

  paymentFailed(provider, details) {
    this.metrics.recordPayment(provider, 'failed');
    this.event('payment_failed', { provider, ...details });
  }

  paymentCreateUncertain(provider, details) {
    this.event('payment_create_uncertain', { provider, ...details });
  }

  paymentOrderSyncFailed(provider, details) {
    this.metrics.recordPayment(provider, 'failed');
    this.event('payment_order_sync_failed', { provider, ...details });
    return this.alerter.send('payment_order_sync_failed', { provider, ...details });
  }

  refundRequested(details) {
    this.metrics.recordRefund('requested');
    this.event('refund_requested', details);
  }

  refundSucceeded(details) {
    this.metrics.recordRefund('success');
    this.event('refund_succeeded', details);
  }

  refundFailed(details) {
    this.metrics.recordRefund('failed');
    this.event('refund_failed', details);
  }

  refundRequestUncertain(details) {
    this.event('refund_request_uncertain', details);
  }

  refundOrderSyncFailed(details) {
    this.metrics.recordRefund('failed');
    this.event('refund_order_sync_failed', details);
    return this.alerter.send('refund_order_sync_failed', details);
  }

  inventoryAnomaly(type, details) {
    this.metrics.recordInventoryAnomaly(type);
    this.event('inventory_anomaly', { type, ...details });
    return this.alerter.send('inventory_anomaly', { type, ...details });
  }

  callbackSignatureFailed(provider, details = {}) {
    this.metrics.recordCallbackSignatureFailure(provider);
    this.event('callback_signature_failed', { provider, ...details });
    return this.alerter.recordCallbackSignatureFailure(provider);
  }

  callbackSignatureVerified(provider) {
    this.alerter.resetCallbackSignatureFailures(provider);
  }

  refundStatus(status, details = {}) {
    this.metrics.recordRefund(status);
    this.event('refund_status_changed', { status, ...details });
  }
}

const businessAudit = new BusinessAudit();

module.exports = {
  AUDIT_EVENTS,
  BusinessAudit,
  businessAudit,
};
