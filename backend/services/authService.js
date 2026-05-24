const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../logger');

class AuthService {
  constructor(db, config = {}) {
    this.db = db;
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.adminExpiresIn = config.adminExpiresIn || process.env.JWT_ADMIN_EXPIRES_IN || '8h';
    this.customerExpiresIn = config.customerExpiresIn || process.env.JWT_CUSTOMER_EXPIRES_IN || '7d';
  }

  _generateToken(userId, username, role = 'admin') {
    const expiresIn = role === 'customer' ? this.customerExpiresIn : this.adminExpiresIn;
    return jwt.sign(
      { userId, username, role },
      this.jwtSecret,
      { expiresIn }
    );
  }

  async login(username, password) {
    try {
      const admin = await this.db.get('SELECT * FROM admins WHERE username = ?', [username]);
      if (!admin) {
        logger.warn('登录失败 - 用户不存在', { username });
        return { data: null, error: '用户名或密码错误', status: 401 };
      }

      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (!isPasswordValid) {
        logger.warn('登录失败 - 密码错误', { username });
        return { data: null, error: '用户名或密码错误', status: 401 };
      }

      await this.db.run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
      const token = this._generateToken(admin.id, admin.username, admin.role);
      logger.info('登录成功', { username });
      return {
        data: {
          token,
          user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role }
        },
        error: null
      };
    } catch (err) {
      logger.error('登录查询失败', { error: err.message });
      return { data: null, error: '登录失败', status: 500 };
    }
  }

  async getMe(userId) {
    try {
      const admin = await this.db.get(
        'SELECT id, username, email, role, created_at, last_login FROM admins WHERE id = ?',
        [userId]
      );
      if (!admin) return { data: null, error: '用户不存在', status: 404 };
      return { data: admin, error: null };
    } catch (err) {
      return { data: null, error: err.message, status: 500 };
    }
  }

  async changePassword(userId, oldPassword, newPassword) {
    try {
      const admin = await this.db.get('SELECT * FROM admins WHERE id = ?', [userId]);
      if (!admin) return { data: null, error: '修改密码失败', status: 500 };

      const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);
      if (!isPasswordValid) {
        logger.warn('修改密码失败 - 旧密码错误', { username: admin.username });
        return { data: null, error: '旧密码错误', status: 401 };
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db.run('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, userId]);
      logger.info('密码修改成功', { username: admin.username });
      return { data: { message: '密码修改成功' }, error: null };
    } catch (err) {
      logger.error('修改密码失败', { error: err.message });
      return { data: null, error: '修改密码失败', status: 500 };
    }
  }
}

module.exports = AuthService;
