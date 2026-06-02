const Redis = require('ioredis');
const logger = require('../logger');
const { createRedisFailureReporter, createRedisRetryStrategy } = require('./cachePolicy');

const redisFailureReporter = createRedisFailureReporter(logger);

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: createRedisRetryStrategy(),
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
};

let redis = null;
let isRedisAvailable = false;

try {
  redis = new Redis(redisConfig);

  redis.on('connect', () => {
    isRedisAvailable = true;
    redisFailureReporter.reset();
    logger.info('Redis connected', { host: redisConfig.host, port: redisConfig.port });
  });

  redis.on('error', (err) => {
    isRedisAvailable = false;
    redisFailureReporter.report(err);
  });

  redis.on('close', () => {
    const wasRedisAvailable = isRedisAvailable;
    isRedisAvailable = false;
    if (wasRedisAvailable) {
      logger.warn('Redis connection closed; using no-cache mode');
    }
  });
} catch (error) {
  logger.warn('Redis initialization failed; using no-cache mode', { error: error.message });
}

const cacheMiddleware = (keyPrefix, ttl = 300) => {
  return async (req, res, next) => {
    if (!isRedisAvailable || !redis) {
      return next();
    }

    const key = `${keyPrefix}:${req.originalUrl || req.url}`;

    try {
      const cachedData = await redis.get(key);
      if (cachedData) {
        logger.info('Cache hit', { key });
        return res.json(JSON.parse(cachedData));
      }
    } catch (error) {
      logger.warn('Cache read failed', { error: error.message, key });
    }

    const originalJson = res.json.bind(res);

    res.json = function(data) {
      if (isRedisAvailable && redis && res.statusCode === 200) {
        redis.setex(key, ttl, JSON.stringify(data)).catch((err) => {
          logger.warn('Cache write failed', { error: err.message, key });
        });
      }
      return originalJson(data);
    };

    next();
  };
};

const clearCache = async (pattern) => {
  if (!isRedisAvailable || !redis) {
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('Cache cleared', { pattern, count: keys.length });
    }
  } catch (error) {
    logger.warn('Cache clear failed', { error: error.message, pattern });
  }
};

const getCache = async (key) => {
  if (!isRedisAvailable || !redis) {
    return null;
  }

  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.warn('Cache get failed', { error: error.message, key });
    return null;
  }
};

const setCache = async (key, value, ttl = 300) => {
  if (!isRedisAvailable || !redis) {
    return false;
  }

  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.warn('Cache set failed', { error: error.message, key });
    return false;
  }
};

module.exports = {
  redis,
  cacheMiddleware,
  clearCache,
  getCache,
  setCache,
  isRedisAvailable: () => isRedisAvailable,
};
