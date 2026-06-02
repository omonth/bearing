import { describe, expect, it, vi } from 'vitest';

const {
  createRedisFailureReporter,
  createRedisRetryStrategy,
} = require('../middleware/cachePolicy');

describe('cachePolicy', () => {
  it('stops retrying redis after the configured attempt limit', () => {
    const retryStrategy = createRedisRetryStrategy(2);

    expect([retryStrategy(1), retryStrategy(2), retryStrategy(3)]).toEqual([
      50,
      100,
      null,
    ]);
  });

  it('uses one retry for invalid redis retry limits', () => {
    const retryStrategy = createRedisRetryStrategy('not-a-number');

    expect([retryStrategy(1), retryStrategy(2)]).toEqual([50, null]);
  });

  it('reports repeated redis failures only once until reset', () => {
    const logger = { warn: vi.fn() };
    const reporter = createRedisFailureReporter(logger);

    reporter.report(new Error('connect refused'));
    reporter.report(new Error('still down'));
    reporter.reset();
    reporter.report(new Error('down again'));

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls.map(([message]) => message)).toEqual([
      'Redis connection failed; using no-cache mode',
      'Redis connection failed; using no-cache mode',
    ]);
  });
});
