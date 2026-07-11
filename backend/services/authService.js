const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../logger');
const { NotFoundError, ValidationError, UnauthorizedError, BusinessError } = require('../utils/errors');

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
    const admin = await this.db.get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin) {
      throw new UnauthorizedError('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('用户名或密码错误');
    }

    await this.db.run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    const token = this._generateToken(admin.id, admin.username, admin.role);
    logger.info('登录成功', { username });
    return {
      token,
      user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role }
    };
  }

  async getMe(userId) {
    const admin = await this.db.get(
      'SELECT id, username, email, role, created_at, last_login FROM admins WHERE id = ?',
      [userId]
    );
    if (!admin) throw new NotFoundError('用户');
    return admin;
  }

  async changePassword(userId, oldPassword, newPassword) {
    const admin = await this.db.get('SELECT * FROM admins WHERE id = ?', [userId]);
    if (!admin) throw new BusinessError('修改密码失败', 500);

    const isPasswordValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('旧密码错误');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.db.run('UPDATE admins SET password = ? WHERE id = ?', [hashedPassword, userId]);
    logger.info('密码修改成功', { username: admin.username });
    return { message: '密码修改成功' };
  }
}

module.exports = AuthService;
