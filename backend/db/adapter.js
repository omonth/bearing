// 数据库适配器 - 支持SQLite和PostgreSQL
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

let db;
let dbType = process.env.DB_TYPE || 'sqlite';

// 初始化数据库连接
function initDatabase() {
  if (dbType === 'postgres') {
    // 使用PostgreSQL
    const { pool } = require('./postgres');
    db = {
      type: 'postgres',
      pool,

      query: async (sql, params = []) => {
        try {
          const result = await pool.query(sql, params);
          return result.rows;
        } catch (error) {
          logger.error('PostgreSQL查询失败', { sql, error: error.message });
          throw error;
        }
      },

      get: async (sql, params = []) => {
        const rows = await db.query(sql, params);
        return rows[0] || null;
      },

      run: async (sql, params = []) => {
        try {
          const result = await pool.query(sql, params);
          return {
            lastID: result.rows[0]?.id,
            changes: result.rowCount
          };
        } catch (error) {
          logger.error('PostgreSQL执行失败', { sql, error: error.message });
          throw error;
        }
      },

      all: async (sql, params = []) => {
        return await db.query(sql, params);
      }
    };

    logger.info('使用PostgreSQL数据库');
  } else {
    // 使用SQLite
    const dbPath = path.join(__dirname, '..', process.env.DB_PATH || 'bearings.db');
    const sqliteDb = new sqlite3.Database(dbPath);

    db = {
      type: 'sqlite',
      sqlite: sqliteDb,

      query: (sql, params = []) => {
        return new Promise((resolve, reject) => {
          sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      },

      get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
          sqliteDb.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
          });
        });
      },

      run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
          sqliteDb.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
          });
        });
      },

      all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
          sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      }
    };

    logger.info('使用SQLite数据库', { path: dbPath });
  }

  return db;
}

// 获取数据库实例
function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

// 关闭数据库连接
async function closeDatabase() {
  if (db) {
    if (db.type === 'postgres') {
      await db.pool.end();
    } else {
      db.sqlite.close();
    }
    logger.info('数据库连接已关闭');
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};
