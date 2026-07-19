const http = require('http');
const https = require('https');

function validateWebhookUrl(value, env = process.env) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:')) {
    throw new Error('BACKUP_ALERT_WEBHOOK_URL must use HTTPS in production');
  }
  return url;
}

async function sendWebhook(urlValue, payload, env = process.env) {
  const url = validateWebhookUrl(urlValue, env);
  if (!url) return;

  const body = Buffer.from(JSON.stringify(payload));
  const transport = url.protocol === 'https:' ? https : http;
  await new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': body.length,
      },
      timeout: Number(env.BACKUP_ALERT_TIMEOUT_MS || 10000),
    }, (response) => {
      response.resume();
      response.once('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`Backup alert webhook returned HTTP ${response.statusCode}`));
      });
    });
    request.once('timeout', () => request.destroy(new Error('Backup alert webhook timed out')));
    request.once('error', reject);
    request.end(body);
  });
}

module.exports = { sendWebhook, validateWebhookUrl };
