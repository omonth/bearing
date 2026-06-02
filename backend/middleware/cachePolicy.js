function createRedisRetryStrategy(maxAttempts = process.env.REDIS_RETRY_ATTEMPTS) {
  const rawAttempts = maxAttempts === undefined || maxAttempts === '' ? 1 : maxAttempts;
  const parsedAttempts = Number(rawAttempts);
  const retryLimit = Number.isFinite(parsedAttempts) && parsedAttempts >= 0 ? parsedAttempts : 1;

  return (times) => {
    if (times > retryLimit) {
      return null;
    }

    return Math.min(times * 50, 2000);
  };
}

function createRedisFailureReporter(logger) {
  let hasLoggedFailure = false;

  return {
    reset() {
      hasLoggedFailure = false;
    },

    report(error) {
      if (hasLoggedFailure) {
        return;
      }

      hasLoggedFailure = true;
      logger.warn('Redis connection failed; using no-cache mode', {
        error: error?.message || '',
      });
    },
  };
}

module.exports = {
  createRedisFailureReporter,
  createRedisRetryStrategy,
};
