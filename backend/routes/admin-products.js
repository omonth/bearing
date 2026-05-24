const express = require('express');
const path = require('path');
const fs = require('fs');
const { body } = require('express-validator');
const logger = require('../logger');
const { handleValidationErrors } = require('../middleware/validation');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { clearCache } = require('../middleware/cache');

module.exports = function(db, bearingService, upload, imagesDir) {
  const router = express.Router();

  router.post('/', verifyToken, requireAdmin, [
    body('name').trim().notEmpty().withMessage('产品名称不能为空'),
    body('model').trim().notEmpty().withMessage('产品型号不能为空'),
    body('price').isFloat({ min: 0.01 }).withMessage('价格必须大于0'),
    body('category').trim().notEmpty().withMessage('分类不能为空'),
    body('stock').isInt({ min: 0 }).withMessage('库存不能为负数'),
    handleValidationErrors
  ], async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.create(req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.update(req.params.id, req.body);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.delete(req.params.id);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.put('/:id/stock', verifyToken, requireAdmin, async (req, res) => {
    if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
    const { data, error, status } = await bearingService.updateStock(req.params.id, req.body.stock);
    if (error) return res.status(status || 500).json({ error });
    res.json(data);
  });

  router.put('/:id/image', verifyToken, requireAdmin, (req, res) => {
    upload.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '请选择要上传的图片' });
      try {
        if (bearingService) {
          const { data: oldData } = await bearingService.getImagePath(req.params.id);
          if (oldData && oldData.image && oldData.image.startsWith('/images/')) {
            const oldPath = path.join(imagesDir, path.basename(oldData.image));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          const imageUrl = `/images/${req.file.filename}`;
          const { data, error, status } = await bearingService.updateImage(req.params.id, imageUrl);
          if (error) return res.status(status || 500).json({ error });
          return res.json(data);
        }
        const row = await db.get('SELECT image FROM bearings WHERE id = ?', [req.params.id]);
        if (row && row.image && row.image.startsWith('/images/')) {
          const oldPath = path.join(imagesDir, path.basename(row.image));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const imageUrl = `/images/${req.file.filename}`;
        await db.run('UPDATE bearings SET image = ? WHERE id = ?', [imageUrl, req.params.id]);
        clearCache('bearings:*');
        logger.info('产品图片已更新', { bearingId: req.params.id, image: imageUrl });
        res.json({ message: '产品图片已更新', url: imageUrl });
      } catch (dbErr) {
        logger.error('更新产品图片失败', { error: dbErr.message });
        res.status(500).json({ error: '更新产品图片失败' });
      }
    });
  });

  return router;
};
