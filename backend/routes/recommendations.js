const express = require('express');

module.exports = function(recommendationEngine) {
  const router = express.Router();

  router.get('/hot', async (req, res, next) => {
    try { res.json(await recommendationEngine.getHotProducts(parseInt(req.query.limit) || 10, parseInt(req.query.days) || 30)); } catch (e) { next(e); }
  });

  router.get('/similar/:id', async (req, res, next) => {
    try { res.json(await recommendationEngine.getSimilarProducts(parseInt(req.params.id), parseInt(req.query.limit) || 5)); } catch (e) { next(e); }
  });

  return router;
};
