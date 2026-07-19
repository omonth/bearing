const ADMIN_SESSION_COOKIE = 'admin_session';
const CUSTOMER_SESSION_COOKIE = 'customer_session';
const AI_SESSION_COOKIE = 'ai_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseCookies(header) {
  if (typeof header !== 'string' || !header.trim()) return {};
  return header.split(';').reduce((cookies, entry) => {
    const separator = entry.indexOf('=');
    if (separator <= 0) return cookies;
    const name = entry.slice(0, separator).trim();
    const rawValue = entry.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
    return cookies;
  }, {});
}

function getCookieOptions(env = process.env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

function setSessionCookie(res, name, token) {
  res.cookie(name, token, getCookieOptions());
}

function clearSessionCookie(res, name) {
  res.clearCookie(name, getCookieOptions());
}

function configuredOrigins(env = process.env) {
  const configured = String(env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (env.NODE_ENV === 'production') return new Set(configured);
  return new Set([
    ...configured,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
}

function hasBrowserSessionCookie(req) {
  const cookies = parseCookies(req.headers.cookie);
  return Boolean(
    cookies[ADMIN_SESSION_COOKIE]
    || cookies[CUSTOMER_SESSION_COOKIE]
    || cookies[AI_SESSION_COOKIE]
  );
}

function createCookieCsrfProtection(env = process.env) {
  const allowedOrigins = configuredOrigins(env);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)
      || !hasBrowserSessionCookie(req)
      || req.headers.authorization?.startsWith('Bearer ')) {
      return next();
    }

    const origin = typeof req.headers.origin === 'string'
      ? req.headers.origin.replace(/\/$/, '')
      : '';
    if (!origin || !allowedOrigins.has(origin)) {
      return res.status(403).json({
        error: '浏览器会话来源校验失败',
        code: 'CSRF_ORIGIN_REJECTED',
      });
    }
    return next();
  };
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  AI_SESSION_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  clearSessionCookie,
  configuredOrigins,
  createCookieCsrfProtection,
  getCookieOptions,
  parseCookies,
  setSessionCookie,
};
