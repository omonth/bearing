const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.isAbsolute(process.env.DB_PATH || '')
  ? process.env.DB_PATH
  : path.join(__dirname, '..', process.env.DB_PATH || 'bearings.db');
const db = new sqlite3.Database(dbPath);

// 创建管理员表
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // 检查是否已有管理员
  db.get('SELECT COUNT(*) as count FROM admins', async (err, row) => {
    if (err) {
      console.error('检查管理员失败:', err);
      db.close();
      return;
    }

    if (row.count === 0) {
      // 创建默认管理员账号
      const defaultPassword = await bcrypt.hash('admin123', 10);
      db.run(
        'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
        ['admin', defaultPassword, 'admin@bearing-sales.com', 'admin'],
        (err) => {
          if (err) {
            console.error('创建默认管理员失败:', err);
          } else {
            console.log('✓ 默认管理员账号已创建');
            console.log('  用户名: admin');
            console.log('  密码: admin123');
            console.log('  请登录后立即修改密码！');
          }
          db.close();
        }
      );
    } else {
      console.log('✓ 管理员表已存在');
      db.close();
    }
  });
});
