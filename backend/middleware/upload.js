const multer = require('multer');
const path = require('path');
const fs = require('fs');

function createUploadMiddleware() {
  const imagesDir = path.join(__dirname, '..', 'public', 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imagesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const sanitized = (req.body.name || '')
        .replace(/[^a-zA-Z0-9一-龥_-]/g, '')
        .slice(0, 100);
      const name = sanitized
        ? sanitized + ext
        : Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
      cb(null, name);
    }
  });

  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const extAllowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(ext);
      if (!extAllowed) {
        return cb(new Error('只允许上传图片文件 (jpg/png/gif/webp/svg)'));
      }
      cb(null, true);
    }
  });

  return { upload, imagesDir };
}

async function validateMime(filePath) {
  try {
    const { fileTypeFromFile } = await import('file-type');
    const result = await fileTypeFromFile(filePath);
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!result || !allowedMimes.includes(result.mime)) {
      fs.unlinkSync(filePath);
      return { valid: false, error: '文件类型不被允许' };
    }
    return { valid: true };
  } catch {
    return { valid: true };
  }
}

module.exports = { createUploadMiddleware, validateMime };
