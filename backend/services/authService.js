const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../logger');
const { NotFoundError, ValidationError, UnauthorizedError, BusinessError } = require('../utils/errors');

const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'bearing-jwt-secret-change-in-production-min-32-chars',
]);
const DUMMY_ADMIN_PASSWORD_HASH = '$2b$10$C84RtBLD5qZjINso0ykEbublUglHL0uBNezsXPrv5TEg0UiC6eOUW';
const COMMON_ADMIN_PASSWORDS = new Set([
  'admin12345678',
  'password1234', // gitleaks:allow - intentionally rejected weak-password dictionary entry
  'qwerty123456',
  'administrator',
  'welcome12345',
  'changeme12345',
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

function validateAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new ValidationError('管理员密码长度必须为 12 至 128 位', 'newPassword');
  }
  const normalized = password.trim().toLowerCase();
  if (COMMON_ADMIN_PASSWORDS.has(normalized)
    || /^(.)\1+$/.test(password)
    || /^(0123456789|1234567890|abcdefghijklmnopqrstuvwxyz)$/i.test(normalized)) {
    throw new ValidationError('管理员密码过于常见或容易猜测', 'newPassword');
  }
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

  _generateToken(userId, username, role = 'admin', sessionVersion = 1) {
    const expiresIn = role === 'customer' ? this.customerExpiresIn : this.adminExpiresIn;
    return jwt.sign(
      { userId, username, role, sessionVersion },
      this.jwtSecret,
      { expiresIn }
    );
  }

  async login(username, password) {
    const admin = await this.db.get('SELECT * FROM admins WHERE username = ?', [username]);
    const isPasswordValid = await bcrypt.compare(
      password,
      admin?.password || DUMMY_ADMIN_PASSWORD_HASH
    );
    if (!admin || !isPasswordValid) {
      throw new UnauthorizedError('用户名或密码错误');
    }
    if (isProduction() && admin.username === 'admin' && password === 'admin123') {
      logger.error('拒绝生产环境默认管理员凭据登录', { username });
      throw new UnauthorizedError('默认管理员凭据已禁用，请使用安全的管理员账户');
    }

    await this.db.run('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);
    const token = this._generateToken(
      admin.id,
      admin.username,
      admin.role,
      Number(admin.session_version)
    );
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

    validateAdminPassword(newPassword);
    if (await bcrypt.compare(newPassword, admin.password)) {
      throw new ValidationError('新密码不能与当前密码相同', 'newPassword');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.db.transaction(async (transaction) => {
      const lockClause = this.db.type === 'postgres' ? ' FOR UPDATE' : '';
      const current = await transaction.get(
        `SELECT password FROM admins WHERE id = ?${lockClause}`,
        [userId]
      );
      if (!current || !await bcrypt.compare(oldPassword, current.password)) {
        throw new UnauthorizedError('旧密码错误');
      }
      await transaction.run(
        `UPDATE admins
         SET password = ?, session_version = session_version + 1
         WHERE id = ?`,
        [hashedPassword, userId]
      );
    });
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
    validateAdminPassword(password);

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
module.exports.validateAdminPassword = validateAdminPassword;
