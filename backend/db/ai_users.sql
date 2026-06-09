-- AI 管理用户表（独立于现有 admin 用户）
CREATE TABLE IF NOT EXISTS ai_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- AI 操作日志表
CREATE TABLE IF NOT EXISTS ai_operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    admin_username TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'query')),
    target_table TEXT,
    target_id INTEGER,
    before_value TEXT,  -- JSON
    after_value TEXT,   -- JSON
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'rolled_back')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP
);

-- 默认管理员账户 (密码: admin123, bcrypt hash)
INSERT OR IGNORE INTO ai_users (username, password_hash, role) VALUES
    ('ai_admin', '$2b$10$defaulthashchangethisinproduction', 'admin');
