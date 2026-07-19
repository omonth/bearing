const { AI_SESSION_COOKIE, parseCookies } = require('./sessionCookies');

function createAIAuthMiddleware(aiAuthService) {
  return function requireAIRole(...roles) {
    return async (req, res, next) => {
      const authHeader = req.headers.authorization;
      const cookieToken = parseCookies(req.headers.cookie)[AI_SESSION_COOKIE];
      if (authHeader && !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未登录' });
      }
      const token = authHeader?.slice(7).trim() || cookieToken;
      if (!token) return res.status(401).json({ error: '未登录' });

      const decoded = await aiAuthService.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: '登录已过期，请重新登录' });
      }

      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: '权限不足' });
      }

      req.aiUser = decoded;
      return next();
    };
  };
}

module.exports = { createAIAuthMiddleware };
