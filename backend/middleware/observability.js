const logger = require('../logger');
const { requestContextMiddleware } = require('./requestContext');

function createRequestObservabilityMiddleware(metrics, alerter) {
  return [
    requestContextMiddleware,
    (req, res, next) => {
      const startedAt = process.hrtime.bigint();
      res.once('finish', () => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
        metrics.observeRequest(req, res.statusCode, durationSeconds);
        alerter?.recordHttpRequest?.(res.statusCode, durationSeconds * 1000);
        logger.info('HTTP请求完成', {
          requestId: req.id,
          method: req.method,
          route: req.route ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched',
          statusCode: res.statusCode,
          durationMs: Math.round(durationSeconds * 1000 * 100) / 100,
        });
      });
      next();
    },
  ];
}

module.exports = {
  createRequestObservabilityMiddleware,
};
