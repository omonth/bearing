const express = require('express');
const { cacheMiddleware } = require('../middleware/cache');

module.exports = function(bearingService) {
  const router = express.Router();

  router.get('/search', cacheMiddleware('search', 300), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.search(req.query);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.get('/search/suggestions', cacheMiddleware('suggestions', 1800), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.searchSuggestions(req.query.q);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.get('/bearings', cacheMiddleware('bearings', 600), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.list(req.query.category);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.get('/bearings/:id', async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.getById(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.get('/categories', cacheMiddleware('categories', 3600), async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.getCategories();
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  return router;
};
