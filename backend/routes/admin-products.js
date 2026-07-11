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
  ], async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.create(req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.update(req.params.id, req.body);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.delete(req.params.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/stock', verifyToken, requireAdmin, async (req, res, next) => {
    try {
      if (!bearingService) return res.status(500).json({ error: '产品服务未配置' });
      const data = await bearingService.updateStock(req.params.id, req.body.stock);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/image', verifyToken, requireAdmin, (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '请选择要上传的图片' });
      try {
        if (bearingService) {
          const oldData = await bearingService.getImagePath(req.params.id);
          if (oldData && oldData.image && oldData.image.startsWith('/images/')) {
            const oldPath = path.join(imagesDir, path.basename(oldData.image));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
          const imageUrl = `/images/${req.file.filename}`;
          const data = await bearingService.updateImage(req.params.id, imageUrl);
          return res.json({ data });
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
        res.json({ data: { message: '产品图片已更新', url: imageUrl } });
      } catch (dbErr) {
        next(dbErr);
      }
    });
  });

  return router;
};
