const express = require('express');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const { verifyToken } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

module.exports = function(authService) {
  const router = express.Router();

  router.post('/login', loginLimiter, [
    body('username').trim().notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!authService) return res.status(500).json({ error: '认证服务未配置' });
      const { username, password } = req.body;
      const data = await authService.login(username, password);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/change-password', verifyToken, [
    body('oldPassword').notEmpty().withMessage('旧密码不能为空'),
    body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位'),
    handleValidationErrors
  ], async (req, res, next) => {
    try {
      if (!authService) return res.status(500).json({ error: '认证服务未配置' });
      const { oldPassword, newPassword } = req.body;
      const data = await authService.changePassword(req.user.userId, oldPassword, newPassword);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', verifyToken, async (req, res, next) => {
    try {
      if (!authService) return res.status(500).json({ error: '认证服务未配置' });
      const data = await authService.getMe(req.user.userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
