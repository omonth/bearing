class ReadinessService {
  constructor(options) {
    this.db = options.db;
    this.redis = options.redis;
    this.requireRedis = options.requireRedis === true;
    this.alerter = options.alerter;
  }

  async checkDatabase() {
    try {
      if (!this.db) throw new Error('database dependency missing');
      if (typeof this.db.get === 'function') {
        await this.db.get('SELECT 1 AS ready');
      } else if (typeof this.db.query === 'function') {
        await this.db.query('SELECT 1 AS ready');
      } else {
        throw new Error('database health operation missing');
      }
      void this.alerter?.notifyDependencyState('database', true);
      return 'up';
    } catch (_error) {
      void this.alerter?.notifyDependencyState('database', false);
      return 'down';
    }
  }

  async checkRedis() {
    if (!this.redis) {
      if (this.requireRedis) {
        void this.alerter?.notifyDependencyState('redis', false);
        return 'down';
      }
      return 'disabled';
    }

    try {
      if (typeof this.redis === 'function') {
        await this.redis();
      } else if (typeof this.redis.ping === 'function') {
        const result = await this.redis.ping();
        if (result !== undefined && result !== 'PONG' && result !== true) {
          throw new Error('unexpected Redis PING response');
        }
      } else {
        throw new Error('Redis health operation missing');
      }
      void this.alerter?.notifyDependencyState('redis', true);
      return 'up';
    } catch (_error) {
      void this.alerter?.notifyDependencyState('redis', false);
      return 'down';
    }
  }

  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const ready = database === 'up' && (redis === 'up' || redis === 'disabled');
    return {
      ready,
      checks: { database, redis },
    };
  }
}

module.exports = ReadinessService;
