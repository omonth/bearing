const SENSITIVE_KEY = /(?:authorization|proxy[_-]?authorization|cookie|password|passwd|pwd|token|jwt|secret|session[_-]?proof|auth[_-]?proof|api(?:v\d+)?[_-]?key|private[_-]?key|payment[_-]?key|certificate|payer|openid|nonce|signature|raw[_-]?body|id[_-]?card|bank[_-]?card)/i;
const PHONE_KEY = /(?:phone|mobile|telephone|tel)$/i;
const ADDRESS_KEY = /(?:address(?:_?detail)?|province|city|district)$/i;
const PERSON_KEY = /(?:customer_?name|payer_?name|recipient_?name)$/i;

function maskPhone(value) {
  const input = String(value);
  if (input.length < 7) return '[REDACTED]';
  return `${input.slice(0, 3)}****${input.slice(-4)}`;
}

function redactString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\b1[3-9]\d{9}\b/g, maskPhone)
    .replace(/((?:authorization|password|passwd|token|jwt|secret|api(?:v\d+)?[_-]?key|private[_-]?key|payment[_-]?key)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^,\s}]+)/gi, '$1[REDACTED]')
    .replace(/((?:^|[?&\s])(?:access_token|token|api_key|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}

function redactSensitive(value, key = '', seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (PHONE_KEY.test(key)) return value == null ? value : maskPhone(value);
  if (ADDRESS_KEY.test(key) || PERSON_KEY.test(key)) {
    return value == null ? value : '[REDACTED]';
  }
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry, '', seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactSensitive(entryValue, entryKey, seen),
    ])
  );
}

module.exports = {
  maskPhone,
  redactSensitive,
  redactString,
};
