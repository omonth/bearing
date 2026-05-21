const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../bearings.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 检查orders表是否有status列
  db.all("PRAGMA table_info(orders)", (err, columns) => {
    if (err) {
      console.error('检查表结构失败:', err);
      db.close();
      return;
    }

    const hasStatus = columns.some(col => col.name === 'status');
    const hasTrackingNumber = columns.some(col => col.name === 'tracking_number');
    const hasShippedAt = columns.some(col => col.name === 'shipped_at');
    const hasCompletedAt = columns.some(col => col.name === 'completed_at');

    if (!hasStatus) {
      db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'`);
      console.log('✓ 添加status列');
    }

    if (!hasTrackingNumber) {
      db.run(`ALTER TABLE orders ADD COLUMN tracking_number TEXT`);
      console.log('✓ 添加tracking_number列');
    }

    if (!hasShippedAt) {
      db.run(`ALTER TABLE orders ADD COLUMN shipped_at DATETIME`);
      console.log('✓ 添加shipped_at列');
    }

    if (!hasCompletedAt) {
      db.run(`ALTER TABLE orders ADD COLUMN completed_at DATETIME`);
      console.log('✓ 添加completed_at列');
    }

    // 创建订单状态历史表
    db.run(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `, (err) => {
      if (err) {
        console.error('创建订单状态历史表失败:', err);
      } else {
        console.log('✓ 订单状态历史表已创建');
      }
      db.close();
    });
  });
});
