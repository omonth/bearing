const express = require('express');
const { cacheMiddleware } = require('../middleware/cache');

module.exports = function(bearingService) {
  const router = express.Router();

  router.get('/search', cacheMiddleware('search', 300), async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.search(req.query);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/search/suggestions', cacheMiddleware('suggestions', 1800), async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.searchSuggestions(req.query.q);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/bearings', cacheMiddleware('bearings', 600), async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.list(req.query.category);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/bearings/:id', async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.getById(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/categories', cacheMiddleware('categories', 3600), async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.getCategories();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
