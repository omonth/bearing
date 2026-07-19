const express = require('express');
const logger = require('../logger');
const {
  AI_SESSION_COOKIE,
  clearSessionCookie,
  setSessionCookie,
} = require('../middleware/sessionCookies');

module.exports = function(aiAuthService, requireAIRole, db) {
  const router = express.Router();

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: '请输入用户名和密码' });
      }
      const result = await aiAuthService.login(username, password);
      if (result.error) return res.status(result.status || 401).json({ error: result.error });
      setSessionCookie(res, AI_SESSION_COOKIE, result.data.token);
      res.json(result.data);
    } catch (error) {
      logger.error('AI登录失败', { error: error.message });
      res.status(500).json({ error: '登录失败' });
    }
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res, AI_SESSION_COOKIE);
    res.json({ loggedOut: true });
  });

  // Get current user info
  router.get('/me', requireAIRole(), (req, res) => {
    res.json({ user: req.aiUser });
  });

  // Get operation logs
  router.get('/logs', requireAIRole('viewer', 'editor', 'admin'), async (req, res) => {
    try {
      const { page, limit, action, status } = req.query;
      const result = await aiAuthService.getLogs({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        action,
        status,
      });
      res.json(result);
    } catch (error) {
      logger.error('获取操作日志失败', { error: error.message });
      res.status(500).json({ error: '获取日志失败' });
    }
  });

  // Rollback an operation
  router.post('/logs/:id/rollback', requireAIRole('admin'), async (req, res) => {
    try {
      const log = await aiAuthService.getLogById(parseInt(req.params.id));
      if (!log) return res.status(404).json({ error: '日志不存在' });
      if (log.status !== 'executed') return res.status(400).json({ error: '只能回滚已执行的操作' });
      if (log.action !== 'update') return res.status(400).json({ error: '仅支持回滚 update 操作' });

      const beforeValue = JSON.parse(log.before_value || '{}');
      const field = Object.keys(beforeValue)[0];
      if (!field) return res.status(400).json({ error: '无法解析原始值' });

      // Restore the old value
      const updateFields = { [field]: beforeValue[field] };
      await db.run(`UPDATE bearings SET ${field} = ? WHERE id = ?`, [beforeValue[field], log.target_id]);

      await aiAuthService.updateLogStatus(log.id, 'rolled_back');

      logger.info('AI操作已回滚', { logId: log.id, field, restoredValue: beforeValue[field] });
      res.json({ message: `已回滚: ${field} 恢复为 ${beforeValue[field]}` });
    } catch (error) {
      logger.error('回滚失败', { error: error.message });
      res.status(500).json({ error: '回滚失败' });
    }
  });

  return router;
};
