const express = require('express');
const path = require('path');
const fs = require('fs');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { NotFoundError } = require('../utils/errors');
const { validateMime } = require('../middleware/upload');
const { clearCache } = require('../middleware/cache');
const logger = require('../logger');

module.exports = function(db, upload, imagesDir) {
  const router = express.Router();

  router.post('/image', verifyToken, requireAdmin, (req, res) => {
    upload.single('image')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: '请选择要上传的图片' });
      const mime = await validateMime(req.file.path);
      if (!mime.valid) return res.status(400).json({ error: mime.error });
      res.json({ message: '图片上传成功', url: `/images/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
    });
  });

  router.post('/images', verifyToken, requireAdmin, (req, res) => {
    upload.array('images', 10)(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.files || req.files.length === 0) return res.status(400).json({ error: '请选择要上传的图片' });
      for (const f of req.files) {
        const mime = await validateMime(f.path);
        if (!mime.valid) return res.status(400).json({ error: `${f.originalname}: ${mime.error}` });
      }
      res.json({ message: `成功上传${req.files.length}张图片`, files: req.files.map(f => ({ url: `/images/${f.filename}`, filename: f.filename, size: f.size })) });
    });
  });

  router.get('/images', verifyToken, requireAdmin, (req, res) => {
    fs.readdir(imagesDir, (err, files) => {
      if (err) return res.status(500).json({ error: '获取图片列表失败' });
      const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f)).map(f => ({
        filename: f, url: `/images/${f}`, size: fs.statSync(path.join(imagesDir, f)).size
      }));
      res.json(images);
    });
  });

  router.delete('/images/:filename', verifyToken, requireAdmin, async (req, res, next) => {
    const filePath = path.join(imagesDir, req.params.filename);
    if (!fs.existsSync(filePath)) return next(new NotFoundError('图片不存在'));
    try {
      fs.unlinkSync(filePath);
      await db.run('UPDATE bearings SET image = NULL WHERE image = ?', [`/images/${req.params.filename}`]);
      clearCache('bearings:*');
      logger.info('图片已删除', { filename: req.params.filename });
      res.json({ message: '图片已删除' });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
