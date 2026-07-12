const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../logger');
const { NotFoundError, ValidationError, UnauthorizedError, BusinessError } = require('../utils/errors');

const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'bearing-jwt-secret-change-in-production-min-32-chars',
]);

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

function isStrongJwtSecret(secret) {
  if (typeof secret !== 'string' || secret.trim().length < MIN_JWT_SECRET_LENGTH) {
    return false;
  }
  const normalized = secret.trim().toLowerCase();
  return !WEAK_JWT_SECRETS.has(normalized)
    && !normalized.includes('change-in-production');
}

class AuthService {
  constructor(db, config = {}) {
    this.db = db;
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.adminExpiresIn = config.adminExpiresIn || process.env.JWT_ADMIN_EXPIRES_IN || '8h';
    this.customerExpiresIn = config.customerExpiresIn || process.env.JWT_CUSTOMER_EXPIRES_IN || '7d';
    if (isProduction() && !isStrongJwtSecret(this.jwtSecret)) {
      throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} non-default characters in production`);
    }
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
    if (isProduction() && admin.username === 'admin' && password === 'admin123') {
      logger.error('拒绝生产环境默认管理员凭据登录', { username });
      throw new UnauthorizedError('默认管理员凭据已禁用，请使用安全的管理员账户');
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

  async bootstrapInitialAdmin({
    username = process.env.INITIAL_ADMIN_USERNAME,
    password = process.env.INITIAL_ADMIN_PASSWORD,
    email = process.env.INITIAL_ADMIN_EMAIL || null,
  } = {}) {
    const hasUsername = Boolean(username);
    const hasPassword = Boolean(password);
    if (hasUsername !== hasPassword) {
      throw new ValidationError('INITIAL_ADMIN_USERNAME 和 INITIAL_ADMIN_PASSWORD 必须同时配置');
    }
    if (!hasUsername) {
      return false;
    }
    if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username)) {
      throw new ValidationError('INITIAL_ADMIN_USERNAME 格式无效');
    }
    if (isProduction() && (password.length < 12 || password.toLowerCase() === 'admin123')) {
      throw new ValidationError('生产环境的 INITIAL_ADMIN_PASSWORD 至少需要 12 位且不能使用默认密码');
    }

    const adminCount = await this.db.get('SELECT COUNT(*) as count FROM admins');
    if (Number(adminCount.count) !== 0) {
      return false;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await this.db.run(
      'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, email, 'admin']
    );
    logger.info('初始管理员账户已创建', { username });
    return true;
  }
}

module.exports = AuthService;
module.exports.isStrongJwtSecret = isStrongJwtSecret;
