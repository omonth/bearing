const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../bearings.db');
const db = new sqlite3.Database(dbPath);

// 创建全文搜索表
db.serialize(() => {
  // 创建FTS5虚拟表
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bearings_fts USING fts5(
      id UNINDEXED,
      name,
      model,
      category,
      description,
      content='bearings',
      content_rowid='id'
    )
  `);

  // 创建触发器：插入时同步到FTS表
  db.run(`
    CREATE TRIGGER IF NOT EXISTS bearings_ai AFTER INSERT ON bearings BEGIN
      INSERT INTO bearings_fts(id, name, model, category, description)
      VALUES (new.id, new.name, new.model, new.category, new.description);
    END
  `);

  // 创建触发器：更新时同步到FTS表
  db.run(`
    CREATE TRIGGER IF NOT EXISTS bearings_au AFTER UPDATE ON bearings BEGIN
      UPDATE bearings_fts
      SET name = new.name, model = new.model, category = new.category, description = new.description
      WHERE id = old.id;
    END
  `);

  // 创建触发器：删除时同步到FTS表
  db.run(`
    CREATE TRIGGER IF NOT EXISTS bearings_ad AFTER DELETE ON bearings BEGIN
      DELETE FROM bearings_fts WHERE id = old.id;
    END
  `);

  // 同步现有数据到FTS表
  db.run(`
    INSERT OR REPLACE INTO bearings_fts(id, name, model, category, description)
    SELECT id, name, model, category, description FROM bearings
  `, (err) => {
    if (err) {
      console.error('同步FTS数据失败:', err);
    } else {
      console.log('✓ 全文搜索索引已创建');
    }
  });

  // 为常用查询字段创建索引
  db.run('CREATE INDEX IF NOT EXISTS idx_bearings_category ON bearings(category)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bearings_model ON bearings(model)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bearings_price ON bearings(price)');
  db.run('CREATE INDEX IF NOT EXISTS idx_bearings_stock ON bearings(stock)');

  console.log('✓ 数据库索引已创建');
});

db.close();
