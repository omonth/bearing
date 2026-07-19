const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeRequestId(value) {
  if (typeof value !== 'string' || !SAFE_REQUEST_ID.test(value)) {
    return crypto.randomUUID();
  }
  return value;
}

function requestContextMiddleware(req, res, next) {
  const requestId = normalizeRequestId(req.get('x-request-id'));
  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  requestContext.run({ requestId }, next);
}

function getRequestContext() {
  return requestContext.getStore();
}

module.exports = {
  getRequestContext,
  normalizeRequestId,
  requestContextMiddleware,
};
