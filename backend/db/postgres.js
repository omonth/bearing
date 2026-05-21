const { Pool } = require('pg');
const logger = require('./logger');

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bearing_sales',
  user: process.env.DB_USER || 'bearing_admin',
  password: process.env.DB_PASSWORD || 'password',

  // 连接池配置
  max: 20, // 最大连接数
  min: 5,  // 最小连接数
  idleTimeoutMillis: 30000, // 空闲连接超时时间
  connectionTimeoutMillis: 2000, // 连接超时时间
};

// 创建连接池
const pool = new Pool(dbConfig);

// 连接池事件监听
pool.on('connect', () => {
  logger.info('PostgreSQL连接池：新连接已建立');
});

pool.on('error', (err) => {
  logger.error('PostgreSQL连接池错误', { error: err.message });
});

pool.on('remove', () => {
  logger.info('PostgreSQL连接池：连接已移除');
});

// 测试连接
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('PostgreSQL连接测试失败', { error: err.message });
  } else {
    logger.info('PostgreSQL连接成功', { time: res.rows[0].now });
  }
});

// 查询辅助函数
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('执行查询', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('查询失败', { text, error: error.message });
    throw error;
  }
};

// 事务辅助函数
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// 优雅关闭
const close = async () => {
  await pool.end();
  logger.info('PostgreSQL连接池已关闭');
};

module.exports = {
  pool,
  query,
  transaction,
  close
};
