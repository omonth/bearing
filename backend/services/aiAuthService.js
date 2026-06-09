const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../logger');

const AI_JWT_SECRET = process.env.AI_JWT_SECRET || process.env.JWT_SECRET || 'ai-jwt-secret-change-me';
const AI_JWT_EXPIRES = '8h';

class AIAuthService {
  constructor(db) {
    this.db = db;
    this._ensureTable();
  }

  async _ensureTable() {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        admin_username TEXT NOT NULL,
        action TEXT NOT NULL,
        target_table TEXT,
        target_id INTEGER,
        before_value TEXT,
        after_value TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        executed_at TIMESTAMP
      )
    `);

    // Seed default admin if no users exist
    const count = await this.db.get('SELECT COUNT(*) as count FROM ai_users');
    if (count.count === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await this.db.run(
        'INSERT INTO ai_users (username, password_hash, role) VALUES (?, ?, ?)',
        ['ai_admin', hash, 'admin']
      );
      logger.info('AI管理员默认账户已创建: ai_admin / admin123');
    }
  }

  async login(username, password) {
    const user = await this.db.get('SELECT * FROM ai_users WHERE username = ?', [username]);
    if (!user) return { error: '用户名或密码错误', status: 401 };

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return { error: '用户名或密码错误', status: 401 };

    await this.db.run('UPDATE ai_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, type: 'ai' },
      AI_JWT_SECRET,
      { expiresIn: AI_JWT_EXPIRES }
    );

    logger.info('AI用户登录成功', { username, role: user.role });
    return { data: { token, user: { id: user.id, username: user.username, role: user.role } } };
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, AI_JWT_SECRET);
      if (decoded.type !== 'ai') return null;
      return decoded;
    } catch {
      return null;
    }
  }

  // ── Operation logs ─────────────────────────────────────────────────────

  async logOperation({ adminId, adminUsername, action, targetTable, targetId, beforeValue, afterValue, reason, status = 'pending' }) {
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
    return this.db.get('SELECT * FROM ai_operation_logs WHERE id = ?', [id]);
  }

  async updateLogStatus(id, status) {
    await this.db.run('UPDATE ai_operation_logs SET status = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
  }
}

module.exports = AIAuthService;
