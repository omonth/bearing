const express = require('express');
const ReadinessService = require('../services/observability/readiness');

module.exports = function createObservabilityRoutes(options) {
  const router = express.Router();
  const readiness = new ReadinessService(options);

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    const result = await readiness.check();
    res.status(result.ready ? 200 : 503).json({
      status: result.ready ? 'ready' : 'not_ready',
      checks: result.checks,
    });
  });

  router.get('/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4; charset=utf-8').send(options.metrics.render());
  });

  return router;
};
