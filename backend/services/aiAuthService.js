const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../logger');

const DEVELOPMENT_AI_JWT_SECRET = 'development-ai-jwt-secret-not-for-production';
const MIN_AI_JWT_SECRET_LENGTH = 32;
const WEAK_AI_JWT_SECRETS = new Set([
  'ai-jwt-secret-change-me',
  'your-secret-key-change-in-production',
  'bearing-jwt-secret-change-in-production-min-32-chars',
]);
const DUMMY_AI_PASSWORD_HASH = '$2b$10$C84RtBLD5qZjINso0ykEbublUglHL0uBNezsXPrv5TEg0UiC6eOUW';

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

function isStrongAiJwtSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_AI_JWT_SECRET_LENGTH) {
    return false;
  }

  const normalized = secret.trim().toLowerCase();
  return normalized.length >= MIN_AI_JWT_SECRET_LENGTH
    && !WEAK_AI_JWT_SECRETS.has(normalized)
    && !normalized.includes('change-me')
    && !normalized.includes('change-in-production');
}

function resolveAiJwtSecret(env = process.env) {
  const configuredSecret = env.AI_JWT_SECRET
    || (!isProduction(env) ? env.JWT_SECRET : null)
    || (!isProduction(env) ? DEVELOPMENT_AI_JWT_SECRET : null);

  if (isProduction(env) && !isStrongAiJwtSecret(configuredSecret)) {
    throw new Error(
      `AI_JWT_SECRET must be configured with at least ${MIN_AI_JWT_SECRET_LENGTH} non-default characters in production`
    );
  }

  return configuredSecret;
}

class AIAuthService {
  constructor(db, config = {}) {
    this.db = db;
    this.jwtSecret = config.jwtSecret || resolveAiJwtSecret();
    if (isProduction() && !isStrongAiJwtSecret(this.jwtSecret)) {
      throw new Error(
        `AI_JWT_SECRET must be configured with at least ${MIN_AI_JWT_SECRET_LENGTH} non-default characters in production`
      );
    }

    this.expiresIn = config.expiresIn || '8h';
    this.bootstrapUsername = config.bootstrapUsername ?? process.env.AI_BOOTSTRAP_USERNAME ?? null;
    this.bootstrapPassword = config.bootstrapPassword ?? process.env.AI_BOOTSTRAP_PASSWORD ?? null;
    this._validateBootstrapConfig();
    this.ready = this._bootstrapInitialAdmin();
  }

  _validateBootstrapConfig() {
    const hasUsername = Boolean(this.bootstrapUsername);
    const hasPassword = Boolean(this.bootstrapPassword);

    if (hasUsername !== hasPassword) {
      throw new Error('AI_BOOTSTRAP_USERNAME and AI_BOOTSTRAP_PASSWORD must be configured together');
    }

    if (!hasUsername) {
      return;
    }

    if (!/^[A-Za-z0-9_.-]{3,100}$/.test(this.bootstrapUsername)) {
      throw new Error('AI_BOOTSTRAP_USERNAME must be 3-100 URL-safe characters');
    }

    if (isProduction() && (
      this.bootstrapPassword.length < 12
      || this.bootstrapPassword.toLowerCase() === 'admin123'
    )) {
      throw new Error('AI_BOOTSTRAP_PASSWORD must be at least 12 characters and not a default password in production');
    }
  }

  async _bootstrapInitialAdmin() {
    const count = await this.db.get('SELECT COUNT(*) as count FROM ai_users');
    if (Number(count.count) !== 0) {
      return;
    }

    if (!this.bootstrapUsername) {
      logger.warn('AI 管理账户尚未初始化；设置 AI_BOOTSTRAP_USERNAME 和 AI_BOOTSTRAP_PASSWORD 后重启以创建一次性管理员账户');
      return;
    }

    const hash = await bcrypt.hash(this.bootstrapPassword, 10);
    await this.db.run(
      'INSERT INTO ai_users (username, password_hash, role) VALUES (?, ?, ?)',
      [this.bootstrapUsername, hash, 'admin']
    );
    logger.info('AI 管理员引导账户已创建', { username: this.bootstrapUsername });
  }

  async login(username, password) {
    await this.ready;
    const user = await this.db.get('SELECT * FROM ai_users WHERE username = ?', [username]);
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_AI_PASSWORD_HASH);
    if (!user || !valid) return { error: '用户名或密码错误', status: 401 };

    await this.db.run('UPDATE ai_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        type: 'ai',
        sessionProof: this._sessionProof(user.id, user.password_hash),
      },
      this.jwtSecret,
      { expiresIn: this.expiresIn }
    );

    logger.info('AI用户登录成功', { username, role: user.role });
    return { data: { token, user: { id: user.id, username: user.username, role: user.role } } };
  }

  _sessionProof(userId, passwordHash) {
    return crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`ai-session:${userId}:${passwordHash}`)
      .digest('hex');
  }

  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      if (decoded.type !== 'ai'
        || !Number.isSafeInteger(decoded.id)
        || typeof decoded.sessionProof !== 'string'
        || !/^[a-f0-9]{64}$/.test(decoded.sessionProof)) return null;
      const user = await this.db.get(
        'SELECT username, password_hash, role FROM ai_users WHERE id = ?',
        [decoded.id]
      );
      if (!user || user.role !== decoded.role || user.username !== decoded.username) return null;
      const expected = Buffer.from(this._sessionProof(decoded.id, user.password_hash), 'hex');
      const supplied = Buffer.from(decoded.sessionProof, 'hex');
      if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  async logOperation({ adminId, adminUsername, action, targetTable, targetId, beforeValue, afterValue, reason, status = 'pending' }) {
    await this.ready;
    const result = await this.db.run(
      `INSERT INTO ai_operation_logs (admin_id, admin_username, action, target_table, target_id, before_value, after_value, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, adminUsername, action, targetTable, targetId,
       beforeValue ? JSON.stringify(beforeValue) : null,
       afterValue ? JSON.stringify(afterValue) : null,
       reason, status]
    );
    return result.lastID;
  }

  async getLogs({ page = 1, limit = 20, action, status } = {}) {
    await this.ready;
    let where = 'WHERE 1=1';
    const params = [];
    if (action) { where += ' AND action = ?'; params.push(action); }
    if (status) { where += ' AND status = ?'; params.push(status); }

    const offset = (page - 1) * limit;
    const [rows, count] = await Promise.all([
      this.db.all(`SELECT * FROM ai_operation_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      this.db.get(`SELECT COUNT(*) as total FROM ai_operation_logs ${where}`, params),
    ]);

    return { data: rows, total: count.total, page, limit };
  }

  async getLogById(id) {
    await this.ready;
    return this.db.get('SELECT * FROM ai_operation_logs WHERE id = ?', [id]);
  }

  async updateLogStatus(id, status) {
    await this.ready;
    await this.db.run('UPDATE ai_operation_logs SET status = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  }
}

module.exports = AIAuthService;
module.exports.isStrongAiJwtSecret = isStrongAiJwtSecret;
module.exports.resolveAiJwtSecret = resolveAiJwtSecret;
