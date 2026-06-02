// 数据库适配器 - 支持SQLite和PostgreSQL
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../logger');

let db;
let dbType = process.env.DB_TYPE || 'sqlite';

// 将 ? 占位符转换为 PostgreSQL 的 $1, $2, ... 格式
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// 初始化数据库连接
function initDatabase() {
  if (dbType === 'postgres') {
    // 使用PostgreSQL
    const { pool } = require('./postgres');
    db = {
      type: 'postgres',
      pool,

      dateTrunc: (granularity, column) => `date_trunc('${granularity}', ${column})`,
      dateFormat: (period, column) => {
        switch (period) {
          case 'hour': return `TO_CHAR(${column}, 'HH24:00')`;
          case 'week': return `TO_CHAR(${column}, 'IYYY-IW')`;
          case 'month': return `TO_CHAR(${column}, 'YYYY-MM')`;
          default: return `TO_CHAR(${column}, 'YYYY-MM-DD')`;
        }
      },
      dateInterval: (offset) => {
        const match = offset.match(/^-\s*(\d+)\s*(\w+)$/);
        if (match) return `NOW() - INTERVAL '${match[1]} ${match[2]}'`;
        return `NOW() - INTERVAL '${offset}'`;
      },
      dateNow: () => 'NOW()',

      query: async (sql, params = []) => {
        try {
          const pgSql = convertPlaceholders(sql);
          const result = await pool.query(pgSql, params);
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
          let pgSql = convertPlaceholders(sql);
          // 为 INSERT 自动加 RETURNING id，兼容 lastID 语义
          if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
            pgSql = convertPlaceholders(sql) + ' RETURNING id';
          }
          const result = await pool.query(pgSql, params);
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
      },

      transaction: async (callback) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tx = {
            get: async (sql, params = []) => {
              const pgSql = convertPlaceholders(sql);
              const result = await client.query(pgSql, params);
              return result.rows[0] || null;
            },
            run: async (sql, params = []) => {
              let pgSql = convertPlaceholders(sql);
              if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
                pgSql = convertPlaceholders(sql) + ' RETURNING id';
              }
              const result = await client.query(pgSql, params);
              return { lastID: result.rows[0]?.id, changes: result.rowCount };
            },
            all: async (sql, params = []) => {
              const pgSql = convertPlaceholders(sql);
              const result = await client.query(pgSql, params);
              return result.rows;
            }
          };
          const result = await callback(tx);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    };

    logger.info('使用PostgreSQL数据库');
  } else {
    // 使用SQLite
    const defaultDbPath = process.env.NODE_ENV === 'production'
      ? path.join('/var/data', 'bearings.db')
      : path.join(__dirname, '..', 'bearings.db');
    const dbPath = process.env.DB_PATH || defaultDbPath;
    const sqliteDb = new sqlite3.Database(dbPath);

    db = {
      type: 'sqlite',
      sqlite: sqliteDb,

      dateTrunc: (granularity, column) => granularity === 'day' ? `date(${column})` : `date(${column})`,
      dateFormat: (period, column) => {
        switch (period) {
          case 'hour': return `strftime('%H:00', ${column})`;
          case 'week': return `strftime('%Y-W%W', ${column})`;
          case 'month': return `strftime('%Y-%m', ${column})`;
          default: return `strftime('%Y-%m-%d', ${column})`;
        }
      },
      dateInterval: (offset) => `datetime('now', '${offset}')`,
      dateNow: () => "datetime('now')",

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
      },

      transaction: async (callback) => {
        return new Promise((resolve, reject) => {
          sqliteDb.serialize(async () => {
            sqliteDb.run('BEGIN TRANSACTION');
            try {
              const result = await callback({
                run: (sql, params = []) => new Promise((res, rej) => {
                  sqliteDb.run(sql, params, function(err) {
                    if (err) rej(err);
                    else res({ lastID: this.lastID, changes: this.changes });
                  });
                }),
                get: (sql, params = []) => new Promise((res, rej) => {
                  sqliteDb.get(sql, params, (err, row) => {
                    if (err) rej(err);
                    else res(row || null);
                  });
                }),
                all: (sql, params = []) => new Promise((res, rej) => {
                  sqliteDb.all(sql, params, (err, rows) => {
                    if (err) rej(err);
                    else res(rows);
                  });
                })
              });
              sqliteDb.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve(result);
              });
            } catch (error) {
              sqliteDb.run('ROLLBACK', () => {
                reject(error);
              });
            }
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
  closeDatabase,
  convertPlaceholders
};
