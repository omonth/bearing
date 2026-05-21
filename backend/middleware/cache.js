const Redis = require('ioredis');
const logger = require('../logger');

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
};

let redis = null;
let isRedisAvailable = false;

try {
  redis = new Redis(redisConfig);

  redis.on('connect', () => {
    isRedisAvailable = true;
    logger.info('Redis连接成功', { host: redisConfig.host, port: redisConfig.port });
  });

  redis.on('error', (err) => {
    isRedisAvailable = false;
    logger.warn('Redis连接失败，将使用无缓存模式', { error: err.message });
  });

  redis.on('close', () => {
    isRedisAvailable = false;
    logger.warn('Redis连接已关闭');
  });
} catch (error) {
  logger.warn('Redis初始化失败，将使用无缓存模式', { error: error.message });
}

// 缓存中间件
const cacheMiddleware = (keyPrefix, ttl = 300) => {
  return async (req, res, next) => {
    if (!isRedisAvailable || !redis) {
      return next();
    }

    const key = `${keyPrefix}:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redis.get(key);
      if (cachedData) {
        logger.info('缓存命中', { key });
        return res.json(JSON.parse(cachedData));
      }
    } catch (error) {
      logger.warn('缓存读取失败', { error: error.message, key });
    }

    // 保存原始的res.json方法
    const originalJson = res.json.bind(res);

    // 重写res.json方法以缓存响应
    res.json = function(data) {
      if (isRedisAvailable && redis && res.statusCode === 200) {
        redis.setex(key, ttl, JSON.stringify(data)).catch(err => {
          logger.warn('缓存写入失败', { error: err.message, key });
        });
      }
      return originalJson(data);
    };

    next();
  };
};

// 清除缓存
const clearCache = async (pattern) => {
  if (!isRedisAvailable || !redis) {
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('缓存已清除', { pattern, count: keys.length });
    }
  } catch (error) {
    logger.warn('清除缓存失败', { error: error.message, pattern });
  }
};

// 获取缓存
const getCache = async (key) => {
  if (!isRedisAvailable || !redis) {
    return null;
  }

  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.warn('获取缓存失败', { error: error.message, key });
    return null;
  }
};

// 设置缓存
const setCache = async (key, value, ttl = 300) => {
  if (!isRedisAvailable || !redis) {
    return false;
  }

  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.warn('设置缓存失败', { error: error.message, key });
    return false;
  }
};

module.exports = {
  redis,
  cacheMiddleware,
  clearCache,
  getCache,
  setCache,
  isRedisAvailable: () => isRedisAvailable
};
