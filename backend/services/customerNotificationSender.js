class CaptureCustomerNotificationSender {
  constructor() {
    this.messages = [];
  }

  async send(message) {
    this.messages.push({ ...message });
  }
}

class WebhookCustomerNotificationSender {
  constructor({ url, token, timeoutMs = 5000, fetchImpl = global.fetch }) {
    if (!url || !token || typeof fetchImpl !== 'function') {
      throw new Error('Customer notification webhook configuration is incomplete');
    }
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Customer notification webhook must use HTTPS');
    }
    if (token.length < 32) {
      throw new Error('Customer notification webhook token must contain at least 32 characters');
    }
    this.url = parsedUrl.toString();
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async send({ kind, destination, secret, expiresAt, delivery }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kind, destination, secret, expiresAt, delivery }),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Customer notification webhook rejected the request (${response.status})`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createDefaultCustomerNotificationSender(environment = process.env) {
  if (environment.NODE_ENV !== 'production') {
    return new CaptureCustomerNotificationSender();
  }

  const url = environment.CUSTOMER_NOTIFICATION_WEBHOOK_URL;
  const token = environment.CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Production customer security flows require CUSTOMER_NOTIFICATION_WEBHOOK_URL and CUSTOMER_NOTIFICATION_WEBHOOK_TOKEN'
    );
  }
  return new WebhookCustomerNotificationSender({ url, token });
}

module.exports = {
  CaptureCustomerNotificationSender,
  WebhookCustomerNotificationSender,
  createDefaultCustomerNotificationSender,
};
