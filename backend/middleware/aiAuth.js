const AIAuthService = require('../services/aiAuthService');

function createAIAuthMiddleware(aiAuthService) {
  return function requireAIRole(...roles) {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未登录' });
      }

      const token = authHeader.slice(7);
      const decoded = aiAuthService.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: '登录已过期，请重新登录' });
      }

      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: '权限不足' });
      }

      req.aiUser = decoded;
      next();
    };
  };
}

module.exports = { createAIAuthMiddleware };
